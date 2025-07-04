import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VirusScannerService } from '../virus-scanner.service';
import { VirusScanException } from '../../../exceptions/file-system.exceptions';
import {
  createTestFileBuffer,
  createTestPDFBuffer,
  createTestJPEGBuffer,
  delay,
} from '../../../__tests__/test-setup';

describe('VirusScannerService', () => {
  let service: VirusScannerService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VirusScannerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VirusScannerService>(VirusScannerService);
    configService = module.get(ConfigService);

    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        VIRUS_SCAN_TIMEOUT: 5000,
        VIRUS_SCAN_RETRIES: 2,
        SCAN_VIRUS_ENABLED: false,
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });
  });

  describe('scanFile', () => {
    it('should scan files and return clean result', async () => {
      const cleanFileBuffer = createTestPDFBuffer();

      const result = await service.scanFile(cleanFileBuffer);

      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scanId).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.scanDate).toBeInstanceOf(Date);
      expect(result.scanDuration).toBe(0);
      expect(result.scannerVersion).toBe('disabled');
    });

    it('should return clean result when scanning is disabled', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return false;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithDisabledScanning = new VirusScannerService(
        configService,
      );
      const fileBuffer = createTestFileBuffer('test content');

      const result = await serviceWithDisabledScanning.scanFile(fileBuffer);

      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scannerVersion).toBe('disabled');
      expect(result.details?.scanMethod).toBe('DISABLED');
      expect(result.scanDuration).toBe(0);
    });

    it('should detect known malware signatures when scanning is enabled', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);
      const eicarTestFile = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );

      const result = await serviceWithEnabledScanning.scanFile(eicarTestFile);

      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(result.threats!.length).toBeGreaterThan(0);
      expect(result.threats![0]).toContain('Trojan.Generic');
      expect(result.scanId).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.scannerVersion).not.toBe('disabled');
    });

    it('should handle empty files', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          return defaultValue;
        },
      );
      const localService = new VirusScannerService(configService);
      const emptyBuffer = Buffer.alloc(0);

      await expect(localService.scanFile(emptyBuffer)).rejects.toThrow(
        VirusScanException,
      );
    });

    it('should skip files that are too large', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          return defaultValue;
        },
      );
      const localService = new VirusScannerService(configService);
      const oversizedBuffer = Buffer.alloc(150 * 1024 * 1024, 'x');

      const result = await localService.scanFile(oversizedBuffer);

      expect(result.clean).toBe(true);
      expect(result.scannerVersion).toBe('skipped');
      expect(result.details?.reason).toBe('FILE_TOO_LARGE');
      expect(result.details?.scanMethod).toBe('SKIPPED');
    });

    it('should handle scanner service unavailability', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 1;
          if (key === 'VIRUS_SCAN_RETRIES') return 0;
          return defaultValue;
        },
      );
      const serviceWithBadConfig = new VirusScannerService(configService);
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024, 'x');

      const result = await serviceWithBadConfig.scanFile(largeBuffer);

      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_TIMEOUT');
      expect(result.details?.scanMethod).toBe('TIMEOUT');
    });

    it('should timeout long-running scans', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 100;
          if (key === 'VIRUS_SCAN_RETRIES') return 0;
          return defaultValue;
        },
      );
      const serviceWithShortTimeout = new VirusScannerService(configService);
      const fileBuffer = createTestFileBuffer('test content');

      const originalScan = serviceWithShortTimeout['simulateClamAVScan'];
      serviceWithShortTimeout['simulateClamAVScan'] = jest.fn(
        async (buffer, fileHash) => {
          await delay(500);
          return originalScan.call(serviceWithShortTimeout, buffer, fileHash);
        },
      );

      const result = await serviceWithShortTimeout.scanFile(fileBuffer);

      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_TIMEOUT');
      expect(result.scannerVersion).toBe('timeout');
      expect(result.details?.scanMethod).toBe('TIMEOUT');
      expect(result.scanDuration).toBeGreaterThanOrEqual(100);
    });

    it('should detect executable content when scanning is enabled', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);

      const peHeaderBuffer = Buffer.concat([
        Buffer.from('MZ'),
        Buffer.alloc(58, 0),
        Buffer.from([0x80, 0x00]),
        Buffer.alloc(126, 0),
        Buffer.from('PE\0\0'),
      ]);

      const result = await serviceWithEnabledScanning.scanFile(peHeaderBuffer);

      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(
        result.threats!.some((threat) => threat.includes('Executable')),
      ).toBe(true);
    });

    it('should retry on failure and succeed on subsequent attempt', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithRetries = new VirusScannerService(configService);
      const fileBuffer = createTestFileBuffer('test content');
      let attemptCount = 0;

      const performVirusScanSpy = jest
        .spyOn(serviceWithRetries as any, 'performVirusScan')
        .mockImplementation(async (buffer, fileHash) => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Temporary scan failure');
          }
          return {
            clean: true,
            threats: [],
            scanId: 'scan-123',
            fileHash,
            scanDate: new Date(),
            scanDuration: 100,
            scannerVersion: '1.0.0',
          };
        });

      const result = await serviceWithRetries.scanFile(fileBuffer);

      expect(result.clean).toBe(true);
      expect(result.attempt).toBe(2);
      expect(performVirusScanSpy).toHaveBeenCalledTimes(2);

      performVirusScanSpy.mockRestore();
    });

    it('should detect malicious scripts when scanning is enabled', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);
      const maliciousScriptBuffer = Buffer.from(
        '#!/bin/bash\nrm -rf /\nformat c:',
      );

      const result = await serviceWithEnabledScanning.scanFile(
        maliciousScriptBuffer,
      );

      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(result.threats!.length).toBeGreaterThan(0);
      expect(
        result.threats!.some((threat) => threat.includes('Trojan.Generic')),
      ).toBe(true);
    });

    it('should handle all retry attempts failing', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithRetries = new VirusScannerService(configService);
      const fileBuffer = createTestFileBuffer('test content');

      jest
        .spyOn(serviceWithRetries as any, 'performVirusScan')
        .mockRejectedValue(new Error('Persistent scan failure'));

      const result = await serviceWithRetries.scanFile(fileBuffer);

      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_ERROR');
      expect(result.details?.scanMethod).toBe('ERROR');
      expect(result.details?.error).toContain('Persistent scan failure');
    });
  });

  describe('checkScannerHealth', () => {
    it('should report healthy when scanner detects EICAR test file', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);

      const health = await serviceWithEnabledScanning.checkScannerHealth();

      expect(health.healthy).toBe(true);
      expect(health.version).toBeDefined();
      expect(health.error).toBeUndefined();
    });

    it('should report unhealthy when scanner fails to detect EICAR', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithBrokenScanner = new VirusScannerService(configService);

      jest
        .spyOn(serviceWithBrokenScanner as any, 'performVirusScan')
        .mockResolvedValue({
          clean: true,
          threats: [],
          scanId: 'scan-123',
          fileHash: 'hash-123',
          scanDate: new Date(),
          scanDuration: 100,
          scannerVersion: '1.0.0',
        });

      const health = await serviceWithBrokenScanner.checkScannerHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Scanner failed to detect EICAR test file');
    });

    it('should handle health check errors gracefully', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithErrorScanner = new VirusScannerService(configService);

      jest
        .spyOn(serviceWithErrorScanner as any, 'performVirusScan')
        .mockRejectedValue(new Error('Scanner initialization failed'));

      const health = await serviceWithErrorScanner.checkScannerHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Scanner initialization failed');
    });
  });

  describe('scanFileStream', () => {
    it('should scan file from stream', async () => {
      const testData = 'This is test stream content';
      const chunks = [Buffer.from(testData)];

      const mockStream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      const result = await service.scanFileStream(mockStream);

      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scanId).toBeDefined();
      expect(result.scannerVersion).toBe('disabled');
    });

    it('should handle stream errors gracefully', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.error(new Error('Stream read error'));
        },
      });

      await expect(service.scanFileStream(mockStream)).rejects.toThrow(
        VirusScanException,
      );
    });
  });

  describe('Edge cases and special scenarios', () => {
    it('should handle various file types correctly', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);

      const testFiles = [
        { name: 'PDF', buffer: createTestPDFBuffer(), shouldBeClean: true },
        { name: 'JPEG', buffer: createTestJPEGBuffer(), shouldBeClean: true },
        {
          name: 'Text',
          buffer: createTestFileBuffer('Safe text content'),
          shouldBeClean: true,
        },
        {
          name: 'Script',
          buffer: Buffer.from('#!/bin/bash\necho "safe"'),
          shouldBeClean: false,
        },
      ];

      for (const testFile of testFiles) {
        const result = await serviceWithEnabledScanning.scanFile(
          testFile.buffer,
        );

        if (testFile.shouldBeClean) {
          expect(result.clean).toBe(true);
          expect(result.threats).toHaveLength(0);
        } else {
          expect(result.clean).toBe(false);
          expect(result.threats).toBeDefined();
          expect(result.threats!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should generate consistent file hashes', async () => {
      const fileContent = createTestFileBuffer(
        'Consistent content for hashing',
      );

      const result1 = await service.scanFile(fileContent);
      const result2 = await service.scanFile(fileContent);

      expect(result1.fileHash).toBe(result2.fileHash);
      expect(result1.fileHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
