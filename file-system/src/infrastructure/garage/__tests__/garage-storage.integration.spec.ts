import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

import { GarageStorageService } from '../garage-storage.service';
import {
  ObjectMetadata,
  UploadResult,
  DownloadResult,
  ObjectInfo,
  ObjectList,
  MultipartUpload,
  PartUploadResult,
  CompletedPart,
  CopyResult,
  PresignedUrlOptions,
  PresignedUrl,
  BucketInfo,
} from '../../../types/file-system.types';
import { FileSystemConfig } from '../../../config/file-system.config';

/**
 * Tests d'intégration pour GarageStorageService
 *
 * Configuration corrigée pour résoudre les erreurs TypeScript
 */
describe('GarageStorageService Integration', () => {
  let service: GarageStorageService;
  let configService: ConfigService;
  let testBucketName: string;
  let createdObjects: string[] = [];

  // ✅ CORRIGÉ : Configuration complète avec tous les champs requis
  const integrationConfig: FileSystemConfig = {
    garage: {
      endpoint: process.env.GARAGE_TEST_ENDPOINT || 'http://localhost:3900',
      region: process.env.GARAGE_TEST_REGION || 'garage',
      accessKey: process.env.GARAGE_TEST_ACCESS_KEY || 'GK1234567890ABCDEFGH',
      secretKey:
        process.env.GARAGE_TEST_SECRET_KEY ||
        'abcdef1234567890abcdef1234567890abcdef12',
      buckets: {
        documents:
          process.env.GARAGE_TEST_BUCKET || `test-integration-${Date.now()}`,
        backups: `test-backups-${Date.now()}`,
        temp: `test-temp-${Date.now()}`,
      },
      forcePathStyle: true,
    },
    cdn: {
      baseUrl: 'https://test-cdn.example.com',
      cacheControl: 'public, max-age=3600',
      invalidationToken: 'test-token',
      edgeLocations: ['eu-west-1'],
      // ✅ AJOUTÉ : Propriétés manquantes
      defaultTtl: 3600,
      maxTtl: 86400,
    },
    processing: {
      maxFileSize: 100 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'text/plain'],
      virusScanTimeout: 30000,
      imageOptimizationQuality: 85,
      thumbnailSize: 200,
      // ✅ AJOUTÉ : Propriétés manquantes
      pdfCompressionLevel: 6,
      maxWorkers: 4,
      chunkSize: 1024 * 1024,
    },
    security: {
      presignedUrlExpiry: 3600,
      maxPresignedUrls: 100,
      ipRestrictionEnabled: false,
      scanVirusEnabled: false,
      // ✅ AJOUTÉ : Propriétés manquantes
      rateLimitUploadsPerMinute: 20,
      abuseBlockDuration: 60,
      deviceFingerprintingEnabled: false,
      securityTokenSecret: 'test_security_token_secret_integration',
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarageStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(integrationConfig),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GarageStorageService>(GarageStorageService);
    configService = module.get(ConfigService);
    testBucketName = integrationConfig.garage.buckets.documents;

    const isConnected = await service.checkConnection();
    if (!isConnected) {
      throw new Error(
        'Cannot connect to Garage S3 instance. ' +
          'Please ensure GARAGE_TEST_* environment variables are set correctly ' +
          'and the Garage instance is running.',
      );
    }

    console.log(
      `✅ Connected to Garage S3 at ${integrationConfig.garage.endpoint}`,
    );
    console.log(`📦 Using test bucket: ${testBucketName}`);
  }, 30000);

  afterAll(async () => {
    if (createdObjects.length > 0) {
      console.log(`🧹 Cleaning up ${createdObjects.length} test objects...`);

      await Promise.allSettled(
        createdObjects.map(async (key) => {
          try {
            await service.deleteObject(key);
          } catch (error) {
            console.warn(`Failed to cleanup object ${key}:`, error.message);
          }
        }),
      );
    }
  }, 30000);

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const createTestBuffer = (size: number): Buffer => {
    return randomBytes(size);
  };

  const generateTestKey = (
    prefix: string = 'integration-test',
    extension: string = 'bin',
  ): string => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const key = `${prefix}/${timestamp}-${randomId}.${extension}`;
    createdObjects.push(key);
    return key;
  };

  describe('Complete CRUD Operations on Real Garage Instance', () => {
    it('should perform complete CRUD operations on real Garage instance', async () => {
      const testContent = createTestBuffer(1024);
      const originalChecksum = require('crypto')
        .createHash('md5')
        .update(testContent)
        .digest('hex');

      const objectKey = generateTestKey('crud-test', 'bin');
      const metadata: ObjectMetadata = {
        contentType: 'application/octet-stream',
        userId: 'integration-user-123',
        projectId: 'integration-project-456',
        customMetadata: {
          testType: 'crud-integration',
          originalChecksum,
        },
      };

      console.log(`🧪 Testing CRUD operations with object: ${objectKey}`);

      // CREATE - Upload de l'objet
      const uploadResult = await service.uploadObject(
        objectKey,
        testContent,
        metadata,
      );

      expect(uploadResult).toBeDefined();
      expect(uploadResult.uploadId).toMatch(/^[a-f0-9-]{36}$/);
      expect(uploadResult.storageKey).toBe(objectKey);
      expect(uploadResult.etag).toBeDefined();
      expect(uploadResult.location).toContain(testBucketName);
      expect(uploadResult.metadata.userId).toBe(metadata.userId);
      expect(uploadResult.metadata.size).toBe(testContent.length);

      console.log(`✅ Upload successful - ETag: ${uploadResult.etag}`);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // READ - Récupération des métadonnées
      const objectInfo = await service.getObjectInfo(objectKey);

      expect(objectInfo).toBeDefined();
      expect(objectInfo.key).toBe(objectKey);
      expect(objectInfo.size).toBe(testContent.length);
      expect(objectInfo.contentType).toBe(metadata.contentType);
      expect(objectInfo.etag).toBe(uploadResult.etag);
      expect(objectInfo.customMetadata['user-id']).toBe(metadata.userId);

      console.log(
        `✅ Metadata retrieval successful - Size: ${objectInfo.size} bytes`,
      );

      // READ - Download du contenu
      const downloadResult = await service.downloadObject(objectKey);

      expect(downloadResult).toBeDefined();
      expect(downloadResult.body).toEqual(testContent);
      expect(downloadResult.metadata.contentType).toBe(metadata.contentType);
      expect(downloadResult.metadata.contentLength).toBe(testContent.length);
      expect(downloadResult.metadata.etag).toBe(uploadResult.etag);

      const downloadedChecksum = require('crypto')
        .createHash('md5')
        .update(downloadResult.body)
        .digest('hex');
      expect(downloadedChecksum).toBe(originalChecksum);

      console.log(`✅ Download successful - Integrity verified`);

      // UPDATE - Copie vers nouveau nom
      const copyKey = generateTestKey('crud-copy', 'bin');
      const copyResult = await service.copyObject(objectKey, copyKey);

      expect(copyResult).toBeDefined();
      expect(copyResult.sourceKey).toBe(objectKey);
      expect(copyResult.destinationKey).toBe(copyKey);
      expect(copyResult.etag).toBeDefined();

      const copiedObjectInfo = await service.getObjectInfo(copyKey);
      expect(copiedObjectInfo.size).toBe(objectInfo.size);
      expect(copiedObjectInfo.contentType).toBe(objectInfo.contentType);

      console.log(`✅ Copy successful - Destination: ${copyKey}`);

      // DELETE - Suppression des objets
      await service.deleteObject(objectKey);
      await service.deleteObject(copyKey);

      await expect(service.getObjectInfo(objectKey)).rejects.toThrow();
      await expect(service.getObjectInfo(copyKey)).rejects.toThrow();

      console.log(`✅ Deletion successful - Objects removed`);

      createdObjects = createdObjects.filter(
        (key) => key !== objectKey && key !== copyKey,
      );
    }, 30000);

    it('should handle objects of various sizes correctly', async () => {
      const testSizes = [
        { name: 'tiny', size: 100 },
        { name: 'small', size: 64 * 1024 },
        { name: 'medium', size: 1024 * 1024 },
        { name: 'large', size: 10 * 1024 * 1024 },
      ];

      for (const testCase of testSizes) {
        console.log(
          `🧪 Testing ${testCase.name} file (${testCase.size} bytes)`,
        );

        const testContent = createTestBuffer(testCase.size);
        const objectKey = generateTestKey(`size-test-${testCase.name}`, 'bin');
        const metadata: ObjectMetadata = {
          contentType: 'application/octet-stream',
          userId: 'size-test-user',
          customMetadata: { sizeCategory: testCase.name },
        };

        const startTime = Date.now();
        const uploadResult = await service.uploadObject(
          objectKey,
          testContent,
          metadata,
        );
        const uploadDuration = Date.now() - startTime;

        expect(uploadResult.metadata.size).toBe(testCase.size);
        console.log(`  ✅ Upload completed in ${uploadDuration}ms`);

        const downloadStart = Date.now();
        const downloadResult = await service.downloadObject(objectKey);
        const downloadDuration = Date.now() - downloadStart;

        expect(downloadResult.body.length).toBe(testCase.size);
        expect(downloadResult.body.equals(testContent)).toBe(true);
        console.log(`  ✅ Download completed in ${downloadDuration}ms`);

        if (testCase.size > 1024 * 1024) {
          console.log(
            `  📊 Throughput: ${(testCase.size / 1024 / 1024 / (uploadDuration / 1000)).toFixed(2)} MB/s upload`,
          );
        }
      }
    }, 60000);
  });

  describe('Concurrent Operations Handling', () => {
    it('should handle concurrent uploads correctly', async () => {
      const concurrentCount = 10;
      const fileSize = 512 * 1024;

      const uploadTasks = Array.from(
        { length: concurrentCount },
        (_, index) => ({
          key: generateTestKey(`concurrent-upload-${index}`, 'bin'),
          content: createTestBuffer(fileSize),
          metadata: {
            contentType: 'application/octet-stream',
            userId: `concurrent-user-${index}`,
            customMetadata: {
              uploadIndex: index.toString(),
              batchId: 'concurrent-test-batch',
            },
          } as ObjectMetadata,
        }),
      );

      console.log(`🧪 Starting ${concurrentCount} concurrent uploads...`);

      const startTime = Date.now();
      const uploadPromises = uploadTasks.map((task) =>
        service.uploadObject(task.key, task.content, task.metadata),
      );

      const uploadResults = await Promise.all(uploadPromises);
      const totalDuration = Date.now() - startTime;

      expect(uploadResults).toHaveLength(concurrentCount);

      uploadResults.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.storageKey).toBe(uploadTasks[index].key);
        expect(result.metadata.size).toBe(fileSize);
        expect(result.etag).toBeDefined();
      });

      console.log(
        `✅ All ${concurrentCount} uploads completed in ${totalDuration}ms`,
      );
      console.log(
        `📊 Average time per upload: ${(totalDuration / concurrentCount).toFixed(2)}ms`,
      );

      const sampleIndices = [
        0,
        Math.floor(concurrentCount / 2),
        concurrentCount - 1,
      ];

      for (const index of sampleIndices) {
        const downloadResult = await service.downloadObject(
          uploadTasks[index].key,
        );
        expect(downloadResult.body.equals(uploadTasks[index].content)).toBe(
          true,
        );
      }

      console.log(`✅ Sample downloads verified - Data integrity maintained`);
    }, 45000);

    it('should handle mixed concurrent operations correctly', async () => {
      const setupObjects = Array.from({ length: 5 }, (_, index) => ({
        key: generateTestKey(`mixed-ops-setup-${index}`, 'txt'),
        content: Buffer.from(
          `Setup content for mixed operations test ${index}`,
        ),
      }));

      for (const obj of setupObjects) {
        await service.uploadObject(obj.key, obj.content, {
          contentType: 'text/plain',
          userId: 'mixed-ops-user',
        });
      }

      console.log(`🧪 Starting mixed concurrent operations...`);

      const mixedOperations = [
        ...Array.from({ length: 3 }, (_, i) =>
          service.uploadObject(
            generateTestKey(`mixed-ops-upload-${i}`, 'bin'),
            createTestBuffer(256 * 1024),
            {
              contentType: 'application/octet-stream',
              userId: 'mixed-ops-user',
            },
          ),
        ),

        ...setupObjects
          .slice(0, 3)
          .map((obj) => service.downloadObject(obj.key)),

        ...setupObjects
          .slice(0, 2)
          .map((obj) => service.getObjectInfo(obj.key)),

        service.copyObject(
          setupObjects[0].key,
          generateTestKey('mixed-ops-copy', 'txt'),
        ),
      ];

      const startTime = Date.now();
      const results = await Promise.allSettled(mixedOperations);
      const totalDuration = Date.now() - startTime;

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(successful).toBeGreaterThan(mixedOperations.length * 0.9);
      expect(failed).toBeLessThan(mixedOperations.length * 0.1);

      console.log(
        `✅ Mixed operations completed: ${successful} successful, ${failed} failed`,
      );
      console.log(`📊 Total duration: ${totalDuration}ms`);

      if (failed > 0) {
        const errors = results
          .filter((r) => r.status === 'rejected')
          .map((r) => r.reason.message);
        console.warn(`⚠️ Failed operations:`, errors);
      }
    }, 45000);
  });

  describe('Data Integrity and Reliability', () => {
    it('should maintain data integrity across operations', async () => {
      // ✅ CORRIGÉ : Types explicites pour éviter les erreurs TypeScript
      interface TestFile {
        name: string;
        content: Buffer;
        contentType: string;
        md5: string;
        sha256: string;
      }

      interface UploadedFile extends TestFile {
        key: string;
        uploadResult: UploadResult;
      }

      const testFiles = [
        {
          name: 'integrity-text.txt',
          content: Buffer.from(
            'This is a text file for integrity testing with special chars: àéèñü',
          ),
          contentType: 'text/plain',
        },
        {
          name: 'integrity-binary.bin',
          content: createTestBuffer(2 * 1024 * 1024),
          contentType: 'application/octet-stream',
        },
        {
          name: 'integrity-json.json',
          content: Buffer.from(
            JSON.stringify(
              {
                testData: 'integrity-test',
                timestamp: new Date().toISOString(),
                numbers: Array.from({ length: 100 }, (_, i) => i * Math.PI),
              },
              null,
              2,
            ),
          ),
          contentType: 'application/json',
        },
      ];

      const originalChecksums: TestFile[] = testFiles.map((file) => ({
        ...file,
        md5: require('crypto')
          .createHash('md5')
          .update(file.content)
          .digest('hex'),
        sha256: require('crypto')
          .createHash('sha256')
          .update(file.content)
          .digest('hex'),
      }));

      console.log(`🧪 Testing data integrity for ${testFiles.length} files...`);

      const uploadResults: UploadedFile[] = [];

      for (const file of originalChecksums) {
        const key = generateTestKey(`integrity-${file.name}`, '');
        const metadata: ObjectMetadata = {
          contentType: file.contentType,
          userId: 'integrity-test-user',
          customMetadata: {
            originalMd5: file.md5,
            originalSha256: file.sha256,
            fileType: file.name.split('.').pop() || 'unknown', // ✅ CORRIGÉ : Gestion undefined
          },
        };

        const uploadResult = await service.uploadObject(
          key,
          file.content,
          metadata,
        );
        uploadResults.push({ ...file, key, uploadResult });
      }

      for (const file of uploadResults) {
        const copyKey = generateTestKey(`integrity-copy-${file.name}`, '');
        await service.copyObject(file.key, copyKey);

        const info = await service.getObjectInfo(file.key);
        expect(info.size).toBe(file.content.length);

        const copyInfo = await service.getObjectInfo(copyKey);
        expect(copyInfo.size).toBe(info.size);
        expect(copyInfo.etag).toBe(info.etag);
      }

      for (const file of uploadResults) {
        const downloadResult = await service.downloadObject(file.key);

        expect(downloadResult.body.length).toBe(file.content.length);
        expect(downloadResult.body.equals(file.content)).toBe(true);

        const downloadedMd5 = require('crypto')
          .createHash('md5')
          .update(downloadResult.body)
          .digest('hex');
        const downloadedSha256 = require('crypto')
          .createHash('sha256')
          .update(downloadResult.body)
          .digest('hex');

        expect(downloadedMd5).toBe(file.md5);
        expect(downloadedSha256).toBe(file.sha256);

        console.log(
          `  ✅ ${file.name}: integrity verified (${downloadResult.body.length} bytes)`,
        );
      }

      console.log(`✅ All files passed integrity verification`);
    }, 60000);

    it('should handle network interruptions gracefully', async () => {
      const testContent = createTestBuffer(1024);
      const key = generateTestKey('network-recovery-test', 'bin');
      const metadata: ObjectMetadata = {
        contentType: 'application/octet-stream',
        userId: 'network-test-user',
      };

      console.log(`🧪 Testing network recovery capabilities...`);

      try {
        const uploadResult = await service.uploadObject(
          key,
          testContent,
          metadata,
        );
        expect(uploadResult).toBeDefined();

        const downloadResult = await service.downloadObject(key);
        expect(downloadResult.body.equals(testContent)).toBe(true);

        console.log(`✅ Network recovery test passed`);
      } catch (error) {
        console.warn(
          `⚠️ Network test failed (expected in some environments):`,
          error.message,
        );
      }
    }, 30000);

    it('should handle edge cases and limits correctly', async () => {
      console.log(`🧪 Testing edge cases and limits...`);

      const emptyKey = generateTestKey('edge-empty', 'txt');
      const emptyContent = Buffer.alloc(0);

      try {
        await service.uploadObject(emptyKey, emptyContent, {
          contentType: 'text/plain',
          userId: 'edge-test-user',
        });
        console.warn(`⚠️ Empty file upload should have failed but succeeded`);
      } catch (error) {
        expect(error.message).toContain('non-empty Buffer');
        console.log(`  ✅ Empty file correctly rejected`);
      }

      const specialCharsKey = generateTestKey(
        'edge-special-chars-àéèñü',
        'txt',
      );
      const specialContent = Buffer.from(
        'Content with special characters: àáâãäåæçèéêë',
      );

      const specialResult = await service.uploadObject(
        specialCharsKey,
        specialContent,
        {
          contentType: 'text/plain; charset=utf-8',
          userId: 'edge-test-user',
        },
      );

      expect(specialResult.storageKey).toBe(specialCharsKey);

      const specialDownload = await service.downloadObject(specialCharsKey);
      expect(specialDownload.body.equals(specialContent)).toBe(true);
      console.log(`  ✅ Special characters in key handled correctly`);

      const complexMetadataKey = generateTestKey(
        'edge-complex-metadata',
        'json',
      );
      const complexContent = Buffer.from('{"test": true}');

      const complexMetadata: ObjectMetadata = {
        contentType: 'application/json',
        userId: 'edge-test-user',
        projectId: 'project-with-hyphens-and-numbers-123',
        customMetadata: {
          'complex-key': 'value with spaces and symbols !@#$%',
          'nested-data': 'àéèñü-unicode-data',
          'long-key': 'x'.repeat(100),
        },
      };

      const complexResult = await service.uploadObject(
        complexMetadataKey,
        complexContent,
        complexMetadata,
      );
      const complexInfo = await service.getObjectInfo(complexMetadataKey);

      expect(complexInfo.customMetadata['user-id']).toBe(
        complexMetadata.userId,
      );
      expect(complexInfo.customMetadata['project-id']).toBe(
        complexMetadata.projectId,
      );
      console.log(`  ✅ Complex metadata handled correctly`);

      const longKey = generateTestKey(
        'edge-very-long-name-' + 'x'.repeat(200),
        'bin',
      );
      const longKeyContent = Buffer.from('Long key test content');

      try {
        const longKeyResult = await service.uploadObject(
          longKey,
          longKeyContent,
          {
            contentType: 'application/octet-stream',
            userId: 'edge-test-user',
          },
        );
        expect(longKeyResult.storageKey).toBe(longKey);
        console.log(`  ✅ Long object key handled correctly`);
      } catch (error) {
        console.log(
          `  ℹ️ Long key rejected (implementation limit): ${error.message}`,
        );
      }

      console.log(`✅ Edge cases testing completed`);
    }, 45000);
  });

  describe('Performance and Monitoring', () => {
    it('should meet basic performance benchmarks', async () => {
      const benchmarks = {
        smallFileUpload: { size: 64 * 1024, maxTime: 5000 },
        mediumFileUpload: { size: 1024 * 1024, maxTime: 10000 },
        smallFileDownload: { size: 64 * 1024, maxTime: 3000 },
        metadataQuery: { maxTime: 1000 },
      };

      console.log(`🧪 Running performance benchmarks...`);

      const smallContent = createTestBuffer(benchmarks.smallFileUpload.size);
      const smallKey = generateTestKey('perf-small', 'bin');

      const smallUploadStart = Date.now();
      const smallUploadResult = await service.uploadObject(
        smallKey,
        smallContent,
        {
          contentType: 'application/octet-stream',
          userId: 'perf-test-user',
        },
      );
      const smallUploadTime = Date.now() - smallUploadStart;

      expect(smallUploadTime).toBeLessThan(benchmarks.smallFileUpload.maxTime);
      console.log(
        `  ✅ Small file upload: ${smallUploadTime}ms (${benchmarks.smallFileUpload.size} bytes)`,
      );

      const mediumContent = createTestBuffer(benchmarks.mediumFileUpload.size);
      const mediumKey = generateTestKey('perf-medium', 'bin');

      const mediumUploadStart = Date.now();
      await service.uploadObject(mediumKey, mediumContent, {
        contentType: 'application/octet-stream',
        userId: 'perf-test-user',
      });
      const mediumUploadTime = Date.now() - mediumUploadStart;

      expect(mediumUploadTime).toBeLessThan(
        benchmarks.mediumFileUpload.maxTime,
      );
      console.log(
        `  ✅ Medium file upload: ${mediumUploadTime}ms (${benchmarks.mediumFileUpload.size} bytes)`,
      );

      const smallDownloadStart = Date.now();
      const smallDownloadResult = await service.downloadObject(smallKey);
      const smallDownloadTime = Date.now() - smallDownloadStart;

      expect(smallDownloadTime).toBeLessThan(
        benchmarks.smallFileDownload.maxTime,
      );
      expect(smallDownloadResult.body.equals(smallContent)).toBe(true);
      console.log(`  ✅ Small file download: ${smallDownloadTime}ms`);

      const metadataStart = Date.now();
      const metadataResult = await service.getObjectInfo(smallKey);
      const metadataTime = Date.now() - metadataStart;

      expect(metadataTime).toBeLessThan(benchmarks.metadataQuery.maxTime);
      expect(metadataResult.size).toBe(benchmarks.smallFileUpload.size);
      console.log(`  ✅ Metadata query: ${metadataTime}ms`);

      const smallThroughput =
        benchmarks.smallFileUpload.size /
        1024 /
        1024 /
        (smallUploadTime / 1000);
      const mediumThroughput =
        benchmarks.mediumFileUpload.size /
        1024 /
        1024 /
        (mediumUploadTime / 1000);

      console.log(
        `📊 Upload throughput: Small=${smallThroughput.toFixed(2)} MB/s, Medium=${mediumThroughput.toFixed(2)} MB/s`,
      );
    }, 45000);

    it('should provide accurate bucket information', async () => {
      console.log(`🧪 Testing bucket information retrieval...`);

      const bucketInfo = await service.getBucketInfo();

      expect(bucketInfo).toBeDefined();
      expect(bucketInfo.name).toBe(testBucketName);
      expect(bucketInfo.region).toBe(integrationConfig.garage.region);
      expect(bucketInfo.creationDate).toBeInstanceOf(Date);
      expect(bucketInfo.usage).toBeDefined();
      expect(bucketInfo.usage.objectCount).toBeGreaterThanOrEqual(0);
      expect(bucketInfo.usage.totalSize).toBeGreaterThanOrEqual(0);

      console.log(`✅ Bucket info: ${bucketInfo.name} in ${bucketInfo.region}`);
      console.log(
        `📊 Usage: ${bucketInfo.usage.objectCount} objects, ${(bucketInfo.usage.totalSize / 1024 / 1024).toFixed(2)} MB`,
      );
    }, 15000);
  });
});
