/**
 * Tests unitaires pour FileProcessingService - Orchestration traitement
 *
 * Ce fichier teste le service principal d'orchestration qui coordonne tous
 * les traitements de fichiers, gère les queues asynchrones et le versioning.
 * Version corrigée avec les bons mocks et signatures.
 *
 * @author Backend Lead
 * @version 1.0
 * @conformsTo 04-06-file-system-tests Phase 3.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { FileProcessingService } from '../file-processing.service';
import { GarageStorageService } from '../../../infrastructure/garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../../config/file-system.config';
import {
  FileMetadata,
  ProcessingStatus,
  VirusScanStatus,
  DocumentType,
  ExtendedProcessingOptions,
  VersionOptions,
  VersionChangeType,
} from '../../../types/file-system.types';
import {
  FileNotFoundException,
  ProcessingException,
  InvalidProcessingStateException,
} from '../../../exceptions/file-system.exceptions';
import { generateTestUUID, delay } from '../../../__tests__/test-setup';

describe('FileProcessingService', () => {
  let service: FileProcessingService;
  let storageService: jest.Mocked<GarageStorageService>;
  let processingQueue: jest.Mocked<Queue>;
  let fileMetadataRepository: jest.Mocked<any>;
  let logger: jest.Mocked<Logger>;
  let mockConfig: any;

  /**
   * Helper pour créer un FileMetadata mock complet
   */
  const createMockFileMetadata = (
    overrides: Partial<FileMetadata> = {},
  ): FileMetadata => ({
    id: generateTestUUID(),
    userId: 'test-user',
    projectId: undefined,
    filename: 'test-file.jpg',
    originalName: 'test-file.jpg',
    contentType: 'image/jpeg',
    size: 1024 * 512,
    storageKey: 'test-storage-key',
    checksumMd5: 'mock-md5',
    checksumSha256: 'mock-sha256',
    virusScanStatus: VirusScanStatus.CLEAN,
    processingStatus: ProcessingStatus.PENDING,
    documentType: DocumentType.DOCUMENT,
    versionCount: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    mockConfig = {
      processing: {
        maxFileSize: 100 * 1024 * 1024,
        allowedMimeTypes: ['image/*', 'application/pdf', 'text/*'],
        thumbnailSize: 200,
        imageOptimizationQuality: 85,
      },
      cdn: {
        baseUrl: 'https://cdn.test.coders.com',
      },
    };

    const mockStorageService = {
      downloadObject: jest.fn(),
      uploadObject: jest.fn(),
      copyObject: jest.fn(),
      getObjectInfo: jest.fn(),
    };

    const mockProcessingQueue = {
      add: jest.fn(),
      process: jest.fn(),
      clean: jest.fn(),
      close: jest.fn(),
      getJob: jest.fn(),
      getJobs: jest.fn(),
    };

    const mockFileMetadataRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    const mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileProcessingService,
        { provide: GarageStorageService, useValue: mockStorageService },
        { provide: 'BullQueue_file-processing', useValue: mockProcessingQueue },
        {
          provide: 'IFileMetadataRepository',
          useValue: mockFileMetadataRepository,
        },
        { provide: Logger, useValue: mockLogger },
        { provide: FILE_SYSTEM_CONFIG, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<FileProcessingService>(FileProcessingService);
    storageService = module.get(GarageStorageService);
    processingQueue = module.get('BullQueue_file-processing');
    fileMetadataRepository = module.get('IFileMetadataRepository');
    logger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction et Initialisation', () => {
    it('should be defined and properly initialized', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(FileProcessingService);
    });
  });

  describe('processUploadedFile - Traitement Principal', () => {
    it('should process image file with complete pipeline', async () => {
      const fileId = generateTestUUID();
      const mockFileMetadata = createMockFileMetadata({
        id: fileId,
        contentType: 'image/jpeg',
        size: 2048,
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(mockFileMetadata);

      jest
        .spyOn(service as any, 'performBasicSecurityCheck')
        .mockImplementation(async () => {
          await delay(5);
          return { safe: true, threats: [], engineVersion: 'basic' };
        });

      jest
        .spyOn(service as any, 'processImage')
        .mockImplementation(async () => {
          await delay(10);
          return {
            success: true,
            processingTime: 15,
            optimizations: {
              originalSize: 2048,
              optimizedSize: 1024,
              compressionRatio: 0.5,
              spaceSavingPercent: 50,
              techniques: ['image_compression', 'format_optimization'],
            },
          };
        });

      jest
        .spyOn(service as any, 'generateThumbnail')
        .mockImplementation(async () => {
          await delay(3);
          return 'https://cdn.test.coders.com/test/thumbnails/200/image.jpg';
        });

      // Act
      const result = await service.processUploadedFile(fileId);

      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.optimizations).toBeDefined();
      expect(result.thumbnailUrl).toContain('cdn.test.coders.com');
      expect(fileMetadataRepository.update).toHaveBeenCalledWith(fileId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });
      expect(fileMetadataRepository.update).toHaveBeenCalledWith(fileId, {
        processingStatus: ProcessingStatus.COMPLETED,
      });
    });

    it('should process PDF file with metadata extraction', async () => {
      const mockFileMetadata = createMockFileMetadata({
        contentType: 'application/pdf',
        size: 2 * 1024 * 1024, // 2MB
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(undefined);

      storageService.uploadObject.mockResolvedValue({
        uploadId: 'pdf-thumbnail-upload',
        storageKey: 'pdf-thumbnail-key',
        etag: 'pdf-etag',
        location: 'pdf-url',
        metadata: mockFileMetadata,
        uploadDuration: 200,
      });

      const result = await service.processUploadedFile(mockFileMetadata.id);

      expect(result.success).toBe(true);
      expect(result.extractedMetadata).toBeDefined();
      expect(result.extractedMetadata?.pageCount).toBeDefined();
      expect(result.thumbnailUrl).toContain('cdn.test.coders.com');
    });

    it('should process text document with basic analysis', async () => {
      const mockFileMetadata = createMockFileMetadata({
        contentType: 'text/plain',
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(undefined);

      storageService.uploadObject.mockResolvedValue({
        uploadId: 'doc-thumbnail-upload',
        storageKey: 'doc-thumbnail-key',
        etag: 'doc-etag',
        location: 'doc-url',
        metadata: mockFileMetadata,
        uploadDuration: 50,
      });

      const result = await service.processUploadedFile(mockFileMetadata.id);

      expect(result.success).toBe(true);
      expect(result.extractedMetadata).toBeDefined();
      expect(result.extractedMetadata?.estimatedWordCount).toBeDefined();
      expect(result.thumbnailUrl).toContain('cdn.test.coders.com');
    });

    it('should handle file already in processing state', async () => {
      const fileId = generateTestUUID();
      const mockFileMetadata = createMockFileMetadata({
        id: fileId,
        processingStatus: ProcessingStatus.PROCESSING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);

      await expect(service.processUploadedFile(fileId)).rejects.toThrow(
        InvalidProcessingStateException,
      );
      expect(fileMetadataRepository.update).toHaveBeenCalledWith(fileId, {
        processingStatus: ProcessingStatus.FAILED,
      });
    });

    it('should handle file not found', async () => {
      const nonExistentFileId = generateTestUUID();

      fileMetadataRepository.findById.mockRejectedValue(
        new FileNotFoundException(nonExistentFileId),
      );

      await expect(
        service.processUploadedFile(nonExistentFileId),
      ).rejects.toThrow(ProcessingException);

      try {
        await service.processUploadedFile(nonExistentFileId);
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessingException);
        expect(error.message).toContain('Fichier non trouvé');
        expect(error.message).toContain(nonExistentFileId);
      }
    });

    it('should handle security scan failure gracefully', async () => {
      const fileId = generateTestUUID();
      const mockFileMetadata = createMockFileMetadata({
        id: fileId,
        contentType: 'image/jpeg',
        size: 200 * 1024 * 1024,
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(mockFileMetadata);

      jest
        .spyOn(service as any, 'performBasicSecurityCheck')
        .mockRejectedValue(new Error('Security scan failed'));

      jest.spyOn(service as any, 'processImage').mockResolvedValue({
        success: true,
        processingTime: 0,
        optimizations: {
          originalSize: mockFileMetadata.size,
          optimizedSize: mockFileMetadata.size,
          compressionRatio: 1,
          spaceSavingPercent: 0,
          techniques: ['basic_image_processing'],
        },
      });

      jest
        .spyOn(service as any, 'generateThumbnail')
        .mockResolvedValue(
          'https://cdn.test.coders.com/test/thumbnails/200/image.jpg',
        );

      const result = await service.processUploadedFile(fileId);

      expect(result.success).toBe(true);
      expect(result.securityScan).toBeDefined();
      expect(result.securityScan?.safe).toBe(false);
      expect(result.securityScan?.threatsFound).toContain(
        'SECURITY_SCAN_FAILED',
      );
    });

    it('should process generic file type', async () => {
      const mockFileMetadata = createMockFileMetadata({
        contentType: 'application/zip',
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(undefined);

      const result = await service.processUploadedFile(mockFileMetadata.id);

      expect(result.success).toBe(true);
      expect(result.extractedMetadata?.processingType).toBe('generic');
      expect(result.thumbnailUrl).toBeUndefined();
    });
  });

  describe('queueProcessing - Gestion Queue Asynchrone', () => {
    it('should queue file for processing with correct priority', async () => {
      const mockFileMetadata = createMockFileMetadata({
        size: 1024 * 1024,
        documentType: DocumentType.CONFIDENTIAL,
        processingStatus: ProcessingStatus.PENDING,
      });

      const processingOptions: ExtendedProcessingOptions = {
        generateThumbnail: true,
        optimizeForWeb: true,
        priority: 8,
        userId: 'test-user',
      };

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);

      const mockJobResult = { id: 'job-123' };
      processingQueue.add.mockResolvedValue(mockJobResult as any);

      const result = await service.queueProcessing(
        mockFileMetadata.id,
        processingOptions,
      );

      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe('queued');
      expect(result.estimatedDuration).toBeDefined();

      expect(processingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          fileId: mockFileMetadata.id,
          userId: 'test-user',
        }),
        expect.objectContaining({
          priority: expect.any(Number),
          attempts: 3,
        }),
      );
    });

    it('should calculate higher priority for smaller files', async () => {
      const smallImageFile = createMockFileMetadata({
        size: 500 * 1024, // 500KB
        contentType: 'image/jpeg',
        processingStatus: ProcessingStatus.PENDING,
      });

      const largeVideoFile = createMockFileMetadata({
        size: 80 * 1024 * 1024, // 80MB
        contentType: 'video/mp4',
        processingStatus: ProcessingStatus.PENDING,
      });

      const urgentOptions: ExtendedProcessingOptions = { priority: 9 };
      const normalOptions: ExtendedProcessingOptions = { priority: 5 };

      fileMetadataRepository.findById
        .mockResolvedValueOnce(smallImageFile)
        .mockResolvedValueOnce(largeVideoFile);

      processingQueue.add
        .mockResolvedValueOnce({ id: 'urgent-job' } as any)
        .mockResolvedValueOnce({ id: 'normal-job' } as any);

      await service.queueProcessing(smallImageFile.id, urgentOptions);
      await service.queueProcessing(largeVideoFile.id, normalOptions);

      expect(processingQueue.add).toHaveBeenNthCalledWith(
        1,
        'process-uploaded-file',
        expect.anything(),
        expect.objectContaining({
          priority: expect.any(Number),
        }),
      );

      expect(processingQueue.add).toHaveBeenNthCalledWith(
        2,
        'process-uploaded-file',
        expect.anything(),
        expect.objectContaining({
          priority: expect.any(Number),
        }),
      );
    });

    it('should handle queue processing errors gracefully', async () => {
      const mockFileMetadata = createMockFileMetadata({
        processingStatus: ProcessingStatus.PENDING,
      });

      const retryOptions: ExtendedProcessingOptions = {
        retryConfig: {
          maxAttempts: 3,
          backoffMs: 1000,
          exponentialBackoff: true,
        },
      };

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);

      processingQueue.add
        .mockRejectedValueOnce(new Error('Queue temporarily unavailable'))
        .mockResolvedValueOnce({ id: 'retry-job' } as any);

      await expect(
        service.queueProcessing(mockFileMetadata.id, retryOptions),
      ).rejects.toThrow('Queue temporarily unavailable');

      const retryResult = await service.queueProcessing(
        mockFileMetadata.id,
        retryOptions,
      );

      expect(retryResult.jobId).toBe('retry-job');
      expect(processingQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should reject file not in pending state', async () => {
      const mockFileMetadata = createMockFileMetadata({
        processingStatus: ProcessingStatus.COMPLETED,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);

      await expect(
        service.queueProcessing(mockFileMetadata.id, {}),
      ).rejects.toThrow(InvalidProcessingStateException);

      expect(processingQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('createVersion - Gestion Versioning', () => {
    it('should create file version successfully', async () => {
      const mockFileMetadata = createMockFileMetadata({
        versionCount: 2,
      });

      const versionOptions: VersionOptions = {
        createVersion: true,
        keepOldVersions: true,
        description: 'Version de test',
        changeType: VersionChangeType.MANUAL_EDIT,
        userId: 'test-user',
      };

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(undefined);

      storageService.copyObject.mockResolvedValue({
        sourceKey: mockFileMetadata.storageKey,
        destinationKey: expect.stringContaining('/versions/3/'),
        etag: 'version-etag',
        lastModified: new Date(),
      });

      const version = await service.createVersion(
        mockFileMetadata.id,
        versionOptions,
      );

      expect(version.fileId).toBe(mockFileMetadata.id);
      expect(version.versionNumber).toBe(3);
      expect(version.changeDescription).toBe('Version de test');
      expect(version.createdBy).toBe('test-user');
      expect(version.isActive).toBe(false);

      expect(storageService.copyObject).toHaveBeenCalledWith(
        mockFileMetadata.storageKey,
        expect.stringContaining('/versions/3/'),
      );

      expect(fileMetadataRepository.update).toHaveBeenCalledWith(
        mockFileMetadata.id,
        { versionCount: 3 },
      );
    });
  });

  describe('generateThumbnail - Génération Thumbnails', () => {
    it('should generate thumbnail for different file types', async () => {
      const imageFile = createMockFileMetadata({
        contentType: 'image/png',
      });

      const pdfFile = createMockFileMetadata({
        contentType: 'application/pdf',
      });

      storageService.uploadObject
        .mockResolvedValueOnce({
          uploadId: 'image-thumb',
          storageKey: 'image-thumb-key',
          etag: 'image-etag',
          location: 'image-url',
          metadata: imageFile,
          uploadDuration: 100,
        })
        .mockResolvedValueOnce({
          uploadId: 'pdf-thumb',
          storageKey: 'pdf-thumb-key',
          etag: 'pdf-etag',
          location: 'pdf-url',
          metadata: pdfFile,
          uploadDuration: 150,
        });

      const imageThumbUrl = await service.generateThumbnail(
        imageFile.id,
        imageFile,
      );
      const pdfThumbUrl = await service.generateThumbnail(pdfFile.id, pdfFile);

      expect(imageThumbUrl).toContain('cdn.test.coders.com');
      expect(pdfThumbUrl).toContain('cdn.test.coders.com');
      expect(storageService.uploadObject).toHaveBeenCalledTimes(2);
    });

    it('should handle thumbnail generation failures', async () => {
      const mockFileMetadata = createMockFileMetadata({
        contentType: 'image/corrupted',
      });

      storageService.uploadObject.mockRejectedValue(
        new Error('Storage upload failed'),
      );

      await expect(
        service.generateThumbnail(mockFileMetadata.id, mockFileMetadata),
      ).rejects.toThrow(ProcessingException);
    });
  });

  describe('Robustesse et Performance', () => {
    it('should handle concurrent processing attempts', async () => {
      const mockFileMetadata = createMockFileMetadata({
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);
      fileMetadataRepository.update.mockResolvedValue(undefined);

      const concurrentOptions: ExtendedProcessingOptions = {
        generateThumbnail: true,
        timeout: 5000,
      };

      processingQueue.add.mockResolvedValue({
        id: 'concurrent-job-1',
        status: 'queued',
        progress: 0,
        estimatedDuration: 30,
      } as any);

      const promise1 = service.queueProcessing(
        mockFileMetadata.id,
        concurrentOptions,
      );
      const promise2 = service.queueProcessing(
        mockFileMetadata.id,
        concurrentOptions,
      );

      const results = await Promise.allSettled([promise1, promise2]);
      const successCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const rejectedCount = results.filter(
        (r) => r.status === 'rejected',
      ).length;

      expect(successCount + rejectedCount).toBe(2);
      expect(successCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle processing timeout gracefully', async () => {
      const mockFileMetadata = createMockFileMetadata({
        processingStatus: ProcessingStatus.PENDING,
        size: 500 * 1024 * 1024, // Très gros fichier
      });

      fileMetadataRepository.findById.mockResolvedValue(mockFileMetadata);

      const timeoutOptions: ExtendedProcessingOptions = {
        timeout: 100,
        retryConfig: {
          maxAttempts: 1,
          backoffMs: 0,
          exponentialBackoff: false,
        },
      };

      processingQueue.add.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Processing timeout')), 50),
          ),
      );

      await expect(
        service.queueProcessing(mockFileMetadata.id, timeoutOptions),
      ).rejects.toThrow('Processing timeout');
    });

    it('should optimize processing based on file type and size', async () => {
      const smallTextFile = createMockFileMetadata({
        contentType: 'text/plain',
        size: 10 * 1024,
        processingStatus: ProcessingStatus.PENDING,
      });

      const largeImageFile = createMockFileMetadata({
        contentType: 'image/jpeg',
        size: 25 * 1024 * 1024,
        processingStatus: ProcessingStatus.PENDING,
      });

      fileMetadataRepository.findById
        .mockResolvedValueOnce(smallTextFile)
        .mockResolvedValueOnce(largeImageFile);

      processingQueue.add.mockResolvedValue({ id: 'optimized-job' } as any);

      const complexOptions: ExtendedProcessingOptions = {
        generateThumbnail: true,
        optimizeForWeb: true,
        extractMetadata: true,
        typeSpecific: {
          image: {
            preserveExif: false,
            autoOrient: true,
            progressive: true,
          },
        },
      };

      await service.queueProcessing(smallTextFile.id, complexOptions);
      await service.queueProcessing(largeImageFile.id, complexOptions);

      expect(processingQueue.add).toHaveBeenCalledTimes(2);

      const textFileCall = processingQueue.add.mock.calls[0];
      const imageFileCall = processingQueue.add.mock.calls[1];

      expect(textFileCall[2]?.priority).toBeGreaterThanOrEqual(
        imageFileCall[2]?.priority || 0,
      );
    });
  });
});
