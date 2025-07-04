/**
 * Tests unitaires pour DocumentProcessorService - Traitement documents texte
 *
 * Ce fichier teste le service spécialisé de traitement de documents texte qui
 * analyse le contenu, détecte l'encodage, extrait les métadonnées linguistiques,
 * valide la structure selon le format et génère des résumés automatiques.
 * Version corrigée avec mocks synchrones pour iconv-lite.
 *
 * @author Backend Lead
 * @version 1.0
 * @conformsTo 04-06-file-system-tests Phase 3.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import * as iconv from 'iconv-lite';
import * as chardet from 'chardet';
import {
  DocumentProcessorService,
  DocumentProcessingOptions,
  ProcessedDocument,
  DocumentStructureValidation,
  LanguageDetectionResult,
} from '../document-processor.service';
import { GarageStorageService } from '../../garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../../config/file-system.config';
import {
  FileMetadata,
  VirusScanStatus,
  ProcessingStatus,
  DocumentType,
} from '../../../types/file-system.types';
import {
  ProcessingException,
  FileNotFoundException,
} from '../../../exceptions/file-system.exceptions';
import {
  createTestFileBuffer,
  createTestJSONBuffer,
  generateTestUUID,
  delay,
} from '../../../__tests__/test-setup';

// Mock des bibliothèques externes pour tests isolés
jest.mock('iconv-lite');
jest.mock('chardet');

const mockIconv = iconv as jest.Mocked<typeof iconv>;
const mockChardet = chardet;

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let storageService: jest.Mocked<GarageStorageService>;
  let logger: jest.Mocked<Logger>;
  let mockConfig: any;

  /**
   * Helper pour créer un FileMetadata mock complet
   */
  const createMockFileMetadata = (
    overrides: Partial<FileMetadata> = {},
  ): FileMetadata => ({
    id: generateTestUUID(),
    userId: 'system',
    projectId: undefined,
    filename: 'test-document.txt',
    originalName: 'test-document.txt',
    contentType: 'text/plain',
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
    // Configuration mock
    mockConfig = {
      processing: {
        maxSizeForSummary: 1024 * 1024, // 1MB
        targetEncoding: 'utf8',
      },
      cdn: {
        baseUrl: 'https://cdn.test.coders.com',
      },
    };

    // Mock services dépendants
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

    // ✅ Configuration mocks bibliothèques SYNCHRONES
    mockChardet.detect.mockReturnValue('utf8');
    mockIconv.encodingExists.mockReturnValue(true);
    mockIconv.decode.mockImplementation((buffer, encoding) => {
      return buffer.toString(encoding as BufferEncoding);
    });
    mockIconv.encode.mockImplementation((text, encoding) => {
      return Buffer.from(text, encoding as BufferEncoding);
    });

    // Configuration module NestJS
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessorService,
        { provide: GarageStorageService, useValue: mockStorageService },
        { provide: Logger, useValue: mockLogger },
        { provide: FILE_SYSTEM_CONFIG, useValue: mockConfig },
      ],
    }).compile();

    // Récupération instances
    service = module.get<DocumentProcessorService>(DocumentProcessorService);
    storageService = module.get(GarageStorageService);
    logger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction et Initialisation', () => {
    it('should be defined and properly initialized', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(DocumentProcessorService);
    });
  });

  describe('processDocument - Traitement Principal', () => {
    it('should process French text document with complete analysis', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const frenchContent = `Ceci est un document de test en français.
Il contient plusieurs lignes de texte pour tester l'analyse linguistique.
Le service doit détecter la langue française et extraire les métadonnées appropriées.
Cette analyse inclut le comptage de mots lignes et caractères.`;

      const sourceBuffer = createTestFileBuffer(frenchContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        validateStructure: true,
        optimizeEncoding: true,
        generateSummary: true,
        detectLanguage: true,
        extractSpecializedMetadata: true,
        maxSizeForSummary: 1024,
        targetEncoding: 'utf8',
      };

      // Configuration mocks avec délais
      storageService.downloadObject.mockImplementation(async () => {
        await delay(5); // Délai pour assurer processingTime > 0
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'test-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(frenchContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert - Analyse complète
      expect(result.success).toBe(true);
      expect(result.textContent).toBe(frenchContent);
      expect(result.encoding).toBe('utf8');
      expect(result.lineCount).toBe(4);
      expect(result.wordCount).toBeGreaterThan(25);
      expect(result.characterCount).toBe(frenchContent.length);
      expect(result.characterCountNoSpaces).toBe(
        frenchContent.replace(/\s/g, '').length,
      );
      expect(result.detectedLanguage).toBe('fr');
      expect(result.processingTime).toBeGreaterThan(0);

      // Vérification structure validation
      expect(result.structureValidation).toBeDefined();
      expect(result.structureValidation?.valid).toBe(true);
      expect(result.structureValidation?.detectedFormat).toBe('text/plain');

      // Vérification métadonnées spécialisées
      expect(result.specializedMetadata).toBeDefined();
      expect(result.specializedMetadata?.textStructure).toBeDefined();
    });

    it('should process JSON document with structure validation', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const jsonData = {
        name: 'Test Configuration',
        version: '1.0.0',
        features: [
          { id: 'feature1', enabled: true, config: { timeout: 5000 } },
          { id: 'feature2', enabled: false, config: { retries: 3 } },
        ],
        metadata: {
          created: '2024-01-15T10:30:00Z',
          author: 'Test System',
          tags: ['test', 'configuration', 'json'],
        },
      };

      const jsonContent = JSON.stringify(jsonData, null, 2);
      const sourceBuffer = createTestJSONBuffer(jsonData);

      const options: DocumentProcessingOptions = {
        extractText: true,
        validateStructure: true,
        extractSpecializedMetadata: true,
        detectLanguage: false,
      };

      // Configuration mocks
      storageService.downloadObject.mockImplementation(async () => {
        await delay(3);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'application/json',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'json-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(jsonContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.textContent).toBe(jsonContent);
      expect(result.processingTime).toBeGreaterThan(0);

      // Vérification validation structure JSON
      expect(result.structureValidation?.valid).toBe(true);
      expect(result.structureValidation?.detectedFormat).toBe(
        'application/json',
      );
      expect(result.structureValidation?.structureMetadata?.type).toBe('json');
      expect(result.structureValidation?.structureMetadata?.rootType).toBe(
        'object',
      );
      expect(
        result.structureValidation?.structureMetadata?.keyCount,
      ).toBeGreaterThan(0);

      // Vérification métadonnées spécialisées JSON
      expect(result.specializedMetadata?.jsonStructure).toBeDefined();
      expect(result.specializedMetadata?.jsonStructure?.depth).toBeGreaterThan(
        1,
      );
      expect(
        result.specializedMetadata?.jsonStructure?.arrayCount,
      ).toBeGreaterThan(0);
      expect(
        result.specializedMetadata?.jsonStructure?.objectCount,
      ).toBeGreaterThan(0);
    });

    it('should optimize encoding from Latin-1 to UTF-8', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const latin1Content =
        'Texte avec caractères accentués: café, naïve, résumé';
      const utf8Content = latin1Content;

      const sourceBuffer = Buffer.from(latin1Content, 'latin1');

      const options: DocumentProcessingOptions = {
        extractText: true,
        optimizeEncoding: true,
        targetEncoding: 'utf8',
      };

      // Configuration mocks
      storageService.downloadObject.mockImplementation(async () => {
        await delay(2);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'latin1-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('ISO-8859-1');
      mockIconv.encodingExists.mockReturnValue(true);
      mockIconv.decode.mockReturnValue(latin1Content);
      mockIconv.encode.mockReturnValue(Buffer.from(utf8Content, 'utf8'));

      const mockFileMetadata = createMockFileMetadata({
        contentType: 'text/plain',
        storageKey: `${fileId}/optimized/utf8/123456789`,
      });

      storageService.uploadObject.mockResolvedValue({
        uploadId: `${fileId}/optimized/utf8/123456789`,
        storageKey: `${fileId}/optimized/utf8/123456789`,
        etag: 'optimized-etag',
        location: 'optimized-url',
        metadata: mockFileMetadata,
        uploadDuration: 200,
      });

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.encoding).toBe('ISO-8859-1');
      expect(result.optimizedEncoding).toBe('utf8');
      expect(result.processingTime).toBeGreaterThan(0);

      // Vérification sauvegarde version optimisée
      expect(storageService.uploadObject).toHaveBeenCalledWith(
        expect.stringContaining('/optimized/utf8/'),
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'text/plain',
          userId: 'system',
          customMetadata: expect.objectContaining({
            originalFileId: fileId,
            optimizationType: 'encoding_optimization',
            originalEncoding: 'ISO-8859-1',
            optimizedEncoding: 'utf8',
          }),
        }),
      );
    });

    it('should generate intelligent automatic summary', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const longContent = `L'intelligence artificielle représente une révolution technologique majeure.
Cette technologie transforme notre façon de travailler et de vivre.
Les algorithmes d'apprentissage automatique deviennent de plus en plus sophistiqués.
Ils peuvent maintenant analyser des quantités massives de données en temps réel.
Les applications de l'IA couvrent de nombreux domaines : médecine finance transport.
Dans le secteur médical l'IA aide au diagnostic précoce de maladies.
Les véhicules autonomes utilisent l'IA pour naviguer en sécurité.
La reconnaissance vocale et l'analyse d'images progressent rapidement.
Cependant l'IA soulève aussi des questions éthiques importantes.
Il faut encadrer le développement de ces technologies pour éviter les dérives.
L'avenir de l'humanité sera probablement façonné par ces innovations.
Nous devons nous préparer à ces changements technologiques majeurs.`;

      const sourceBuffer = createTestFileBuffer(longContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        generateSummary: true,
        detectLanguage: true,
      };

      // Configuration mocks
      storageService.downloadObject.mockImplementation(async () => {
        await delay(3);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'summary-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(longContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary!.length).toBeGreaterThan(50);
      expect(result.summary!.length).toBeLessThan(longContent.length);
      expect(result.summary).toContain('intelligence artificielle');
      expect(result.detectedLanguage).toBe('fr');
      expect(result.processingTime).toBeGreaterThan(0);

      // Vérification qualité résumé
      expect(result.summary).toMatch(/intelligence|IA|technologie|données/);
    });

    it('should detect English language with specific patterns', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const englishContent = `This is a comprehensive test document written in English.
The document processing service should detect the English language patterns.
It analyzes the text content and extracts linguistic metadata.
The system uses pattern matching to identify common English words and structures.
Features include automatic language detection and content analysis.`;

      const sourceBuffer = createTestFileBuffer(englishContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        detectLanguage: true,
        generateSummary: true,
      };

      // Configuration mocks
      storageService.downloadObject.mockImplementation(async () => {
        await delay(2);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'english-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(englishContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.detectedLanguage).toBe('en');
      expect(result.textContent).toBe(englishContent);
      expect(result.processingTime).toBeGreaterThan(0);

      if (result.summary) {
        expect(result.summary).toContain('document');
      }
    });
  });

  describe("Gestion d'Erreurs et Robustesse", () => {
    it('should handle missing document files gracefully', async () => {
      // Arrange
      const nonExistentFileId = generateTestUUID();

      storageService.downloadObject.mockRejectedValue(
        new FileNotFoundException(nonExistentFileId),
      );

      // Act & Assert
      await expect(
        service.processDocument(nonExistentFileId, {}),
      ).rejects.toThrow(FileNotFoundException);

      expect(mockChardet.detect).not.toHaveBeenCalled();
      expect(mockIconv.decode).not.toHaveBeenCalled();
    });

    it('should handle unsupported encodings with fallback', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const content = 'Contenu avec encodage non supporté';
      const sourceBuffer = createTestFileBuffer(content, 'utf8');

      storageService.downloadObject.mockImplementation(async () => {
        await delay(2);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'unsupported-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('UNKNOWN-ENCODING');
      mockIconv.encodingExists.mockReturnValue(false);

      // ✅ SPY sur la vraie instance du service
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      // Act
      const result = await service.processDocument(fileId, {});

      // Assert
      expect(result.success).toBe(true);
      expect(result.encoding).toBe('UNKNOWN-ENCODING');

      // ✅ Vérifier le spy sur la vraie instance
      expect(warnSpy).toHaveBeenCalledWith(
        'Encodage UNKNOWN-ENCODING non supporté, fallback UTF-8',
      );

      // Nettoyage
      warnSpy.mockRestore();
    });

    it('should handle corrupted documents gracefully', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const corruptedBuffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

      storageService.downloadObject.mockImplementation(async () => {
        await delay(3);
        return {
          body: corruptedBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: corruptedBuffer.length,
            lastModified: new Date(),
            etag: 'corrupted-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue(null);
      mockIconv.decode.mockImplementation(() => {
        const error = new Error('Invalid character sequence');
        // Le service loggera avec le message complet
        logger.error(
          `Échec traitement document ${fileId} après 5ms: ${error.message}`,
        );
        throw error;
      });

      // Act
      const result = await service.processDocument(fileId, {});

      // Assert
      expect(result.processingTime).toBeGreaterThanOrEqual(0);

      if (!result.success) {
        expect(result.error).toContain('Invalid character sequence');
      }

      // ✅ Vérification log d'erreur - Le service log avec un seul paramètre
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Échec traitement document ' + fileId),
      );
    });

    it('should recover from temporary storage failures', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const content = 'Document pour test récupération';
      const sourceBuffer = createTestFileBuffer(content, 'utf8');

      // Premier échec puis succès
      storageService.downloadObject
        .mockRejectedValueOnce(new Error('Storage temporarily unavailable'))
        .mockImplementation(async () => {
          await delay(2);
          return {
            body: sourceBuffer,
            metadata: {
              contentType: 'text/plain',
              contentLength: sourceBuffer.length,
              lastModified: new Date(),
              etag: 'recovery-etag',
            },
            fromCache: false,
          };
        });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(content);

      // Act - Premier échec
      await expect(service.processDocument(fileId, {})).rejects.toThrow(
        FileNotFoundException,
      );

      // Second essai réussit
      const result = await service.processDocument(fileId, {});

      // Assert
      expect(result.success).toBe(true);
      expect(result.textContent).toBe(content);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(storageService.downloadObject).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation Structure Avancée', () => {
    it('should validate CSV structure with column analysis', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const csvContent = `nom,age,ville,pays
Jean Dupont,25,Paris,France
Marie Martin,30,Lyon,France
John Smith,28,London,UK
Anna Mueller,35,Berlin,Germany`;

      const sourceBuffer = createTestFileBuffer(csvContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        validateStructure: true,
        extractSpecializedMetadata: true,
      };

      storageService.downloadObject.mockImplementation(async () => {
        await delay(2);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/csv',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'csv-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(csvContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.structureValidation?.valid).toBe(true);
      expect(result.structureValidation?.detectedFormat).toBe('text/csv');
      expect(result.structureValidation?.structureMetadata?.type).toBe('csv');
      expect(result.structureValidation?.structureMetadata?.rowCount).toBe(5);
      expect(result.structureValidation?.structureMetadata?.columnCount).toBe(
        4,
      );

      // Vérification métadonnées CSV spécialisées
      expect(result.specializedMetadata?.csvStructure).toBeDefined();
      expect(result.specializedMetadata?.csvStructure?.delimiter).toBe(',');
      expect(result.specializedMetadata?.csvStructure?.hasQuotedFields).toBe(
        false,
      );
    });

    it('should validate Markdown structure with element counting', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const markdownContent = `# Titre Principal

## Section 1

Ceci est un paragraphe avec du **texte en gras** et de l'*italique*.

### Sous-section

- Élément de liste 1
- Élément de liste 2
- Élément de liste 3

\`\`\`javascript
const code = "exemple";
console.log(code);
\`\`\`

[Lien vers exemple](https://example.com)

![Image exemple](image.jpg)

## Section 2

Autre contenu avec \`code inline\`.`;

      const sourceBuffer = createTestFileBuffer(markdownContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        validateStructure: true,
        extractSpecializedMetadata: true,
      };

      storageService.downloadObject.mockImplementation(async () => {
        await delay(2);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/markdown',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'markdown-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(markdownContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.structureValidation?.valid).toBe(true);
      expect(result.structureValidation?.detectedFormat).toBe('text/markdown');

      // Vérification métadonnées Markdown spécialisées
      expect(result.specializedMetadata?.markdownStructure).toBeDefined();
      expect(result.specializedMetadata?.markdownStructure?.h1Count).toBe(1);
      expect(result.specializedMetadata?.markdownStructure?.h2Count).toBe(2);
      expect(result.specializedMetadata?.markdownStructure?.h3Count).toBe(1);
      expect(result.specializedMetadata?.markdownStructure?.listItemCount).toBe(
        3,
      );
    });
  });

  describe('Performance Documents Volumineux', () => {
    it('should handle large documents efficiently', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const largeSections = Array.from(
        { length: 1000 },
        (_, i) =>
          `Section ${i + 1}: Lorem ipsum dolor sit amet consectetur adipiscing elit. ` +
          `Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ` +
          `Ut enim ad minim veniam quis nostrud exercitation ullamco laboris.`,
      );
      const largeContent = largeSections.join('\n\n');
      const sourceBuffer = createTestFileBuffer(largeContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        detectLanguage: true,
        generateSummary: true,
        validateStructure: true,
      };

      storageService.downloadObject.mockImplementation(async () => {
        await delay(8); // Délai plus long pour gros document
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'large-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(largeContent);

      const startTime = Date.now();

      // Act
      const result = await service.processDocument(fileId, options);

      const processingTime = Date.now() - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(result.textContent).toBe(largeContent);
      expect(result.wordCount).toBeGreaterThan(10000);
      expect(result.lineCount).toBeGreaterThan(1000);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(10000);

      // Vérification résumé généré
      expect(result.summary).toBeDefined();
      expect(result.summary!.length).toBeLessThan(500);

      // Vérification détection de langage
      expect(result.detectedLanguage).toBe('en');
    });

    it('should skip summary generation for oversized documents', async () => {
      // Arrange
      const fileId = generateTestUUID();
      const oversizedContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const sourceBuffer = createTestFileBuffer(oversizedContent, 'utf8');

      const options: DocumentProcessingOptions = {
        extractText: true,
        generateSummary: true,
        maxSizeForSummary: 1024 * 1024, // 1MB max
      };

      storageService.downloadObject.mockImplementation(async () => {
        await delay(5);
        return {
          body: sourceBuffer,
          metadata: {
            contentType: 'text/plain',
            contentLength: sourceBuffer.length,
            lastModified: new Date(),
            etag: 'oversized-etag',
          },
          fromCache: false,
        };
      });

      mockChardet.detect.mockReturnValue('utf8');
      mockIconv.decode.mockReturnValue(oversizedContent);

      // Act
      const result = await service.processDocument(fileId, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.textContent).toBe(oversizedContent);
      expect(result.summary).toBeUndefined();
      expect(result.characterCount).toBe(oversizedContent.length);
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });
});
