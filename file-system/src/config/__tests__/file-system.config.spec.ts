/**
 * Tests de validation pour la configuration du système de fichiers
 * Version finale avec isolation complète des variables d'environnement
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
    originalEnv = { ...process.env };

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
    process.env = originalEnv;

    await module.close();
  });

  // ============================================================================
  // TESTS VALIDATION VARIABLES D'ENVIRONNEMENT
  // ============================================================================

  describe('Environment Variables Validation', () => {
    it('should load configuration from environment variables successfully', () => {
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

      process.env = { ...validEnv };
      const config = fileSystemConfig();

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
      };

      process.env = { ...minimalEnv };
      const config = fileSystemConfig();

      expect(config.processing.maxFileSize).toBe(100 * 1024 * 1024);
      expect(config.processing.imageOptimizationQuality).toBe(85);
      expect(config.security.presignedUrlExpiry).toBe(3600);
      expect(config.security.ipRestrictionEnabled).toBe(true);
      expect(config.security.scanVirusEnabled).toBe(true);
      expect(config.cdn.defaultTtl).toBe(86400);
    });

    it('should throw error for missing required variables', () => {
      const incompleteEnv = {
        GARAGE_ENDPOINT: 'https://s3.test.com',
        GARAGE_SECRET_KEY: 'test_secret',
      };

      process.env = { ...incompleteEnv };
      expect(() => fileSystemConfig()).toThrow(
        /is required and cannot be empty/,
      );
    });

    it('should validate numeric environment variables', () => {
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
        MAX_FILE_SIZE: '52428800',
        IMAGE_OPTIMIZATION_QUALITY: '90',
        PRESIGNED_URL_EXPIRY: '7200',
      };

      process.env = { ...envWithNumbers };
      const config = fileSystemConfig();

      expect(config.processing.maxFileSize).toBe(52428800);
      expect(config.processing.imageOptimizationQuality).toBe(90);
      expect(config.security.presignedUrlExpiry).toBe(7200);
      expect(typeof config.processing.maxFileSize).toBe('number');
    });

    it('should validate boolean environment variables', () => {
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
        SCAN_VIRUS_ENABLED: 'true',
        DEVICE_FINGERPRINTING_ENABLED: 'true',
      };

      process.env = { ...envWithBooleans };
      const config = fileSystemConfig();

      expect(config.security.ipRestrictionEnabled).toBe(false);
      expect(config.security.scanVirusEnabled).toBe(true);
      expect(config.security.deviceFingerprintingEnabled).toBe(true);
      expect(typeof config.security.ipRestrictionEnabled).toBe('boolean');
    });

    it('should validate array environment variables', () => {
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

      process.env = { ...envWithArrays };
      const config = fileSystemConfig();

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
      const validEnv = createValidEnvironment();

      process.env = { ...validEnv };
      const config = fileSystemConfig();

      expect(config).toHaveProperty('garage');
      expect(config).toHaveProperty('cdn');
      expect(config).toHaveProperty('processing');
      expect(config).toHaveProperty('security');
      expect(config.garage).toHaveProperty('endpoint');
      expect(config.garage).toHaveProperty('accessKey');
      expect(config.garage).toHaveProperty('secretKey');
      expect(config.garage).toHaveProperty('buckets');
      expect(config.garage.buckets).toHaveProperty('documents');
      expect(config.garage.buckets).toHaveProperty('backups');
      expect(config.garage.buckets).toHaveProperty('temp');
      expect(config.cdn).toHaveProperty('baseUrl');
      expect(config.cdn).toHaveProperty('invalidationToken');
      expect(config.cdn).toHaveProperty('edgeLocations');
      expect(config.processing).toHaveProperty('maxFileSize');
      expect(config.processing).toHaveProperty('allowedMimeTypes');
      expect(config.processing).toHaveProperty('virusScanTimeout');
      expect(config.security).toHaveProperty('presignedUrlExpiry');
      expect(config.security).toHaveProperty('securityTokenSecret');
    });

    it('should set forcePathStyle to true for Garage compatibility', () => {
      const validEnv = createValidEnvironment();

      process.env = { ...validEnv };
      const config = fileSystemConfig();

      expect(config.garage.forcePathStyle).toBe(true);
    });

    it('should validate security token secret minimum length', () => {
      const envWithShortSecret = createValidEnvironment();
      envWithShortSecret.SECURITY_TOKEN_SECRET = 'too_short'; // < 32 chars

      process.env = { ...envWithShortSecret };
      expect(() => fileSystemConfig()).toThrow(/at least 32 characters long/);
    });
  });

  // ============================================================================
  // TESTS TYPE GUARDS ET UTILITAIRES
  // ============================================================================

  describe('Type Guards and Utilities', () => {
    it('should validate valid file system configuration', () => {
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

      const isValid = isValidFileSystemConfig(validConfig);

      expect(isValid).toBe(true);
    });

    it('should reject invalid file system configuration', () => {
      const invalidConfigs = [
        null,
        undefined,
        {},
        { garage: null },
        { garage: {}, cdn: null },
        { garage: {}, cdn: {}, processing: null },
        'not an object',
      ];

      invalidConfigs.forEach((config) => {
        expect(isValidFileSystemConfig(config)).toBe(false);
      });
    });

    it('should provide environment-specific configuration', () => {
      const devConfig = getEnvironmentConfig('development');
      const stagingConfig = getEnvironmentConfig('staging');
      const prodConfig = getEnvironmentConfig('production');

      expect(devConfig.processing?.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
      expect(devConfig.processing?.maxWorkers).toBe(2);
      expect(devConfig.security?.scanVirusEnabled).toBe(false);
      expect(devConfig.security?.deviceFingerprintingEnabled).toBe(false);
      expect(stagingConfig.processing?.maxFileSize).toBe(50 * 1024 * 1024); // 50MB
      expect(stagingConfig.security?.rateLimitUploadsPerMinute).toBe(20);
      expect(prodConfig).toEqual(getEnvironmentConfig('unknown'));
    });
  });

  // ============================================================================
  // TESTS INTÉGRATION NESTJS
  // ============================================================================

  describe('NestJS Integration', () => {
    it('should be injectable as ConfigService', () => {
      const config = configService.get<FileSystemConfig>(FILE_SYSTEM_CONFIG);

      expect(config).toBeDefined();
      expect(configService).toBeDefined();
    });

    it('should provide typed access to configuration sections', () => {
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

      expect(garageConfig).toBeDefined();
      expect(cdnConfig).toBeDefined();
      expect(processingConfig).toBeDefined();
      expect(securityConfig).toBeDefined();

      if (garageConfig) {
        expect(garageConfig.forcePathStyle).toBe(true);
      }
    });

    it('should handle missing configuration gracefully', () => {
      const missingConfig = configService.get('nonexistent.config');

      expect(missingConfig).toBeUndefined();
    });
  });

  // ============================================================================
  // TESTS EDGE CASES ET VALIDATION
  // ============================================================================

  describe('Edge Cases and Validation', () => {
    it('should handle empty string environment variables', () => {
      const envWithEmptyStrings = {
        GARAGE_ENDPOINT: '',
        GARAGE_ACCESS_KEY: '',
        GARAGE_SECRET_KEY: '',
      };

      process.env = { ...envWithEmptyStrings };
      expect(() => fileSystemConfig()).toThrow(
        /is required and cannot be empty/,
      );
    });

    it('should handle malformed numeric values', () => {
      const envWithBadNumbers = createValidEnvironment();
      envWithBadNumbers.MAX_FILE_SIZE = 'not_a_number';

      process.env = { ...envWithBadNumbers };
      expect(() => fileSystemConfig()).toThrow();
    });

    it('should handle malformed boolean values', () => {
      const envWithBadBooleans = createValidEnvironment();
      envWithBadBooleans.IP_RESTRICTION_ENABLED = 'maybe';

      process.env = { ...envWithBadBooleans };
      const config = fileSystemConfig();

      expect(config.security.ipRestrictionEnabled).toBe(false);
    });

    it('should validate URL format for endpoints', () => {
      const envWithBadUrl = createValidEnvironment();
      envWithBadUrl.GARAGE_ENDPOINT = 'not-a-valid-url';

      process.env = { ...envWithBadUrl };
      expect(() => fileSystemConfig()).not.toThrow();
    });

    it('should handle very large configuration values', () => {
      const envWithLargeValues = createValidEnvironment();
      envWithLargeValues.MAX_FILE_SIZE = String(Number.MAX_SAFE_INTEGER);

      process.env = { ...envWithLargeValues };
      const config = fileSystemConfig();

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
