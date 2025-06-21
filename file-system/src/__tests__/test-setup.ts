// src/__tests__/test-setup.ts

/**
 * Configuration globale des tests pour le système de fichiers Coders V1
 * 
 * Ce fichier configure l'environnement de test complet selon les standards 07-08
 * et prépare tous les mocks, utilities et matchers nécessaires pour les tests
 * d'infrastructure du composant C-06 File System.
 * 
 * Fonctionnalités :
 * - Respect des variables d'environnement .env.test (Step 1.1)
 * - Configuration complémentaire pour tests avancés (Step 1.2+)
 * - Mocks AWS SDK pour Garage S3
 * - Utilities de test (buffers, UUID, checksums)
 * - Matchers Jest personnalisés
 * - Helpers spécifiques au stockage
 * - Configuration globale Jest
 * 
 * @author DevOps Lead
 * @version 1.1 - Adapté pour Step 1.1 + 1.2
 * @conformite 07-08 Coding Standards
 */

import { randomBytes, createHash } from 'crypto';

// ============================================================================
// CONFIGURATION VARIABLES D'ENVIRONNEMENT
// ============================================================================

/**
 * Configuration complémentaire des variables d'environnement pour tests
 * Respecte les variables déjà chargées depuis .env.test et ajoute uniquement les manquantes
 */
const setupTestEnvironment = (): void => {
  // Variables complémentaires (seulement si pas déjà définies)
  const complementaryEnvVars = {
    // Configuration Node.js (respect .env.test)
    NODE_ENV: process.env.NODE_ENV || 'test',
    TZ: process.env.TZ || 'UTC',
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
    
    // Garage S3 Configuration (respect .env.test en priorité)
    GARAGE_ENDPOINT: process.env.GARAGE_ENDPOINT || 'https://s3.test.coders.com',
    GARAGE_ACCESS_KEY: process.env.GARAGE_ACCESS_KEY || 'GK_TEST_ACCESS_KEY_123456789',
    GARAGE_SECRET_KEY: process.env.GARAGE_SECRET_KEY || 'test_secret_key_with_sufficient_length_for_aws_sdk_validation_requirements',
    GARAGE_BUCKET_DOCUMENTS: process.env.GARAGE_BUCKET_DOCUMENTS || 'test-coders-documents',
    GARAGE_BUCKET_BACKUPS: process.env.GARAGE_BUCKET_BACKUPS || 'test-coders-backups',
    GARAGE_BUCKET_TEMP: process.env.GARAGE_BUCKET_TEMP || 'test-coders-temp',
    GARAGE_REGION: process.env.GARAGE_REGION || 'eu-west-1',
    GARAGE_FORCE_PATH_STYLE: process.env.GARAGE_FORCE_PATH_STYLE || 'true',
    
    // Garage S3 Configuration Tests d'Intégration (Step 1.2)
    GARAGE_TEST_ENDPOINT: process.env.GARAGE_TEST_ENDPOINT || 'http://localhost:3900',
    GARAGE_TEST_REGION: process.env.GARAGE_TEST_REGION || 'garage',
    GARAGE_TEST_ACCESS_KEY: process.env.GARAGE_TEST_ACCESS_KEY || 'GK1234567890ABCDEFGH',
    GARAGE_TEST_SECRET_KEY: process.env.GARAGE_TEST_SECRET_KEY || 'abcdef1234567890abcdef1234567890abcdef12',
    GARAGE_TEST_BUCKET: process.env.GARAGE_TEST_BUCKET || `test-integration-${Date.now()}`,
    
    // CDN Configuration (respect .env.test)
    CDN_BASE_URL: process.env.CDN_BASE_URL || 'https://cdn.test.coders.com',
    CDN_CACHE_CONTROL: process.env.CDN_CACHE_CONTROL || 'public, max-age=300',
    CDN_INVALIDATION_TOKEN: process.env.CDN_INVALIDATION_TOKEN || 'test_cdn_invalidation_token_123456789',
    CDN_EDGE_LOCATIONS: process.env.CDN_EDGE_LOCATIONS || 'eu-west-1,us-east-1,ap-southeast-1',
    CDN_DEFAULT_TTL: process.env.CDN_DEFAULT_TTL || '300',
    CDN_MAX_TTL: process.env.CDN_MAX_TTL || '3600',
    CDN_INVALIDATION_ENABLED: process.env.CDN_INVALIDATION_ENABLED || 'false',
    
    // Processing Configuration (respect .env.test)
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || '104857600', // Respect .env.test value
    ALLOWED_MIME_TYPES: process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,application/json',
    VIRUS_SCAN_TIMEOUT: process.env.VIRUS_SCAN_TIMEOUT || '5000',
    VIRUS_SCAN_ENABLED: process.env.VIRUS_SCAN_ENABLED || 'false',
    SCAN_VIRUS_ENABLED: process.env.SCAN_VIRUS_ENABLED || 'false',
    IMAGE_OPTIMIZATION_QUALITY: process.env.IMAGE_OPTIMIZATION_QUALITY || '85',
    THUMBNAIL_SIZE: process.env.THUMBNAIL_SIZE || '128',
    PDF_COMPRESSION_LEVEL: process.env.PDF_COMPRESSION_LEVEL || '6',
    
    // Security Configuration (respect .env.test)
    PRESIGNED_URL_EXPIRY: process.env.PRESIGNED_URL_EXPIRY || '1800',
    MAX_PRESIGNED_URLS: process.env.MAX_PRESIGNED_URLS || '10',
    IP_RESTRICTION_ENABLED: process.env.IP_RESTRICTION_ENABLED || 'false',
    RATE_LIMIT_UPLOADS_PER_MINUTE: process.env.RATE_LIMIT_UPLOADS_PER_MINUTE || '20',
    ABUSE_BLOCK_DURATION: process.env.ABUSE_BLOCK_DURATION || '60',
    DEVICE_FINGERPRINTING_ENABLED: process.env.DEVICE_FINGERPRINTING_ENABLED || 'false',
    SECURITY_TOKEN_SECRET: process.env.SECURITY_TOKEN_SECRET || 'test_security_token_secret_with_minimum_32_characters_length_for_jwt_validation',
    
    // Backup et Versioning
    BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS || '7',
    VERSION_RETENTION_COUNT: process.env.VERSION_RETENTION_COUNT || '3',
    AUTOMATED_BACKUP_ENABLED: process.env.AUTOMATED_BACKUP_ENABLED || 'false',
    CROSS_REGION_REPLICATION: process.env.CROSS_REGION_REPLICATION || 'false',
    
    // Performance et Monitoring
    GARAGE_REQUEST_TIMEOUT: process.env.GARAGE_REQUEST_TIMEOUT || '30000',
    PROCESSING_TIMEOUT: process.env.PROCESSING_TIMEOUT || '60000',
    CACHE_TTL_METADATA: process.env.CACHE_TTL_METADATA || '60',
    CACHE_TTL_PRESIGNED_URL: process.env.CACHE_TTL_PRESIGNED_URL || '300',
    
    // Configuration Base de données (pour tests futurs)
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_coders_file_system',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379/15',
    
    // Configuration Authentification (intégration C-05)
    JWT_SECRET: process.env.JWT_SECRET || 'test_jwt_secret_for_file_system_tests_with_sufficient_length',
    JWT_EXPIRY: process.env.JWT_EXPIRY || '1h',
    
    // Divers
    TEMP_UPLOAD_DIR: process.env.TEMP_UPLOAD_DIR || '/tmp/test-uploads',
    CLEANUP_TEMP_FILES: process.env.CLEANUP_TEMP_FILES || 'true'
  };

  // Application uniquement des variables manquantes (pas d'écrasement)
  Object.keys(complementaryEnvVars).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = complementaryEnvVars[key];
    }
  });
  
  console.log('✅ Test environment variables configured for C-06 File System (respecting .env.test)');
  console.log(`📝 Using configuration: MAX_FILE_SIZE=${process.env.MAX_FILE_SIZE}, GARAGE_ENDPOINT=${process.env.GARAGE_ENDPOINT}`);
};

// ============================================================================
// MOCKS AWS SDK - Configuration complète pour Garage S3
// ============================================================================

/**
 * Configuration des mocks AWS SDK pour isolation des tests unitaires
 * Compatible avec @aws-sdk/client-s3 v3 et les méthodes utilisées dans GarageStorageService
 * Appliqué uniquement pour les tests unitaires (Step 1.2)
 */
const setupAWSMocks = (): void => {
  // Mock principal du client S3 avec réponses par défaut
  jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        // Valeurs par défaut pour éviter les erreurs undefined
        ETag: '"default-etag"',
        Location: 'https://test-garage.example.com/test-bucket/default-object',
        UploadId: 'default-upload-id',
        ContentLength: 1024,
        ContentType: 'application/octet-stream',
        LastModified: new Date(),
        Metadata: {},
        Body: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('test data')), 0);
            } else if (event === 'end') {
              setTimeout(() => callback(), 1);
            }
          }),
          pipe: jest.fn()
        }
      }),
      config: {
        endpoint: process.env.GARAGE_ENDPOINT,
        region: process.env.GARAGE_REGION,
        credentials: {
          accessKeyId: process.env.GARAGE_ACCESS_KEY,
          secretAccessKey: process.env.GARAGE_SECRET_KEY
        }
      },
      destroy: jest.fn()
    })),
    
    // Commands pour opérations de base
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    
    // Commands pour multipart upload
    CreateMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    UploadPartCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    CompleteMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    AbortMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    
    // Commands avancées
    CopyObjectCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    GetBucketLocationCommand: jest.fn().mockImplementation((input) => ({ 
      input,
      resolveMiddleware: jest.fn() 
    })),
    
    // Waiters et utilitaires
    waitUntilObjectExists: jest.fn().mockResolvedValue({}),
    waitUntilObjectNotExists: jest.fn().mockResolvedValue({})
  }));

  // Mock des utilitaires S3 avec structure correcte
  jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockImplementation(async (client, command, options = {}) => {
      const expiresIn = options.expiresIn || 3600;
      const mockUrl = `https://test-garage.example.com/test-bucket/mock-object?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}`;
      return Promise.resolve(mockUrl);
    })
  }));

  // Mock de la librairie de upload multipart avec réponse complète
  jest.mock('@aws-sdk/lib-storage', () => ({
    Upload: jest.fn().mockImplementation((params) => ({
      done: jest.fn().mockResolvedValue({
        ETag: '"mock-multipart-etag"',
        Location: `https://test-garage.example.com/test-bucket/${params.params.Key}`,
        Key: params.params.Key,
        Bucket: params.params.Bucket
      }),
      on: jest.fn(),
      abort: jest.fn()
    }))
  }));

  // Mock UUID pour reproductibilité des tests
  jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-v4-for-tests-12345678')
  }));
  
  console.log('🔧 AWS SDK mocks configured for unit tests (corrected version)');
};

// ============================================================================
// CONFIGURATION GLOBALE JEST
// ============================================================================

/**
 * Configuration avant tous les tests
 * Mise en place de l'environnement de test complet
 */
beforeAll(async () => {
  // 1. Configuration variables d'environnement complémentaires
  // (jest.env.setup.js a déjà chargé .env.test)
  setupTestEnvironment();
  
  // 2. Configuration des mocks AWS SDK pour tests unitaires
  setupAWSMocks();
  
  // 3. Configuration timezone pour tests déterministes
  process.env.TZ = 'UTC';
  
  // 4. Configuration des timeouts pour tests d'intégration
  jest.setTimeout(60000); // 60 secondes max par test (pour tests d'intégration)
  
  // 5. Configuration console selon LOG_LEVEL de .env.test
  const originalConsole = console;
  if (process.env.NODE_ENV === 'test') {
    const logLevel = process.env.LOG_LEVEL || 'error';
    global.console = {
      ...originalConsole,
      log: logLevel === 'error' ? jest.fn() : originalConsole.log,
      debug: jest.fn(), // Toujours masquer debug
      info: logLevel === 'error' ? jest.fn() : originalConsole.info,
      warn: originalConsole.warn, // Garder les warnings
      error: originalConsole.error // Garder les erreurs
    };
  }
  
  console.log('🧪 Jest test environment fully configured for Step 1.1 + 1.2');
});

/**
 * Configuration avant chaque test
 * Reset des mocks et état propre
 */
beforeEach(() => {
  // Reset des mocks entre chaque test pour isolation
  jest.clearAllMocks();
  
  // Reset des timers si utilisés dans les tests
  if (jest.isMockFunction(setTimeout)) {
    jest.clearAllTimers();
  }
});

/**
 * Nettoyage après chaque test
 * Optionnel : nettoyage spécifique si nécessaire
 */
afterEach(async () => {
  // Attendre que tous les timers se terminent
  if (jest.isMockFunction(setTimeout)) {
    jest.runOnlyPendingTimers();
  }
  
  // Petit délai pour permettre aux promesses de se résoudre
  await new Promise(resolve => setTimeout(resolve, 10));
});

/**
 * Nettoyage après tous les tests
 * Restauration de l'état initial
 */
afterAll(() => {
  // Restauration des mocks
  jest.restoreAllMocks();
  
  // Restauration console si nécessaire
  if (process.env.NODE_ENV === 'test') {
    // Restaurer console sera fait automatiquement par Jest
  }
  
  console.log('🧹 Jest test environment cleaned up');
});

// ============================================================================
// UTILITIES DE TEST - Helpers pour création de données
// ============================================================================

/**
 * Crée un buffer de test standard avec contenu spécifié
 * 
 * @param content Contenu du buffer (défaut: contenu de test standard)
 * @param encoding Encodage à utiliser (défaut: utf8)
 * @returns Buffer de test
 */
export function createTestFileBuffer(content: string = 'test file content', encoding: BufferEncoding = 'utf8'): Buffer {
  return Buffer.from(content, encoding);
}

/**
 * Crée un buffer de taille spécifique avec contenu aléatoire
 * Utile pour tests de performance et validation taille
 * 
 * @param sizeBytes Taille du buffer en octets
 * @returns Buffer avec contenu aléatoire
 */
export function createRandomBuffer(sizeBytes: number): Buffer {
  return randomBytes(sizeBytes);
}

/**
 * Crée un fichier PDF valide minimal pour tests
 * Compatible avec les validateurs PDF standards
 * 
 * @returns Buffer contenant un PDF valide minimal
 */
export function createTestPDFBuffer(): Buffer {
  const pdfContent = [
    '%PDF-1.4',
    '1 0 obj',
    '<<',
    '/Type /Catalog',
    '/Pages 2 0 R',
    '>>',
    'endobj',
    '2 0 obj',
    '<<',
    '/Type /Pages',
    '/Kids [3 0 R]',
    '/Count 1',
    '>>',
    'endobj',
    '3 0 obj',
    '<<',
    '/Type /Page',
    '/Parent 2 0 R',
    '/MediaBox [0 0 612 792]',
    '>>',
    'endobj',
    'xref',
    '0 4',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000074 00000 n ',
    '0000000120 00000 n ',
    'trailer',
    '<<',
    '/Size 4',
    '/Root 1 0 R',
    '>>',
    'startxref',
    '179',
    '%%EOF'
  ].join('\n');
  
  return Buffer.from(pdfContent, 'utf8');
}

/**
 * Crée une image JPEG valide minimale pour tests
 * Header JPEG conforme aux standards pour validation
 * 
 * @returns Buffer contenant un JPEG valide minimal
 */
export function createTestJPEGBuffer(): Buffer {
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, // SOI (Start of Image)
    0xFF, 0xE0, // APP0
    0x00, 0x10, // Length of APP0 segment
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // JFIF version 1.1
    0x01, // Density units (inches)
    0x00, 0x48, // X density (72 DPI)
    0x00, 0x48, // Y density (72 DPI)
    0x00, 0x00, // Thumbnail width and height (0 = no thumbnail)
    
    // Minimal quantization table and image data
    0xFF, 0xC0, // SOF0 (Start of Frame)
    0x00, 0x11, // Length
    0x08, // Data precision
    0x00, 0x01, 0x00, 0x01, // Image dimensions (1x1)
    0x01, // Number of components
    0x01, 0x11, 0x00, // Component info
    
    0xFF, 0xDA, // SOS (Start of Scan)
    0x00, 0x08, // Length
    0x01, // Number of components
    0x01, 0x00, // Component selector and Huffman table
    0x00, 0x3F, 0x00, // Spectral selection
    
    0xFF, 0xD9 // EOI (End of Image)
  ]);
  
  return jpegHeader;
}

/**
 * Crée une image PNG valide minimale pour tests
 * Header PNG conforme aux standards
 * 
 * @returns Buffer contenant un PNG valide minimal
 */
export function createTestPNGBuffer(): Buffer {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x0D, // Length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE // CRC
  ]);
  const idatChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x0A, // Length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // Compressed data
    0xE2, 0x21, 0xBC, 0x33 // CRC
  ]);
  const iendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, // Length
    0x49, 0x45, 0x4E, 0x44, // "IEND"
    0xAE, 0x42, 0x60, 0x82 // CRC
  ]);
  
  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Crée un fichier JSON valide pour tests
 * 
 * @param data Données à sérialiser (défaut: objet de test)
 * @returns Buffer contenant du JSON valide
 */
export function createTestJSONBuffer(data: any = { test: true, timestamp: new Date().toISOString() }): Buffer {
  return Buffer.from(JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Simule un délai asynchrone pour tests de performance et timing
 * 
 * @param ms Délai en millisecondes
 * @returns Promise qui se résout après le délai
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Génère un UUID v4 valide pour tests
 * Version déterministe pour reproductibilité si nécessaire
 * 
 * @param deterministic Si true, génère un UUID prévisible pour tests
 * @returns UUID v4 valide
 */
export function generateTestUUID(deterministic: boolean = false): string {
  if (deterministic) {
    return '12345678-1234-4567-8901-123456789012';
  }
  
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Génère une clé de stockage de test valide
 * 
 * @param prefix Préfixe de la clé (défaut: test-files)
 * @param filename Nom du fichier (défaut: généré automatiquement)
 * @returns Clé de stockage valide
 */
export function generateTestStorageKey(prefix: string = 'test-files', filename?: string): string {
  const name = filename || `test-file-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return `${prefix}/${name}`;
}

/**
 * Calcule le checksum MD5 d'un buffer
 * 
 * @param buffer Buffer à hash
 * @returns Checksum MD5 en hexadécimal
 */
export function calculateMD5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Calcule le checksum SHA256 d'un buffer
 * 
 * @param buffer Buffer à hash
 * @returns Checksum SHA256 en hexadécimal
 */
export function calculateSHA256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Génère un checksum MD5 de test (format valide mais contenu fictif)
 * 
 * @returns Checksum MD5 valide pour tests
 */
export function generateTestMD5(): string {
  return 'a1b2c3d4e5f6789012345678901234567';
}

/**
 * Génère un checksum SHA256 de test (format valide mais contenu fictif)
 * 
 * @returns Checksum SHA256 valide pour tests
 */
export function generateTestSHA256(): string {
  return 'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234';
}

/**
 * Valide qu'une chaîne respecte le format UUID v4
 * 
 * @param uuid Chaîne à valider
 * @returns true si UUID valide
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Crée des métadonnées d'objet de test
 * 
 * @param overrides Propriétés à surcharger
 * @returns Métadonnées d'objet pour tests
 */
export function createTestObjectMetadata(overrides: any = {}): any {
  return {
    contentType: 'text/plain',
    userId: 'test-user-123',
    projectId: 'test-project-456',
    customMetadata: {
      testId: generateTestUUID(true),
      environment: 'test'
    },
    ...overrides
  };
}

// ============================================================================
// MATCHERS PERSONNALISÉS JEST - Assertions spécialisées
// ============================================================================

/**
 * Extension des matchers Jest pour assertions spécialisées du système de fichiers
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidFileSize(): R;
      toBeValidMimeType(): R;
      toBeValidFilename(): R;
      toBeValidStorageKey(): R;
      toBeValidChecksum(algorithm: 'md5' | 'sha256'): R;
      toBeValidUUID(): R;
      toBeValidBuffer(): R;
      toBeValidPresignedUrl(): R;
      toHaveValidFileStructure(): R;
    }
  }
}

// Extension des matchers Jest avec implémentations complètes
expect.extend({
  /**
   * Vérifie qu'une taille de fichier est dans les limites autorisées
   */
  toBeValidFileSize(received: number) {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '104857600'); // Utilise la valeur de .env.test
    const pass = typeof received === 'number' && received > 0 && received <= maxSize;
    
    return {
      message: () => 
        `expected ${received} to be a valid file size (> 0 and <= ${maxSize} bytes)`,
      pass
    };
  },

  /**
   * Vérifie qu'un type MIME est valide selon les standards
   */
  toBeValidMimeType(received: string) {
    const mimeTypeRegex = /^[a-z-]+\/[a-z0-9-+.]+$/i;
    const pass = typeof received === 'string' && mimeTypeRegex.test(received);
    
    return {
      message: () => 
        `expected "${received}" to be a valid MIME type (format: type/subtype)`,
      pass
    };
  },

  /**
   * Vérifie qu'un nom de fichier est valide (sécurité et longueur)
   */
  toBeValidFilename(received: string) {
    const pass = typeof received === 'string' &&
                 received.length > 0 && 
                 received.length <= 255 && 
                 !/[<>:"/\\|?*\x00-\x1f]/.test(received) &&
                 !received.includes('..') &&
                 received !== '.' &&
                 received !== '..';
    
    return {
      message: () => 
        `expected "${received}" to be a valid filename (1-255 chars, no forbidden characters)`,
      pass
    };
  },

  /**
   * Vérifie qu'une clé de stockage S3 est valide
   */
  toBeValidStorageKey(received: string) {
    const pass = typeof received === 'string' &&
                 received.length > 0 &&
                 received.length <= 1024 && // Limite S3
                 !received.startsWith('/') &&
                 !received.endsWith('/') &&
                 !received.includes('//') &&
                 !received.includes('..') &&
                 !/[\x00-\x1f\x7f]/.test(received); // Pas de caractères de contrôle
    
    return {
      message: () => 
        `expected "${received}" to be a valid storage key (S3 compatible)`,
      pass
    };
  },

  /**
   * Vérifie qu'un checksum a le format attendu
   */
  toBeValidChecksum(received: string, algorithm: 'md5' | 'sha256') {
    const patterns = {
      md5: /^[a-f0-9]{32}$/i,
      sha256: /^[a-f0-9]{64}$/i
    };
    
    const pass = typeof received === 'string' && patterns[algorithm].test(received);
    
    return {
      message: () => 
        `expected "${received}" to be a valid ${algorithm.toUpperCase()} checksum`,
      pass
    };
  },

  /**
   * Vérifie qu'une chaîne est un UUID v4 valide
   */
  toBeValidUUID(received: string) {
    const pass = isValidUUID(received);
    
    return {
      message: () => 
        `expected "${received}" to be a valid UUID v4`,
      pass
    };
  },

  /**
   * Vérifie qu'un objet est un Buffer valide et non vide
   */
  toBeValidBuffer(received: any) {
    const pass = Buffer.isBuffer(received) && received.length > 0;
    
    return {
      message: () => 
        `expected ${received} to be a valid non-empty Buffer`,
      pass
    };
  },

  /**
   * Vérifie qu'une URL pré-signée a le format attendu
   */
  toBeValidPresignedUrl(received: string) {
    try {
      const url = new URL(received);
      const hasSignature = url.searchParams.has('X-Amz-Signature') || 
                          url.searchParams.has('Signature') ||
                          url.searchParams.has('X-Amz-Algorithm');
      const pass = hasSignature && (url.protocol === 'https:' || url.protocol === 'http:');
      
      return {
        message: () => 
          `expected "${received}" to be a valid presigned URL with signature parameters`,
        pass
      };
    } catch {
      return {
        message: () => 
          `expected "${received}" to be a valid presigned URL`,
        pass: false
      };
    }
  },

  /**
   * Vérifie qu'un objet a la structure attendue d'un fichier
   */
  toHaveValidFileStructure(received: any) {
    const requiredFields = ['id', 'filename', 'contentType', 'size', 'storageKey'];
    const hasRequiredFields = requiredFields.every(field => 
      received && typeof received === 'object' && field in received
    );
    
    const pass = hasRequiredFields && 
                 typeof received.size === 'number' &&
                 received.size > 0;
    
    return {
      message: () => 
        `expected object to have valid file structure with fields: ${requiredFields.join(', ')}`,
      pass
    };
  }
});

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

/**
 * Configuration exportée pour utilisation dans d'autres fichiers de test
 * Utilise les valeurs de .env.test en priorité
 */
export const testConfig = {
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'),
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || '').split(','),
  virusScanEnabled: process.env.VIRUS_SCAN_ENABLED === 'true',
  testBucket: process.env.GARAGE_TEST_BUCKET || 'test-bucket',
  testEndpoint: process.env.GARAGE_TEST_ENDPOINT || 'http://localhost:3900',
  garageEndpoint: process.env.GARAGE_ENDPOINT || 'https://s3.test.coders.com',
  cdnBaseUrl: process.env.CDN_BASE_URL || 'https://cdn.test.coders.com'
};
