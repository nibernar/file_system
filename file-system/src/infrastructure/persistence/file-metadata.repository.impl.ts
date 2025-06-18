import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheManager } from '@nestjs/cache-manager';
import { 
  IFileMetadataRepository,
  CreateFileMetadataDto,
  UpdateFileMetadataDto,
  FindOptions,
  StorageUsage
} from '../../domain/repositories/file-metadata.repository';
import { FileMetadata, ProcessingStatus, VirusScanStatus } from '../../types/file-system.types';
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
    private readonly cacheManager: CacheManager
  ) {}

  /**
   * Crée une nouvelle entrée de métadonnées de fichier
   * 
   * Cette méthode valide les données, crée l'entrée en base avec une transaction,
   * invalide le cache pertinent et enregistre l'audit trail.
   * 
   * @param metadata - Les données du fichier à créer
   * @returns Les métadonnées créées avec l'ID généré
   */
  async create(metadata: CreateFileMetadataDto): Promise<FileMetadata> {
    this.logger.log(`Creating file metadata for user ${metadata.userId}`);
    
    try {
      // Transaction pour garantir l'intégrité des données
      const fileMetadata = await this.prisma.$transaction(async (tx) => {
        // Vérification de l'unicité de la clé de stockage
        const existing = await tx.file.findUnique({
          where: { storageKey: metadata.storageKey }
        });
        
        if (existing) {
          throw new Error(`File with storage key ${metadata.storageKey} already exists`);
        }
        
        // Création de l'entrée principale
        const file = await tx.file.create({
          data: {
            userId: metadata.userId,
            projectId: metadata.projectId,
            filename: metadata.filename,
            originalName: metadata.originalName,
            contentType: metadata.contentType,
            size: metadata.size,
            storageKey: metadata.storageKey,
            cdnUrl: metadata.cdnUrl,
            checksumMd5: metadata.checksumMd5,
            checksumSha256: metadata.checksumSha256,
            virusScanStatus: VirusScanStatus.PENDING,
            processingStatus: ProcessingStatus.PENDING,
            versionCount: 1,
            metadata: metadata.metadata || {},
            tags: metadata.tags || []
          },
          include: {
            user: true,
            project: true,
            versions: true
          }
        });
        
        // Création de la première version
        await tx.fileVersion.create({
          data: {
            fileId: file.id,
            versionNumber: 1,
            storageKey: metadata.storageKey,
            size: metadata.size,
            checksumMd5: metadata.checksumMd5,
            checksumSha256: metadata.checksumSha256,
            createdBy: metadata.userId,
            changeDescription: 'Initial upload'
          }
        });
        
        // Enregistrement de l'audit trail
        await tx.fileAudit.create({
          data: {
            fileId: file.id,
            userId: metadata.userId,
            action: 'CREATED',
            metadata: {
              filename: metadata.filename,
              contentType: metadata.contentType,
              size: metadata.size
            }
          }
        });
        
        return file;
      });
      
      // Invalidation du cache utilisateur
      await this.invalidateUserCache(metadata.userId);
      if (metadata.projectId) {
        await this.invalidateProjectCache(metadata.projectId);
      }
      
      // Conversion vers le type FileMetadata
      return this.mapToFileMetadata(fileMetadata);
      
    } catch (error) {
      this.logger.error(`Failed to create file metadata: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche des métadonnées de fichier par ID
   * 
   * Utilise une stratégie cache-first avec fallback sur la base de données.
   * Le cache a un TTL intelligent basé sur l'activité du fichier.
   * 
   * @param id - L'identifiant unique du fichier
   * @returns Les métadonnées ou null si non trouvé
   */
  async findById(id: string): Promise<FileMetadata | null> {
    // Vérification du cache en premier
    const cacheKey = `file:metadata:${id}`;
    const cached = await this.cacheManager.get<FileMetadata>(cacheKey);
    
    if (cached) {
      this.logger.debug(`Cache hit for file ${id}`);
      return cached;
    }
    
    // Fallback sur la base de données
    this.logger.debug(`Cache miss for file ${id}, fetching from database`);
    
    try {
      const file = await this.prisma.file.findUnique({
        where: { id },
        include: {
          user: true,
          project: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1
          },
          accessLogs: {
            orderBy: { accessedAt: 'desc' },
            take: 5
          }
        }
      });
      
      if (!file) {
        return null;
      }
      
      const metadata = this.mapToFileMetadata(file);
      
      // Mise en cache avec TTL adaptatif
      const ttl = this.calculateCacheTTL(file);
      await this.cacheManager.set(cacheKey, metadata, ttl);
      
      return metadata;
      
    } catch (error) {
      this.logger.error(`Failed to find file by id ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche tous les fichiers d'un utilisateur
   * 
   * Implémente la pagination et le tri côté base de données pour
   * optimiser les performances avec de grandes collections.
   * 
   * @param userId - L'identifiant de l'utilisateur
   * @param options - Options de recherche et pagination
   * @returns La liste des métadonnées
   */
  async findByUserId(userId: string, options: FindOptions = {}): Promise<FileMetadata[]> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted = false,
      contentType,
      processingStatus
    } = options;
    
    try {
      // Construction des conditions de requête
      const where: any = {
        userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(contentType && { contentType }),
        ...(processingStatus && { processingStatus })
      };
      
      const files = await this.prisma.file.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          project: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1
          }
        }
      });
      
      return files.map(file => this.mapToFileMetadata(file));
      
    } catch (error) {
      this.logger.error(`Failed to find files for user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche tous les fichiers d'un projet
   * 
   * @param projectId - L'identifiant du projet
   * @param options - Options de recherche et pagination
   * @returns La liste des métadonnées
   */
  async findByProjectId(projectId: string, options: FindOptions = {}): Promise<FileMetadata[]> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted = false,
      contentType,
      processingStatus
    } = options;
    
    try {
      const where: any = {
        projectId,
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(contentType && { contentType }),
        ...(processingStatus && { processingStatus })
      };
      
      const files = await this.prisma.file.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          user: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1
          }
        }
      });
      
      return files.map(file => this.mapToFileMetadata(file));
      
    } catch (error) {
      this.logger.error(`Failed to find files for project ${projectId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Met à jour les métadonnées d'un fichier
   * 
   * Utilise une transaction pour garantir la cohérence et met à jour
   * le cache de manière atomique.
   * 
   * @param id - L'identifiant du fichier à mettre à jour
   * @param updates - Les champs à mettre à jour
   * @returns Les métadonnées mises à jour
   */
  async update(id: string, updates: UpdateFileMetadataDto): Promise<FileMetadata> {
    this.logger.log(`Updating file metadata for ${id}`);
    
    try {
      const updatedFile = await this.prisma.$transaction(async (tx) => {
        // Vérification de l'existence
        const existing = await tx.file.findUnique({ where: { id } });
        if (!existing) {
          throw new Error(`File ${id} not found`);
        }
        
        // Mise à jour
        const file = await tx.file.update({
          where: { id },
          data: {
            ...(updates.filename && { filename: updates.filename }),
            ...(updates.cdnUrl !== undefined && { cdnUrl: updates.cdnUrl }),
            ...(updates.virusScanStatus && { virusScanStatus: updates.virusScanStatus }),
            ...(updates.processingStatus && { processingStatus: updates.processingStatus }),
            ...(updates.metadata && { metadata: { ...existing.metadata, ...updates.metadata } }),
            ...(updates.tags && { tags: updates.tags }),
            ...(updates.deletedAt !== undefined && { deletedAt: updates.deletedAt }),
            ...(updates.versionCount !== undefined && { versionCount: updates.versionCount })
          },
          include: {
            user: true,
            project: true,
            versions: true
          }
        });
        
        // Audit trail
        await tx.fileAudit.create({
          data: {
            fileId: id,
            userId: file.userId,
            action: 'UPDATED',
            metadata: { updates }
          }
        });
        
        return file;
      });
      
      // Invalidation du cache
      await this.invalidateFileCache(id);
      
      return this.mapToFileMetadata(updatedFile);
      
    } catch (error) {
      this.logger.error(`Failed to update file ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Supprime les métadonnées d'un fichier (hard delete)
   * 
   * @param id - L'identifiant du fichier à supprimer
   */
  async delete(id: string): Promise<void> {
    this.logger.warn(`Hard deleting file ${id}`);
    
    try {
      await this.prisma.$transaction(async (tx) => {
        const file = await tx.file.findUnique({ where: { id } });
        if (!file) {
          throw new Error(`File ${id} not found`);
        }
        
        // Suppression des relations en cascade
        await tx.fileVersion.deleteMany({ where: { fileId: id } });
        await tx.fileAccess.deleteMany({ where: { fileId: id } });
        await tx.fileAudit.deleteMany({ where: { fileId: id } });
        await tx.file.delete({ where: { id } });
      });
      
      // Invalidation du cache
      await this.invalidateFileCache(id);
      
    } catch (error) {
      this.logger.error(`Failed to delete file ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche un fichier par sa clé de stockage
   * 
   * @param storageKey - La clé unique de stockage dans Garage S3
   * @returns Les métadonnées ou null
   */
  async findByStorageKey(storageKey: string): Promise<FileMetadata | null> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { storageKey },
        include: {
          user: true,
          project: true,
          versions: true
        }
      });
      
      return file ? this.mapToFileMetadata(file) : null;
      
    } catch (error) {
      this.logger.error(`Failed to find file by storage key ${storageKey}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche des fichiers par checksum
   * 
   * @param checksum - Le checksum MD5 ou SHA256 à rechercher
   * @returns La liste des fichiers correspondants
   */
  async findByChecksum(checksum: string): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.file.findMany({
        where: {
          OR: [
            { checksumMd5: checksum },
            { checksumSha256: checksum }
          ],
          deletedAt: null
        },
        include: {
          user: true,
          project: true
        }
      });
      
      return files.map(file => this.mapToFileMetadata(file));
      
    } catch (error) {
      this.logger.error(`Failed to find files by checksum ${checksum}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche les fichiers en attente de traitement
   * 
   * @returns La liste des fichiers à traiter
   */
  async findPendingProcessing(): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.file.findMany({
        where: {
          processingStatus: ProcessingStatus.PENDING,
          deletedAt: null
        },
        orderBy: { createdAt: 'asc' },
        take: 100, // Limite pour éviter la surcharge
        include: {
          user: true,
          project: true
        }
      });
      
      return files.map(file => this.mapToFileMetadata(file));
      
    } catch (error) {
      this.logger.error(`Failed to find pending processing files: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Recherche les fichiers expirés
   * 
   * @param olderThan - Date limite pour considérer un fichier comme expiré
   * @returns La liste des fichiers expirés
   */
  async findExpiredFiles(olderThan: Date): Promise<FileMetadata[]> {
    try {
      const files = await this.prisma.file.findMany({
        where: {
          createdAt: { lt: olderThan },
          deletedAt: null
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: true,
          project: true
        }
      });
      
      return files.map(file => this.mapToFileMetadata(file));
      
    } catch (error) {
      this.logger.error(`Failed to find expired files: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calcule l'utilisation du stockage pour un utilisateur
   * 
   * Utilise des requêtes SQL optimisées avec agrégations pour
   * éviter de charger toutes les données en mémoire.
   * 
   * @param userId - L'identifiant de l'utilisateur
   * @returns Les statistiques d'utilisation
   */
  async getUserStorageUsage(userId: string): Promise<StorageUsage> {
    const cacheKey = `user:storage:${userId}`;
    const cached = await this.cacheManager.get<StorageUsage>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      // Requête agrégée pour les statistiques
      const [totalStats, byContentType, byStatus] = await Promise.all([
        // Statistiques totales
        this.prisma.file.aggregate({
          where: { userId, deletedAt: null },
          _sum: { size: true },
          _count: true
        }),
        
        // Répartition par type de contenu
        this.prisma.file.groupBy({
          by: ['contentType'],
          where: { userId, deletedAt: null },
          _sum: { size: true },
          _count: true
        }),
        
        // Répartition par statut
        this.prisma.file.groupBy({
          by: ['processingStatus'],
          where: { userId, deletedAt: null },
          _count: true
        })
      ]);
      
      const usage: StorageUsage = {
        totalSize: totalStats._sum.size || 0,
        fileCount: totalStats._count,
        byContentType: byContentType.map(item => ({
          contentType: item.contentType,
          size: item._sum.size || 0,
          count: item._count
        })),
        byProcessingStatus: byStatus.map(item => ({
          status: item.processingStatus,
          count: item._count
        })),
        calculatedAt: new Date()
      };
      
      // Cache pour 5 minutes
      await this.cacheManager.set(cacheKey, usage, FILE_SYSTEM_CONSTANTS.CACHE_TTL.METADATA);
      
      return usage;
      
    } catch (error) {
      this.logger.error(`Failed to calculate user storage usage: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calcule l'utilisation du stockage pour un projet
   * 
   * @param projectId - L'identifiant du projet
   * @returns Les statistiques d'utilisation
   */
  async getProjectStorageUsage(projectId: string): Promise<StorageUsage> {
    const cacheKey = `project:storage:${projectId}`;
    const cached = await this.cacheManager.get<StorageUsage>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      const [totalStats, byContentType, byStatus] = await Promise.all([
        this.prisma.file.aggregate({
          where: { projectId, deletedAt: null },
          _sum: { size: true },
          _count: true
        }),
        
        this.prisma.file.groupBy({
          by: ['contentType'],
          where: { projectId, deletedAt: null },
          _sum: { size: true },
          _count: true
        }),
        
        this.prisma.file.groupBy({
          by: ['processingStatus'],
          where: { projectId, deletedAt: null },
          _count: true
        })
      ]);
      
      const usage: StorageUsage = {
        totalSize: totalStats._sum.size || 0,
        fileCount: totalStats._count,
        byContentType: byContentType.map(item => ({
          contentType: item.contentType,
          size: item._sum.size || 0,
          count: item._count
        })),
        byProcessingStatus: byStatus.map(item => ({
          status: item.processingStatus,
          count: item._count
        })),
        calculatedAt: new Date()
      };
      
      // Cache pour 5 minutes
      await this.cacheManager.set(cacheKey, usage, FILE_SYSTEM_CONSTANTS.CACHE_TTL.METADATA);
      
      return usage;
      
    } catch (error) {
      this.logger.error(`Failed to calculate project storage usage: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Mappe une entité Prisma vers le type FileMetadata
   * 
   * @param file - L'entité Prisma
   * @returns Les métadonnées formatées
   */
  private mapToFileMetadata(file: any): FileMetadata {
    return {
      id: file.id,
      userId: file.userId,
      projectId: file.projectId,
      filename: file.filename,
      originalName: file.originalName,
      contentType: file.contentType,
      size: file.size,
      storageKey: file.storageKey,
      cdnUrl: file.cdnUrl,
      checksumMd5: file.checksumMd5,
      checksumSha256: file.checksumSha256,
      virusScanStatus: file.virusScanStatus,
      processingStatus: file.processingStatus,
      versionCount: file.versionCount,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      deletedAt: file.deletedAt
    };
  }

  /**
   * Calcule le TTL du cache de manière adaptative
   * 
   * Les fichiers récemment accédés ont un TTL plus long.
   * 
   * @param file - L'entité fichier
   * @returns Le TTL en secondes
   */
  private calculateCacheTTL(file: any): number {
    const lastAccess = file.accessLogs?.[0]?.accessedAt;
    if (!lastAccess) {
      return FILE_SYSTEM_CONSTANTS.CACHE_TTL.METADATA;
    }
    
    const hoursSinceAccess = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceAccess < 1) {
      return 3600; // 1 heure pour les fichiers très actifs
    } else if (hoursSinceAccess < 24) {
      return 1800; // 30 minutes pour les fichiers récents
    } else {
      return FILE_SYSTEM_CONSTANTS.CACHE_TTL.METADATA; // 5 minutes par défaut
    }
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