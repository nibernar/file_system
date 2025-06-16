/**
 * Configuration globale des tests pour le système de fichiers
 * Version corrigée avec variables d'environnement intégrées
 */

// ============================================================================
// CONFIGURATION VARIABLES D'ENVIRONNEMENT - Définition directe
// ============================================================================

/**
 * Variables d'environnement pour les tests
 * Définies directement ici pour éviter les dépendances externes
 */
const setupTestEnvironment = () => {
  const testEnvVars = {
    NODE_ENV: 'test',
    TZ: 'UTC',
    
    // Garage S3 Configuration
    GARAGE_ENDPOINT: 'https://s3.test.coders.com',
    GARAGE_ACCESS_KEY: 'TEST_ACCESS_KEY_123',
    GARAGE_SECRET_KEY: 'test_secret_key_with_sufficient_length_for_validation',
    GARAGE_BUCKET_DOCUMENTS: 'test-coders-documents',
    GARAGE_BUCKET_BACKUPS: 'test-coders-backups',
    GARAGE_BUCKET_TEMP: 'test-coders-temp',
    GARAGE_REGION: 'eu-west-1',
    
    // CDN Configuration
    CDN_BASE_URL: 'https://cdn.test.coders.com',
    CDN_CACHE_CONTROL: 'public, max-age=300',
    CDN_INVALIDATION_TOKEN: 'test_cdn_invalidation_token_123',
    CDN_EDGE_LOCATIONS: 'eu-west-1,us-east-1',
    CDN_DEFAULT_TTL: '300',
    CDN_MAX_TTL: '3600',
    
    // Processing Configuration
    MAX_FILE_SIZE: '104857600', // 100MB
    ALLOWED_MIME_TYPES: 'image/jpeg,application/pdf,text/plain',
    VIRUS_SCAN_TIMEOUT: '5000',
    IMAGE_OPTIMIZATION_QUALITY: '85',
    THUMBNAIL_SIZE: '128',
    
    // Security Configuration
    PRESIGNED_URL_EXPIRY: '1800',
    MAX_PRESIGNED_URLS: '5',
    IP_RESTRICTION_ENABLED: 'false',
    SCAN_VIRUS_ENABLED: 'false',
    RATE_LIMIT_UPLOADS_PER_MINUTE: '20',
    ABUSE_BLOCK_DURATION: '60',
    DEVICE_FINGERPRINTING_ENABLED: 'false',
    SECURITY_TOKEN_SECRET: 'test_security_token_secret_with_minimum_32_characters_length'
  };

  // Application des variables d'environnement
  Object.assign(process.env, testEnvVars);
  
  console.log('✅ Test environment variables configured');
};

// ============================================================================
// SETUP GLOBAL JEST - Configuration avant tous les tests
// ============================================================================

/**
 * Configuration globale Jest pour les tests du système de fichiers
 */
beforeAll(() => {
  // Configuration variables d'environnement en premier
  setupTestEnvironment();
  
  // Configuration timezone pour tests déterministes
  process.env.TZ = 'UTC';
  
  // Configuration des timeouts pour tests d'intégration
  jest.setTimeout(30000); // 30 secondes max par test
});

/**
 * Configuration avant chaque test
 */
beforeEach(() => {
  // Reset des mocks entre chaque test
  jest.clearAllMocks();
});

/**
 * Nettoyage après tous les tests
 */
afterAll(() => {
  // Restauration des mocks
  jest.restoreAllMocks();
});

// ============================================================================
// UTILITIES DE TEST - Helpers pour tests
// ============================================================================

/**
 * Crée un buffer de test pour simuler un fichier
 */
export function createTestFileBuffer(content: string = 'test file content'): Buffer {
  return Buffer.from(content, 'utf8');
}

/**
 * Crée un fichier PDF valide minimal pour tests
 */
export function createTestPDFBuffer(): Buffer {
  const pdfHeader = '%PDF-1.4\n';
  const pdfContent = '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n';
  const pdfTrailer = 'trailer<</Size 1/Root 1 0 R>>\n%%EOF';
  
  return Buffer.from(pdfHeader + pdfContent + pdfTrailer, 'utf8');
}

/**
 * Crée une image JPEG valide minimale pour tests
 */
export function createTestJPEGBuffer(): Buffer {
  // Header JPEG minimal valide
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, // SOI + APP0
    0x00, 0x10, // Length
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF"
    0x01, 0x01, // Version
    0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // Density info
    0xFF, 0xD9 // EOI
  ]);
  
  return jpegHeader;
}

/**
 * Simule un délai asynchrone pour tests de performance
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Génère un UUID valide pour tests
 */
export function generateTestUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Valide qu'une chaîne respecte le format UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Crée un checksum MD5 de test
 */
export function generateTestMD5(): string {
  return 'a1b2c3d4e5f6789012345678901234567';
}

/**
 * Crée un checksum SHA256 de test
 */
export function generateTestSHA256(): string {
  return 'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234';
}

// ============================================================================
// MATCHERS PERSONNALISÉS - Assertions spécialisées
// ============================================================================

/**
 * Matchers Jest personnalisés pour le système de fichiers
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidFileSize(): R;
      toBeValidMimeType(): R;
      toBeValidFilename(): R;
      toBeValidStorageKey(): R;
      toBeValidChecksum(algorithm: 'md5' | 'sha256'): R;
    }
  }
}

// Extension des matchers Jest
expect.extend({
  /**
   * Vérifie qu'une taille de fichier est valide
   */
  toBeValidFileSize(received: number) {
    const pass = received > 0 && received <= 500 * 1024 * 1024; // Max 500MB
    return {
      message: () => 
        `expected ${received} to be a valid file size (> 0 and <= 500MB)`,
      pass
    };
  },

  /**
   * Vérifie qu'un type MIME est valide
   */
  toBeValidMimeType(received: string) {
    const mimeTypeRegex = /^[a-z-]+\/[a-z0-9-+.]+$/;
    const pass = mimeTypeRegex.test(received);
    return {
      message: () => 
        `expected "${received}" to be a valid MIME type`,
      pass
    };
  },

  /**
   * Vérifie qu'un nom de fichier est valide
   */
  toBeValidFilename(received: string) {
    const pass = received.length > 0 && 
                 received.length <= 255 && 
                 !/[<>:"/\\|?*\x00-\x1f]/.test(received);
    return {
      message: () => 
        `expected "${received}" to be a valid filename`,
      pass
    };
  },

  /**
   * Vérifie qu'une clé de stockage est valide
   */
  toBeValidStorageKey(received: string) {
    const storageKeyRegex = /^[a-zA-Z0-9!_.*'()-\/]+$/;
    const pass = storageKeyRegex.test(received) && 
                 !received.includes('..') && 
                 received.length > 0;
    return {
      message: () => 
        `expected "${received}" to be a valid storage key`,
      pass
    };
  },

  /**
   * Vérifie qu'un checksum est valide
   */
  toBeValidChecksum(received: string, algorithm: 'md5' | 'sha256') {
    const patterns = {
      md5: /^[a-f0-9]{32}$/i,
      sha256: /^[a-f0-9]{64}$/i
    };
    
    const pass = patterns[algorithm].test(received);
    return {
      message: () => 
        `expected "${received}" to be a valid ${algorithm.toUpperCase()} checksum`,
      pass
    };
  }
});
