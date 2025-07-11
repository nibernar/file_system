/**
 * Tests unitaires pour ImageProcessorService - Traitement d'images avec Sharp
 *
 * Ce fichier teste le service spécialisé de traitement d'images qui utilise Sharp
 * pour l'optimisation, le redimensionnement, la conversion de format et la génération
 * de thumbnails. Version corrigée avec les bonnes valeurs enum et mocks.
 *
 * @author Backend Lead
 * @version 1.0
 * @conformsTo 04-06-file-system-tests Phase 3.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import {
  ImageProcessorService,
  ImageOptimizationOptions,
} from '../image-processor.service';
import { GarageStorageService } from '../../garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../../config/file-system.config';
import {
  ImageFormat,
  FileMetadata,
  VirusScanStatus,
  ProcessingStatus,
  DocumentType,
} from '../../../types/file-system.types';
import {
  FileNotFoundException,
  OptimizationException,
  ThumbnailGenerationException,
} from '../../../exceptions/file-system.exceptions';
import {
  createTestJPEGBuffer,
  createTestPNGBuffer,
  generateTestUUID,
} from '../../../__tests__/test-setup';

jest.mock('sharp');
const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;
  let storageService: jest.Mocked<GarageStorageService>;
  let logger: jest.Mocked<Logger>;
  let mockSharpInstance: any;

  /**
   * Helper pour créer un FileMetadata mock complet
   */
  const createMockFileMetadata = (
    overrides: Partial<FileMetadata> = {},
  ): FileMetadata => ({
    id: generateTestUUID(),
    userId: 'system',
    projectId: undefined,
    filename: 'test-image.jpg',
    originalName: 'test-image.jpg',
    contentType: 'image/jpeg',
    size: 1024,
    storageKey: 'test-storage-key',
    checksumMd5: 'mock-md5',
    checksumSha256: 'mock-sha256',
    virusScanStatus: VirusScanStatus.CLEAN,
    processingStatus: ProcessingStatus.COMPLETED,
    documentType: DocumentType.DOCUMENT,
    versionCount: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    mockSharpInstance = {
      metadata: jest.fn(),
      resize: jest.fn().mockReturnThis(),
      withMetadata: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      avif: jest.fn().mockReturnThis(),
      toFormat: jest.fn().mockReturnThis(),
      toBuffer: jest.fn(),
    };

    mockSharp.mockReturnValue(mockSharpInstance);

    (mockSharp as any).kernel = {
      lanczos3: 'lanczos3',
    };

    const mockStorageService = {
      downloadObject: jest.fn(),
      uploadObject: jest.fn(),
      getObjectInfo: jest.fn(),
    };

    const mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessorService,
        { provide: GarageStorageService, useValue: mockStorageService },
        { provide: Logger, useValue: mockLogger },
        {
          provide: FILE_SYSTEM_CONFIG,
          useValue: {
            processing: {
              imageOptimizationQuality: 85,
              thumbnailSize: 200,
            },
            cdn: {
              baseUrl: 'https://cdn.test.coders.com',
            },
          },
        },
      ],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);
    storageService = module.get(GarageStorageService);
    logger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction et Initialisation', () => {
    it('should be defined and properly initialized', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ImageProcessorService);
    });

    it('should have Sharp available for image processing', () => {
      const sharpInstance = mockSharp(Buffer.from('test'));

      expect(sharpInstance).toBeDefined();
      expect(mockSharp).toHaveBeenCalled();
    });
  });

  describe('optimizeImage - Optimisation Intelligente', () => {
    it('should optimize JPEG image with custom quality settings', async () => {
      const fileId = generateTestUUID();
      const sourceBuffer = createTestJPEGBuffer();
      const optimizedBuffer = Buffer.from('optimized-jpeg-content');

      const options: ImageOptimizationOptions = {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 90,
        format: ImageFormat.JPEG,
        preserveExif: false,
        progressive: true,
        optimizeForWeb: true,
      };

      storageService.downloadObject.mockResolvedValue({
        body: sourceBuffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: sourceBuffer.length,
          lastModified: new Date(),
          etag: 'test-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 3840,
        height: 2160,
        format: 'jpeg',
        size: sourceBuffer.length,
      });

      mockSharpInstance.toBuffer.mockResolvedValue({
        data: optimizedBuffer,
        info: {
          width: 1920,
          height: 1080,
          size: optimizedBuffer.length,
          format: 'jpeg',
        },
      });

      const mockFileMetadata = createMockFileMetadata({
        contentType: 'image/jpeg',
        size: optimizedBuffer.length,
        storageKey: `${fileId}/optimized/jpeg/123456789`,
      });

      storageService.uploadObject.mockResolvedValue({
        uploadId: `${fileId}/optimized/jpeg/123456789`,
        storageKey: `${fileId}/optimized/jpeg/123456789`,
        etag: 'optimized-etag',
        location: 'https://test-storage.com/optimized.jpg',
        metadata: mockFileMetadata,
        uploadDuration: 500,
      });

      const result = await service.optimizeImage(fileId, options);

      expect(result).toBeDefined();
      expect(result.buffer).toEqual(optimizedBuffer);
      expect(result.format).toBe(ImageFormat.JPEG);
      expect(result.dimensions.width).toBe(1920);
      expect(result.dimensions.height).toBe(1080);
      expect(result.compressionRatio).toBe(
        optimizedBuffer.length / sourceBuffer.length,
      );

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      });

      expect(mockSharpInstance.withMetadata).toHaveBeenCalledWith({});

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({
        quality: 90,
        progressive: true,
        mozjpeg: true,
        optimiseScans: true,
      });

      expect(storageService.uploadObject).toHaveBeenCalledWith(
        expect.stringContaining('/optimized/jpeg/'),
        optimizedBuffer,
        expect.objectContaining({
          contentType: 'image/jpeg',
          userId: 'system',
        }),
      );
    });

    it('should convert PNG to WebP with web optimization', async () => {
      const fileId = generateTestUUID();
      const sourceBuffer = createTestPNGBuffer();
      const webpBuffer = Buffer.from('optimized-webp-content');

      const options: ImageOptimizationOptions = {
        maxWidth: 1200,
        maxHeight: 800,
        quality: 85,
        format: ImageFormat.WEBP,
        optimizeForWeb: true,
      };

      storageService.downloadObject.mockResolvedValue({
        body: sourceBuffer,
        metadata: {
          contentType: 'image/png',
          contentLength: sourceBuffer.length,
          lastModified: new Date(),
          etag: 'png-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 2400,
        height: 1600,
        format: 'png',
        size: sourceBuffer.length,
        hasAlpha: true,
      });

      mockSharpInstance.toBuffer.mockResolvedValue({
        data: webpBuffer,
        info: {
          width: 1200,
          height: 800,
          size: webpBuffer.length,
          format: 'webp',
        },
      });

      const mockFileMetadata = createMockFileMetadata({
        contentType: 'image/webp',
        size: webpBuffer.length,
      });

      storageService.uploadObject.mockResolvedValue({
        uploadId: `${fileId}/optimized/webp/123456789`,
        storageKey: `${fileId}/optimized/webp/123456789`,
        etag: 'webp-etag',
        location: 'https://test-storage.com/optimized.webp',
        metadata: mockFileMetadata,
        uploadDuration: 400,
      });

      const result = await service.optimizeImage(fileId, options);

      expect(result.format).toBe(ImageFormat.WEBP);
      expect(result.buffer).toEqual(webpBuffer);
      expect(result.originalSize).toBe(sourceBuffer.length);
      expect(result.optimizedSize).toBe(webpBuffer.length);
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({
        quality: 85,
        effort: 6,
        smartSubsample: true,
        preset: 'photo',
      });

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(1200, 800, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      });
    });

    it('should handle corrupted images gracefully', async () => {
      const fileId = generateTestUUID();
      const corruptedBuffer = Buffer.from('not-a-valid-image-data');

      storageService.downloadObject.mockResolvedValue({
        body: corruptedBuffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: corruptedBuffer.length,
          lastModified: new Date(),
          etag: 'corrupted-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.metadata.mockRejectedValue(
        new Error('Input buffer contains unsupported image format'),
      );

      await expect(service.optimizeImage(fileId, {})).rejects.toThrow(
        OptimizationException,
      );
    });
  });

  describe('generateThumbnail - Génération Miniatures', () => {
    it('should generate multi-format thumbnails successfully', async () => {
      const fileId = generateTestUUID();
      const sourceBuffer = createTestJPEGBuffer();
      const thumbnailSize = 200;
      const formats = [ImageFormat.WEBP, ImageFormat.JPEG];

      const webpThumbnail = Buffer.from('webp-thumbnail-content');
      const jpegThumbnail = Buffer.from('jpeg-thumbnail-content');

      storageService.downloadObject.mockResolvedValue({
        body: sourceBuffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: sourceBuffer.length,
          lastModified: new Date(),
          etag: 'thumbnail-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(webpThumbnail)
        .mockResolvedValueOnce(jpegThumbnail);

      const webpMetadata = createMockFileMetadata({
        contentType: 'image/webp',
        storageKey: `${fileId}/thumbnails/200/webp/123456789`,
      });

      const jpegMetadata = createMockFileMetadata({
        contentType: 'image/jpeg',
        storageKey: `${fileId}/thumbnails/200/jpeg/123456789`,
      });

      storageService.uploadObject
        .mockResolvedValueOnce({
          uploadId: `${fileId}/thumbnails/200/webp/123456789`,
          storageKey: `${fileId}/thumbnails/200/webp/123456789`,
          etag: 'webp-thumb-etag',
          location: 'https://test-storage.com/thumb.webp',
          metadata: webpMetadata,
          uploadDuration: 100,
        })
        .mockResolvedValueOnce({
          uploadId: `${fileId}/thumbnails/200/jpeg/123456789`,
          storageKey: `${fileId}/thumbnails/200/jpeg/123456789`,
          etag: 'jpeg-thumb-etag',
          location: 'https://test-storage.com/thumb.jpg',
          metadata: jpegMetadata,
          uploadDuration: 100,
        });

      const result = await service.generateThumbnail(
        fileId,
        thumbnailSize,
        formats,
      );

      expect(result.success).toBe(true);
      expect(result.formats).toHaveLength(2);
      expect(result.dimensions).toBeDefined();
      if (result.dimensions) {
        expect(result.dimensions.width).toBe(thumbnailSize);
        expect(result.dimensions.height).toBe(thumbnailSize);
      }

      expect(result.formats).toBeDefined();
      if (result.formats) {
        const webpFormat = result.formats.find(
          (f) => f.format === ImageFormat.WEBP,
        );
        const jpegFormat = result.formats.find(
          (f) => f.format === ImageFormat.JPEG,
        );

        expect(webpFormat).toBeDefined();
        expect(webpFormat?.url).toContain('cdn.test.coders.com');
        expect(jpegFormat).toBeDefined();
        expect(jpegFormat?.url).toContain('cdn.test.coders.com');
        expect(result.url).toEqual(webpFormat?.url);
      }

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(
        thumbnailSize,
        thumbnailSize,
        {
          fit: 'cover',
          position: 'center',
          kernel: 'lanczos3',
        },
      );

      expect(mockSharpInstance.withMetadata).toHaveBeenCalledWith({});
    });

    it('should validate thumbnail size limits', async () => {
      const fileId = generateTestUUID();
      const invalidSizes = [30, 1200];

      const sourceBuffer = createTestJPEGBuffer();
      storageService.downloadObject.mockResolvedValue({
        body: sourceBuffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: sourceBuffer.length,
          lastModified: new Date(),
          etag: 'test-etag',
        },
        fromCache: false,
      });

      for (const size of invalidSizes) {
        await expect(service.generateThumbnail(fileId, size)).rejects.toThrow(
          ThumbnailGenerationException,
        );
      }
    });
  });

  describe('generateMultipleFormats - Conversion Multi-Formats', () => {
    it('should generate all modern web formats successfully', async () => {
      const fileId = generateTestUUID();
      const sourceBuffer = createTestJPEGBuffer();
      const targetFormats = [
        ImageFormat.WEBP,
        ImageFormat.AVIF,
        ImageFormat.JPEG,
      ];

      const webpBuffer = Buffer.from('webp-format-content');
      const avifBuffer = Buffer.from('avif-format-content');
      const jpegBuffer = Buffer.from('jpeg-format-content');

      storageService.downloadObject.mockResolvedValue({
        body: sourceBuffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: sourceBuffer.length,
          lastModified: new Date(),
          etag: 'formats-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: sourceBuffer.length,
      });

      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(webpBuffer)
        .mockResolvedValueOnce(avifBuffer)
        .mockResolvedValueOnce(jpegBuffer);

      const webpMetadata = createMockFileMetadata({
        contentType: 'image/webp',
      });
      const avifMetadata = createMockFileMetadata({
        contentType: 'image/avif',
      });
      const jpegMetadata = createMockFileMetadata({
        contentType: 'image/jpeg',
      });

      storageService.uploadObject
        .mockResolvedValueOnce({
          uploadId: 'webp-upload',
          storageKey: 'webp-key',
          etag: 'webp-etag',
          location: 'webp-url',
          metadata: webpMetadata,
          uploadDuration: 100,
        })
        .mockResolvedValueOnce({
          uploadId: 'avif-upload',
          storageKey: 'avif-key',
          etag: 'avif-etag',
          location: 'avif-url',
          metadata: avifMetadata,
          uploadDuration: 100,
        })
        .mockResolvedValueOnce({
          uploadId: 'jpeg-upload',
          storageKey: 'jpeg-key',
          etag: 'jpeg-etag',
          location: 'jpeg-url',
          metadata: jpegMetadata,
          uploadDuration: 100,
        });

      const results = await service.generateMultipleFormats(
        fileId,
        targetFormats,
      );

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      const webpResult = results.find((r) => r.toFormat === ImageFormat.WEBP);
      const avifResult = results.find((r) => r.toFormat === ImageFormat.AVIF);
      const jpegResult = results.find((r) => r.toFormat === ImageFormat.JPEG);

      expect(webpResult).toBeDefined();
      expect(webpResult?.buffer).toEqual(webpBuffer);
      expect(webpResult?.compressionRatio).toBe(
        webpBuffer.length / sourceBuffer.length,
      );

      expect(avifResult).toBeDefined();
      expect(avifResult?.buffer).toEqual(avifBuffer);
      expect(jpegResult).toBeDefined();
      expect(jpegResult?.buffer).toEqual(jpegBuffer);
      expect(storageService.uploadObject).toHaveBeenCalledTimes(3);
    });
  });

  describe("Gestion d'Erreurs et Robustesse", () => {
    it('should handle missing image files gracefully', async () => {
      const nonExistentFileId = generateTestUUID();

      storageService.downloadObject.mockRejectedValue(
        new FileNotFoundException(nonExistentFileId),
      );

      await expect(
        service.optimizeImage(nonExistentFileId, {}),
      ).rejects.toThrow(OptimizationException);

      expect(mockSharp).not.toHaveBeenCalled();
    });

    it('should reject unsupported image formats', async () => {
      const fileId = generateTestUUID();
      const unsupportedBuffer = Buffer.from('unsupported-format-data');

      storageService.downloadObject.mockResolvedValue({
        body: unsupportedBuffer,
        metadata: {
          contentType: 'application/octet-stream',
          contentLength: unsupportedBuffer.length,
          lastModified: new Date(),
          etag: 'unsupported-etag',
        },
        fromCache: false,
      });

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'unknown',
        size: unsupportedBuffer.length,
      });

      await expect(service.optimizeImage(fileId, {})).rejects.toThrow(
        OptimizationException,
      );
    });

    it('should recover from temporary component failures', async () => {
      const fileId = generateTestUUID();
      const sourceBuffer = createTestJPEGBuffer();

      storageService.downloadObject
        .mockRejectedValueOnce(new Error('Storage temporarily unavailable'))
        .mockResolvedValueOnce({
          body: sourceBuffer,
          metadata: {
            contentType: 'image/jpeg',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'recovery-etag',
          },
          fromCache: false,
        });

      await expect(service.optimizeImage(fileId, {})).rejects.toThrow(
        OptimizationException,
      );

      mockSharpInstance.metadata.mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: sourceBuffer.length,
      });

      const optimizedBuffer = Buffer.from('recovered-optimization');
      mockSharpInstance.toBuffer.mockResolvedValue({
        data: optimizedBuffer,
        info: {
          width: 1920,
          height: 1080,
          size: optimizedBuffer.length,
          format: 'webp',
        },
      });

      const mockFileMetadata = createMockFileMetadata({
        contentType: 'image/webp',
        size: optimizedBuffer.length,
      });

      storageService.uploadObject.mockResolvedValue({
        uploadId: 'recovered-upload',
        storageKey: 'recovered-key',
        etag: 'recovered-etag',
        location: 'recovered-url',
        metadata: mockFileMetadata,
        uploadDuration: 300,
      });

      const result = await service.optimizeImage(fileId, {});

      expect(result.buffer).toEqual(optimizedBuffer);
      expect(storageService.downloadObject).toHaveBeenCalledTimes(2);
    });
  });
});
