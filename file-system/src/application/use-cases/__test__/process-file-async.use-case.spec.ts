/**
 * Tests unitaires pour ProcessFileAsyncUseCase
 *
 * Tests complets du use case de traitement asynchrone de fichiers,
 * couvrant la validation, calcul de priorité, gestion de queue et monitoring.
 * Conforme aux standards 07-08 avec pattern AAA et mocks appropriés.
 *
 * @module ProcessFileAsyncUseCaseSpec
 * @version 1.0
 * @author QA Backend
 * @conformsTo 04-06-file-system-tests
 * @conformsTo 07-08 Coding Standards AAA Pattern
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

import { ProcessFileAsyncUseCase } from '../process-file-async.use-case';
import { IFileMetadataRepository } from '../../../domain/repositories/file-metadata.repository';
import { MetricsService } from '../../../infrastructure/monitoring/metrics.service';

import {
  ProcessingOptions,
  FileMetadata,
  ProcessingStatus,
  ProcessingJobStatus,
  VirusScanStatus,
  DocumentType,
} from '../../../types/file-system.types';

import {
  FileNotFoundException,
  InvalidProcessingStateException,
  ProcessingQueueException,
  FileProcessingException,
} from '../../../exceptions/file-system.exceptions';

/**
 * Mock factory pour créer des instances Bull Job
 */
class MockJobFactory {
  static create<T = any>(data: T, options: any = {}): any {
    const mockJob = {
      id: 'job-123',
      name: 'process-uploaded-file',
      data,
      opts: { priority: 5, ...options },
      timestamp: Date.now(),
      processedOn: undefined,
      finishedOn: undefined,
      returnvalue: undefined,
      failedReason: undefined,
      attemptsMade: 0,

      getState: jest.fn().mockResolvedValue('waiting'),
      progress: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      retry: jest.fn().mockResolvedValue(undefined),
      log: jest.fn(),

      getPosition: jest.fn().mockResolvedValue(1),

      queue: {} as any,
      delay: 0,
      toJSON: jest.fn(),
    };

    return mockJob;
  }

  static createCompleted<T = any>(data: T, result: any): any {
    const job = this.create(data);
    job.getState.mockResolvedValue('completed');
    job.returnvalue = result;
    job.processedOn = Date.now() - 5000;
    job.finishedOn = Date.now();
    return job;
  }

  static createFailed<T = any>(data: T, error: string): any {
    const job = this.create(data);
    job.getState.mockResolvedValue('failed');
    job.failedReason = error;
    job.attemptsMade = 3;
    return job;
  }

  static createActive<T = any>(data: T): any {
    const job = this.create(data);
    job.getState.mockResolvedValue('active');
    job.processedOn = Date.now() - 2000;
    return job;
  }
}

// ============================================================================
// MOCKS ET BUILDERS DE TEST DATA
// ============================================================================

class FileMetadataTestDataBuilder {
  private data: Partial<FileMetadata> = {
    id: 'test-file-123',
    userId: 'test-user-456',
    filename: 'test-document.pdf',
    originalName: 'original-test-document.pdf',
    contentType: 'application/pdf',
    size: 5 * 1024 * 1024, // 5MB
    storageKey: 'files/test-user-456/test-document.pdf',
    checksumMd5: 'abc123md5',
    checksumSha256: 'def456sha256',
    virusScanStatus: VirusScanStatus.CLEAN,
    processingStatus: ProcessingStatus.PENDING,
    documentType: DocumentType.DOCUMENT,
    versionCount: 1,
    tags: ['test'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withUserId(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  withProcessingStatus(status: ProcessingStatus): this {
    this.data.processingStatus = status;
    return this;
  }

  withVirusScanStatus(status: VirusScanStatus): this {
    this.data.virusScanStatus = status;
    return this;
  }

  withDocumentType(documentType: DocumentType): this {
    this.data.documentType = documentType;
    return this;
  }

  withSize(size: number): this {
    this.data.size = size;
    return this;
  }

  withContentType(contentType: string): this {
    this.data.contentType = contentType;
    return this;
  }

  asDeleted(): this {
    this.data.deletedAt = new Date();
    return this;
  }

  build(): FileMetadata {
    return this.data as FileMetadata;
  }
}

/**
 * Builder pour créer des ProcessingOptions de test
 */
class ProcessingOptionsTestDataBuilder {
  private data: ProcessingOptions = {
    generateThumbnail: true,
    optimizeForWeb: true,
    extractMetadata: true,
    imageQuality: 85,
  };

  withPriority(priority: number): this {
    this.data.priority = priority;
    return this;
  }

  withUrgent(urgent: boolean = true): this {
    this.data.urgent = urgent;
    return this;
  }

  withReason(reason: string): this {
    this.data.reason = reason;
    return this;
  }

  withImageQuality(quality: number): this {
    this.data.imageQuality = quality;
    return this;
  }

  withOptimizationsDisabled(): this {
    this.data.generateThumbnail = false;
    this.data.optimizeForWeb = false;
    this.data.extractMetadata = false;
    return this;
  }

  build(): ProcessingOptions {
    return { ...this.data };
  }
}

/**
 * Mock factory pour la Queue Bull
 */
function createMockQueue(): jest.Mocked<Queue> {
  return {
    add: jest.fn(),
    getJob: jest.fn(),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 10,
      active: 2,
      completed: 100,
      failed: 5,
      delayed: 0,
    }),
    isPaused: jest.fn().mockResolvedValue(false),
    pause: jest.fn(),
    resume: jest.fn(),
    empty: jest.fn(),
    clean: jest.fn(),
    getWaiting: jest.fn(),
    getActive: jest.fn(),
    getCompleted: jest.fn(),
    getFailed: jest.fn(),
    getDelayed: jest.fn(),
    process: jest.fn(),
    close: jest.fn(),

    name: 'file-processing',

    on: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as jest.Mocked<Queue>;
}

// ============================================================================
// SUITE DE TESTS PRINCIPALE
// ============================================================================

describe('ProcessFileAsyncUseCase', () => {
  let useCase: ProcessFileAsyncUseCase;
  let mockFileProcessingQueue: jest.Mocked<Queue>;
  let mockFileMetadataRepository: jest.Mocked<IFileMetadataRepository>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockCacheManager: jest.Mocked<Cache>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Arrange - Configuration des mocks selon standards 07-08
    mockFileProcessingQueue = createMockQueue();

    const mockServices = {
      IFileMetadataRepository: {
        findById: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      MetricsService: {
        recordHistogram: jest.fn(),
        incrementCounter: jest.fn(),
        updateGauge: jest.fn(),
      },
      CacheManager: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        reset: jest.fn(),
      },
      Logger: {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessFileAsyncUseCase,
        {
          provide: getQueueToken('file-processing'),
          useValue: mockFileProcessingQueue,
        },
        {
          provide: 'IFileMetadataRepository',
          useValue: mockServices.IFileMetadataRepository,
        },
        {
          provide: MetricsService,
          useValue: mockServices.MetricsService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockServices.CacheManager,
        },
        {
          provide: Logger,
          useValue: mockServices.Logger,
        },
      ],
    }).compile();

    useCase = module.get<ProcessFileAsyncUseCase>(ProcessFileAsyncUseCase);
    mockFileMetadataRepository = module.get('IFileMetadataRepository');
    mockMetricsService = module.get(MetricsService);
    mockCacheManager = module.get(CACHE_MANAGER);
    mockLogger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // TESTS DE LA MÉTHODE EXECUTE - Traitement principal
  // ============================================================================

  describe('execute', () => {
    it('should successfully queue file for processing with default options', async () => {
      // Arrange
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withDocumentType(DocumentType.PROJECT_DOCUMENT)
        .build();

      const options = new ProcessingOptionsTestDataBuilder().build();
      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      // Act
      const result = await useCase.execute(fileMetadata.id, options);

      // Assert
      expect(result).toBeDefined();
      expect(result.jobId).toBe('job-123');
      expect(result.status).toBe(ProcessingJobStatus.RUNNING);
      expect(result.progress).toBe(0);
      expect(result.priority).toBeGreaterThan(0);
      expect(result.estimatedDuration).toBeGreaterThan(0);
      expect(result.queuePosition).toBeGreaterThan(0);

      // Vérifications des appels de services
      expect(mockFileMetadataRepository.findById).toHaveBeenCalledWith(
        fileMetadata.id,
      );
      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          fileId: fileMetadata.id,
          jobType: expect.any(String),
          priority: expect.any(Number),
          options: expect.objectContaining({
            generateThumbnail: true,
            optimizeForWeb: true,
            extractMetadata: true,
          }),
        }),
        expect.objectContaining({
          priority: expect.any(Number),
          attempts: 3,
          backoff: expect.any(Object),
        }),
      );

      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          processingStatus: ProcessingStatus.PROCESSING,
          jobId: 'job-123',
        }),
      );

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `file:job:${fileMetadata.id}`,
        expect.any(Object),
        3600,
      );
    });

    it('should calculate higher priority for confidential documents', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withDocumentType(DocumentType.CONFIDENTIAL)
        .build();

      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const result = await useCase.execute(fileMetadata.id);

      expect(result.priority).toBe(9);

      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          priority: 9,
        }),
        expect.objectContaining({
          priority: 9,
        }),
      );
    });

    it('should apply priority penalty for large files', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withSize(100 * 1024 * 1024)
        .withDocumentType(DocumentType.DOCUMENT)
        .build();

      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const result = await useCase.execute(fileMetadata.id);

      expect(result.priority).toBe(3);

      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          priority: 3,
        }),
        expect.objectContaining({
          priority: 3,
        }),
      );
    });

    it('should boost priority for urgent processing', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withDocumentType(DocumentType.DOCUMENT) // Base priority 5
        .build();

      const options = new ProcessingOptionsTestDataBuilder()
        .withUrgent(true)
        .build();

      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const result = await useCase.execute(fileMetadata.id, options);

      expect(result.priority).toBe(8);

      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          priority: 8,
        }),
        expect.objectContaining({
          priority: 8,
        }),
      );
    });

    it('should override priority when explicitly specified', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withDocumentType(DocumentType.CONFIDENTIAL)
        .build();

      const options = new ProcessingOptionsTestDataBuilder()
        .withPriority(2)
        .build();

      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const result = await useCase.execute(fileMetadata.id, options);

      expect(result.priority).toBe(2);

      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.objectContaining({
          priority: 2,
        }),
        expect.objectContaining({
          priority: 2,
        }),
      );
    });

    it('should record comprehensive metrics during execution', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder().build();
      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      await useCase.execute(fileMetadata.id);

      expect(mockMetricsService.recordHistogram).toHaveBeenCalledWith(
        'file_processing_queue_time',
        expect.any(Number),
        expect.objectContaining({
          contentType: fileMetadata.contentType,
          documentType: fileMetadata.documentType,
        }),
      );

      expect(mockMetricsService.recordHistogram).toHaveBeenCalledWith(
        'file_processing_priority',
        expect.any(Number),
        expect.objectContaining({
          documentType: fileMetadata.documentType,
        }),
      );

      expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith(
        'file_processing_jobs_queued',
        expect.objectContaining({
          contentType: fileMetadata.contentType,
        }),
      );
    });

    it('should throw FileNotFoundException for non-existent file', async () => {
      const nonExistentFileId = 'non-existent-file-123';

      mockFileMetadataRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(nonExistentFileId)).rejects.toThrow(
        FileNotFoundException,
      );

      expect(mockFileMetadataRepository.findById).toHaveBeenCalledWith(
        nonExistentFileId,
      );
      expect(mockFileProcessingQueue.add).not.toHaveBeenCalled();
    });

    it('should throw FileNotFoundException for deleted file', async () => {
      const deletedFile = new FileMetadataTestDataBuilder().asDeleted().build();

      mockFileMetadataRepository.findById.mockResolvedValue(deletedFile);

      await expect(useCase.execute(deletedFile.id)).rejects.toThrow(
        FileNotFoundException,
      );

      expect(mockFileProcessingQueue.add).not.toHaveBeenCalled();
    });

    it('should throw InvalidProcessingStateException for file already processing', async () => {
      const processingFile = new FileMetadataTestDataBuilder()
        .withProcessingStatus(ProcessingStatus.PROCESSING)
        .build();

      mockFileMetadataRepository.findById.mockResolvedValue(processingFile);

      await expect(useCase.execute(processingFile.id)).rejects.toThrow(
        InvalidProcessingStateException,
      );

      expect(mockFileProcessingQueue.add).not.toHaveBeenCalled();
    });

    it('should throw FileProcessingException for infected file', async () => {
      // Arrange
      const infectedFile = new FileMetadataTestDataBuilder()
        .withVirusScanStatus(VirusScanStatus.INFECTED)
        .build();

      mockFileMetadataRepository.findById.mockResolvedValue(infectedFile);

      // Act & Assert
      await expect(useCase.execute(infectedFile.id)).rejects.toThrow(
        FileProcessingException,
      );

      expect(mockFileProcessingQueue.add).not.toHaveBeenCalled();
    });

    it('should handle queue failures and update file status', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder().build();

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockRejectedValue(
        new Error('Queue service unavailable'),
      );

      await expect(useCase.execute(fileMetadata.id)).rejects.toThrow(
        'Queue service unavailable',
      );

      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          processingStatus: ProcessingStatus.FAILED,
          error: 'Failed to add job to queue: Queue service unavailable',
        }),
      );
    });

    it('should calculate appropriate timeout based on file characteristics', async () => {
      const largeFileMetadata = new FileMetadataTestDataBuilder()
        .withSize(50 * 1024 * 1024) // 50MB
        .withContentType('application/pdf')
        .build();

      const mockJob = MockJobFactory.create({ fileId: largeFileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(largeFileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(largeFileMetadata);

      await useCase.execute(largeFileMetadata.id);

      expect(mockFileProcessingQueue.add).toHaveBeenCalledWith(
        'process-uploaded-file',
        expect.any(Object),
        expect.objectContaining({
          timeout: expect.any(Number),
        }),
      );

      const callArgs = mockFileProcessingQueue.add.mock.calls[0];
      const jobOptions = callArgs[2];
      expect(jobOptions).toBeDefined();
      expect(jobOptions!.timeout).toBeGreaterThan(60000);
    });
  });

  // ============================================================================
  // TESTS DE GESTION DU STATUT DES JOBS
  // ============================================================================

  describe('getJobStatus', () => {
    it('should return complete job status for active job', async () => {
      const jobId = 'job-active-123';
      const mockJob = MockJobFactory.createActive({ fileId: 'file-123' });
      mockJob.id = jobId;

      const mockProgress = jest.fn().mockReturnValue(45);
      Object.defineProperty(mockJob, 'progress', {
        value: mockProgress,
        writable: true,
      });

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const result = await useCase.getJobStatus(jobId);

      expect(result).toBeDefined();
      expect(result.jobId).toBe(jobId);
      expect(result.status).toBe(ProcessingJobStatus.RUNNING);
      expect(result.progress).toBe(45);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeUndefined();

      expect(mockFileProcessingQueue.getJob).toHaveBeenCalledWith(jobId);
    });

    it('should return complete job status for completed job', async () => {
      const jobId = 'job-completed-123';
      const result = { success: true, processingTime: 5000 };
      const mockJob = MockJobFactory.createCompleted(
        { fileId: 'file-123' },
        result,
      );

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const jobStatus = await useCase.getJobStatus(jobId);

      expect(jobStatus.status).toBe(ProcessingJobStatus.COMPLETED);
      expect(jobStatus.result).toEqual(result);
      expect(jobStatus.startedAt).toBeDefined();
      expect(jobStatus.completedAt).toBeDefined();
      expect(jobStatus.duration).toBe(5000);
    });

    it('should return job status for failed job with error details', async () => {
      const jobId = 'job-failed-123';
      const errorMessage = 'Processing timeout exceeded';
      const mockJob = MockJobFactory.createFailed(
        { fileId: 'file-123' },
        errorMessage,
      );

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const result = await useCase.getJobStatus(jobId);

      expect(result.status).toBe(ProcessingJobStatus.FAILED);
      expect(result.error).toBe(errorMessage);
      expect(result.progress).toBe(0);
    });

    it('should throw ProcessingQueueException for non-existent job', async () => {
      const nonExistentJobId = 'non-existent-job-123';

      mockFileProcessingQueue.getJob.mockResolvedValue(null);

      await expect(useCase.getJobStatus(nonExistentJobId)).rejects.toThrow(
        ProcessingQueueException,
      );

      expect(mockFileProcessingQueue.getJob).toHaveBeenCalledWith(
        nonExistentJobId,
      );
    });
  });

  // ============================================================================
  // TESTS D'ANNULATION DE JOBS
  // ============================================================================

  describe('cancelJob', () => {
    it('should successfully cancel waiting job', async () => {
      const jobId = 'job-waiting-123';
      const fileId = 'file-123';
      const reason = 'User cancelled processing';

      const mockJob = MockJobFactory.create({ fileId });
      mockJob.getState.mockResolvedValue('waiting');
      mockJob.remove.mockResolvedValue(undefined);

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

      const result = await useCase.cancelJob(jobId, reason);

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileId,
        expect.objectContaining({
          processingStatus: ProcessingStatus.PENDING,
          cancelledAt: expect.any(Date),
          cancelReason: reason,
        }),
      );
    });

    it('should successfully cancel active job', async () => {
      const jobId = 'job-active-123';
      const fileId = 'file-456';
      const reason = 'Emergency cancellation';

      const mockJob = MockJobFactory.createActive({ fileId });
      mockJob.remove.mockResolvedValue(undefined);

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

      const result = await useCase.cancelJob(jobId, reason);

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should refuse to cancel completed job', async () => {
      const jobId = 'job-completed-123';
      const reason = 'Too late to cancel';

      const mockJob = MockJobFactory.createCompleted(
        { fileId: 'file-123' },
        {},
      );

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const result = await useCase.cancelJob(jobId, reason);

      expect(result).toBe(false);
      expect(mockJob.remove).not.toHaveBeenCalled();
      expect(mockFileMetadataRepository.update).not.toHaveBeenCalled();
    });

    it('should refuse to cancel failed job', async () => {
      const jobId = 'job-failed-123';
      const reason = 'Cannot cancel failed job';
      const mockJob = MockJobFactory.createFailed(
        { fileId: 'file-123' },
        'Already failed',
      );

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const result = await useCase.cancelJob(jobId, reason);

      expect(result).toBe(false);
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    it('should throw ProcessingQueueException for non-existent job during cancellation', async () => {
      const nonExistentJobId = 'non-existent-job-123';
      const reason = 'Cancel non-existent job';

      mockFileProcessingQueue.getJob.mockResolvedValue(null);

      await expect(useCase.cancelJob(nonExistentJobId, reason)).rejects.toThrow(
        ProcessingQueueException,
      );
    });
  });

  // ============================================================================
  // TESTS DE RETRY DE JOBS
  // ============================================================================

  describe('retryJob', () => {
    it('should successfully retry failed job', async () => {
      const jobId = 'job-failed-123';
      const mockJob = MockJobFactory.createFailed(
        { fileId: 'file-123' },
        'Processing timeout',
      );
      mockJob.id = jobId;

      mockJob.retry.mockImplementation(async () => {
        mockJob.getState.mockResolvedValue('waiting');
        mockJob.progress.mockResolvedValue(undefined);
        mockJob.failedReason = undefined;
      });

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const result = await useCase.retryJob(jobId);

      expect(result).toBeDefined();
      expect(result.jobId).toBe(jobId);
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should throw exception when trying to retry non-failed job', async () => {
      const jobId = 'job-active-123';
      const mockJob = MockJobFactory.createActive({ fileId: 'file-123' });

      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      await expect(useCase.retryJob(jobId)).rejects.toThrow(
        ProcessingQueueException,
      );

      expect(mockJob.retry).not.toHaveBeenCalled();
    });

    it('should throw ProcessingQueueException for non-existent job during retry', async () => {
      const nonExistentJobId = 'non-existent-job-123';

      mockFileProcessingQueue.getJob.mockResolvedValue(null);

      await expect(useCase.retryJob(nonExistentJobId)).rejects.toThrow(
        ProcessingQueueException,
      );
    });
  });

  // ============================================================================
  // TESTS DE TRAITEMENT EN BATCH
  // ============================================================================

  describe('executeBatch', () => {
    it('should successfully process multiple files in batch', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      const options = new ProcessingOptionsTestDataBuilder().build();
      const fileMetadataList = fileIds.map((id) =>
        new FileMetadataTestDataBuilder().withId(id).build(),
      );

      const mockJobs = fileIds.map((id) =>
        MockJobFactory.create({ fileId: id }),
      );

      mockFileMetadataRepository.findById
        .mockResolvedValueOnce(fileMetadataList[0])
        .mockResolvedValueOnce(fileMetadataList[1])
        .mockResolvedValueOnce(fileMetadataList[2]);

      mockFileProcessingQueue.add
        .mockResolvedValueOnce(mockJobs[0])
        .mockResolvedValueOnce(mockJobs[1])
        .mockResolvedValueOnce(mockJobs[2]);

      mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

      const results = await useCase.executeBatch(fileIds, options);

      expect(results).toHaveLength(3);

      results.forEach((result, index) => {
        expect(result.jobId).toBe('job-123');
        expect(result.status).toBe(ProcessingJobStatus.RUNNING);
      });

      expect(mockFileMetadataRepository.findById).toHaveBeenCalledTimes(3);
      expect(mockFileProcessingQueue.add).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch processing', async () => {
      const fileIds = ['file-success', 'file-not-found', 'file-success-2'];
      const options = new ProcessingOptionsTestDataBuilder().build();
      const validFiles = [
        new FileMetadataTestDataBuilder().withId('file-success').build(),
        new FileMetadataTestDataBuilder().withId('file-success-2').build(),
      ];

      const mockJobs = [
        MockJobFactory.create({ fileId: 'file-success' }),
        MockJobFactory.create({ fileId: 'file-success-2' }),
      ];

      mockFileMetadataRepository.findById
        .mockResolvedValueOnce(validFiles[0]) // file-success: OK
        .mockResolvedValueOnce(null) // file-not-found: Error
        .mockResolvedValueOnce(validFiles[1]); // file-success-2: OK

      mockFileProcessingQueue.add
        .mockResolvedValueOnce(mockJobs[0])
        .mockResolvedValueOnce(mockJobs[1]);

      mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

      const results = await useCase.executeBatch(fileIds, options);

      expect(results).toHaveLength(2); // Seulement les fichiers réussis
      expect(results[0].jobId).toBe('job-123');
      expect(results[1].jobId).toBe('job-123');
      expect(results).toHaveLength(2);
    });

    it('should handle large batch with proper batching strategy', async () => {
      const fileIds = Array.from({ length: 25 }, (_, i) => `file-${i + 1}`);
      const options = new ProcessingOptionsTestDataBuilder().build();

      fileIds.forEach((id) => {
        const fileMetadata = new FileMetadataTestDataBuilder()
          .withId(id)
          .build();
        mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

        const mockJob = MockJobFactory.create({ fileId: id });
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      });

      mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

      const results = await useCase.executeBatch(fileIds, options);

      expect(results).toHaveLength(25);
      expect(mockFileMetadataRepository.findById).toHaveBeenCalledTimes(25);
      expect(mockFileProcessingQueue.add).toHaveBeenCalledTimes(25);
    });

    it('should handle empty batch gracefully', async () => {
      const emptyFileIds: string[] = [];
      const options = new ProcessingOptionsTestDataBuilder().build();
      const results = await useCase.executeBatch(emptyFileIds, options);

      expect(results).toHaveLength(0);
      expect(mockFileMetadataRepository.findById).not.toHaveBeenCalled();
      expect(mockFileProcessingQueue.add).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // TESTS DES MÉTHODES UTILITAIRES PRIVÉES
  // ============================================================================

  describe('Private Utility Methods', () => {
    describe('Priority Calculation', () => {
      it('should respect minimum and maximum priority bounds', async () => {
        const fileMetadata = new FileMetadataTestDataBuilder()
          .withDocumentType(DocumentType.CONFIDENTIAL)
          .build();

        const options = new ProcessingOptionsTestDataBuilder()
          .withUrgent(true)
          .build();

        const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

        mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);
        mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

        const result = await useCase.execute(fileMetadata.id, options);

        expect(result.priority).toBe(10);

        const lowPriorityFile = new FileMetadataTestDataBuilder()
          .withDocumentType(DocumentType.ARCHIVE)
          .withSize(100 * 1024 * 1024)
          .build();

        mockFileMetadataRepository.findById.mockResolvedValue(lowPriorityFile);
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);

        const lowResult = await useCase.execute(lowPriorityFile.id);
        expect(lowResult.priority).toBe(1);
      });
    });

    describe('Duration Estimation', () => {
      it('should estimate longer duration for larger files', async () => {
        const largeFile = new FileMetadataTestDataBuilder()
          .withSize(50 * 1024 * 1024)
          .withContentType('application/pdf')
          .build();

        const smallFile = new FileMetadataTestDataBuilder()
          .withSize(1 * 1024 * 1024)
          .withContentType('application/pdf')
          .build();

        const mockJob = MockJobFactory.create({ fileId: largeFile.id });

        mockFileMetadataRepository.findById
          .mockResolvedValueOnce(largeFile)
          .mockResolvedValueOnce(smallFile);
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);
        mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

        const largeFileResult = await useCase.execute(largeFile.id);
        const smallFileResult = await useCase.execute(smallFile.id);

        expect(largeFileResult.estimatedDuration).toBeDefined();
        expect(smallFileResult.estimatedDuration).toBeDefined();
        expect(largeFileResult.estimatedDuration).toBeDefined();
        expect(smallFileResult.estimatedDuration).toBeDefined();
        expect(largeFileResult.estimatedDuration!).toBeGreaterThan(
          smallFileResult.estimatedDuration!,
        );
      });

      it('should estimate different durations for different content types', async () => {
        const pdfFile = new FileMetadataTestDataBuilder()
          .withContentType('application/pdf')
          .withSize(10 * 1024 * 1024)
          .build();

        const imageFile = new FileMetadataTestDataBuilder()
          .withContentType('image/jpeg')
          .withSize(10 * 1024 * 1024)
          .build();

        const mockJob = MockJobFactory.create({ fileId: pdfFile.id });

        mockFileMetadataRepository.findById
          .mockResolvedValueOnce(pdfFile)
          .mockResolvedValueOnce(imageFile);
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);
        mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

        const pdfResult = await useCase.execute(pdfFile.id);
        const imageResult = await useCase.execute(imageFile.id);

        expect(pdfResult.estimatedDuration).toBeDefined();
        expect(imageResult.estimatedDuration).toBeDefined();
        expect(pdfResult.estimatedDuration!).toBeGreaterThan(
          imageResult.estimatedDuration!,
        );
      });
    });

    describe('Queue Position Calculation', () => {
      it('should estimate queue position based on priority and waiting jobs', async () => {
        const highPriorityFile = new FileMetadataTestDataBuilder()
          .withDocumentType(DocumentType.CONFIDENTIAL)
          .build();

        const lowPriorityFile = new FileMetadataTestDataBuilder()
          .withDocumentType(DocumentType.ARCHIVE)
          .build();

        const mockJob = MockJobFactory.create({ fileId: highPriorityFile.id });

        mockFileProcessingQueue.getJobCounts.mockResolvedValue({
          waiting: 20,
          active: 2,
          completed: 100,
          failed: 5,
          delayed: 0,
        });

        mockFileMetadataRepository.findById
          .mockResolvedValueOnce(highPriorityFile)
          .mockResolvedValueOnce(lowPriorityFile);
        mockFileProcessingQueue.add.mockResolvedValue(mockJob);
        mockFileMetadataRepository.update.mockResolvedValue({} as FileMetadata);

        const highPriorityResult = await useCase.execute(highPriorityFile.id);
        const lowPriorityResult = await useCase.execute(lowPriorityFile.id);

        expect(highPriorityResult.queuePosition).toBeDefined();
        expect(lowPriorityResult.queuePosition).toBeDefined();
        expect(highPriorityResult.queuePosition!).toBeLessThanOrEqual(
          lowPriorityResult.queuePosition!,
        );
        expect(highPriorityResult.queuePosition).toBeGreaterThan(0);
        expect(lowPriorityResult.queuePosition).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // TESTS D'INTÉGRATION ET SCENARIOS COMPLEXES
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('should handle complete workflow from queue to completion tracking', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withDocumentType(DocumentType.PROJECT_DOCUMENT)
        .build();

      const options = new ProcessingOptionsTestDataBuilder()
        .withUrgent(true)
        .withReason('Critical project deadline')
        .build();

      const mockJob = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add.mockResolvedValue(mockJob);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const queueResult = await useCase.execute(fileMetadata.id, options);

      expect(queueResult.status).toBe(ProcessingJobStatus.RUNNING);
      expect(queueResult.priority).toBeGreaterThan(7); // Urgent + PROJECT_DOCUMENT

      mockJob.getState.mockResolvedValue('active');

      const mockProgressFn = jest.fn().mockReturnValue(50);
      Object.defineProperty(mockJob, 'progress', {
        value: mockProgressFn,
        writable: true,
      });

      mockJob.processedOn = Date.now() - 1000;
      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const activeStatus = await useCase.getJobStatus(
        queueResult.jobId.toString(),
      );

      expect(activeStatus.status).toBe(ProcessingJobStatus.RUNNING);
      expect(activeStatus.progress).toBe(50);
      expect(activeStatus.startedAt).toBeDefined();

      const completionResult = { success: true, processingTime: 5000 };
      mockJob.getState.mockResolvedValue('completed');
      mockJob.returnvalue = completionResult;
      mockJob.finishedOn = Date.now();

      const completedStatus = await useCase.getJobStatus(
        queueResult.jobId.toString(),
      );

      expect(completedStatus.status).toBe(ProcessingJobStatus.COMPLETED);
      expect(completedStatus.result).toEqual(completionResult);
      expect(completedStatus.completedAt).toBeDefined();
      expect(completedStatus.duration).toBeDefined();
    });

    it('should handle error recovery and retry workflow', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder().build();
      const mockJob = MockJobFactory.createFailed(
        { fileId: fileMetadata.id },
        'Temporary service error',
      );

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.getJob.mockResolvedValue(mockJob);

      const failedStatus = await useCase.getJobStatus('job-failed-123');

      expect(failedStatus.status).toBe(ProcessingJobStatus.FAILED);
      expect(failedStatus.error).toBe('Temporary service error');

      mockJob.retry.mockImplementation(async () => {
        mockJob.getState.mockResolvedValue('waiting');
        mockJob.failedReason = undefined;
        mockJob.attemptsMade = 0;
      });

      const retryResult = await useCase.retryJob('job-failed-123');

      expect(retryResult.status).toBe(ProcessingJobStatus.QUEUED);
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should handle concurrent operations without conflicts', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder().build();
      const mockJob1 = MockJobFactory.create({ fileId: fileMetadata.id });
      const mockJob2 = MockJobFactory.create({ fileId: fileMetadata.id });

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockFileProcessingQueue.add
        .mockResolvedValueOnce(mockJob1)
        .mockResolvedValueOnce(mockJob2);
      mockFileMetadataRepository.update.mockResolvedValue(fileMetadata);

      const promise1 = useCase.execute(fileMetadata.id, {
        reason: 'First attempt',
      });

      const result1 = await promise1;
      expect(result1).toBeDefined();

      fileMetadata.processingStatus = ProcessingStatus.PROCESSING;
      const promise2 = useCase.execute(fileMetadata.id, {
        reason: 'Second attempt',
      });
      await expect(promise2).rejects.toThrow(InvalidProcessingStateException);
    });
  });
});
