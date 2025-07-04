/**
 * Tests de validation pour les types du système de fichiers
 *
 * Tests conformes à la stratégie 04-06-file-system-tests.md
 * Pattern AAA (Arrange, Act, Assert) selon 07-08 Coding Standards
 *
 * @version 1.0
 * @conformsTo 04-06-file-system-tests
 * @conformsTo 07-08-coding-standards
 */

import {
  VirusScanStatus,
  ProcessingStatus,
  DocumentType,
  FileOperation,
  VersionChangeType,
  ProcessingJobType,
  ProcessingJobStatus,
  SecurityThreat,
  FileMetadata,
  FileVersion,
  FileAccess,
  ProcessingJob,
  SecurityValidation,
  SecurityScanResult,
  PresignedUrl,
  UploadFileDto,
  GetUserFilesOptions,
  PaginatedFileList,
  isFileMetadata,
  isProcessingResult,
  SUPPORTED_MIME_TYPES,
  FILE_SIZES,
  DURATIONS,
  CreateDto,
  UpdateDto,
  PartialWithId,
} from '../file-system.types';

describe('FileSystemTypes', () => {
  // ============================================================================
  // TESTS ENUMS - Validation des énumérations
  // ============================================================================

  describe('Enums Validation', () => {
    it('should have correct VirusScanStatus values', () => {
      expect(VirusScanStatus.PENDING).toBe('pending');
      expect(VirusScanStatus.SCANNING).toBe('scanning');
      expect(VirusScanStatus.CLEAN).toBe('clean');
      expect(VirusScanStatus.INFECTED).toBe('infected');
      expect(VirusScanStatus.ERROR).toBe('error');

      Object.values(VirusScanStatus).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should have correct ProcessingStatus workflow', () => {
      const statusFlow = [
        ProcessingStatus.PENDING,
        ProcessingStatus.PROCESSING,
        ProcessingStatus.COMPLETED,
      ];

      const failureFlow = [
        ProcessingStatus.PENDING,
        ProcessingStatus.PROCESSING,
        ProcessingStatus.FAILED,
      ];

      const skipFlow = [ProcessingStatus.PENDING, ProcessingStatus.SKIPPED];

      expect(statusFlow).toEqual(['pending', 'processing', 'completed']);
      expect(failureFlow).toEqual(['pending', 'processing', 'failed']);
      expect(skipFlow).toEqual(['pending', 'skipped']);
    });

    it('should have comprehensive DocumentType categories', () => {
      const expectedTypes = [
        'document',
        'template',
        'project_document',
        'confidential',
        'temporary',
        'archive',
      ];

      const actualTypes = Object.values(DocumentType);

      expect(actualTypes).toEqual(expect.arrayContaining(expectedTypes));
      expect(actualTypes.length).toBeGreaterThanOrEqual(expectedTypes.length);
    });

    it('should have all FileOperation types for access control', () => {
      const requiredOperations = [
        'read',
        'write',
        'delete',
        'share',
        'process',
      ];

      const operations = Object.values(FileOperation);

      requiredOperations.forEach((op) => {
        expect(operations).toContain(op);
      });
    });

    it('should have SecurityThreat enum covering major threat vectors', () => {
      const majorThreats = [
        SecurityThreat.INVALID_FORMAT,
        SecurityThreat.MALWARE_DETECTED,
        SecurityThreat.SUSPICIOUS_CONTENT,
        SecurityThreat.FILE_TOO_LARGE,
        SecurityThreat.RATE_LIMIT_EXCEEDED,
      ];

      majorThreats.forEach((threat) => {
        expect(typeof threat).toBe('string');
        expect(threat.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // TESTS INTERFACES PRINCIPALES - Structures de données
  // ============================================================================

  describe('Main Interfaces Structure', () => {
    it('should create valid FileMetadata object', () => {
      const fileMetadata: FileMetadata = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987fcdeb-51a2-43d1-9f12-123456789abc',
        projectId: 'proj-123',
        filename: 'test-document.pdf',
        originalName: 'My Document.pdf',
        contentType: 'application/pdf',
        size: 1024576,
        storageKey: 'files/user123/2024/01/test-document.pdf',
        cdnUrl: 'https://cdn.coders.com/files/optimized/test-document.pdf',
        checksumMd5: 'a1b2c3d4e5f6789012345678901234567',
        checksumSha256:
          'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234',
        virusScanStatus: VirusScanStatus.CLEAN,
        processingStatus: ProcessingStatus.COMPLETED,
        documentType: DocumentType.PROJECT_DOCUMENT,
        versionCount: 1,
        tags: ['document', 'pdf', 'important'],
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:05:00Z'),
      };

      expect(fileMetadata.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(fileMetadata.size).toBeGreaterThan(0);
      expect(fileMetadata.versionCount).toBe(1);
      expect(Array.isArray(fileMetadata.tags)).toBe(true);
      expect(fileMetadata.createdAt).toBeInstanceOf(Date);
      expect(fileMetadata.updatedAt).toBeInstanceOf(Date);
    });

    it('should create valid FileVersion with proper versioning', () => {
      const fileVersion: FileVersion = {
        id: 'version-123e4567-e89b-12d3-a456-426614174000',
        fileId: '123e4567-e89b-12d3-a456-426614174000',
        versionNumber: 2,
        storageKey: 'files/user123/versions/file123/2',
        size: 1048576,
        checksum: 'version2_checksum_a1b2c3d4e5f6',
        changeDescription: 'Updated content after review',
        changeType: VersionChangeType.MANUAL_EDIT,
        createdBy: 'user-789',
        createdAt: new Date('2024-01-15T11:00:00Z'),
        isActive: true,
      };

      expect(fileVersion.versionNumber).toBeGreaterThan(0);
      expect(fileVersion.changeType).toBe(VersionChangeType.MANUAL_EDIT);
      expect(fileVersion.isActive).toBe(true);
      expect(fileVersion.storageKey).toContain('versions');
      expect(fileVersion.createdBy).toBeDefined();
    });

    it('should create valid FileAccess audit log', () => {
      const fileAccess: FileAccess = {
        id: 'access-log-123',
        fileId: 'file-456',
        userId: 'user-789',
        operation: FileOperation.READ,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Test Browser)',
        result: 'SUCCESS',
        metadata: {
          downloadDuration: 1250,
          cacheHit: true,
          cdnLocation: 'eu-west-1',
        },
        timestamp: new Date(),
      };

      expect(fileAccess.operation).toBe(FileOperation.READ);
      expect(fileAccess.result).toMatch(/^(SUCCESS|FAILURE|PARTIAL)$/);
      expect(fileAccess.ipAddress).toMatch(
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      );
      expect(typeof fileAccess.metadata).toBe('object');
      expect(fileAccess.timestamp).toBeInstanceOf(Date);
    });

    it('should create valid ProcessingJob with queue management', () => {
      const processingJob: ProcessingJob = {
        id: 'job-123e4567-e89b-12d3',
        fileId: 'file-789',
        jobType: ProcessingJobType.FULL_PROCESSING,
        priority: 5,
        status: ProcessingJobStatus.QUEUED,
        progress: 0,
        options: {
          generateThumbnail: true,
          optimizeForWeb: true,
          extractMetadata: true,
          imageQuality: 85,
        },
        createdAt: new Date(),
      };

      expect(processingJob.priority).toBeGreaterThanOrEqual(1);
      expect(processingJob.priority).toBeLessThanOrEqual(10);
      expect(processingJob.progress).toBeGreaterThanOrEqual(0);
      expect(processingJob.progress).toBeLessThanOrEqual(100);
      expect(processingJob.status).toBe(ProcessingJobStatus.QUEUED);
      expect(processingJob.options.generateThumbnail).toBe(true);
    });
  });

  // ============================================================================
  // TESTS TYPE GUARDS - Validation runtime
  // ============================================================================

  describe('Type Guards', () => {
    it('should validate FileMetadata with isFileMetadata guard', () => {
      const validFileMetadata = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        filename: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        virusScanStatus: VirusScanStatus.CLEAN,
        processingStatus: ProcessingStatus.COMPLETED,
      };

      const invalidObjects = [
        null,
        undefined,
        {},
        { id: 123 },
        { id: 'valid', userId: null },
        { id: 'valid', userId: 'user-123', size: 'not-a-number' },
        {
          id: 'valid',
          userId: 'user-123',
          size: 1024,
          virusScanStatus: 'invalid-status',
        },
      ];

      expect(isFileMetadata(validFileMetadata)).toBe(true);

      invalidObjects.forEach((obj) => {
        expect(isFileMetadata(obj)).toBe(false);
      });
    });

    it('should validate ProcessingResult with isProcessingResult guard', () => {
      const validProcessingResult = {
        success: true,
        processingTime: 5000,
      };

      const validFailedResult = {
        success: false,
        processingTime: 1000,
      };

      const invalidResults = [
        null,
        { success: 'true' },
        { processingTime: 5000 },
        { success: true },
        { success: true, processingTime: 'slow' },
      ];

      expect(isProcessingResult(validProcessingResult)).toBe(true);
      expect(isProcessingResult(validFailedResult)).toBe(true);

      invalidResults.forEach((result) => {
        expect(isProcessingResult(result)).toBe(false);
      });
    });
  });

  // ============================================================================
  // TESTS DTOS ET VALIDATION - Structure des données d'entrée
  // ============================================================================

  describe('DTOs and Input Validation', () => {
    it('should create valid UploadFileDto', () => {
      const uploadDto: UploadFileDto = {
        filename: 'document.pdf',
        contentType: 'application/pdf',
        size: 2048576,
        buffer: Buffer.from('fake pdf content'),
        documentType: DocumentType.PROJECT_DOCUMENT,
        projectId: 'project-123',
        tags: ['important', 'contract'],
        checksumSha256:
          '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      expect(uploadDto.size).toBeGreaterThan(0);
      expect(Buffer.isBuffer(uploadDto.buffer)).toBe(true);
      expect(Array.isArray(uploadDto.tags)).toBe(true);
      expect(uploadDto.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should create valid GetUserFilesOptions with pagination', () => {
      const options: GetUserFilesOptions = {
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        contentType: 'application/pdf',
        processingStatus: ProcessingStatus.COMPLETED,
        projectId: 'project-123',
        tags: ['important'],
        includeDeleted: false,
      };

      expect(options.page).toBeGreaterThan(0);
      expect(options.limit).toBeGreaterThan(0);
      expect(['asc', 'desc']).toContain(options.sortOrder);
      expect(options.includeDeleted).toBe(false);
    });

    it('should create valid PaginatedFileList response', () => {
      const mockFile: FileMetadata = {
        id: '123',
        userId: 'user-456',
        filename: 'test.pdf',
        originalName: 'test.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: 'files/test.pdf',
        checksumMd5: 'md5hash',
        checksumSha256: 'sha256hash',
        virusScanStatus: VirusScanStatus.CLEAN,
        processingStatus: ProcessingStatus.COMPLETED,
        documentType: DocumentType.DOCUMENT,
        versionCount: 1,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const paginatedList: PaginatedFileList = {
        files: [mockFile],
        pagination: {
          currentPage: 1,
          totalPages: 5,
          totalItems: 100,
          itemsPerPage: 20,
          hasNextPage: true,
          hasPreviousPage: false,
        },
        stats: {
          totalSize: 1024000,
          fileCount: 100,
          lastActivity: new Date(),
        },
      };

      expect(Array.isArray(paginatedList.files)).toBe(true);
      expect(paginatedList.pagination.currentPage).toBe(1);
      expect(paginatedList.pagination.hasNextPage).toBe(true);
      expect(paginatedList.pagination.hasPreviousPage).toBe(false);
      expect(paginatedList.stats?.totalSize).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // TESTS SÉCURITÉ - Structures sécurité et validation
  // ============================================================================

  describe('Security Interfaces', () => {
    it('should create comprehensive SecurityValidation result', () => {
      const securityValidation: SecurityValidation = {
        passed: false,
        threats: [
          SecurityThreat.MALWARE_DETECTED,
          SecurityThreat.SUSPICIOUS_CONTENT,
        ],
        mitigations: ['QUARANTINE', 'BLOCK_USER_IP'],
        scanId: 'scan-123e4567-e89b-12d3',
        confidenceScore: 95,
        details: {
          virusName: 'Trojan.Win32.Example',
          scanEngine: 'ClamAV 0.103.0',
          suspiciousPatterns: ['embedded_javascript', 'external_links'],
        },
      };

      expect(securityValidation.passed).toBe(false);
      expect(Array.isArray(securityValidation.threats)).toBe(true);
      expect(securityValidation.threats.length).toBeGreaterThan(0);
      expect(Array.isArray(securityValidation.mitigations)).toBe(true);
      expect(securityValidation.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(securityValidation.confidenceScore).toBeLessThanOrEqual(100);
    });

    it('should create detailed SecurityScanResult', () => {
      const scanResult: SecurityScanResult = {
        safe: false,
        threatsFound: ['Trojan.Win32.Example', 'PUA.Script.Suspicious'],
        engineVersion: 'ClamAV 0.103.8',
        signaturesDate: new Date('2024-01-15'),
        scanDuration: 2500,
        scannedAt: new Date(),
        scanDetails: {
          totalSignatures: 8234567,
          scanMethod: 'full_scan',
          memoryUsage: '64MB',
          filesScanned: 1,
        },
      };

      expect(scanResult.safe).toBe(false);
      expect(Array.isArray(scanResult.threatsFound)).toBe(true);
      expect(scanResult.threatsFound.length).toBeGreaterThan(0);
      expect(scanResult.scanDuration).toBeGreaterThan(0);
      expect(scanResult.scannedAt).toBeInstanceOf(Date);
    });

    it('should create secure PresignedUrl with restrictions', () => {
      const presignedUrl: PresignedUrl = {
        url: 'https://s3.coders.com/files/document.pdf?X-Amz-Signature=abc123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        restrictions: {
          ipAddress: ['192.168.1.100', '10.0.0.0/8'],
          userAgent: 'CoderApp/1.0',
          operations: ['GET'],
        },
        securityToken: 'sec_token_123abc',
      };

      expect(presignedUrl.url).toContain('X-Amz-Signature');
      expect(presignedUrl.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(Array.isArray(presignedUrl.restrictions.ipAddress)).toBe(true);
      expect(Array.isArray(presignedUrl.restrictions.operations)).toBe(true);
      expect(presignedUrl.securityToken).toBeDefined();
    });
  });

  // ============================================================================
  // TESTS TYPES UTILITAIRES - Utility types TypeScript
  // ============================================================================

  describe('Utility Types', () => {
    it('should work with CreateDto utility type', () => {
      type CreateFileDto = CreateDto<FileMetadata>;

      const createDto: CreateFileDto = {
        userId: 'user-123',
        filename: 'new-file.pdf',
        originalName: 'New File.pdf',
        contentType: 'application/pdf',
        size: 1024,
        storageKey: 'files/new-file.pdf',
        checksumMd5: 'md5hash',
        checksumSha256: 'sha256hash',
        virusScanStatus: VirusScanStatus.PENDING,
        processingStatus: ProcessingStatus.PENDING,
        documentType: DocumentType.DOCUMENT,
        versionCount: 1,
        tags: [],
      };

      expect(createDto.userId).toBeDefined();
      expect(createDto.filename).toBeDefined();
      expect((createDto as any).id).toBeUndefined();
    });

    it('should work with UpdateDto utility type', () => {
      type UpdateFileDto = UpdateDto<FileMetadata>;

      const updateDto: UpdateFileDto = {
        id: 'file-123',
        filename: 'updated-filename.pdf',
        tags: ['updated', 'modified'],
        processingStatus: ProcessingStatus.COMPLETED,
      };

      expect(updateDto.id).toBeDefined();
      expect(updateDto.filename).toBeDefined();
      expect(updateDto.tags).toBeDefined();
      expect(updateDto.processingStatus).toBeDefined();
    });

    it('should work with PartialWithId utility type', () => {
      type PartialFile = PartialWithId<FileMetadata>;

      const partialFile: PartialFile = {
        id: 'required-id-123',
        filename: 'optional-update.pdf',
      };

      expect(partialFile.id).toBeDefined();
      expect(partialFile.filename).toBeDefined();
    });
  });

  // ============================================================================
  // TESTS CONSTANTES TYPÉES - Validation des constantes
  // ============================================================================

  describe('Typed Constants', () => {
    it('should have correct SUPPORTED_MIME_TYPES structure', () => {
      const imageTypes = SUPPORTED_MIME_TYPES.IMAGES;
      const documentTypes = SUPPORTED_MIME_TYPES.DOCUMENTS;
      const templateTypes = SUPPORTED_MIME_TYPES.TEMPLATES;

      expect(Array.isArray(imageTypes)).toBe(true);
      expect(Array.isArray(documentTypes)).toBe(true);
      expect(Array.isArray(templateTypes)).toBe(true);
      expect(imageTypes).toContain('image/jpeg');
      expect(imageTypes).toContain('image/png');
      expect(documentTypes).toContain('application/pdf');
      expect(templateTypes).toContain('application/json');
      const jpegType: 'image/jpeg' = imageTypes[0];
      expect(jpegType).toBe('image/jpeg');
    });

    it('should have correct FILE_SIZES constants', () => {
      expect(FILE_SIZES.KB).toBe(1024);
      expect(FILE_SIZES.MB).toBe(1024 * 1024);
      expect(FILE_SIZES.GB).toBe(1024 * 1024 * 1024);
      expect(FILE_SIZES.MAX_UPLOAD).toBe(100 * 1024 * 1024); // 100MB
      expect(FILE_SIZES.MB / FILE_SIZES.KB).toBe(1024);
      expect(FILE_SIZES.GB / FILE_SIZES.MB).toBe(1024);
    });

    it('should have correct DURATIONS constants', () => {
      expect(DURATIONS.SECOND).toBe(1000);
      expect(DURATIONS.MINUTE).toBe(60 * 1000);
      expect(DURATIONS.HOUR).toBe(60 * 60 * 1000);
      expect(DURATIONS.DAY).toBe(24 * 60 * 60 * 1000);
      expect(DURATIONS.MINUTE / DURATIONS.SECOND).toBe(60);
      expect(DURATIONS.HOUR / DURATIONS.MINUTE).toBe(60);
      expect(DURATIONS.DAY / DURATIONS.HOUR).toBe(24);
    });
  });

  // ============================================================================
  // TESTS INTÉGRATION ET COMPATIBILITÉ
  // ============================================================================

  describe('Integration and Compatibility', () => {
    it('should maintain enum compatibility across types', () => {
      const fileMetadata: FileMetadata = createMockFileMetadata();

      expect(Object.values(VirusScanStatus)).toContain(
        fileMetadata.virusScanStatus,
      );
      expect(Object.values(ProcessingStatus)).toContain(
        fileMetadata.processingStatus,
      );
      expect(Object.values(DocumentType)).toContain(fileMetadata.documentType);
    });

    it('should support proper date handling', () => {
      const now = new Date();
      const fileMetadata: FileMetadata = createMockFileMetadata();
      fileMetadata.createdAt = now;
      fileMetadata.updatedAt = now;

      expect(fileMetadata.createdAt).toBeInstanceOf(Date);
      expect(fileMetadata.updatedAt).toBeInstanceOf(Date);
      expect(fileMetadata.createdAt.getTime()).toBe(now.getTime());

      const serialized = JSON.stringify(fileMetadata);
      const deserialized = JSON.parse(serialized);
      expect(new Date(deserialized.createdAt).getTime()).toBe(now.getTime());
    });

    it('should support deep object validation', () => {
      const complexObject = {
        fileMetadata: createMockFileMetadata(),
        processingJob: createMockProcessingJob(),
        securityValidation: createMockSecurityValidation(),
      };

      expect(isFileMetadata(complexObject.fileMetadata)).toBe(true);
      expect(
        complexObject.processingJob.options.generateThumbnail,
      ).toBeDefined();
      expect(Array.isArray(complexObject.securityValidation.threats)).toBe(
        true,
      );
    });
  });

  // ============================================================================
  // HELPERS DE TEST - Fonctions utilitaires
  // ============================================================================

  /**
   * Crée un FileMetadata valide pour les tests
   */
  function createMockFileMetadata(): FileMetadata {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: 'user-123456789',
      projectId: 'project-abc',
      filename: 'test-document.pdf',
      originalName: 'Test Document.pdf',
      contentType: 'application/pdf',
      size: 1048576,
      storageKey: 'files/user123/2024/01/test-document.pdf',
      cdnUrl: 'https://cdn.coders.com/files/test-document.pdf',
      checksumMd5: 'a1b2c3d4e5f6789012345678901234567',
      checksumSha256:
        'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234',
      virusScanStatus: VirusScanStatus.CLEAN,
      processingStatus: ProcessingStatus.COMPLETED,
      documentType: DocumentType.PROJECT_DOCUMENT,
      versionCount: 1,
      tags: ['test', 'document'],
      createdAt: new Date('2024-01-15T10:00:00Z'),
      updatedAt: new Date('2024-01-15T10:05:00Z'),
    };
  }

  /**
   * Crée un ProcessingJob valide pour les tests
   */
  function createMockProcessingJob(): ProcessingJob {
    return {
      id: 'job-123e4567-e89b-12d3',
      fileId: 'file-789',
      jobType: ProcessingJobType.FULL_PROCESSING,
      priority: 5,
      status: ProcessingJobStatus.COMPLETED,
      progress: 100,
      options: {
        generateThumbnail: true,
        optimizeForWeb: true,
        extractMetadata: true,
        imageQuality: 85,
        forceReprocess: false,
      },
      result: {
        success: true,
        processingTime: 5000,
        optimizations: {
          originalSize: 1048576,
          optimizedSize: 786432,
          compressionRatio: 0.75,
          techniques: ['compression', 'optimization'],
          spaceSavingPercent: 25,
        },
      },
      executionTime: 5000,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      startedAt: new Date('2024-01-15T10:01:00Z'),
      completedAt: new Date('2024-01-15T10:06:00Z'),
    };
  }

  /**
   * Crée un SecurityValidation valide pour les tests
   */
  function createMockSecurityValidation(): SecurityValidation {
    return {
      passed: true,
      threats: [],
      mitigations: [],
      scanId: 'scan-123e4567-e89b-12d3-a456',
      confidenceScore: 98,
      details: {
        scanEngine: 'ClamAV 0.103.8',
        scanDuration: 1500,
        signatures: 8234567,
      },
    };
  }
});
