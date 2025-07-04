/**
 * Tests unitaires pour PdfProcessorService - VERSION COMPLÈTEMENT RECODÉE V3
 *
 * Cette version est conçue pour être ultra-claire et robuste, avec des mocks
 * prévisibles et des assertions qui correspondent au comportement réel du service.
 *
 * @author Backend Lead
 * @version 3.0
 * @conformsTo 04-06-file-system-tests Phase 3.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  PdfProcessorService,
  PdfOptimizationOptions,
  OptimizedPdf,
  PdfMetadata,
  PdfPreview,
} from '../pdf-processor.service';
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
  ProcessingException,
  ThumbnailGenerationException,
  OptimizationException,
  FileNotFoundException,
} from '../../../exceptions/file-system.exceptions';
import {
  createTestPDFBuffer,
  createTestJPEGBuffer,
  generateTestUUID,
  delay,
} from '../../../__tests__/test-setup';

// Mock des modules Node.js pour tests isolés
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('os');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('PdfProcessorService', () => {
  let service: PdfProcessorService;
  let storageService: jest.Mocked<GarageStorageService>;
  let logger: jest.Mocked<Logger>;
  let mockConfig: any;

  // =============================================================================
  // HELPERS ET UTILITAIRES
  // =============================================================================

  /**
   * Crée un FileMetadata mock complet pour les tests
   */
  const createMockFileMetadata = (
    overrides: Partial<FileMetadata> = {},
  ): FileMetadata => ({
    id: generateTestUUID(),
    userId: 'system',
    projectId: undefined,
    filename: 'test-file.pdf',
    originalName: 'test-file.pdf',
    contentType: 'application/pdf',
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

  /**
   * Mock de processus ultra-simple et fiable
   * Cette version évite tous les problèmes de timing et de configuration complexe
   */
  const createSimpleProcessMock = (
    exitCode: number = 0,
    stdout: string = '',
    stderr: string = '',
  ) => {
    const mock = {
      // Streams obligatoires
      stdout: {
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'data' && stdout) {
            setImmediate(() => callback(Buffer.from(stdout)));
          }
          return mock.stdout;
        }),
      },
      stderr: {
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'data' && stderr) {
            setImmediate(() => callback(Buffer.from(stderr)));
          }
          return mock.stderr;
        }),
      },
      stdin: {
        write: jest.fn(),
        end: jest.fn(),
      },

      // Gestion des événements processus
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          setImmediate(() => callback(exitCode));
        } else if (event === 'error' && exitCode === -1) {
          setImmediate(() => callback(new Error('Process error')));
        }
        return mock;
      }),

      kill: jest.fn(),
      pid: Math.floor(Math.random() * 1000) + 1000,
    };

    return mock;
  };

  /**
   * Gestionnaire intelligent des appels spawn séquentiels
   * Permet de définir facilement une séquence d'appels avec des résultats différents
   */
  const createSequentialSpawnMock = (
    sequence: Array<{
      command?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    }>,
  ) => {
    let callIndex = 0;

    return mockSpawn.mockImplementation((command: string, args: string[]) => {
      const config = sequence[callIndex] || sequence[sequence.length - 1];
      callIndex++;

      // Si un command est spécifié, vérifier qu'il correspond
      if (config.command && command !== config.command) {
        // Utiliser la config par défaut si pas de match
        return createSimpleProcessMock(0, '', '') as any;
      }

      return createSimpleProcessMock(
        config.exitCode || 0,
        config.stdout || '',
        config.stderr || '',
      ) as any;
    });
  };

  // =============================================================================
  // SETUP ET CONFIGURATION
  // =============================================================================

  beforeEach(async () => {
    // Configuration de base
    mockConfig = {
      processing: {
        virusScanTimeout: 30000,
        pdfCompressionLevel: 6,
      },
      cdn: {
        baseUrl: 'https://cdn.test.coders.com',
      },
    };

    // Mock services
    const mockStorageService = {
      downloadObject: jest.fn(),
      uploadObject: jest.fn(),
      copyObject: jest.fn(),
      getObjectInfo: jest.fn(),
    };

    const mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Configuration mocks filesystem
    mockOs.tmpdir.mockReturnValue('/tmp');
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(Buffer.from('default-file-content'));
    mockFs.unlink.mockResolvedValue(undefined);

    // Reset complet des mocks
    mockSpawn.mockReset();
    mockSpawn.mockClear();

    // Configuration module NestJS
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfProcessorService,
        { provide: GarageStorageService, useValue: mockStorageService },
        { provide: Logger, useValue: mockLogger },
        { provide: FILE_SYSTEM_CONFIG, useValue: mockConfig },
      ],
    }).compile();

    // Récupération instances
    service = module.get<PdfProcessorService>(PdfProcessorService);
    storageService = module.get(GarageStorageService);
    logger = module.get(Logger);

    // Mock par défaut pour les vérifications d'outils dans le constructeur
    mockSpawn.mockImplementation((command: string) => {
      if (
        command.includes('version') ||
        command === 'gs' ||
        command === 'pdfinfo'
      ) {
        return createSimpleProcessMock(0, 'version 1.0', '') as any;
      }
      return createSimpleProcessMock(0, '', '') as any;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // TESTS DE BASE
  // =============================================================================

  describe('Construction et Initialisation', () => {
    it('should be defined and properly initialized', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(PdfProcessorService);
    });

    it('should ensure temp directory exists', () => {
      expect(mockFs.access).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // TESTS OPTIMISATION PDF
  // =============================================================================

  describe('optimizePdf - Optimisation avec Ghostscript', () => {
    it('should optimize PDF with complete compression workflow', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const sourcePdfBuffer = createTestPDFBuffer();
      const optimizedSize = 150; // Taille plus petite que l'original

      const options: PdfOptimizationOptions = {
        compressionLevel: 8,
        optimizeImages: true,
        removeMetadata: true,
        linearize: true,
        imageQuality: 75,
        maxImageDpi: 150,
      };

      // Configuration storage
      storageService.downloadObject.mockResolvedValue({
        body: sourcePdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: sourcePdfBuffer.length,
          lastModified: new Date(),
          etag: 'pdf-etag',
        },
        fromCache: false,
      });

      storageService.uploadObject.mockResolvedValue({
        uploadId: `${fileId}/optimized/123456789.pdf`,
        storageKey: `${fileId}/optimized/123456789.pdf`,
        etag: 'optimized-etag',
        location: 'https://test-storage.com/optimized.pdf',
        metadata: createMockFileMetadata(),
        uploadDuration: 500,
      });

      // Configuration séquence d'appels spawn
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: `Title: Test Document
Author: Test Author
Pages: 5
PDF version: 1.4
Page size: 612 x 792 pts (letter)`,
        },
        {
          command: 'gs',
          exitCode: 0,
          stdout: '',
        },
        {
          command: 'qpdf',
          exitCode: 0,
          stdout: '',
        },
      ]);

      // Mock fichiers temporaires
      const optimizedBuffer = Buffer.from('a'.repeat(optimizedSize));
      mockFs.readFile
        .mockResolvedValueOnce(optimizedBuffer) // Lecture après ghostscript
        .mockResolvedValueOnce(optimizedBuffer) // Lecture après qpdf
        .mockResolvedValueOnce(optimizedBuffer); // Lecture finale

      // Act
      const result = await service.optimizePdf(fileId, options);

      // Assert
      expect(result).toBeDefined();
      expect(result.originalSize).toBe(sourcePdfBuffer.length);
      expect(result.optimizedSize).toBe(optimizedSize);
      expect(result.compressionRatio).toBe(
        optimizedSize / sourcePdfBuffer.length,
      );
      expect(result.techniques).toEqual(
        expect.arrayContaining([
          'pdf_compression',
          'image_optimization',
          'linearization',
        ]),
      );
      expect(result.pageCount).toBe(5);

      // Vérification des appels
      expect(mockSpawn).toHaveBeenCalledWith('pdfinfo', expect.any(Array));
      expect(mockSpawn).toHaveBeenCalledWith(
        'gs',
        expect.arrayContaining(['-sDEVICE=pdfwrite']),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        'qpdf',
        expect.arrayContaining(['--linearize']),
      );
    });

    it('should handle Ghostscript errors gracefully', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const corruptedPdfBuffer = Buffer.from('not-a-pdf');

      storageService.downloadObject.mockResolvedValue({
        body: corruptedPdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: corruptedPdfBuffer.length,
          lastModified: new Date(),
          etag: 'corrupted-etag',
        },
        fromCache: false,
      });

      // Configuration : pdfinfo OK, ghostscript FAIL
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: 'Pages: 1',
        },
        {
          command: 'gs',
          exitCode: 1,
          stderr: 'GPL Ghostscript: Error reading PDF',
        },
      ]);

      // Act & Assert
      await expect(service.optimizePdf(fileId, {})).rejects.toThrow(
        OptimizationException,
      );
    });
  });

  // =============================================================================
  // TESTS GÉNÉRATION PREVIEWS
  // =============================================================================

  describe('generatePreview - Génération Previews Images', () => {
    it('should generate multi-page previews successfully', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const sourcePdfBuffer = createTestPDFBuffer();
      const pageCount = 3;
      const dpi = 150;

      storageService.downloadObject.mockResolvedValue({
        body: sourcePdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: sourcePdfBuffer.length,
          lastModified: new Date(),
          etag: 'preview-etag',
        },
        fromCache: false,
      });

      // Configuration spawn pour preview
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: `Pages: 5
Page size: 612 x 792 pts (letter)`,
        },
        {
          command: 'pdftoppm',
          exitCode: 0,
          stdout: '',
        },
      ]);

      // Mock lecture images
      const pageBuffers = Array(pageCount)
        .fill(null)
        .map(() => createTestJPEGBuffer());
      pageBuffers.forEach((buffer) => {
        mockFs.readFile.mockResolvedValueOnce(buffer);
      });

      // Mock sauvegarde
      const uploadPromises = Array(pageCount)
        .fill(null)
        .map((_, i) =>
          storageService.uploadObject.mockResolvedValueOnce({
            uploadId: `${fileId}/preview/page-${i + 1}-${dpi}dpi.jpg`,
            storageKey: `${fileId}/preview/page-${i + 1}-${dpi}dpi.jpg`,
            etag: `page${i + 1}-etag`,
            location: `page${i + 1}-url`,
            metadata: createMockFileMetadata(),
            uploadDuration: 100,
          }),
        );

      // Act
      const result = await service.generatePreview(fileId, pageCount, dpi);

      // Assert
      expect(result.success).toBe(true);
      expect(result.pagePreview).toHaveLength(pageCount);
      expect(result.thumbnailUrl).toContain('cdn.test.coders.com');

      result.pagePreview.forEach((page, index) => {
        expect(page.pageNumber).toBe(index + 1);
        expect(page.url).toContain('cdn.test.coders.com');
      });

      expect(storageService.uploadObject).toHaveBeenCalledTimes(pageCount);

      // Le service fait du nettoyage : pages + fichiers temporaires
      expect(mockFs.unlink).toHaveBeenCalledTimes(pageCount + 1);
    });

    it('should validate preview generation parameters', async () => {
      const fileId = generateTestUUID();

      // Tests de validation synchrones (pas besoin de mocks complexes)
      await expect(service.generatePreview(fileId, 3, 500)).rejects.toThrow(
        ThumbnailGenerationException,
      );

      await expect(service.generatePreview(fileId, 3, 50)).rejects.toThrow(
        ThumbnailGenerationException,
      );

      await expect(service.generatePreview(fileId, 0, 150)).rejects.toThrow(
        ThumbnailGenerationException,
      );

      await expect(service.generatePreview(fileId, 15, 150)).rejects.toThrow(
        ThumbnailGenerationException,
      );
    });
  });

  // =============================================================================
  // TESTS EXTRACTION MÉTADONNÉES
  // =============================================================================

  describe('extractMetadata - Extraction Métadonnées PDF', () => {
    it('should extract complete PDF metadata successfully', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const sourcePdfBuffer = createTestPDFBuffer();

      const pdfinfoOutput = `Title:          Test Document Title
Author:         John Doe
Subject:        Testing PDF metadata extraction
Keywords:       test, pdf, metadata, extraction
Creator:        Microsoft Word
Producer:       Microsoft: Print To PDF
CreationDate:   Mon Jan 15 14:30:00 2024
ModDate:        Mon Jan 15 15:45:00 2024
Pages:          10
Encrypted:      no
Form:           none
PDF version:    1.7
Page size:      612 x 792 pts (letter)`;

      storageService.downloadObject.mockResolvedValue({
        body: sourcePdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: sourcePdfBuffer.length,
          lastModified: new Date(),
          etag: 'metadata-etag',
        },
        fromCache: false,
      });

      // Configuration spawn
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: pdfinfoOutput,
        },
        {
          command: 'pdftotext',
          exitCode: 0,
          stdout: 'Sample text content from PDF for indexing and search.',
        },
      ]);

      // Act
      const metadata = await service.extractMetadata(fileId);

      // Assert
      expect(metadata).toBeDefined();
      expect(metadata.title).toBe('Test Document Title');
      expect(metadata.author).toBe('John Doe');
      expect(metadata.subject).toBe('Testing PDF metadata extraction');
      expect(metadata.keywords).toBe('test, pdf, metadata, extraction');
      expect(metadata.creator).toBe('Microsoft Word');
      expect(metadata.producer).toBe('Microsoft: Print To PDF');
      expect(metadata.pageCount).toBe(10);
      expect(metadata.pdfVersion).toBe('1.7');
      expect(metadata.encrypted).toBe(false);
      expect(metadata.hasAcroForm).toBe(false);

      expect(metadata.creationDate).toBeInstanceOf(Date);
      expect(metadata.modificationDate).toBeInstanceOf(Date);

      expect(metadata.pageSize).toEqual({
        width: 612,
        height: 792,
        unit: 'pts',
      });

      expect(metadata.textContent).toContain('Sample text content');
      expect(metadata.textLength).toBeGreaterThan(0);
    });

    it('should handle pdfinfo command failures', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const corruptedPdfBuffer = Buffer.from('not-a-pdf-file');

      storageService.downloadObject.mockResolvedValue({
        body: corruptedPdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: corruptedPdfBuffer.length,
          lastModified: new Date(),
          etag: 'error-etag',
        },
        fromCache: false,
      });

      // Mock processus qui échoue
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 1,
          stderr: 'Error: May not be a PDF file',
        },
      ]);

      // Act & Assert
      await expect(service.extractMetadata(fileId)).rejects.toThrow(
        ProcessingException,
      );
    });
  });

  // =============================================================================
  // TESTS ROBUSTESSE ET GESTION D'ERREURS
  // =============================================================================

  describe("Robustesse et Gestion d'Erreurs", () => {
    it('should handle missing PDF files gracefully', async () => {
      const nonExistentFileId = generateTestUUID();

      storageService.downloadObject.mockRejectedValue(
        new FileNotFoundException(nonExistentFileId),
      );

      await expect(service.optimizePdf(nonExistentFileId, {})).rejects.toThrow(
        OptimizationException,
      );

      // Vérifier qu'aucun traitement PDF n'a été tenté
      const processedCalls = mockSpawn.mock.calls.filter(
        (call) =>
          ['gs', 'qpdf', 'pdftoppm'].includes(call[0]) &&
          !call[1]?.includes('--version'),
      );
      expect(processedCalls).toHaveLength(0);
    });

    it('should recover from temporary failures', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const sourcePdfBuffer = createTestPDFBuffer();

      // Premier échec puis succès
      storageService.downloadObject
        .mockRejectedValueOnce(new Error('Storage temporarily unavailable'))
        .mockResolvedValueOnce({
          body: sourcePdfBuffer,
          metadata: {
            contentType: 'application/pdf',
            contentLength: sourcePdfBuffer.length,
            lastModified: new Date(),
            etag: 'recovery-etag',
          },
          fromCache: false,
        });

      // Premier échec
      await expect(service.optimizePdf(fileId, {})).rejects.toThrow(
        OptimizationException,
      );

      // Setup pour le retry réussi
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: 'Pages: 1',
        },
        {
          command: 'gs',
          exitCode: 0,
          stdout: '',
        },
      ]);

      const optimizedBuffer = Buffer.from('recovered-content');
      mockFs.readFile.mockResolvedValue(optimizedBuffer);

      storageService.uploadObject.mockResolvedValue({
        uploadId: 'recovered-upload',
        storageKey: 'recovered-key',
        etag: 'recovered-etag',
        location: 'recovered-url',
        metadata: createMockFileMetadata(),
        uploadDuration: 400,
      });

      // Second essai réussit
      const result = await service.optimizePdf(fileId, {});

      expect(result.optimizedSize).toBe(optimizedBuffer.length);
      expect(storageService.downloadObject).toHaveBeenCalledTimes(2);
    });

    it('should handle command timeout gracefully', async () => {
      const fileId = generateTestUUID();
      const sourcePdfBuffer = createTestPDFBuffer();

      storageService.downloadObject.mockResolvedValue({
        body: sourcePdfBuffer,
        metadata: {
          contentType: 'application/pdf',
          contentLength: sourcePdfBuffer.length,
          lastModified: new Date(),
          etag: 'timeout-etag',
        },
        fromCache: false,
      });

      // Configuration : pdfinfo OK, ghostscript timeout
      createSequentialSpawnMock([
        {
          command: 'pdfinfo',
          exitCode: 0,
          stdout: 'Pages: 1',
        },
        {
          command: 'gs',
          exitCode: -1, // Force une erreur
        },
      ]);

      await expect(service.optimizePdf(fileId, {})).rejects.toThrow(
        OptimizationException,
      );
    });
  });
});
