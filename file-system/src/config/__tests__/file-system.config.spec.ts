/**
 * Tests de validation pour la configuration du système de fichiers
 * Version finale avec isolation complète des variables d'environnement
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

import fileSystemConfig, {
  FileSystemConfig,
  GarageConfig,
  CDNConfig,
  ProcessingConfig,
  SecurityConfig,
  isValidFileSystemConfig,
  getEnvironmentConfig,
  FILE_SYSTEM_CONFIG,
} from '../file-system.config';

describe('FileSystemConfig', () => {
  let module: TestingModule;
  let configService: ConfigService;
  let originalEnv: Record<string, string | undefined>;

  // ============================================================================
  // SETUP ET TEARDOWN AVEC ISOLATION COMPLÈTE
  // ============================================================================

  beforeEach(async () => {
    // ISOLATION : Sauvegarder l'environnement original
    originalEnv = { ...process.env };

    // Arrange - Setup module de test
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [fileSystemConfig],
          envFilePath: '.env.test',
        }),
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    // ISOLATION : Restaurer l'environnement original
    process.env = originalEnv;

    await module.close();
  });

  // ============================================================================
  // TESTS VALIDATION VARIABLES D'ENVIRONNEMENT
  // ============================================================================

  describe('Environment Variables Validation', () => {
    it('should load configuration from environment variables successfully', () => {
      // Arrange - Environnement complètement isolé
      const validEnv = {
        GARAGE_ENDPOINT: 'https://s3.coders.com',
        GARAGE_ACCESS_KEY: 'GK_TEST_ACCESS_KEY',
        GARAGE_SECRET_KEY: 'test_secret_key_1234567890',
        GARAGE_BUCKET_DOCUMENTS: 'coders-documents',
        GARAGE_BUCKET_BACKUPS: 'coders-backups',
        GARAGE_BUCKET_TEMP: 'coders-temp',
        GARAGE_REGION: 'eu-west-1',
        CDN_BASE_URL: 'https://cdn.coders.com',
        CDN_INVALIDATION_TOKEN: 'cdn_token_123',
        SECURITY_TOKEN_SECRET: 'super_secret_token_key_32_chars_minimum_length',
      };

      // Act - Reset complet de l'environnement
      process.env = { ...validEnv };
      const config = fileSystemConfig();

      // Assert
      expect(config).toBeDefined();
      expect(config.garage.endpoint).toBe('https://s3.coders.com');
      expect(config.garage.accessKey).toBe('GK_TEST_ACCESS_KEY');
      expect(config.garage.buckets.documents).toBe('coders-documents');
      expect(config.cdn.baseUrl).toBe('https://cdn.coders.com');
      expect(config.security.securityTokenSecret).toBe(
        'super_secret_token_key_32_chars_minimum_length',
      );
    });

    it('should apply default values for optional configuration', () => {
      // Arrange - SEULEMENT les variables requises, PAS d'optionnelles
      const minimalEnv = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        GARAGE_ACCESS_KEY: 'test_key',
        GARAGE_SECRET_KEY: 'test_secret',
        GARAGE_BUCKET_DOCUMENTS: 'docs',
        GARAGE_BUCKET_BACKUPS: 'backups',
        GARAGE_BUCKET_TEMP: 'temp',
        GARAGE_REGION: 'eu-west-1',
        CDN_BASE_URL: 'https://cdn.test.com',
        CDN_INVALIDATION_TOKEN: 'token',
        SECURITY_TOKEN_SECRET: 'minimum_length_secret_key_here_32_chars_ok',
        // PAS d'autres variables = valeurs par défaut utilisées
      };

      // Act - Reset complet de l'environnement
      process.env = { ...minimalEnv };
      const config = fileSystemConfig();

      // Assert - Vérification valeurs par défaut
      expect(config.processing.maxFileSize).toBe(100 * 1024 * 1024); // 100MB
      expect(config.processing.imageOptimizationQuality).toBe(85); // Défaut de file-system.config.ts
      expect(config.security.presignedUrlExpiry).toBe(3600); // 1 hour
      expect(config.security.ipRestrictionEnabled).toBe(true); // Défaut = true
      expect(config.security.scanVirusEnabled).toBe(true); // Défaut = true
      expect(config.cdn.defaultTtl).toBe(86400); // 24 hours
    });

    it('should throw error for missing required variables', () => {
      // Arrange - Variables requises manquantes
      const incompleteEnv = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        // GARAGE_ACCESS_KEY manquant - requis !
        GARAGE_SECRET_KEY: 'test_secret',
      };

      // Act & Assert - Reset complet de l'environnement
      process.env = { ...incompleteEnv };
      expect(() => fileSystemConfig()).toThrow(
        /is required and cannot be empty/,
      );
    });

    it('should validate numeric environment variables', () => {
      // Arrange
      const envWithNumbers = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        GARAGE_ACCESS_KEY: 'test_key',
        GARAGE_SECRET_KEY: 'test_secret',
        GARAGE_BUCKET_DOCUMENTS: 'docs',
        GARAGE_BUCKET_BACKUPS: 'backups',
        GARAGE_BUCKET_TEMP: 'temp',
        GARAGE_REGION: 'eu-west-1',
        CDN_BASE_URL: 'https://cdn.test.com',
        CDN_INVALIDATION_TOKEN: 'token',
        SECURITY_TOKEN_SECRET: 'secret_key_with_sufficient_length_32_chars_min',
        MAX_FILE_SIZE: '52428800', // 50MB as string
        IMAGE_OPTIMIZATION_QUALITY: '90',
        PRESIGNED_URL_EXPIRY: '7200', // 2 hours
      };

      // Act - Reset complet de l'environnement
      process.env = { ...envWithNumbers };
      const config = fileSystemConfig();

      // Assert - Conversion string → number
      expect(config.processing.maxFileSize).toBe(52428800);
      expect(config.processing.imageOptimizationQuality).toBe(90);
      expect(config.security.presignedUrlExpiry).toBe(7200);
      expect(typeof config.processing.maxFileSize).toBe('number');
    });

    it('should validate boolean environment variables', () => {
      // Arrange
      const envWithBooleans = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        GARAGE_ACCESS_KEY: 'test_key',
        GARAGE_SECRET_KEY: 'test_secret',
        GARAGE_BUCKET_DOCUMENTS: 'docs',
        GARAGE_BUCKET_BACKUPS: 'backups',
        GARAGE_BUCKET_TEMP: 'temp',
        GARAGE_REGION: 'eu-west-1',
        CDN_BASE_URL: 'https://cdn.test.com',
        CDN_INVALIDATION_TOKEN: 'token',
        SECURITY_TOKEN_SECRET: 'secret_key_with_sufficient_length_32_chars_min',
        IP_RESTRICTION_ENABLED: 'false',
        SCAN_VIRUS_ENABLED: 'true', // EXPLICITEMENT à true
        DEVICE_FINGERPRINTING_ENABLED: 'true',
      };

      // Act - Reset complet de l'environnement
      process.env = { ...envWithBooleans };
      const config = fileSystemConfig();

      // Assert - Conversion string → boolean
      expect(config.security.ipRestrictionEnabled).toBe(false);
      expect(config.security.scanVirusEnabled).toBe(true);
      expect(config.security.deviceFingerprintingEnabled).toBe(true);
      expect(typeof config.security.ipRestrictionEnabled).toBe('boolean');
    });

    it('should validate array environment variables', () => {
      // Arrange
      const envWithArrays = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        GARAGE_ACCESS_KEY: 'test_key',
        GARAGE_SECRET_KEY: 'test_secret',
        GARAGE_BUCKET_DOCUMENTS: 'docs',
        GARAGE_BUCKET_BACKUPS: 'backups',
        GARAGE_BUCKET_TEMP: 'temp',
        GARAGE_REGION: 'eu-west-1',
        CDN_BASE_URL: 'https://cdn.test.com',
        CDN_INVALIDATION_TOKEN: 'token',
        SECURITY_TOKEN_SECRET: 'secret_key_with_sufficient_length_32_chars_min',
        CDN_EDGE_LOCATIONS: 'eu-west-1, us-east-1, ap-southeast-1',
        ALLOWED_MIME_TYPES: 'image/jpeg,application/pdf, text/plain',
      };

      // Act - Reset complet de l'environnement
      process.env = { ...envWithArrays };
      const config = fileSystemConfig();

      // Assert - Conversion string → array avec trim
      expect(config.cdn.edgeLocations).toEqual([
        'eu-west-1',
        'us-east-1',
        'ap-southeast-1',
      ]);
      expect(config.processing.allowedMimeTypes).toEqual([
        'image/jpeg',
        'application/pdf',
        'text/plain',
      ]);
      expect(Array.isArray(config.cdn.edgeLocations)).toBe(true);
    });
  });

  // ============================================================================
  // TESTS STRUCTURE CONFIGURATION
  // ============================================================================

  describe('Configuration Structure', () => {
    it('should have correct configuration structure', () => {
      // Arrange
      const validEnv = createValidEnvironment();

      // Act - Reset complet de l'environnement
      process.env = { ...validEnv };
      const config = fileSystemConfig();

      // Assert - Structure complète
      expect(config).toHaveProperty('garage');
      expect(config).toHaveProperty('cdn');
      expect(config).toHaveProperty('processing');
      expect(config).toHaveProperty('security');

      // Garage config
      expect(config.garage).toHaveProperty('endpoint');
      expect(config.garage).toHaveProperty('accessKey');
      expect(config.garage).toHaveProperty('secretKey');
      expect(config.garage).toHaveProperty('buckets');
      expect(config.garage.buckets).toHaveProperty('documents');
      expect(config.garage.buckets).toHaveProperty('backups');
      expect(config.garage.buckets).toHaveProperty('temp');

      // CDN config
      expect(config.cdn).toHaveProperty('baseUrl');
      expect(config.cdn).toHaveProperty('invalidationToken');
      expect(config.cdn).toHaveProperty('edgeLocations');

      // Processing config
      expect(config.processing).toHaveProperty('maxFileSize');
      expect(config.processing).toHaveProperty('allowedMimeTypes');
      expect(config.processing).toHaveProperty('virusScanTimeout');

      // Security config
      expect(config.security).toHaveProperty('presignedUrlExpiry');
      expect(config.security).toHaveProperty('securityTokenSecret');
    });

    it('should set forcePathStyle to true for Garage compatibility', () => {
      // Arrange
      const validEnv = createValidEnvironment();

      // Act - Reset complet de l'environnement
      process.env = { ...validEnv };
      const config = fileSystemConfig();

      // Assert - Garage S3 nécessite forcePathStyle
      expect(config.garage.forcePathStyle).toBe(true);
    });

    it('should validate security token secret minimum length', () => {
      // Arrange
      const envWithShortSecret = createValidEnvironment();
      envWithShortSecret.SECURITY_TOKEN_SECRET = 'too_short'; // < 32 chars

      // Act & Assert - Reset complet de l'environnement
      process.env = { ...envWithShortSecret };
      expect(() => fileSystemConfig()).toThrow(/at least 32 characters long/);
    });
  });

  // ============================================================================
  // TESTS TYPE GUARDS ET UTILITAIRES
  // ============================================================================

  describe('Type Guards and Utilities', () => {
    it('should validate valid file system configuration', () => {
      // Arrange
      const validConfig = {
        garage: {
          endpoint: 'https://s3.test.com',
          accessKey: 'test',
          secretKey: 'test',
          buckets: { documents: 'docs', backups: 'backups', temp: 'temp' },
          region: 'eu-west-1',
          forcePathStyle: true,
        },
        cdn: {
          baseUrl: 'https://cdn.test.com',
          cacheControl: 'public, max-age=3600',
          invalidationToken: 'token',
          edgeLocations: ['eu-west-1'],
          defaultTtl: 3600,
          maxTtl: 86400,
        },
        processing: {
          maxFileSize: 100 * 1024 * 1024,
          allowedMimeTypes: ['image/jpeg'],
          virusScanTimeout: 30000,
          imageOptimizationQuality: 85,
          thumbnailSize: 200,
          pdfCompressionLevel: 6,
          maxWorkers: 4,
          chunkSize: 64 * 1024,
        },
        security: {
          presignedUrlExpiry: 3600,
          maxPresignedUrls: 10,
          ipRestrictionEnabled: true,
          scanVirusEnabled: true,
          rateLimitUploadsPerMinute: 10,
          abuseBlockDuration: 300,
          deviceFingerprintingEnabled: true,
          securityTokenSecret:
            'valid_secret_key_with_sufficient_length_32_chars',
        },
      };

      // Act
      const isValid = isValidFileSystemConfig(validConfig);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject invalid file system configuration', () => {
      // Arrange
      const invalidConfigs = [
        null,
        undefined,
        {},
        { garage: null },
        { garage: {}, cdn: null },
        { garage: {}, cdn: {}, processing: null },
        'not an object',
      ];

      // Act & Assert
      invalidConfigs.forEach((config) => {
        expect(isValidFileSystemConfig(config)).toBe(false);
      });
    });

    it('should provide environment-specific configuration', () => {
      // Arrange & Act - Ces fonctions n'utilisent pas process.env
      const devConfig = getEnvironmentConfig('development');
      const stagingConfig = getEnvironmentConfig('staging');
      const prodConfig = getEnvironmentConfig('production');

      // Assert - Development config
      expect(devConfig.processing?.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
      expect(devConfig.processing?.maxWorkers).toBe(2);
      expect(devConfig.security?.scanVirusEnabled).toBe(false);
      expect(devConfig.security?.deviceFingerprintingEnabled).toBe(false);

      // Assert - Staging config
      expect(stagingConfig.processing?.maxFileSize).toBe(50 * 1024 * 1024); // 50MB
      expect(stagingConfig.security?.rateLimitUploadsPerMinute).toBe(20);

      // Assert - Production config (default)
      expect(prodConfig).toEqual(getEnvironmentConfig('unknown'));
    });
  });

  // ============================================================================
  // TESTS INTÉGRATION NESTJS
  // ============================================================================

  describe('NestJS Integration', () => {
    it('should be injectable as ConfigService', () => {
      // Arrange & Act
      const config = configService.get<FileSystemConfig>(FILE_SYSTEM_CONFIG);

      // Assert
      expect(config).toBeDefined();
      expect(configService).toBeDefined();
    });

    it('should provide typed access to configuration sections', () => {
      // Arrange & Act
      const garageConfig = configService.get<GarageConfig>(
        `${FILE_SYSTEM_CONFIG}.garage`,
      );
      const cdnConfig = configService.get<CDNConfig>(
        `${FILE_SYSTEM_CONFIG}.cdn`,
      );
      const processingConfig = configService.get<ProcessingConfig>(
        `${FILE_SYSTEM_CONFIG}.processing`,
      );
      const securityConfig = configService.get<SecurityConfig>(
        `${FILE_SYSTEM_CONFIG}.security`,
      );

      // Assert
      expect(garageConfig).toBeDefined();
      expect(cdnConfig).toBeDefined();
      expect(processingConfig).toBeDefined();
      expect(securityConfig).toBeDefined();

      if (garageConfig) {
        expect(garageConfig.forcePathStyle).toBe(true);
      }
    });

    it('should handle missing configuration gracefully', () => {
      // Arrange & Act
      const missingConfig = configService.get('nonexistent.config');

      // Assert
      expect(missingConfig).toBeUndefined();
    });
  });

  // ============================================================================
  // TESTS EDGE CASES ET VALIDATION
  // ============================================================================

  describe('Edge Cases and Validation', () => {
    it('should handle empty string environment variables', () => {
      // Arrange
      const envWithEmptyStrings = {
        GARAGE_ENDPOINT: '',
        GARAGE_ACCESS_KEY: '',
        GARAGE_SECRET_KEY: '',
      };

      // Act & Assert - Reset complet de l'environnement
      process.env = { ...envWithEmptyStrings };
      expect(() => fileSystemConfig()).toThrow(
        /is required and cannot be empty/,
      );
    });

    it('should handle malformed numeric values', () => {
      // Arrange
      const envWithBadNumbers = createValidEnvironment();
      envWithBadNumbers.MAX_FILE_SIZE = 'not_a_number';

      // Act & Assert - Reset complet de l'environnement
      process.env = { ...envWithBadNumbers };
      expect(() => fileSystemConfig()).toThrow();
    });

    it('should handle malformed boolean values', () => {
      // Arrange
      const envWithBadBooleans = createValidEnvironment();
      envWithBadBooleans.IP_RESTRICTION_ENABLED = 'maybe'; // Ni 'true' ni 'false'

      // Act - Reset complet de l'environnement
      process.env = { ...envWithBadBooleans };
      const config = fileSystemConfig();

      // Assert - Boolean malformé devient false
      expect(config.security.ipRestrictionEnabled).toBe(false);
    });

    it('should validate URL format for endpoints', () => {
      // Arrange
      const envWithBadUrl = createValidEnvironment();
      envWithBadUrl.GARAGE_ENDPOINT = 'not-a-valid-url';

      // Act & Assert - Reset complet de l'environnement
      process.env = { ...envWithBadUrl };
      // Note: URL validation pourrait être ajoutée avec @IsUrl() decorator
      expect(() => fileSystemConfig()).not.toThrow(); // Actuellement pas de validation URL
    });

    it('should handle very large configuration values', () => {
      // Arrange
      const envWithLargeValues = createValidEnvironment();
      envWithLargeValues.MAX_FILE_SIZE = String(Number.MAX_SAFE_INTEGER);

      // Act - Reset complet de l'environnement
      process.env = { ...envWithLargeValues };
      const config = fileSystemConfig();

      // Assert
      expect(config.processing.maxFileSize).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isSafeInteger(config.processing.maxFileSize)).toBe(true);
    });
  });

  // ============================================================================
  // HELPERS DE TEST
  // ============================================================================

  /**
   * Crée un environnement valide pour les tests
   */
  function createValidEnvironment(): Record<string, string> {
    return {
      GARAGE_ENDPOINT: 'https://s3.test.coders.com',
      GARAGE_ACCESS_KEY: 'GK_TEST_ACCESS_KEY_123',
      GARAGE_SECRET_KEY: 'test_secret_key_with_sufficient_length_123',
      GARAGE_BUCKET_DOCUMENTS: 'test-coders-documents',
      GARAGE_BUCKET_BACKUPS: 'test-coders-backups',
      GARAGE_BUCKET_TEMP: 'test-coders-temp',
      GARAGE_REGION: 'eu-west-1',
      CDN_BASE_URL: 'https://cdn.test.coders.com',
      CDN_INVALIDATION_TOKEN: 'test_cdn_invalidation_token_123',
      SECURITY_TOKEN_SECRET:
        'test_security_token_secret_with_minimum_32_characters_length',
    };
  }
});
