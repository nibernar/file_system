import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  IFileMetadataRepository,
  CreateFileMetadataDto,
  UpdateFileMetadataDto,
  FindOptions,
  StorageUsage,
} from '../../domain/repositories/file-metadata.repository';
import {
  FileMetadata,
  ProcessingStatus,
  VirusScanStatus,
  DocumentType,
} from '../../types/file-system.types';
import { FILE_SYSTEM_CONSTANTS } from '../../constants/file-system.constants';

/**
 * Implémentation concrète du repository de métadonnées de fichiers
 *
 * Cette classe implémente l'interface IFileMetadataRepository en utilisant
 * Prisma comme ORM et Redis comme cache. Elle inclut des optimisations
 * de performance et une gestion d'erreurs robuste.
 *
 * @class FileMetadataRepositoryImpl
 * @implements {IFileMetadataRepository}
 */
@Injectable()
export class FileMetadataRepositoryImpl implements IFileMetadataRepository {
  private readonly logger = new Logger(FileMetadataRepositoryImpl.name);

  /**
   * Constructeur du repository
   *
   * @param prisma - Service Prisma pour l'accès à la base de données
   * @param cacheManager - Gestionnaire de cache Redis pour l'optimisation des performances
   */
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Crée une nouvelle entrée de métadonnées de fichier
   */
  async create(metadata: CreateFileMetadataDto): Promise<FileMetadata> {
    this.logger.log(`Creating file metadata for user ${metadata.userId}`);

    try {
      const fileData = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.files.findUnique({
          where: { storage_key: metadata.storageKey },
        });

        if (existing) {
          throw new Error(
            `File with storage key ${metadata.storageKey} already exists`,
          );
        }

        const file = await tx.files.create({
          data: {
            user_id: metadata.userId,
            project_id: metadata.projectId,
            filename: metadata.filename,
            original_name: metadata.originalName,
            content_type: metadata.contentType,
            size: metadata.size,
            storage_key: metadata.storageKey,
            cdn_url: metadata.cdnUrl,
            checksum_md5: metadata.checksumMd5,
            checksum_sha256: metadata.checksumSha256,
            virus_scan_status: VirusScanStatus.PENDING,
            processing_status: ProcessingStatus.PENDING,
            document_type: metadata.documentType || DocumentType.DOCUMENT,
            tags: metadata.tags || [],
            version_count: 1,
            metadata: metadata.metadata || {},
          },
        });

        return file;
      });

      await this.invalidateUserCache(metadata.userId);
      if (metadata.projectId) {
        await this.invalidateProjectCache(metadata.projectId);
      }

      return this.mapToFileMetadata(fileData);
    } catch (error) {
      this.logger.error(
        `Failed to create file metadata: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche des métadonnées de fichier par ID
   */
  async findById(id: string): Promise<FileMetadata | null> {
    const cacheKey = `file:metadata:${id}`;
    const cached = await this.cacheManager.get<FileMetadata>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for file ${id}`);
      return cached;
    }

    this.logger.debug(`Cache miss for file ${id}, fetching from database`);

    try {
      const file = await this.prisma.files.findUnique({
        where: { id },
      });

      if (!file) {
        return null;
      }

      const metadata = this.mapToFileMetadata(file);

      const ttl = FILE_SYSTEM_CONSTANTS.CACHE_TTL.DEFAULT;
      await this.cacheManager.set(cacheKey, metadata, ttl);

      return metadata;
    } catch (error) {
      this.logger.error(
        `Failed to find file by id ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche tous les fichiers d'un utilisateur
   */
  async findByUserId(
    userId: string,
    options: FindOptions = {},
  ): Promise<FileMetadata[]> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted = false,
      contentType,
      processingStatus,
      documentType,
      tags,
    } = options;

    try {
      const sortField = this.mapSortField(sortBy);

      const where: any = {
        user_id: userId,
        ...(includeDeleted ? {} : { deleted_at: null }),
        ...(contentType && { content_type: contentType }),
        ...(processingStatus && { processing_status: processingStatus }),
        ...(documentType && { document_type: documentType }),
        ...(tags &&
          tags.length > 0 && {
            tags: {
              hasEvery: tags,
            },
          }),
      };

      const files = await this.prisma.files.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        take: limit,
        skip: offset,
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find files for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche tous les fichiers d'un projet
   */
  async findByProjectId(
    projectId: string,
    options: FindOptions = {},
  ): Promise<FileMetadata[]> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted = false,
      contentType,
      processingStatus,
      documentType,
      tags,
    } = options;

    try {
      const sortField = this.mapSortField(sortBy);

      const where: any = {
        project_id: projectId,
        ...(includeDeleted ? {} : { deleted_at: null }),
        ...(contentType && { content_type: contentType }),
        ...(processingStatus && { processing_status: processingStatus }),
        ...(documentType && { document_type: documentType }),
        ...(tags &&
          tags.length > 0 && {
            tags: {
              hasEvery: tags,
            },
          }),
      };

      const files = await this.prisma.files.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        take: limit,
        skip: offset,
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find files for project ${projectId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Met à jour les métadonnées d'un fichier
   */
  async update(
    id: string,
    updates: UpdateFileMetadataDto,
  ): Promise<FileMetadata> {
    this.logger.log(`Updating file metadata for ${id}`);

    try {
      const updatedFile = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.files.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`File ${id} not found`);
        }

        const updateData: any = {};
        if (updates.filename) updateData.filename = updates.filename;
        if (updates.cdnUrl !== undefined) updateData.cdn_url = updates.cdnUrl;
        if (updates.virusScanStatus)
          updateData.virus_scan_status = updates.virusScanStatus;
        if (updates.processingStatus)
          updateData.processing_status = updates.processingStatus;
        if (updates.documentType)
          updateData.document_type = updates.documentType;
        if (updates.tags) updateData.tags = updates.tags;
        if (updates.deletedAt !== undefined)
          updateData.deleted_at = updates.deletedAt;
        if (updates.versionCount !== undefined)
          updateData.version_count = updates.versionCount;

        if (updates.metadata && existing.metadata) {
          updateData.metadata = {
            ...(existing.metadata as Record<string, any>),
            ...updates.metadata,
          };
        } else if (updates.metadata) {
          updateData.metadata = updates.metadata;
        }

        const file = await tx.files.update({
          where: { id },
          data: updateData,
        });

        return file;
      });

      await this.invalidateFileCache(id);

      return this.mapToFileMetadata(updatedFile);
    } catch (error) {
      this.logger.error(
        `Failed to update file ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Supprime les métadonnées d'un fichier (hard delete)
   */
  async delete(id: string): Promise<void> {
    this.logger.warn(`Hard deleting file ${id}`);

    try {
      await this.prisma.files.delete({ where: { id } });

      await this.invalidateFileCache(id);
    } catch (error) {
      this.logger.error(
        `Failed to delete file ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche un fichier par sa clé de stockage
   */
  async findByStorageKey(storageKey: string): Promise<FileMetadata | null> {
    try {
      const file = await this.prisma.files.findUnique({
        where: { storage_key: storageKey },
      });

      return file ? this.mapToFileMetadata(file) : null;
    } catch (error) {
      this.logger.error(
        `Failed to find file by storage key ${storageKey}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche des fichiers par checksum
   */
  async findByChecksum(checksum: string): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.files.findMany({
        where: {
          OR: [{ checksum_md5: checksum }, { checksum_sha256: checksum }],
          deleted_at: null,
        },
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find files by checksum ${checksum}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche des fichiers par tags
   */
  async findByTags(
    tags: string[],
    matchAll: boolean = false,
  ): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.files.findMany({
        where: {
          tags: matchAll ? { hasEvery: tags } : { hasSome: tags },
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find files by tags ${tags.join(', ')}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche les fichiers en attente de traitement
   */
  async findPendingProcessing(): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.files.findMany({
        where: {
          processing_status: ProcessingStatus.PENDING,
          deleted_at: null,
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find pending processing files: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Recherche les fichiers expirés
   */
  async findExpiredFiles(olderThan: Date): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.files.findMany({
        where: {
          created_at: { lt: olderThan },
          deleted_at: null,
        },
        orderBy: { created_at: 'asc' },
      });

      return files.map((file) => this.mapToFileMetadata(file));
    } catch (error) {
      this.logger.error(
        `Failed to find expired files: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calcule l'utilisation du stockage pour un utilisateur
   * VERSION CORRIGÉE avec byDocumentType et topTags
   */
  async getUserStorageUsage(userId: string): Promise<StorageUsage> {
    const cacheKey = `user:storage:${userId}`;
    const cached = await this.cacheManager.get<StorageUsage>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const [totalStats, byContentType, byStatus, byDocType, tagStats] =
        await Promise.all([
          this.prisma.files.aggregate({
            where: { user_id: userId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['content_type'],
            where: { user_id: userId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['processing_status'],
            where: { user_id: userId, deleted_at: null },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['document_type'],
            where: { user_id: userId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
          SELECT unnest(tags) as tag, COUNT(*) as count
          FROM files 
          WHERE user_id = ${userId} 
            AND deleted_at IS NULL 
            AND array_length(tags, 1) > 0
          GROUP BY unnest(tags)
          ORDER BY count DESC
          LIMIT 10
        `,
        ]);

      const usage: StorageUsage = {
        totalSize: Number(totalStats._sum.size || 0),
        fileCount: totalStats._count,
        byContentType: byContentType.map((item) => ({
          contentType: item.content_type,
          size: Number(item._sum.size || 0),
          count: item._count,
        })),
        byDocumentType: byDocType.map((item) => ({
          documentType: item.document_type || 'unknown',
          size: Number(item._sum.size || 0),
          count: item._count,
        })),
        byProcessingStatus: byStatus.map((item) => ({
          status: item.processing_status || 'unknown',
          count: item._count,
        })),
        topTags: tagStats.map((item) => ({
          tag: item.tag,
          count: Number(item.count),
        })),
        calculatedAt: new Date(),
      };

      await this.cacheManager.set(
        cacheKey,
        usage,
        FILE_SYSTEM_CONSTANTS.CACHE_TTL.DEFAULT,
      );

      return usage;
    } catch (error) {
      this.logger.error(
        `Failed to calculate user storage usage: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calcule l'utilisation du stockage pour un projet
   * VERSION CORRIGÉE avec byDocumentType et topTags
   */
  async getProjectStorageUsage(projectId: string): Promise<StorageUsage> {
    const cacheKey = `project:storage:${projectId}`;
    const cached = await this.cacheManager.get<StorageUsage>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const [totalStats, byContentType, byStatus, byDocType, tagStats] =
        await Promise.all([
          this.prisma.files.aggregate({
            where: { project_id: projectId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['content_type'],
            where: { project_id: projectId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['processing_status'],
            where: { project_id: projectId, deleted_at: null },
            _count: true,
          }),

          this.prisma.files.groupBy({
            by: ['document_type'],
            where: { project_id: projectId, deleted_at: null },
            _sum: { size: true },
            _count: true,
          }),

          this.prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
          SELECT unnest(tags) as tag, COUNT(*) as count
          FROM files 
          WHERE project_id = ${projectId} 
            AND deleted_at IS NULL 
            AND array_length(tags, 1) > 0
          GROUP BY unnest(tags)
          ORDER BY count DESC
          LIMIT 10
        `,
        ]);

      const usage: StorageUsage = {
        totalSize: Number(totalStats._sum.size || 0),
        fileCount: totalStats._count,
        byContentType: byContentType.map((item) => ({
          contentType: item.content_type,
          size: Number(item._sum.size || 0),
          count: item._count,
        })),
        byDocumentType: byDocType.map((item) => ({
          documentType: item.document_type || 'unknown',
          size: Number(item._sum.size || 0),
          count: item._count,
        })),
        byProcessingStatus: byStatus.map((item) => ({
          status: item.processing_status || 'unknown',
          count: item._count,
        })),
        topTags: tagStats.map((item) => ({
          tag: item.tag,
          count: Number(item.count),
        })),
        calculatedAt: new Date(),
      };

      await this.cacheManager.set(
        cacheKey,
        usage,
        FILE_SYSTEM_CONSTANTS.CACHE_TTL.DEFAULT,
      );

      return usage;
    } catch (error) {
      this.logger.error(
        `Failed to calculate project storage usage: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Helper pour mapper les noms de champs de tri
   */
  private mapSortField(sortBy: string): string {
    const fieldMapping: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      size: 'size',
      filename: 'filename',
    };

    return fieldMapping[sortBy] || 'created_at';
  }

  /**
   * Mappe une entité Prisma vers le type FileMetadata
   */
  private mapToFileMetadata(file: any): FileMetadata {
    return {
      id: file.id,
      userId: file.user_id,
      projectId: file.project_id,
      filename: file.filename,
      originalName: file.original_name,
      contentType: file.content_type,
      size: Number(file.size),
      storageKey: file.storage_key,
      cdnUrl: file.cdn_url,
      checksumMd5: file.checksum_md5,
      checksumSha256: file.checksum_sha256,
      virusScanStatus: file.virus_scan_status,
      processingStatus: file.processing_status,
      documentType: file.document_type || DocumentType.DOCUMENT,
      tags: file.tags || [],
      versionCount: file.version_count || 1,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      deletedAt: file.deleted_at,
    };
  }

  /**
   * Invalide le cache pour un fichier spécifique
   */
  private async invalidateFileCache(fileId: string): Promise<void> {
    await this.cacheManager.del(`file:metadata:${fileId}`);
  }

  /**
   * Invalide le cache pour un utilisateur
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.del(`user:storage:${userId}`);
  }

  /**
   * Invalide le cache pour un projet
   */
  private async invalidateProjectCache(projectId: string): Promise<void> {
    await this.cacheManager.del(`project:storage:${projectId}`);
  }
}
