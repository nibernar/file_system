// src/infrastructure/persistence/__tests__/file-metadata.repository.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { FileMetadataRepositoryImpl } from '../file-metadata.repository.impl';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentType, ProcessingStatus, VirusScanStatus } from '../../../types/file-system.types';

describe('FileMetadataRepository', () => {
  let repository: FileMetadataRepositoryImpl;
  let prismaService: jest.Mocked<PrismaService>;
  let cacheManager: jest.Mocked<Cache>;

  beforeEach(async () => {
    const mockPrismaService = {
      files: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };

    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileMetadataRepositoryImpl,
        { provide: PrismaService, useValue: mockPrismaService as any },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    repository = module.get<FileMetadataRepositoryImpl>(FileMetadataRepositoryImpl);
    prismaService = module.get(PrismaService);
    cacheManager = module.get(CACHE_MANAGER);
  });

  it('should create file metadata with all required fields', async () => {
    // Arrange
    const createDto = {
      userId: 'user-123',
      filename: 'test.pdf',
      originalName: 'Test.pdf',
      contentType: 'application/pdf',
      size: 1024,
      storageKey: 'files/test.pdf',
      checksumMd5: 'md5hash',
      checksumSha256: 'sha256hash',
      documentType: DocumentType.DOCUMENT
    };

    const mockResult = {
      id: 'file-123',
      user_id: 'user-123',
      filename: 'test.pdf',
      original_name: 'Test.pdf',
      content_type: 'application/pdf',
      size: 1024,
      storage_key: 'files/test.pdf',
      checksum_md5: 'md5hash',
      checksum_sha256: 'sha256hash',
      virus_scan_status: VirusScanStatus.PENDING,
      processing_status: ProcessingStatus.PENDING,
      document_type: DocumentType.DOCUMENT,
      tags: [],
      version_count: 1,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      cdn_url: null,
      project_id: null
    };

    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        files: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockResult)
        }
      } as any;
      return await callback(tx);
    });

    // Act
    const result = await repository.create(createDto);

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe('file-123');
    expect(result.filename).toBe('test.pdf');
    expect(result.userId).toBe('user-123');
  });

  it('should find files by user with proper filtering', async () => {
    // Arrange
    const userId = 'user-123';
    const mockFiles = [
      {
        id: 'file-1',
        user_id: userId,
        filename: 'doc1.pdf',
        original_name: 'Document 1.pdf',
        content_type: 'application/pdf',
        size: 1024,
        storage_key: 'files/doc1.pdf',
        checksum_md5: 'md5-1',
        checksum_sha256: 'sha256-1',
        virus_scan_status: VirusScanStatus.CLEAN,
        processing_status: ProcessingStatus.COMPLETED,
        document_type: DocumentType.DOCUMENT,
        tags: [],
        version_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        cdn_url: null,
        project_id: null
      }
    ];

    (prismaService.files.findMany as jest.Mock).mockResolvedValue(mockFiles);

    // Act
    const result = await repository.findByUserId(userId, { limit: 10 });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(userId);
    expect(prismaService.files.findMany).toHaveBeenCalledWith({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
      skip: 0
    });
  });

  it('should update metadata while preserving constraints', async () => {
    // Arrange
    const fileId = 'file-123';
    const updates = {
      filename: 'updated.pdf',
      processingStatus: ProcessingStatus.COMPLETED
    };

    const existingFile = { id: fileId, metadata: {} };
    const updatedFile = { ...existingFile, filename: 'updated.pdf', processing_status: ProcessingStatus.COMPLETED };

    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        files: {
          findUnique: jest.fn().mockResolvedValue(existingFile),
          update: jest.fn().mockResolvedValue(updatedFile)
        }
      } as any;
      return await callback(tx);
    });

    // Act
    const result = await repository.update(fileId, updates);

    // Assert
    expect(result).toBeDefined();
    expect(result.filename).toBe('updated.pdf');
  });

  it('should calculate storage usage accurately', async () => {
    // Arrange
    const userId = 'user-123';
    const mockTotalStats = {
      _sum: { size: BigInt(1000000) },
      _count: 10
    };
    const mockByContentType = [
      { content_type: 'application/pdf', _sum: { size: BigInt(500000) }, _count: 5 }
    ];
    const mockByDocumentType = [
      { document_type: DocumentType.DOCUMENT, _sum: { size: BigInt(500000) }, _count: 5 }
    ];
    const mockByProcessingStatus = [
      { processing_status: ProcessingStatus.COMPLETED, _count: 8 }
    ];
    const mockTagStats = [
      { tag: 'important', count: BigInt(3) }
    ];

    (cacheManager.get as jest.Mock).mockResolvedValue(null);
    (prismaService.files.aggregate as jest.Mock).mockResolvedValue(mockTotalStats);
    (prismaService.files.groupBy as jest.Mock)
      .mockResolvedValueOnce(mockByContentType)
      .mockResolvedValueOnce(mockByProcessingStatus)
      .mockResolvedValueOnce(mockByDocumentType);
    (prismaService.$queryRaw as jest.Mock).mockResolvedValue(mockTagStats);

    // Act
    const result = await repository.getUserStorageUsage(userId);

    // Assert
    expect(result.totalSize).toBe(1000000);
    expect(result.fileCount).toBe(10);
    expect(result.byContentType).toHaveLength(1);
    expect(result.byDocumentType).toHaveLength(1);
  });

  it('should handle concurrent access correctly', async () => {
    // Arrange
    const userId = 'user-123';
    const concurrentCount = 5;
    
    (prismaService.files.aggregate as jest.Mock).mockResolvedValue({
      _sum: { size: BigInt(1000) },
      _count: 1
    });
    (prismaService.files.groupBy as jest.Mock).mockResolvedValue([]);
    (prismaService.$queryRaw as jest.Mock).mockResolvedValue([]);
    (cacheManager.get as jest.Mock).mockResolvedValue(null);

    // Act - Appels simultanés
    const promises = Array.from({ length: concurrentCount }, () => 
      repository.getUserStorageUsage(userId)
    );
    const results = await Promise.all(promises);

    // Assert
    expect(results).toHaveLength(concurrentCount);
    results.forEach(result => {
      expect(result.totalSize).toBe(1000);
      expect(result.fileCount).toBe(1);
    });
  });

  it('should cache frequently accessed metadata', async () => {
    // Arrange
    const fileId = 'file-123';
    const cachedMetadata = {
      id: fileId,
      userId: 'user-123',
      filename: 'cached.pdf',
      contentType: 'application/pdf',
      size: 1024,
      storageKey: 'files/cached.pdf',
      checksumMd5: 'md5',
      checksumSha256: 'sha256',
      virusScanStatus: VirusScanStatus.CLEAN,
      processingStatus: ProcessingStatus.COMPLETED,
      documentType: DocumentType.DOCUMENT,
      tags: [],
      versionCount: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    (cacheManager.get as jest.Mock).mockResolvedValue(cachedMetadata);

    // Act
    const result = await repository.findById(fileId);

    // Assert
    expect(result).toEqual(cachedMetadata);
    expect(cacheManager.get).toHaveBeenCalledWith(`file:metadata:${fileId}`);
    expect(prismaService.files.findUnique).not.toHaveBeenCalled();
  });
});
