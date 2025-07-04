import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileSecurityService } from '../file-security.service';
import { VirusScannerService } from '../../../infrastructure/security/virus-scanner.service';
import { FileValidatorService } from '../../../infrastructure/security/file-validator.service';
import {
  SecurityThreat,
  UploadFileDto,
  FileOperation,
  PresignedUrlOptions,
} from '../../../types/file-system.types';
import {
  FileSecurityException,
  RateLimitExceededException,
  UnauthorizedFileAccessException,
} from '../../../exceptions/file-system.exceptions';
import {
  createTestFileBuffer,
  createTestPDFBuffer,
  generateTestUUID,
} from '../../../__tests__/test-setup';

import { DocumentType } from '../../../types/file-system.types';

describe('FileSecurityService', () => {
  let service: FileSecurityService;
  let virusScanner: jest.Mocked<VirusScannerService>;
  let fileValidator: jest.Mocked<FileValidatorService>;
  let configService: jest.Mocked<ConfigService>;
  let auditService: any;
  let rateLimitService: any;
  let fileMetadataService: any;
  let storageService: any;

  beforeEach(async () => {
    auditService = {
      logSecurityValidation: jest.fn(),
      logFileAccess: jest.fn(),
      logUrlGeneration: jest.fn(),
    };

    rateLimitService = {
      checkLimit: jest.fn(),
      incrementCounter: jest.fn(),
    };

    fileMetadataService = {
      getFileMetadata: jest.fn(),
      updateFileSecurityStatus: jest.fn(),
    };

    storageService = {
      generatePresignedUrl: jest.fn(),
      moveToQuarantine: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSecurityService,
        {
          provide: VirusScannerService,
          useValue: {
            scanFile: jest.fn(),
          },
        },
        {
          provide: FileValidatorService,
          useValue: {
            validateFormat: jest.fn(),
            validateContent: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: 'IAuditService',
          useValue: auditService,
        },
        {
          provide: 'IRateLimitService',
          useValue: rateLimitService,
        },
        {
          provide: 'IFileMetadataService',
          useValue: fileMetadataService,
        },
        {
          provide: 'IStorageService',
          useValue: storageService,
        },
      ],
    }).compile();

    service = module.get<FileSecurityService>(FileSecurityService);
    virusScanner = module.get(VirusScannerService);
    fileValidator = module.get(FileValidatorService);
    configService = module.get(ConfigService);

    configService.get.mockImplementation((key: string) => {
      if (key === 'fileSystem') {
        return {
          security: {
            scanVirusEnabled: false,
            presignedUrlExpiry: 1800,
            maxPresignedUrls: 5,
            ipRestrictionEnabled: false,
            rateLimitUploadsPerMinute: 20,
            abuseBlockDuration: 60,
            deviceFingerprintingEnabled: false,
            securityTokenSecret:
              'test_security_token_secret_with_minimum_32_characters_length',
          },
          processing: {
            maxFileSize: 10485760,
            allowedMimeTypes: ['image/jpeg', 'application/pdf', 'text/plain'],
            virusScanTimeout: 5000,
          },
        };
      }
      const envMap: Record<string, any> = {
        SCAN_VIRUS_ENABLED: false,
        MAX_FILE_SIZE: 10485760,
        PRESIGNED_URL_EXPIRY: 1800,
        RATE_LIMIT_UPLOADS_PER_MINUTE: 20,
      };
      return envMap[key];
    });
  });

  describe('validateFileUpload', () => {
    it('should validate clean files successfully', async () => {
      const pdfBuffer = createTestPDFBuffer();
      const file: UploadFileDto = {
        filename: 'test-document.pdf',
        contentType: 'application/pdf',
        size: pdfBuffer.length,
        buffer: pdfBuffer,
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        detectedMimeType: 'application/pdf',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 19,
        resetTime: new Date(Date.now() + 60000),
      });

      const result = await service.validateFileUpload(file, userId);

      expect(result.passed).toBe(true);
      expect(result.threats).toHaveLength(0);
      expect(result.scanId).toBeDefined();
      expect(result.confidenceScore).toBe(100);
      expect(auditService.logSecurityValidation).toHaveBeenCalledWith(
        userId,
        result,
      );
      expect(rateLimitService.incrementCounter).toHaveBeenCalledWith(
        userId,
        'upload',
      );
      expect(virusScanner.scanFile).not.toHaveBeenCalled();
    });

    it('should detect and quarantine malicious files when virus scan is enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'fileSystem') {
          return {
            security: {
              scanVirusEnabled: true,
              presignedUrlExpiry: 1800,
              maxPresignedUrls: 5,
              ipRestrictionEnabled: false,
              rateLimitUploadsPerMinute: 20,
              abuseBlockDuration: 60,
              deviceFingerprintingEnabled: false,
              securityTokenSecret:
                'test_security_token_secret_with_minimum_32_characters_length',
            },
            processing: {
              maxFileSize: 10485760,
              allowedMimeTypes: ['image/jpeg', 'application/pdf', 'text/plain'],
              virusScanTimeout: 5000,
            },
          };
        }
        return null;
      });

      const file: UploadFileDto = {
        filename: 'malicious.exe',
        contentType: 'application/octet-stream',
        size: 1024,
        buffer: createTestFileBuffer('malicious content'),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        detectedMimeType: 'application/octet-stream',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      virusScanner.scanFile.mockResolvedValue({
        clean: false,
        threats: ['Trojan.Win32.Generic'],
        scanId: 'scan-456',
        fileHash: 'hash-456',
        scanDate: new Date(),
        scanDuration: 2000,
        scannerVersion: '1.0.0',
      });

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 18,
        resetTime: new Date(Date.now() + 60000),
      });

      storageService.moveToQuarantine.mockResolvedValue(undefined);

      const result = await service.validateFileUpload(file, userId);

      expect(result.passed).toBe(false);
      expect(result.threats).toContain(SecurityThreat.MALWARE_DETECTED);
      expect(result.mitigations).toContain('QUARANTINE');
      expect(storageService.moveToQuarantine).toHaveBeenCalledWith(
        file.filename,
        expect.stringContaining('Malware detected'),
      );
      expect(auditService.logSecurityValidation).toHaveBeenCalledWith(
        userId,
        result,
      );
    });

    it('should enforce rate limiting per user', async () => {
      const file: UploadFileDto = {
        filename: 'test.txt',
        contentType: 'text/plain',
        size: 100,
        buffer: createTestFileBuffer('test'),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        detectedMimeType: 'text/plain',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      const resetTime = new Date(Date.now() + 60000);
      rateLimitService.checkLimit.mockResolvedValue({
        allowed: false,
        limit: 20,
        remaining: 0,
        resetTime,
      });

      await expect(service.validateFileUpload(file, userId)).rejects.toThrow(
        RateLimitExceededException,
      );

      expect(rateLimitService.checkLimit).toHaveBeenCalledWith(
        userId,
        'upload',
      );
      expect(rateLimitService.incrementCounter).not.toHaveBeenCalled();
    });

    it('should reject files with invalid format', async () => {
      const file: UploadFileDto = {
        filename: 'invalid.xyz',
        contentType: 'application/unknown',
        size: 1024,
        buffer: createTestFileBuffer('invalid'),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: false,
        errors: ['Unsupported file type'],
        warnings: [],
        detectedMimeType: 'application/unknown',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 19,
        resetTime: new Date(Date.now() + 60000),
      });

      const result = await service.validateFileUpload(file, userId);

      expect(result.passed).toBe(false);
      expect(result.threats).toContain(SecurityThreat.INVALID_FORMAT);
      expect(result.mitigations).toContain('FORMAT_REJECTION');
      expect(auditService.logSecurityValidation).toHaveBeenCalledWith(
        userId,
        result,
      );
    });

    it('should handle virus scanner failures gracefully', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'fileSystem') {
          return {
            security: {
              scanVirusEnabled: true,
              presignedUrlExpiry: 1800,
              maxPresignedUrls: 5,
              ipRestrictionEnabled: false,
              rateLimitUploadsPerMinute: 20,
              abuseBlockDuration: 60,
              deviceFingerprintingEnabled: false,
              securityTokenSecret:
                'test_security_token_secret_with_minimum_32_characters_length',
            },
            processing: {
              maxFileSize: 10485760,
              allowedMimeTypes: ['image/jpeg', 'application/pdf', 'text/plain'],
              virusScanTimeout: 5000,
            },
          };
        }
        return null;
      });

      const file: UploadFileDto = {
        filename: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        buffer: createTestPDFBuffer(),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        detectedMimeType: 'application/pdf',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      virusScanner.scanFile.mockRejectedValue(
        new Error('Scanner service unavailable'),
      );

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 15,
        resetTime: new Date(Date.now() + 60000),
      });

      await expect(service.validateFileUpload(file, userId)).rejects.toThrow(
        FileSecurityException,
      );

      const auditCall = auditService.logSecurityValidation.mock.calls[0];
      expect(auditCall[0]).toBe(userId);
      expect(auditCall[1].passed).toBe(false);
      expect(auditCall[1].threats).toContain(SecurityThreat.SUSPICIOUS_CONTENT);
    });

    it('should detect suspicious content patterns', async () => {
      const file: UploadFileDto = {
        filename: 'script.txt',
        contentType: 'text/plain',
        size: 50,
        buffer: createTestFileBuffer('<script>alert("xss")</script>'),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        detectedMimeType: 'text/plain',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: false,
        threats: ['SUSPICIOUS_SCRIPT_CONTENT'],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 18,
        resetTime: new Date(Date.now() + 60000),
      });

      const result = await service.validateFileUpload(file, userId);

      expect(result.passed).toBe(false);
      expect(result.threats).toContain(SecurityThreat.SUSPICIOUS_CONTENT);
      expect(result.mitigations).toContain('CONTENT_SANITIZATION');
    });

    it('should audit all security decisions', async () => {
      const file: UploadFileDto = {
        filename: 'audit-test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        buffer: createTestPDFBuffer(),
        documentType: DocumentType.DOCUMENT,
      };
      const userId = generateTestUUID(true);

      fileValidator.validateFormat.mockResolvedValue({
        valid: false,
        errors: ['Invalid format'],
        warnings: [],
        detectedMimeType: 'application/pdf',
        actualMimeType: null,
        fileSignature: null,
      });

      fileValidator.validateContent.mockResolvedValue({
        safe: true,
        threats: [],
        warnings: [],
        metadata: {},
        analysis: {},
      });

      rateLimitService.checkLimit.mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 20,
        resetTime: new Date(Date.now() + 60000),
      });

      const result = await service.validateFileUpload(file, userId);

      expect(auditService.logSecurityValidation).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          passed: false,
          threats: expect.arrayContaining([SecurityThreat.INVALID_FORMAT]),
          scanId: expect.any(String),
        }),
      );
    });
  });

  describe('checkFileAccess', () => {
    it('should validate file access permissions for owner', async () => {
      const fileId = generateTestUUID(true);
      const userId = generateTestUUID(true);
      const operation = FileOperation.READ;

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        userId: userId,
        filename: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: `files/${userId}/test.pdf`,
      });

      const result = await service.checkFileAccess(fileId, userId, operation);

      expect(result).toBe(true);
      expect(auditService.logFileAccess).toHaveBeenCalledWith(
        userId,
        fileId,
        operation,
        'SUCCESS',
        { reason: 'OWNER_ACCESS' },
      );
    });

    it('should deny access to unauthorized users', async () => {
      const fileId = '11111111-1111-1111-1111-111111111111';
      const ownerId = '22222222-2222-2222-2222-222222222222';
      const unauthorizedUserId = '33333333-3333-3333-3333-333333333333';
      const operation = FileOperation.READ;

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        userId: ownerId,
        filename: 'private.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: `files/${ownerId}/private.pdf`,
      });

      const result = await service.checkFileAccess(
        fileId,
        unauthorizedUserId,
        operation,
      );

      expect(result).toBe(false);
      expect(auditService.logFileAccess).toHaveBeenCalledWith(
        unauthorizedUserId,
        fileId,
        operation,
        'FAILURE',
        { reason: 'INSUFFICIENT_PERMISSIONS' },
      );
    });

    it('should handle missing files gracefully', async () => {
      const fileId = generateTestUUID(true);
      const userId = generateTestUUID(true);
      const operation = FileOperation.READ;

      fileMetadataService.getFileMetadata.mockResolvedValue(null);

      const result = await service.checkFileAccess(fileId, userId, operation);

      expect(result).toBe(false);
      expect(auditService.logFileAccess).toHaveBeenCalledWith(
        userId,
        fileId,
        operation,
        'FAILURE',
        { reason: 'FILE_NOT_FOUND' },
      );
    });
  });

  describe('generateSecurePresignedUrl', () => {
    it('should generate secure presigned URLs with restrictions', async () => {
      const fileId = generateTestUUID(true);
      const userId = generateTestUUID(true);
      const storageKey = `files/${userId}/test.pdf`;
      const options: PresignedUrlOptions = {
        key: storageKey,
        operation: 'GET',
        expiresIn: 1800,
        ipRestriction: ['192.168.1.100'],
        userAgent: 'Mozilla/5.0',
      };

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        userId: userId,
        filename: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: storageKey,
      });

      storageService.generatePresignedUrl.mockResolvedValue({
        url: 'https://s3.test.coders.com/test-coders-documents/files/test.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=1800',
        expiresAt: new Date(Date.now() + 1800000),
      });

      const result = await service.generateSecurePresignedUrl(
        fileId,
        userId,
        options,
      );

      expect(result.url).toContain('https://');
      expect(result.url).toContain('X-Amz-Algorithm');
      expect(result.restrictions.operations).toEqual(['GET']);
      expect(result.restrictions.ipAddress).toEqual(['192.168.1.100']);
      expect(result.restrictions.userAgent).toBe('Mozilla/5.0');
      expect(result.securityToken).toBeDefined();
      expect(auditService.logUrlGeneration).toHaveBeenCalledWith(
        fileId,
        userId,
        expect.any(Object),
      );
    });

    it('should reject unauthorized presigned URL generation', async () => {
      const fileId = '44444444-4444-4444-4444-444444444444';
      const ownerId = '55555555-5555-5555-5555-555555555555';
      const unauthorizedUserId = '66666666-6666-6666-6666-666666666666';
      const storageKey = `files/${ownerId}/private.pdf`;
      const options: PresignedUrlOptions = {
        key: storageKey,
        operation: 'GET',
        expiresIn: 3600,
      };

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        userId: ownerId,
        filename: 'private.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: storageKey,
      });

      await expect(
        service.generateSecurePresignedUrl(fileId, unauthorizedUserId, options),
      ).rejects.toThrow(UnauthorizedFileAccessException);

      expect(storageService.generatePresignedUrl).not.toHaveBeenCalled();
    });

    it('should respect maximum expiry time configuration', async () => {
      const fileId = generateTestUUID(true);
      const userId = generateTestUUID(true);
      const storageKey = `files/${userId}/test.pdf`;
      const options: PresignedUrlOptions = {
        key: storageKey,
        operation: 'GET',
        expiresIn: 7200,
      };

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        userId: userId,
        filename: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: storageKey,
      });

      storageService.generatePresignedUrl.mockResolvedValue({
        url: 'https://s3.test.coders.com/test-coders-documents/files/test.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=1800',
        expiresAt: new Date(Date.now() + 1800000),
      });

      await service.generateSecurePresignedUrl(fileId, userId, options);

      expect(storageService.generatePresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresIn: 1800,
        }),
      );
    });
  });

  describe('getLatestScanResult', () => {
    it('should return security scan status for a file', async () => {
      const fileId = generateTestUUID(true);
      const scanDate = new Date();

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        filename: 'scanned.pdf',
        virusScanStatus: 'CLEAN',
        detectedThreats: [],
        scannerVersion: '1.0.0',
        scanDuration: 1500,
        lastScanDate: scanDate,
        lastScanId: 'scan-123',
        createdAt: scanDate,
      });

      const result = await service.getLatestScanResult(fileId);

      expect(result.safe).toBe(true);
      expect(result.threatsFound).toEqual([]);
      expect(result.engineVersion).toBe('1.0.0');
      expect(result.scanDuration).toBe(1500);
      expect(result.scannedAt).toEqual(scanDate);
      expect(result.scanDetails).toBeDefined();
      expect(result.scanDetails?.scanId).toBe('scan-123');
      expect(result.scanDetails?.status).toBe('CLEAN');
    });

    it('should handle infected file scan results', async () => {
      const fileId = generateTestUUID(true);
      const scanDate = new Date();

      fileMetadataService.getFileMetadata.mockResolvedValue({
        id: fileId,
        filename: 'infected.exe',
        virusScanStatus: 'INFECTED',
        detectedThreats: ['Trojan.Win32.Generic', 'Malware.Suspicious'],
        scannerVersion: '1.0.0',
        scanDuration: 3000,
        lastScanDate: scanDate,
        lastScanId: 'scan-456',
        createdAt: scanDate,
      });

      const result = await service.getLatestScanResult(fileId);

      expect(result.safe).toBe(false);
      expect(result.threatsFound).toEqual([
        'Trojan.Win32.Generic',
        'Malware.Suspicious',
      ]);
      expect(result.scanDetails).toBeDefined();
      expect(result.scanDetails?.status).toBe('INFECTED');
    });
  });
});
