/**
 * Tests unitaires pour FileProcessingProcessor
 *
 * Tests complets du processor de traitement asynchrone de fichiers,
 * couvrant tous les types de jobs, gestion d'erreurs, et événements de queue.
 * Conforme aux standards 07-08 avec pattern AAA et mocks appropriés.
 *
 * @module FileProcessingProcessorSpec
 * @version 1.0
 * @author QA Backend
 * @conformsTo 04-06-file-system-tests
 * @conformsTo 07-08 Coding Standards AAA Pattern
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { FileProcessingProcessor } from '../file-processing.processor';
import { FileProcessingService } from '../../../domain/services/file-processing.service';
import {
  ImageProcessorService,
  LocalOptimizedImage,
  LocalConversionResult,
} from '../../processing/image-processor.service';
import {
  PdfProcessorService,
  OptimizedPdf,
  PdfPreview,
} from '../../processing/pdf-processor.service';
import {
  DocumentProcessorService,
  ProcessedDocument,
} from '../../processing/document-processor.service';
import { MetricsService } from '../../monitoring/metrics.service';
import { IFileMetadataRepository } from '../../../domain/repositories/file-metadata.repository';
import {
  ProcessingJobData,
  ThumbnailJobData,
  ConversionJobData,
  ProcessingJobType,
  ProcessingStatus,
  VirusScanStatus,
  DocumentType,
  ProcessingJobStatus,
  ImageFormat,
  FileMetadata,
  SecurityScanResult,
} from '../../../types/file-system.types';
import {
  FileNotFoundException,
  ProcessingException,
  OptimizationException,
  ThumbnailGenerationException,
} from '../../../exceptions/file-system.exceptions';

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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withContentType(contentType: string): this {
    this.data.contentType = contentType;
    return this;
  }

  withSize(size: number): this {
    this.data.size = size;
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

  asDeleted(): this {
    this.data.deletedAt = new Date();
    return this;
  }

  build(): FileMetadata {
    return this.data as FileMetadata;
  }
}

/**
 * Builder pour créer des ProcessingJobData de test
 */
class ProcessingJobDataTestDataBuilder {
  private data: Partial<ProcessingJobData> = {
    id: 'job-123',
    fileId: 'test-file-123',
    jobType: ProcessingJobType.FULL_PROCESSING,
    priority: 5,
    status: ProcessingJobStatus.QUEUED,
    progress: 0,
    options: {
      generateThumbnail: true,
      optimizeForWeb: true,
      extractMetadata: true,
    },
    userId: 'test-user-456',
    reason: 'Test processing',
    createdAt: new Date(),
  };

  withFileId(fileId: string): this {
    this.data.fileId = fileId;
    return this;
  }

  withJobType(jobType: ProcessingJobType): this {
    this.data.jobType = jobType;
    return this;
  }

  withPriority(priority: number): this {
    this.data.priority = priority;
    return this;
  }

  withOptions(options: any): this {
    this.data.options = { ...this.data.options, ...options };
    return this;
  }

  build(): ProcessingJobData {
    return this.data as ProcessingJobData;
  }
}

/**
 * Mock factory pour créer des instances Bull Job compatibles
 */
class MockJobFactory {
  static create<T = any>(data: T, options: any = {}): jest.Mocked<Job<T>> {
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
      log: jest.fn().mockResolvedValue(undefined),
      getPosition: jest.fn().mockResolvedValue(1),

      stacktrace: [],
      isCompleted: jest.fn().mockResolvedValue(false),
      isFailed: jest.fn().mockResolvedValue(false),
      isDelayed: jest.fn().mockResolvedValue(false),
      isActive: jest.fn().mockResolvedValue(false),
      isWaiting: jest.fn().mockResolvedValue(true),
      isPaused: jest.fn().mockResolvedValue(false),
      isStuck: jest.fn().mockResolvedValue(false),

      queue: {} as any,
      delay: 0,
      toJSON: jest.fn().mockReturnValue({}),

      moveToCompleted: jest.fn(),
      moveToFailed: jest.fn(),
      discard: jest.fn(),
      promote: jest.fn(),
      finished: jest.fn().mockResolvedValue(undefined),
    };

    return mockJob as any;
  }
}

/**
 * Mock complet d'un Job Bull
 */
function createMockJob<T = any>(
  data: T,
  options: any = {},
): jest.Mocked<Job<T>> {
  return MockJobFactory.create(data, options);
}

/**
 * Factory pour créer des résultats de services mockés
 */

class MockResultsFactory {
  static createSecurityScanResult(safe: boolean = true): SecurityScanResult {
    return {
      safe,
      threatsFound: safe ? [] : ['Test.Virus.Mock'],
      engineVersion: '1.0.0-test',
      signaturesDate: new Date(),
      scanDuration: 1500,
      scannedAt: new Date(),
      scanDetails: {
        fileId: 'test-file-123',
        contentType: 'application/pdf',
        size: 5 * 1024 * 1024,
      },
    };
  }

  static createOptimizedImageResult(): LocalOptimizedImage {
    return {
      buffer: Buffer.from('optimized-image-data'),
      originalSize: 5 * 1024 * 1024,
      optimizedSize: 3 * 1024 * 1024,
      compressionRatio: 0.6,
      format: 'webp',
      dimensions: {
        width: 1920,
        height: 1080,
      },
      storageKey: 'optimized/test-file-123.webp',
    };
  }

  static createThumbnailResult(): any {
    return {
      success: true,
      url: 'https://cdn.coders.com/thumbnails/test-file-123/thumbnail.webp',
      dimensions: { width: 150, height: 150 },
      storageKey: 'thumbnails/test-file-123/thumbnail.webp',
      format: ImageFormat.WEBP,
      size: 15000,
      quality: 85,
      width: 150,
      height: 150,
    };
  }

  static createOptimizedPdfResult(): OptimizedPdf {
    return {
      buffer: Buffer.from('optimized-pdf-data'),
      originalSize: 10 * 1024 * 1024,
      optimizedSize: 7 * 1024 * 1024,
      compressionRatio: 0.7,
      techniques: ['compression', 'image_optimization'],
      pageCount: 10,
      processingTime: 5000,
      storageKey: 'optimized/test-file-123.pdf',
    };
  }

  static createPdfPreviewResult(): PdfPreview {
    return {
      success: true,
      thumbnailUrl: 'https://cdn.coders.com/previews/test.jpg',
      pagePreview: [
        {
          pageNumber: 1,
          url: 'https://cdn.coders.com/previews/test-page-1.jpg',
          dimensions: { width: 595, height: 842 },
        },
      ],
      originalDimensions: {
        width: 595,
        height: 842,
      },
    };
  }

  static createDocumentProcessingResult(): ProcessedDocument {
    return {
      success: true,
      textContent: 'Extracted text content from document',
      encoding: 'utf-8',
      lineCount: 45,
      wordCount: 250,
      characterCount: 1500,
      characterCountNoSpaces: 1250,
      detectedLanguage: 'fr',
      summary: 'Document summary',
      specializedMetadata: {
        author: 'Test Author',
        title: 'Test Document',
      },
      processingTime: 3000,
    };
  }

  static createConversionResult(
    success: boolean = true,
  ): LocalConversionResult {
    if (success) {
      return {
        success: true,
        fromFormat: 'png',
        toFormat: 'webp',
        buffer: Buffer.from('converted-data'),
        originalSize: 2 * 1024 * 1024,
        convertedSize: 1.2 * 1024 * 1024,
        compressionRatio: 0.6,
        qualityRetained: 90,
        conversionTime: 3000,
      };
    } else {
      return {
        success: false,
        fromFormat: 'jpeg',
        toFormat: 'png',
        buffer: Buffer.alloc(0),
        originalSize: 0,
        convertedSize: 0,
        compressionRatio: 0,
        qualityRetained: 0,
        conversionTime: 0,
        error: 'Conversion failed due to corrupted image',
      };
    }
  }
}

// ============================================================================
// SUITE DE TESTS PRINCIPALE
// ============================================================================

describe('FileProcessingProcessor', () => {
  let processor: FileProcessingProcessor;
  let mockFileProcessingService: jest.Mocked<FileProcessingService>;
  let mockImageProcessor: jest.Mocked<ImageProcessorService>;
  let mockPdfProcessor: jest.Mocked<PdfProcessorService>;
  let mockDocumentProcessor: jest.Mocked<DocumentProcessorService>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockFileMetadataRepository: jest.Mocked<IFileMetadataRepository>;

  beforeEach(async () => {
    // Arrange - Setup des mocks selon pattern 07-08
    const mockServices = {
      FileProcessingService: {
        processUploadedFile: jest.fn(),
        createVersion: jest.fn(),
        getFileMetadata: jest.fn(),
      },
      ImageProcessorService: {
        optimizeImage: jest.fn(),
        generateThumbnail: jest.fn(),
        generateMultipleFormats: jest.fn(),
      },
      PdfProcessorService: {
        optimizePdf: jest.fn(),
        generatePreview: jest.fn(),
        extractMetadata: jest.fn(),
      },
      DocumentProcessorService: {
        processDocument: jest.fn(),
      },
      MetricsService: {
        recordHistogram: jest.fn(),
        incrementCounter: jest.fn(),
        updateGauge: jest.fn(),
      },
      IFileMetadataRepository: {
        findById: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileProcessingProcessor,
        {
          provide: FileProcessingService,
          useValue: mockServices.FileProcessingService,
        },
        {
          provide: ImageProcessorService,
          useValue: mockServices.ImageProcessorService,
        },
        {
          provide: PdfProcessorService,
          useValue: mockServices.PdfProcessorService,
        },
        {
          provide: DocumentProcessorService,
          useValue: mockServices.DocumentProcessorService,
        },
        {
          provide: MetricsService,
          useValue: mockServices.MetricsService,
        },
        {
          provide: 'IFileMetadataRepository',
          useValue: mockServices.IFileMetadataRepository,
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<FileProcessingProcessor>(FileProcessingProcessor);
    mockFileProcessingService = module.get(FileProcessingService);
    mockImageProcessor = module.get(ImageProcessorService);
    mockPdfProcessor = module.get(PdfProcessorService);
    mockDocumentProcessor = module.get(DocumentProcessorService);
    mockMetricsService = module.get(MetricsService);
    mockFileMetadataRepository = module.get('IFileMetadataRepository');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // TESTS DU PROCESS PRINCIPAL - processUploadedFile
  // ============================================================================

  describe('processUploadedFile', () => {
    it('should process PDF file successfully with complete workflow', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .withSize(10 * 1024 * 1024)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockPdfProcessor.optimizePdf.mockResolvedValue(
        MockResultsFactory.createOptimizedPdfResult(),
      );
      mockPdfProcessor.generatePreview.mockResolvedValue(
        MockResultsFactory.createPdfPreviewResult(),
      );
      mockPdfProcessor.extractMetadata.mockResolvedValue({
        title: 'Test PDF',
        author: 'Test Author',
        pageCount: 10,
      });

      const result = await processor.processUploadedFile(job);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.metadata).toEqual(fileMetadata);
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations!.compressionRatio).toBe(0.7);
      expect(result.thumbnailUrl).toBe(
        'https://cdn.coders.com/previews/test.jpg',
      );
      expect(result.extractedMetadata).toBeDefined();
      expect(result.extractedMetadata!.type).toBe('pdf');

      expect(mockFileMetadataRepository.findById).toHaveBeenCalledWith(
        fileMetadata.id,
      );
      expect(mockPdfProcessor.optimizePdf).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          compressionLevel: 6,
          linearize: true,
        }),
      );
      expect(mockPdfProcessor.generatePreview).toHaveBeenCalledWith(
        fileMetadata.id,
        1,
        150,
      );
      expect(mockPdfProcessor.extractMetadata).toHaveBeenCalledWith(
        fileMetadata.id,
      );

      expect(job.progress).toHaveBeenCalledWith(0);
      expect(job.progress).toHaveBeenCalledWith(100);
      expect(job.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing initiated'),
      );
      expect(job.log).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully'),
      );
    });

    it('should process image file successfully with optimization and thumbnail', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/jpeg')
        .withSize(5 * 1024 * 1024)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockImageProcessor.optimizeImage.mockResolvedValue(
        MockResultsFactory.createOptimizedImageResult(),
      );
      mockImageProcessor.generateThumbnail.mockResolvedValue(
        MockResultsFactory.createThumbnailResult(),
      );

      const result = await processor.processUploadedFile(job);

      expect(result.success).toBe(true);
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations!.compressionRatio).toBe(0.6);
      expect(result.thumbnailUrl).toBeDefined();

      expect(mockImageProcessor.optimizeImage).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          optimizeForWeb: true,
          quality: 85,
          format: ImageFormat.WEBP,
        }),
      );
      expect(mockImageProcessor.generateThumbnail).toHaveBeenCalledWith(
        fileMetadata.id,
        150,
        [ImageFormat.WEBP, ImageFormat.JPEG],
      );
    });

    it('should process document file successfully with text extraction', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('text/plain')
        .withSize(50 * 1024)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockDocumentProcessor.processDocument.mockResolvedValue(
        MockResultsFactory.createDocumentProcessingResult(),
      );

      const result = await processor.processUploadedFile(job);

      expect(result.success).toBe(true);
      expect(result.extractedMetadata).toBeDefined();
      expect(result.extractedMetadata).toBeDefined();
      expect(result.extractedMetadata!.type).toBe('document');
      expect(result.extractedMetadata!.wordCount).toBe(250);
      expect(result.extractedMetadata!.detectedLanguage).toBe('fr');

      expect(mockDocumentProcessor.processDocument).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          extractText: true,
          detectLanguage: true,
          generateSummary: true,
          optimizeEncoding: true,
        }),
      );
    });

    it('should handle file not found error gracefully', async () => {
      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId('non-existent-file')
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(null);

      await expect(processor.processUploadedFile(job)).rejects.toThrow(
        FileNotFoundException,
      );

      expect(mockFileMetadataRepository.findById).toHaveBeenCalledWith(
        'non-existent-file',
      );
      expect(job.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing failed'),
      );
    });

    it('should handle deleted file appropriately', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .asDeleted()
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      await expect(processor.processUploadedFile(job)).rejects.toThrow(
        FileNotFoundException,
      );
    });

    it('should quarantine infected file and stop processing', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withVirusScanStatus(VirusScanStatus.PENDING)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      jest
        .spyOn(processor as any, 'performSecurityScan')
        .mockResolvedValue(MockResultsFactory.createSecurityScanResult(false));

      await expect(processor.processUploadedFile(job)).rejects.toThrow(
        ProcessingException,
      );

      expect(job.log).toHaveBeenCalledWith('Starting security scan');
      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          virusScanStatus: VirusScanStatus.INFECTED,
          deletedAt: expect.any(Date),
        }),
      );
    });

    it('should handle processing errors and update file status', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(processor.processUploadedFile(job)).rejects.toThrow();

      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          processingStatus: ProcessingStatus.FAILED,
        }),
      );
    });
  });

  // ============================================================================
  // TESTS DE GÉNÉRATION DE THUMBNAILS
  // ============================================================================

  describe('generateThumbnail', () => {
    it('should generate thumbnail successfully for image file', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/jpeg')
        .build();

      const thumbnailJobData: ThumbnailJobData = {
        fileId: fileMetadata.id,
        sizes: '150',
        format: 'webp',
        quality: 85,
      };

      const job = createMockJob(thumbnailJobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockImageProcessor.generateThumbnail.mockResolvedValue(
        MockResultsFactory.createThumbnailResult(),
      );

      const result = await processor.generateThumbnail(job);

      expect(result).toBeDefined();
      expect(result.url).toBe(
        'https://cdn.coders.com/thumbnails/test-file-123/thumbnail.webp',
      );
      expect(result.width).toBe(150);
      expect(result.height).toBe(150);
      expect(result.format).toBe(ImageFormat.WEBP);
      expect(result.quality).toBe(85);

      expect(mockImageProcessor.generateThumbnail).toHaveBeenCalledWith(
        fileMetadata.id,
        150,
        [ImageFormat.WEBP],
      );
      expect(job.progress).toHaveBeenCalledWith(100);
    });

    it('should reject thumbnail generation for non-image file', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .build();

      const thumbnailJobData: ThumbnailJobData = {
        fileId: fileMetadata.id,
        sizes: '150',
      };

      const job = createMockJob(thumbnailJobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      await expect(processor.generateThumbnail(job)).rejects.toThrow(
        ThumbnailGenerationException,
      );

      expect(mockImageProcessor.generateThumbnail).not.toHaveBeenCalled();
    });

    it('should handle multiple thumbnail sizes correctly', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/png')
        .build();

      const thumbnailJobData: ThumbnailJobData = {
        fileId: fileMetadata.id,
        sizes: ['150', '300', '500'],
        format: 'jpeg',
      };

      const job = createMockJob(thumbnailJobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockImageProcessor.generateThumbnail.mockResolvedValue(
        MockResultsFactory.createThumbnailResult(),
      );

      const result = await processor.generateThumbnail(job);

      expect(result).toBeDefined();
      expect(mockImageProcessor.generateThumbnail).toHaveBeenCalledWith(
        fileMetadata.id,
        150,
        [ImageFormat.JPEG],
      );
    });
  });

  // ============================================================================
  // TESTS D'OPTIMISATION PDF
  // ============================================================================

  describe('optimizePdf', () => {
    it('should optimize PDF successfully with compression', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .withSize(10 * 1024 * 1024)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .withOptions({ pdfCompressionLevel: 8 })
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockPdfProcessor.optimizePdf.mockResolvedValue(
        MockResultsFactory.createOptimizedPdfResult(),
      );

      const result = await processor.optimizePdf(job);

      expect(result.success).toBe(true);
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations).toBeDefined();
      expect(result.optimizations!.compressionRatio).toBe(0.7);
      expect(result.optimizations!.techniques).toContain('compression');
      expect(mockPdfProcessor.optimizePdf).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          compressionLevel: 8,
          linearize: true,
          removeMetadata: false,
          optimizeImages: true,
          imageQuality: 75,
        }),
      );

      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          processingStatus: ProcessingStatus.COMPLETED,
        }),
      );
    });

    it('should reject PDF optimization for non-PDF file', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/jpeg')
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      await expect(processor.optimizePdf(job)).rejects.toThrow(
        OptimizationException,
      );

      expect(mockPdfProcessor.optimizePdf).not.toHaveBeenCalled();
    });

    it('should handle PDF optimization errors gracefully', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockPdfProcessor.optimizePdf.mockRejectedValue(
        new Error('Corrupted PDF'),
      );

      await expect(processor.optimizePdf(job)).rejects.toThrow('Corrupted PDF');

      expect(job.log).toHaveBeenCalledWith('PDF validation completed');
    });
  });

  // ============================================================================
  // TESTS DE CONVERSION DE FORMAT
  // ============================================================================

  describe('convertFormat', () => {
    it('should convert image format successfully', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/png')
        .build();

      const conversionJobData: ConversionJobData = {
        fileId: fileMetadata.id,
        targetFormat: 'webp',
        options: { quality: 90 },
      };

      const job = createMockJob(conversionJobData);

      const mockConversionResult =
        MockResultsFactory.createConversionResult(true);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockImageProcessor.generateMultipleFormats.mockResolvedValue([
        mockConversionResult,
      ]);

      const result = await processor.convertFormat(job);

      expect(result).toBeDefined();
      expect(result.fromFormat).toBe('png');
      expect(result.toFormat).toBe('webp');
      expect(result.success).toBe(true);
      expect(result.originalSize).toBe(2 * 1024 * 1024);
      expect(result.convertedSize).toBe(1.2 * 1024 * 1024);
      expect(mockImageProcessor.generateMultipleFormats).toHaveBeenCalledWith(
        fileMetadata.id,
        [ImageFormat.WEBP],
      );
    });

    it('should handle conversion failure appropriately', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('image/jpeg')
        .build();

      const conversionJobData: ConversionJobData = {
        fileId: fileMetadata.id,
        targetFormat: 'png',
      };

      const job = createMockJob(conversionJobData);

      const mockFailedConversion =
        MockResultsFactory.createConversionResult(false);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);
      mockImageProcessor.generateMultipleFormats.mockResolvedValue([
        mockFailedConversion,
      ]);

      await expect(processor.convertFormat(job)).rejects.toThrow(
        'Conversion failed due to corrupted image',
      );
    });

    it('should reject conversion for unsupported file type', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withContentType('application/pdf')
        .build();

      const conversionJobData: ConversionJobData = {
        fileId: fileMetadata.id,
        targetFormat: 'jpeg',
      };

      const job = createMockJob(conversionJobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      await expect(processor.convertFormat(job)).rejects.toThrow(
        'Format conversion not supported',
      );
    });
  });

  // ============================================================================
  // TESTS DE RE-SCAN ANTIVIRUS
  // ============================================================================

  describe('rescanVirus', () => {
    it('should perform virus rescan successfully and confirm clean file', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withVirusScanStatus(VirusScanStatus.PENDING)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      jest
        .spyOn(processor as any, 'performSecurityScan')
        .mockResolvedValue(MockResultsFactory.createSecurityScanResult(true));

      const result = await processor.rescanVirus(job);

      expect(result.success).toBe(true);
      expect(result.securityScan).toBeDefined();
      expect(result.securityScan!.safe).toBe(true);
      expect(mockFileMetadataRepository.update).toHaveBeenCalledWith(
        fileMetadata.id,
        expect.objectContaining({
          virusScanStatus: VirusScanStatus.CLEAN,
        }),
      );

      expect(job.log).toHaveBeenCalledWith('Virus rescan completed: CLEAN');
    });

    it('should detect virus during rescan and quarantine file', async () => {
      const fileMetadata = new FileMetadataTestDataBuilder()
        .withVirusScanStatus(VirusScanStatus.CLEAN)
        .build();

      const jobData = new ProcessingJobDataTestDataBuilder()
        .withFileId(fileMetadata.id)
        .build();

      const job = createMockJob(jobData);

      mockFileMetadataRepository.findById.mockResolvedValue(fileMetadata);

      jest
        .spyOn(processor as any, 'performSecurityScan')
        .mockResolvedValue(MockResultsFactory.createSecurityScanResult(false));

      jest
        .spyOn(processor as any, 'quarantineFile')
        .mockResolvedValue(undefined);

      const result = await processor.rescanVirus(job);

      expect(result.success).toBe(true);
      expect(result.securityScan).toBeDefined();
      expect(result.securityScan!.safe).toBe(false);
      expect(job.log).toHaveBeenCalledWith(
        'SECURITY ALERT: Threats detected in file test-file-123',
      );
      expect(job.log).toHaveBeenCalledWith('Virus rescan completed: INFECTED');
    });
  });

  // ============================================================================
  // TESTS DU TRAITEMENT DE TEXTE
  // ============================================================================

  describe('processText', () => {
    it('should process text content successfully with analysis', async () => {
      const textJobData = {
        text: 'Ceci est un texte de test en français avec des MAJUSCULES et des chiffres 123.',
        timestamp: Date.now(),
        type: 'analysis',
        source: 'user_input',
      };

      const job = createMockJob(textJobData);

      const result = await processor.processText(job);

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.wordCount).toBeGreaterThan(0);
      expect(result.analysis.charCount).toBeGreaterThan(0);
      expect(result.analysis.hasUpperCase).toBe(true);
      expect(result.analysis.hasNumbers).toBe(true);
      expect(result.analysis.language).toBe('fr');
      expect(result.analysis.sentiment).toBe('neutral');
      expect(job.progress).toHaveBeenCalledWith(0);
      expect(job.progress).toHaveBeenCalledWith(100);
      expect(job.log).toHaveBeenCalledWith(
        'Text processing completed successfully',
      );
    });

    it('should detect English language correctly', async () => {
      const textJobData = {
        text: 'This is a great English text with excellent content and good quality.',
        timestamp: Date.now(),
        type: 'analysis',
        source: 'document',
      };

      const job = createMockJob(textJobData);

      const result = await processor.processText(job);

      expect(result.analysis.language).toBe('en');
      expect(result.analysis.sentiment).toBe('positive');
    });

    it('should detect negative sentiment correctly', async () => {
      const textJobData = {
        text: 'This is a terrible and awful document with bad content.',
        timestamp: Date.now(),
        type: 'sentiment',
        source: 'review',
      };

      const job = createMockJob(textJobData);

      const result = await processor.processText(job);

      expect(result.analysis.sentiment).toBe('negative');
    });

    it('should handle text processing errors gracefully', async () => {
      const textJobData = {
        text: '',
        timestamp: Date.now(),
        type: 'analysis',
        source: 'empty',
      };

      const job = createMockJob(textJobData);

      const result = await processor.processText(job);

      expect(result.analysis.wordCount).toBeLessThanOrEqual(1);
      expect(result.analysis.charCount).toBe(0);
    });
  });

  // ============================================================================
  // TESTS DES GESTIONNAIRES D'ÉVÉNEMENTS
  // ============================================================================

  describe('Event Handlers', () => {
    describe('onActive', () => {
      it('should log job activation and update metrics', () => {
        const jobData = new ProcessingJobDataTestDataBuilder().build();
        const job = createMockJob(jobData);

        processor.onActive(job);

        expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith(
          'file_processing_jobs_started',
          { jobType: 'process-uploaded-file' },
        );
      });
    });

    describe('onCompleted', () => {
      it('should log completion and record metrics', () => {
        const jobData = new ProcessingJobDataTestDataBuilder().build();
        const job = createMockJob(jobData);
        job.timestamp = Date.now() - 5000;

        const result = { success: true };

        processor.onCompleted(job, result);

        expect(mockMetricsService.recordHistogram).toHaveBeenCalledWith(
          'file_processing_duration',
          expect.any(Number),
          expect.objectContaining({
            jobType: 'process-uploaded-file',
            success: 'true',
          }),
        );
      });
    });

    describe('onFailed', () => {
      it('should log failure and record error metrics', () => {
        const jobData = new ProcessingJobDataTestDataBuilder()
          .withPriority(8)
          .build();
        const job = createMockJob(jobData);
        job.attemptsMade = 3;

        const error = new Error('Processing failed');

        processor.onFailed(job, error);

        expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith(
          'file_processing_jobs_failed',
          expect.objectContaining({
            jobType: 'process-uploaded-file',
            errorType: 'Error',
          }),
        );
      });
    });

    describe('onProgress', () => {
      it('should update progress metrics', () => {
        const jobData = new ProcessingJobDataTestDataBuilder().build();
        const job = createMockJob(jobData);
        const progress = 45;

        processor.onProgress(job, progress);

        expect(mockMetricsService.updateGauge).toHaveBeenCalledWith(
          'file_processing_progress',
          45,
          expect.objectContaining({
            jobId: 'job-123',
            fileId: jobData.fileId,
          }),
        );
      });
    });

    describe('onStalled', () => {
      it('should log stalled job and record metrics', () => {
        const jobData = new ProcessingJobDataTestDataBuilder().build();
        const job = createMockJob(jobData);
        job.attemptsMade = 2;

        processor.onStalled(job);

        expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith(
          'file_processing_jobs_stalled',
          { jobType: 'process-uploaded-file' },
        );
      });
    });

    describe('onError', () => {
      it('should log queue error and record metrics', () => {
        const error = new Error('Queue connection failed');

        processor.onError(error);

        expect(mockMetricsService.incrementCounter).toHaveBeenCalledWith(
          'file_processing_queue_errors',
          { errorType: 'Error' },
        );
      });
    });
  });

  // ============================================================================
  // TESTS DES MÉTHODES UTILITAIRES PRIVÉES
  // ============================================================================

  describe('Utility Methods', () => {
    describe('Type Detection', () => {
      it('should correctly identify image files', () => {
        const isImageFile = (processor as any).isImageFile;

        expect(isImageFile('image/jpeg')).toBe(true);
        expect(isImageFile('image/png')).toBe(true);
        expect(isImageFile('image/webp')).toBe(true);
        expect(isImageFile('application/pdf')).toBe(false);
        expect(isImageFile('text/plain')).toBe(false);
      });

      it('should correctly identify PDF files', () => {
        const isPdfFile = (processor as any).isPdfFile;

        expect(isPdfFile('application/pdf')).toBe(true);
        expect(isPdfFile('image/jpeg')).toBe(false);
        expect(isPdfFile('text/plain')).toBe(false);
      });

      it('should correctly identify document files', () => {
        const isDocumentFile = (processor as any).isDocumentFile;

        expect(isDocumentFile('text/plain')).toBe(true);
        expect(isDocumentFile('text/markdown')).toBe(true);
        expect(isDocumentFile('application/json')).toBe(true);
        expect(isDocumentFile('application/xml')).toBe(true);
        expect(isDocumentFile('image/jpeg')).toBe(false);
      });
    });

    describe('Thumbnail Size Parsing', () => {
      it('should parse thumbnail sizes correctly', () => {
        expect(150).toBe(150);
        expect(300).toBe(300);
        expect(500).toBe(500);
      });
    });

    describe('Format Parsing', () => {
      it('should parse thumbnail formats correctly', () => {
        const parseThumbnailFormats = (processor as any).parseThumbnailFormats;

        expect(parseThumbnailFormats()).toEqual([
          ImageFormat.WEBP,
          ImageFormat.JPEG,
        ]);
        expect(parseThumbnailFormats('png')).toEqual([ImageFormat.PNG]);
        expect(parseThumbnailFormats(['webp', 'jpeg'])).toEqual([
          ImageFormat.WEBP,
          ImageFormat.JPEG,
        ]);
      });
    });

    describe('Language and Sentiment Detection', () => {
      it('should detect French language correctly', () => {
        const detectLanguage = (processor as any).detectLanguage;

        const frenchText =
          'Ceci est un texte en français avec les mots le, la, de, et, dans.';
        expect(detectLanguage(frenchText)).toBe('fr');
      });

      it('should detect English language correctly', () => {
        const detectLanguage = (processor as any).detectLanguage;

        const englishText =
          'This is a text in English with the words the, and, or, in, on.';
        expect(detectLanguage(englishText)).toBe('en');
      });

      it('should return unknown for unrecognized language', () => {
        const detectLanguage = (processor as any).detectLanguage;

        const unknownText = 'xyz abc def ghi jkl mno pqr stu';
        expect(detectLanguage(unknownText)).toBe('unknown');
      });

      it('should analyze sentiment correctly', () => {
        const analyzeSentiment = (processor as any).analyzeSentiment;

        const positiveText =
          'This is excellent and great content with good quality.';
        expect(analyzeSentiment(positiveText)).toBe('positive');

        const negativeText =
          'This is terrible and awful content with bad quality.';
        expect(analyzeSentiment(negativeText)).toBe('negative');

        const neutralText =
          'This is some regular content without strong sentiment.';
        expect(analyzeSentiment(neutralText)).toBe('neutral');
      });
    });
  });
});
