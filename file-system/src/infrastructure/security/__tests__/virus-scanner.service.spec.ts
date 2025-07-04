import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VirusScannerService } from '../virus-scanner.service';
import { VirusScanResult } from '../../../types/file-system.types';
import {
  VirusScanException,
  VirusScanTimeoutException,
} from '../../../exceptions/file-system.exceptions';
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

    // Configuration par défaut basée sur votre .env.test
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        VIRUS_SCAN_TIMEOUT: 5000, // Depuis .env.test
        VIRUS_SCAN_RETRIES: 2,
        SCAN_VIRUS_ENABLED: false, // SCAN_VIRUS_ENABLED=false dans .env.test
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });
  });

  describe('scanFile', () => {
    it('should scan files and return clean result', async () => {
      // Arrange
      const cleanFileBuffer = createTestPDFBuffer();

      // Act
      const result = await service.scanFile(cleanFileBuffer);

      // Assert
      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scanId).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.scanDate).toBeInstanceOf(Date);
      expect(result.scanDuration).toBe(0);
      expect(result.scannerVersion).toBe('disabled');
    });

    it('should return clean result when scanning is disabled', async () => {
      // Arrange
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

      // Act
      const result = await serviceWithDisabledScanning.scanFile(fileBuffer);

      // Assert
      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scannerVersion).toBe('disabled');
      expect(result.details?.scanMethod).toBe('DISABLED');
      expect(result.scanDuration).toBe(0);
    });

    it('should detect known malware signatures when scanning is enabled', async () => {
      // Arrange
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

      // Act
      const result = await serviceWithEnabledScanning.scanFile(eicarTestFile);

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(result.threats!.length).toBeGreaterThan(0);
      expect(result.threats![0]).toContain('Trojan.Generic');
      expect(result.scanId).toBeDefined();
      expect(result.fileHash).toBeDefined();
      expect(result.scannerVersion).not.toBe('disabled');
    });

    it('should handle empty files', async () => {
      // Arrange
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true; // Activer le scan
          return defaultValue;
        },
      );
      // CORRECTION: Créer une nouvelle instance de service avec la config mise à jour
      const localService = new VirusScannerService(configService);
      const emptyBuffer = Buffer.alloc(0);

      // Act & Assert
      await expect(localService.scanFile(emptyBuffer)).rejects.toThrow(
        VirusScanException,
      );
    });

    it('should skip files that are too large', async () => {
      // Arrange
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true; // Activer le scan
          return defaultValue;
        },
      );
      // CORRECTION: Créer une nouvelle instance de service avec la config mise à jour
      const localService = new VirusScannerService(configService);
      const oversizedBuffer = Buffer.alloc(150 * 1024 * 1024, 'x');

      // Act
      const result = await localService.scanFile(oversizedBuffer);

      // Assert
      expect(result.clean).toBe(true);
      expect(result.scannerVersion).toBe('skipped');
      expect(result.details?.reason).toBe('FILE_TOO_LARGE');
      expect(result.details?.scanMethod).toBe('SKIPPED');
    });

    it('should handle scanner service unavailability', async () => {
      // Arrange
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

      // Act
      const result = await serviceWithBadConfig.scanFile(largeBuffer);

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_TIMEOUT');
      expect(result.details?.scanMethod).toBe('TIMEOUT');
    });

    it('should timeout long-running scans', async () => {
      // Arrange
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

      // Act
      const result = await serviceWithShortTimeout.scanFile(fileBuffer);

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_TIMEOUT');
      expect(result.scannerVersion).toBe('timeout');
      expect(result.details?.scanMethod).toBe('TIMEOUT');
      expect(result.scanDuration).toBeGreaterThanOrEqual(100);
    });

    // ... reste des tests sans modification ...
    it('should detect executable content when scanning is enabled', async () => {
      // Arrange - Activer le scan
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);

      // Simuler un header PE (Windows executable)
      const peHeaderBuffer = Buffer.concat([
        Buffer.from('MZ'), // DOS header
        Buffer.alloc(58, 0),
        Buffer.from([0x80, 0x00]), // PE offset
        Buffer.alloc(126, 0),
        Buffer.from('PE\0\0'), // PE signature
      ]);

      // Act
      const result = await serviceWithEnabledScanning.scanFile(peHeaderBuffer);

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(
        result.threats!.some((threat) => threat.includes('Executable')),
      ).toBe(true);
    });

    it('should retry on failure and succeed on subsequent attempt', async () => {
      // Arrange - Activer le scan avec retries
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2; // 2 retries
          return defaultValue;
        },
      );

      const serviceWithRetries = new VirusScannerService(configService);
      const fileBuffer = createTestFileBuffer('test content');
      let attemptCount = 0;

      // Espionner performVirusScan pour échouer sur la première tentative
      const performVirusScanSpy = jest
        .spyOn(serviceWithRetries as any, 'performVirusScan')
        .mockImplementation(async (buffer, fileHash) => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Temporary scan failure');
          }
          // Deuxième tentative réussit
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

      // Act
      const result = await serviceWithRetries.scanFile(fileBuffer);

      // Assert
      expect(result.clean).toBe(true);
      expect(result.attempt).toBe(2);
      expect(performVirusScanSpy).toHaveBeenCalledTimes(2);

      performVirusScanSpy.mockRestore();
    });

    it('should detect malicious scripts when scanning is enabled', async () => {
      // Arrange - Activer le scan
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

      // Act
      const result = await serviceWithEnabledScanning.scanFile(
        maliciousScriptBuffer,
      );

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toBeDefined();
      expect(result.threats!.length).toBeGreaterThan(0);
      expect(
        result.threats!.some((threat) => threat.includes('Trojan.Generic')),
      ).toBe(true);
    });

    it('should handle all retry attempts failing', async () => {
      // Arrange - Activer le scan avec retries
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

      // Espionner performVirusScan pour toujours échouer
      jest
        .spyOn(serviceWithRetries as any, 'performVirusScan')
        .mockRejectedValue(new Error('Persistent scan failure'));

      // Act
      const result = await serviceWithRetries.scanFile(fileBuffer);

      // Assert
      expect(result.clean).toBe(false);
      expect(result.threats).toContain('SCAN_ERROR');
      expect(result.details?.scanMethod).toBe('ERROR');
      expect(result.details?.error).toContain('Persistent scan failure');
    });
  });

  describe('checkScannerHealth', () => {
    it('should report healthy when scanner detects EICAR test file', async () => {
      // Arrange - Activer le scan pour le health check
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithEnabledScanning = new VirusScannerService(configService);

      // Act
      const health = await serviceWithEnabledScanning.checkScannerHealth();

      // Assert
      expect(health.healthy).toBe(true);
      expect(health.version).toBeDefined();
      expect(health.error).toBeUndefined();
    });

    it('should report unhealthy when scanner fails to detect EICAR', async () => {
      // Arrange - Activer le scan
      configService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'SCAN_VIRUS_ENABLED') return true;
          if (key === 'VIRUS_SCAN_TIMEOUT') return 5000;
          if (key === 'VIRUS_SCAN_RETRIES') return 2;
          return defaultValue;
        },
      );

      const serviceWithBrokenScanner = new VirusScannerService(configService);

      // Espionner performVirusScan pour toujours retourner clean (défaillance)
      jest
        .spyOn(serviceWithBrokenScanner as any, 'performVirusScan')
        .mockResolvedValue({
          clean: true, // Ne devrait pas être clean pour EICAR
          threats: [],
          scanId: 'scan-123',
          fileHash: 'hash-123',
          scanDate: new Date(),
          scanDuration: 100,
          scannerVersion: '1.0.0',
        });

      // Act
      const health = await serviceWithBrokenScanner.checkScannerHealth();

      // Assert
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Scanner failed to detect EICAR test file');
    });

    it('should handle health check errors gracefully', async () => {
      // Arrange - Scanner qui lance une erreur
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

      // Act
      const health = await serviceWithErrorScanner.checkScannerHealth();

      // Assert
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Scanner initialization failed');
    });
  });

  describe('scanFileStream', () => {
    it('should scan file from stream', async () => {
      // Arrange
      const testData = 'This is test stream content';
      const chunks = [Buffer.from(testData)];

      // Créer un mock ReadableStream
      const mockStream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      // Act
      const result = await service.scanFileStream(mockStream);

      // Assert
      expect(result.clean).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scanId).toBeDefined();
      expect(result.scannerVersion).toBe('disabled'); // Car SCAN_VIRUS_ENABLED=false
    });

    it('should handle stream errors gracefully', async () => {
      // Arrange - Stream qui génère une erreur
      const mockStream = new ReadableStream({
        start(controller) {
          controller.error(new Error('Stream read error'));
        },
      });

      // Act & Assert
      await expect(service.scanFileStream(mockStream)).rejects.toThrow(
        VirusScanException,
      );
    });
  });

  describe('Edge cases and special scenarios', () => {
    it('should handle various file types correctly', async () => {
      // Arrange - Activer le scan
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

      // Act & Assert
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
      // Arrange
      const fileContent = createTestFileBuffer(
        'Consistent content for hashing',
      );

      // Act - Scanner le même fichier deux fois
      const result1 = await service.scanFile(fileContent);
      const result2 = await service.scanFile(fileContent);

      // Assert - Les hashes doivent être identiques
      expect(result1.fileHash).toBe(result2.fileHash);
      expect(result1.fileHash).toMatch(/^[a-f0-9]{64}$/); // SHA256 format
    });
  });
});
