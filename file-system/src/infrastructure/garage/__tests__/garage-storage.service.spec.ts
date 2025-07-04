// src/infrastructure/garage/__tests__/garage-storage.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import { GarageStorageService } from '../garage-storage.service';

// ✅ IMPORTANT: Mocks AVANT les imports des classes AWS
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
  CreateMultipartUploadCommand: jest.fn(),
  UploadPartCommand: jest.fn(),
  CompleteMultipartUploadCommand: jest.fn(),
  AbortMultipartUploadCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn(),
}));

// Import des classes mockées APRÈS les mocks
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';

/**
 * Tests unitaires pour GarageStorageService
 * Configuration corrigée des mocks AWS SDK
 */
describe('GarageStorageService', () => {
  let service: GarageStorageService;
  let configService: jest.Mocked<ConfigService>;
  let mockS3Client: any;
  let logger: jest.Mocked<Logger>;

  // Configuration de test standard
  const mockConfig: any = {
    garage: {
      endpoint: 'https://test-garage.example.com',
      region: 'eu-west-1',
      accessKey: 'TEST_ACCESS_KEY',
      secretKey: 'TEST_SECRET_KEY',
      buckets: {
        documents: 'test-documents',
        backups: 'test-backups',
        temp: 'test-temp',
      },
      forcePathStyle: true,
    },
    cdn: {
      baseUrl: 'https://test-cdn.example.com',
      cacheControl: 'public, max-age=3600',
      invalidationToken: 'test-token',
      edgeLocations: ['eu-west-1'],
      defaultTtl: 3600,
      maxTtl: 86400,
    },
    processing: {
      maxFileSize: 500 * 1024 * 1024, // 500MB pour permettre tous les tests
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      virusScanTimeout: 30000,
      imageOptimizationQuality: 85,
      thumbnailSize: 200,
      pdfCompressionLevel: 6,
      maxWorkers: 4,
      chunkSize: 1024 * 1024,
    },
    security: {
      presignedUrlExpiry: 3600,
      maxPresignedUrls: 100,
      ipRestrictionEnabled: true,
      scanVirusEnabled: true,
      rateLimitUploadsPerMinute: 20,
      abuseBlockDuration: 60,
      deviceFingerprintingEnabled: false,
      securityTokenSecret: 'test-secret-token',
    },
  };

  beforeEach(async () => {
    // Reset tous les mocks
    jest.clearAllMocks();

    // ✅ Configuration des mocks AWS SDK DANS beforeEach
    mockS3Client = {
      send: jest.fn(),
      config: {
        endpoint: mockConfig.garage.endpoint,
        region: mockConfig.garage.region,
      },
      destroy: jest.fn(),
    };

    // Configuration du constructor S3Client
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client,
    );

    // Configuration des commandes pour retourner l'input
    (
      PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>
    ).mockImplementation((input) => ({ input }) as any);
    (
      GetObjectCommand as jest.MockedClass<typeof GetObjectCommand>
    ).mockImplementation((input) => ({ input }) as any);
    (
      DeleteObjectCommand as jest.MockedClass<typeof DeleteObjectCommand>
    ).mockImplementation((input) => ({ input }) as any);
    (
      HeadObjectCommand as jest.MockedClass<typeof HeadObjectCommand>
    ).mockImplementation((input) => ({ input }) as any);
    (
      ListObjectsV2Command as jest.MockedClass<typeof ListObjectsV2Command>
    ).mockImplementation((input) => ({ input }) as any);
    (
      CreateMultipartUploadCommand as jest.MockedClass<
        typeof CreateMultipartUploadCommand
      >
    ).mockImplementation((input) => ({ input }) as any);
    (
      UploadPartCommand as jest.MockedClass<typeof UploadPartCommand>
    ).mockImplementation((input) => ({ input }) as any);
    (
      CompleteMultipartUploadCommand as jest.MockedClass<
        typeof CompleteMultipartUploadCommand
      >
    ).mockImplementation((input) => ({ input }) as any);
    (
      AbortMultipartUploadCommand as jest.MockedClass<
        typeof AbortMultipartUploadCommand
      >
    ).mockImplementation((input) => ({ input }) as any);
    (
      CopyObjectCommand as jest.MockedClass<typeof CopyObjectCommand>
    ).mockImplementation((input) => ({ input }) as any);

    // Configuration des utilitaires
    (
      getSignedUrl as jest.MockedFunction<typeof getSignedUrl>
    ).mockResolvedValue(
      'https://test-garage.example.com/test-bucket/mock-object?X-Amz-Algorithm=AWS4-HMAC-SHA256',
    );

    (Upload as jest.MockedClass<typeof Upload>).mockImplementation(
      () =>
        ({
          done: jest.fn().mockResolvedValue({
            ETag: '"mock-multipart-etag"',
            Location: 'https://test-garage.example.com/test-documents/mock-key',
            Key: 'mock-key',
          }),
        }) as any,
    );

    // ✅ CORRIGÉ : Créer le mock logger avant le module
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Configuration du module de test avec Logger mocké
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarageStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockConfig),
          },
        },
        {
          provide: Logger,
          useValue: logger, // ✅ Utiliser directement notre mock
        },
      ],
    }).compile();

    service = module.get<GarageStorageService>(GarageStorageService);
    configService = module.get(ConfigService);
    // logger est déjà défini plus haut

    // ✅ IMPORTANT: Remplacer le logger du service par notre mock pour être sûr
    (service as any).logger = logger;
  });

  /**
   * Tests d'initialisation du service
   */
  describe('Service Initialization', () => {
    it('should initialize S3 client with correct configuration', () => {
      // Assert - Vérification de l'initialisation du client S3
      expect(S3Client).toHaveBeenCalledWith({
        endpoint: mockConfig.garage.endpoint,
        region: mockConfig.garage.region,
        credentials: {
          accessKeyId: mockConfig.garage.accessKey,
          secretAccessKey: mockConfig.garage.secretKey,
        },
        forcePathStyle: mockConfig.garage.forcePathStyle,
        maxAttempts: 3,
      });

      // ✅ SOLUTION FINALE : Vérifier que le service est correctement initialisé
      expect(service).toBeDefined();
      expect(service.checkConnection).toBeDefined();
      expect(service.uploadObject).toBeDefined();
      expect(service.downloadObject).toBeDefined();
      expect(service.generatePresignedUrl).toBeDefined();

      // Vérifier que la configuration est accessible
      expect((service as any).defaultBucket).toBe(
        mockConfig.garage.buckets.documents,
      );
      expect((service as any).s3Client).toBeDefined();

      // Note: Le logger est testé dans tous les autres tests quand il est mocké correctement
    });

    it('should throw error if file system configuration not found', async () => {
      const badConfigService = {
        get: jest.fn().mockReturnValue(null),
      };

      expect(() => {
        new GarageStorageService(badConfigService as any);
      }).toThrow('File system configuration not found');
    });
  });

  /**
   * Tests des opérations d'upload
   */
  describe('Upload Operations', () => {
    it('should upload small files successfully', async () => {
      // Arrange
      const testBuffer = Buffer.from('Test file content');
      const key = 'test-files/small-file.txt';
      const metadata: any = {
        contentType: 'text/plain',
        userId: 'user-123',
        projectId: 'project-456',
        customMetadata: { testId: 'unit-test' },
      };

      const mockS3Response = {
        ETag: '"abc123def456"',
        Location:
          'https://test-garage.example.com/test-documents/test-files/small-file.txt',
      };

      mockS3Client.send.mockResolvedValue(mockS3Response);

      // Act
      const result = await service.uploadObject(key, testBuffer, metadata);

      // Assert
      expect(result).toBeDefined();
      expect(result.uploadId).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.storageKey).toBe(key);
      expect(result.etag).toBe('abc123def456');
      expect(result.location).toBe(mockS3Response.Location);
      expect(result.metadata.userId).toBe(metadata.userId);
      expect(result.metadata.contentType).toBe(metadata.contentType);
      expect(result.metadata.size).toBe(testBuffer.length);

      // ✅ CORRIGÉ : Vérification de l'appel avec la bonne structure
      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          Key: key,
          Body: testBuffer,
          ContentType: metadata.contentType,
          ContentLength: testBuffer.length,
          Metadata: expect.objectContaining({
            'user-id': metadata.userId,
            'project-id': metadata.projectId,
          }),
        }),
      });

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Object uploaded successfully'),
      );
    });

    it('should handle multipart upload for large files', async () => {
      // Arrange
      const largeBuffer = Buffer.alloc(150 * 1024 * 1024, 'x'); // 150MB
      const key = 'test-files/large-file.bin';
      const metadata: any = {
        contentType: 'application/octet-stream',
        userId: 'user-123',
      };

      const mockUploadResult = {
        ETag: '"large-file-etag"',
        Location:
          'https://test-garage.example.com/test-documents/test-files/large-file.bin',
        Key: key,
      };

      const mockUpload = {
        done: jest.fn().mockResolvedValue(mockUploadResult),
      };
      (Upload as jest.MockedClass<typeof Upload>).mockImplementation(
        () => mockUpload as any,
      );

      // Act
      const result = await service.uploadObject(key, largeBuffer, metadata);

      // Assert
      expect(Upload).toHaveBeenCalledWith({
        client: mockS3Client,
        params: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          Key: key,
          Body: largeBuffer,
          ContentType: metadata.contentType,
        }),
        partSize: 50 * 1024 * 1024,
        queueSize: 4,
      });

      expect(mockUpload.done).toHaveBeenCalled();
      expect(result.storageKey).toBe(key);
      expect(result.metadata.size).toBe(largeBuffer.length);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Large object uploaded successfully'),
      );
    });

    it('should validate file size and type restrictions', async () => {
      // Test 1 : Fichier trop volumineux (600MB > 500MB limit)
      const oversizedBuffer = Buffer.alloc(600 * 1024 * 1024, 'x');
      const metadata: any = {
        contentType: 'text/plain',
        userId: 'user-123',
      };

      await expect(
        service.uploadObject('test/oversized.txt', oversizedBuffer, metadata),
      ).rejects.toThrow('File too large');

      // Test 2 : Clé invalide
      const validBuffer = Buffer.from('test content');

      await expect(
        service.uploadObject('', validBuffer, metadata),
      ).rejects.toThrow('Invalid key: must be a non-empty string');

      // Test 3 : Buffer invalide
      await expect(
        service.uploadObject('test/empty.txt', Buffer.alloc(0), metadata),
      ).rejects.toThrow('Invalid buffer: must be a non-empty Buffer');

      // Test 4 : Métadonnées manquantes
      const incompleteMetadata = {
        contentType: 'text/plain',
      } as any;

      await expect(
        service.uploadObject(
          'test/incomplete.txt',
          validBuffer,
          incompleteMetadata,
        ),
      ).rejects.toThrow(
        'Invalid metadata: contentType and userId are required',
      );
    });
  });

  /**
   * Tests des opérations de téléchargement
   */
  describe('Download Operations', () => {
    it('should download objects successfully', async () => {
      // Arrange
      const key = 'test-files/download-test.txt';
      const expectedContent = Buffer.from('Downloaded content');

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setImmediate(() => callback(expectedContent));
          } else if (event === 'end') {
            setImmediate(() => callback());
          }
          return mockStream;
        }),
        pipe: jest.fn(),
      };

      const mockS3Response = {
        Body: mockStream,
        ContentType: 'text/plain',
        ContentLength: expectedContent.length,
        LastModified: new Date('2023-01-01'),
        ETag: '"download-etag"',
      };

      mockS3Client.send.mockResolvedValue(mockS3Response);

      // Act
      const result = await service.downloadObject(key);

      // Assert
      expect(result).toBeDefined();
      expect(result.body).toEqual(expectedContent);
      expect(result.metadata.contentType).toBe('text/plain');
      expect(result.metadata.contentLength).toBe(expectedContent.length);
      expect(result.metadata.etag).toBe('download-etag');
      expect(result.fromCache).toBe(false);

      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          Key: key,
        }),
      });
    });

    it('should retrieve object information correctly', async () => {
      // Arrange
      const key = 'test-files/info-test.pdf';
      const mockHeadResponse = {
        ContentLength: 1024 * 1024,
        ContentType: 'application/pdf',
        ETag: '"info-etag"',
        LastModified: new Date('2023-01-01'),
        Metadata: {
          'user-id': 'user-123',
          'project-id': 'project-456',
        },
      };

      mockS3Client.send.mockResolvedValue(mockHeadResponse);

      // Act
      const result = await service.getObjectInfo(key);

      // Assert
      expect(result).toBeDefined();
      expect(result.key).toBe(key);
      expect(result.size).toBe(1024 * 1024);
      expect(result.contentType).toBe('application/pdf');
      expect(result.etag).toBe('info-etag');
      expect(result.lastModified).toEqual(new Date('2023-01-01'));
      expect(result.customMetadata).toEqual({
        'user-id': 'user-123',
        'project-id': 'project-456',
      });

      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          Key: key,
        }),
      });
    });
  });

  /**
   * Tests de génération d'URLs pré-signées
   */
  describe('Presigned URL Generation', () => {
    it('should generate valid presigned URLs', async () => {
      // Arrange
      const options: any = {
        key: 'test-files/presigned-test.pdf',
        operation: 'GET',
        expiresIn: 3600,
        ipRestriction: ['192.168.1.100'],
        userAgent: 'TestAgent/1.0',
      };

      const mockPresignedUrl =
        'https://test-garage.example.com/test-documents/test-files/presigned-test.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256';

      (
        getSignedUrl as jest.MockedFunction<typeof getSignedUrl>
      ).mockResolvedValue(mockPresignedUrl);

      // Act
      const result = await service.generatePresignedUrl(options);

      // Assert
      expect(result).toBeDefined();
      expect(result.url).toBe(mockPresignedUrl);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.restrictions.ipAddress).toEqual(['192.168.1.100']);
      expect(result.restrictions.userAgent).toBe('TestAgent/1.0');
      expect(result.restrictions.operations).toEqual(['GET']);

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        { input: expect.objectContaining({ Key: options.key }) },
        expect.objectContaining({ expiresIn: 3600 }),
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Presigned URL generated'),
      );
    });

    it('should throw error for missing key in options', async () => {
      const invalidOptions = {
        operation: 'GET',
        expiresIn: 3600,
      } as any;

      await expect(
        service.generatePresignedUrl(invalidOptions),
      ).rejects.toThrow('Key is required in PresignedUrlOptions');
    });
  });

  /**
   * Tests de gestion d'erreurs et résilience
   */
  describe('Error Handling and Resilience', () => {
    it('should handle connection failures gracefully', async () => {
      // Arrange
      const networkError = new Error('Network timeout');
      networkError.name = 'NetworkingError';
      mockS3Client.send.mockRejectedValue(networkError);

      const testBuffer = Buffer.from('Test content');
      const metadata: any = {
        contentType: 'text/plain',
        userId: 'user-123',
      };

      // Act & Assert
      await expect(
        service.uploadObject('test/connection-fail.txt', testBuffer, metadata),
      ).rejects.toThrow('Failed to upload object: Network timeout');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Upload failed'),
        networkError,
      );
    });

    it('should retry failed operations with exponential backoff', async () => {
      // Arrange
      let attemptCount = 0;
      mockS3Client.send.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ ETag: '"retry-success"' });
      });

      const testBuffer = Buffer.from('Retry test');
      const metadata: any = {
        contentType: 'text/plain',
        userId: 'user-123',
      };

      // Act
      const result = await service.uploadObject(
        'test/retry-test.txt',
        testBuffer,
        metadata,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.etag).toBe('retry-success');
      expect(attemptCount).toBe(3);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Operation failed (attempt'),
      );
    });

    it('should validate connection health correctly', async () => {
      // Test 1 : Connexion réussie
      mockS3Client.send.mockResolvedValue({ KeyCount: 0 });

      const healthyResult = await service.checkConnection();
      expect(healthyResult).toBe(true);
      expect(logger.log).toHaveBeenCalledWith(
        'Garage S3 connection check successful',
      );

      // Reset pour le second test
      jest.clearAllMocks();

      // Test 2 : Connexion échouée
      mockS3Client.send.mockRejectedValue(new Error('Connection failed'));

      const unhealthyResult = await service.checkConnection();
      expect(unhealthyResult).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Garage S3 connection check failed',
        expect.any(Error),
      );
    });
  });

  /**
   * Tests des opérations multipart avancées
   */
  describe('Multipart Upload Operations', () => {
    it('should initialize multipart upload correctly', async () => {
      // Arrange
      const key = 'test-files/multipart-test.bin';
      const metadata: any = {
        contentType: 'application/octet-stream',
        userId: 'user-123',
        projectId: 'project-456',
      };

      const mockMultipartResponse = {
        UploadId: 'test-upload-id-123',
        Bucket: mockConfig.garage.buckets.documents,
        Key: key,
      };

      mockS3Client.send.mockResolvedValue(mockMultipartResponse);

      // Act
      const result = await service.initializeMultipartUpload(key, metadata);

      // Assert
      expect(result).toBeDefined();
      expect(result.uploadId).toBe('test-upload-id-123');
      expect(result.key).toBe(key);
      expect(result.bucket).toBe(mockConfig.garage.buckets.documents);

      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          Key: key,
          ContentType: metadata.contentType,
          Metadata: expect.objectContaining({
            'user-id': metadata.userId,
            'project-id': metadata.projectId,
          }),
        }),
      });
    });

    it('should upload multipart parts successfully', async () => {
      // Arrange
      const uploadId = 'test-upload-id-123';
      const partNumber = 1;
      const partBuffer = Buffer.alloc(5 * 1024 * 1024, 'part');

      const mockPartResponse = {
        ETag: '"part-1-etag"',
      };

      mockS3Client.send.mockResolvedValue(mockPartResponse);

      // Act
      const result = await service.uploadPart(uploadId, partNumber, partBuffer);

      // Assert
      expect(result).toBeDefined();
      expect(result.partNumber).toBe(partNumber);
      expect(result.etag).toBe('part-1-etag');
      expect(result.size).toBe(partBuffer.length);

      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: partBuffer,
        }),
      });
    });

    it('should complete multipart upload successfully', async () => {
      // Arrange
      const uploadId = 'test-upload-id-123';
      const parts: any[] = [
        { partNumber: 1, etag: 'part-1-etag', size: 5 * 1024 * 1024 },
        { partNumber: 2, etag: 'part-2-etag', size: 3 * 1024 * 1024 },
      ];

      const mockCompleteResponse = {
        ETag: '"complete-etag"',
        Location:
          'https://test-garage.example.com/test-documents/test-upload-id-123',
        Key: uploadId,
      };

      mockS3Client.send.mockResolvedValue(mockCompleteResponse);

      // Act
      const result = await service.completeMultipartUpload(uploadId, parts);

      // Assert
      expect(result).toBeDefined();
      expect(result.etag).toBe('complete-etag');
      expect(result.location).toBe(mockCompleteResponse.Location);
      expect(result.metadata.size).toBe(8 * 1024 * 1024);

      expect(mockS3Client.send).toHaveBeenCalledWith({
        input: expect.objectContaining({
          Bucket: mockConfig.garage.buckets.documents,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [
              { ETag: 'part-1-etag', PartNumber: 1 },
              { ETag: 'part-2-etag', PartNumber: 2 },
            ],
          },
        }),
      });
    });
  });
});
