// src/domain/repositories/file-metadata.repository.ts
import { FileMetadata, DocumentType } from '../../types/file-system.types';

/**
 * Options de recherche pour les requêtes de métadonnées de fichiers
 * @interface FindOptions
 */
export interface FindOptions {
  /** Nombre maximum de résultats à retourner */
  limit?: number;
  /** Nombre de résultats à ignorer (pour la pagination) */
  offset?: number;
  /** Champ sur lequel trier les résultats */
  sortBy?: 'createdAt' | 'updatedAt' | 'size' | 'filename';
  /** Ordre de tri */
  sortOrder?: 'asc' | 'desc';
  /** Inclure les fichiers supprimés (soft delete) */
  includeDeleted?: boolean;
  /** Filtrer par type de contenu */
  contentType?: string;
  /** Filtrer par statut de traitement */
  processingStatus?: string;
  /** Filtrer par type de document */
  documentType?: DocumentType;
  /** Filtrer par tags */
  tags?: string[];
}

/**
 * DTO pour la création de métadonnées de fichier
 * @interface CreateFileMetadataDto
 */
export interface CreateFileMetadataDto {
  /** ID de l'utilisateur propriétaire du fichier */
  userId: string;
  /** ID du projet associé (optionnel) */
  projectId?: string;
  /** Nom du fichier stocké */
  filename: string;
  /** Nom original du fichier uploadé */
  originalName: string;
  /** Type MIME du fichier */
  contentType: string;
  /** Taille du fichier en octets */
  size: number;
  /** Clé de stockage unique dans Garage S3 */
  storageKey: string;
  /** URL CDN si distribué */
  cdnUrl?: string;
  /** Checksum MD5 du fichier */
  checksumMd5: string;
  /** Checksum SHA256 du fichier */
  checksumSha256: string;
  /** Type de document */
  documentType?: DocumentType;
  /** Tags pour l'organisation */
  tags?: string[];
  /** Métadonnées additionnelles */
  metadata?: Record<string, any>;
}

/**
 * DTO pour la mise à jour de métadonnées de fichier
 * @interface UpdateFileMetadataDto
 */
export interface UpdateFileMetadataDto {
  /** Nouveau nom de fichier */
  filename?: string;
  /** URL CDN mise à jour */
  cdnUrl?: string;
  /** Statut de scan antivirus */
  virusScanStatus?: string;
  /** Statut de traitement */
  processingStatus?: string;
  /** Type de document mis à jour */
  documentType?: DocumentType;
  /** Tags mis à jour */
  tags?: string[];
  /** Métadonnées additionnelles à mettre à jour */
  metadata?: Record<string, any>;
  /** Date de suppression (soft delete) */
  deletedAt?: Date;
  /** Compteur de versions */
  versionCount?: number;
}

/**
 * Statistiques d'utilisation du stockage
 * @interface StorageUsage
 */
export interface StorageUsage {
  /** Espace total utilisé en octets */
  totalSize: number;
  /** Nombre total de fichiers */
  fileCount: number;
  /** Répartition par type de contenu */
  byContentType: Array<{
    contentType: string;
    size: number;
    count: number;
  }>;
  /** Répartition par type de document */
  byDocumentType: Array<{
    documentType: string;
    size: number;
    count: number;
  }>;
  /** Répartition par statut de traitement */
  byProcessingStatus: Array<{
    status: string;
    count: number;
  }>;
  /** Tags les plus utilisés */
  topTags: Array<{
    tag: string;
    count: number;
  }>;
  /** Date du calcul */
  calculatedAt: Date;
}

/**
 * Interface du repository pour la gestion des métadonnées de fichiers
 *
 * Ce repository gère toutes les opérations liées aux métadonnées des fichiers
 * stockés dans le système. Il sert d'abstraction entre la logique métier
 * et la couche de persistance (base de données).
 *
 * @interface IFileMetadataRepository
 */
export interface IFileMetadataRepository {
  /**
   * Crée une nouvelle entrée de métadonnées de fichier
   *
   * @param metadata - Les données du fichier à créer
   * @returns Une promesse contenant les métadonnées créées avec l'ID généré
   * @throws {ValidationError} Si les données sont invalides
   * @throws {DatabaseError} Si l'insertion échoue
   *
   * @example
   * ```typescript
   * const metadata = await repository.create({
   *   userId: 'user-123',
   *   filename: 'document.pdf',
   *   originalName: 'Mon Document.pdf',
   *   contentType: 'application/pdf',
   *   size: 1048576,
   *   storageKey: 'files/user-123/document.pdf',
   *   checksumMd5: 'abc123...',
   *   checksumSha256: 'def456...',
   *   documentType: DocumentType.PROJECT_DOCUMENT,
   *   tags: ['important', 'project-alpha']
   * });
   * ```
   */
  create(metadata: CreateFileMetadataDto): Promise<FileMetadata>;

  /**
   * Recherche des métadonnées de fichier par ID
   *
   * @param id - L'identifiant unique du fichier
   * @returns Une promesse contenant les métadonnées ou null si non trouvé
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const file = await repository.findById('file-123');
   * if (file) {
   *   console.log(`Fichier trouvé: ${file.filename}`);
   *   console.log(`Type: ${file.documentType}`);
   *   console.log(`Tags: ${file.tags.join(', ')}`);
   * }
   * ```
   */
  findById(id: string): Promise<FileMetadata | null>;

  /**
   * Recherche tous les fichiers d'un utilisateur
   *
   * @param userId - L'identifiant de l'utilisateur
   * @param options - Options de recherche et pagination
   * @returns Une promesse contenant la liste des métadonnées
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const userFiles = await repository.findByUserId('user-123', {
   *   limit: 20,
   *   offset: 0,
   *   sortBy: 'createdAt',
   *   sortOrder: 'desc',
   *   documentType: DocumentType.PROJECT_DOCUMENT,
   *   tags: ['urgent']
   * });
   * ```
   */
  findByUserId(userId: string, options?: FindOptions): Promise<FileMetadata[]>;

  /**
   * Recherche tous les fichiers d'un projet
   *
   * @param projectId - L'identifiant du projet
   * @param options - Options de recherche et pagination
   * @returns Une promesse contenant la liste des métadonnées
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const projectFiles = await repository.findByProjectId('project-456', {
   *   contentType: 'application/pdf',
   *   includeDeleted: false,
   *   tags: ['deliverable']
   * });
   * ```
   */
  findByProjectId(
    projectId: string,
    options?: FindOptions,
  ): Promise<FileMetadata[]>;

  /**
   * Met à jour les métadonnées d'un fichier
   *
   * @param id - L'identifiant du fichier à mettre à jour
   * @param updates - Les champs à mettre à jour
   * @returns Une promesse contenant les métadonnées mises à jour
   * @throws {NotFoundError} Si le fichier n'existe pas
   * @throws {ValidationError} Si les données sont invalides
   * @throws {DatabaseError} Si la mise à jour échoue
   *
   * @example
   * ```typescript
   * const updated = await repository.update('file-123', {
   *   processingStatus: 'completed',
   *   cdnUrl: 'https://cdn.example.com/file-123',
   *   documentType: DocumentType.TEMPLATE,
   *   tags: ['processed', 'ready'],
   *   metadata: { optimized: true }
   * });
   * ```
   */
  update(id: string, updates: UpdateFileMetadataDto): Promise<FileMetadata>;

  /**
   * Supprime les métadonnées d'un fichier (hard delete)
   *
   * Note: Dans la plupart des cas, préférer un soft delete via update()
   * avec deletedAt pour conserver l'historique.
   *
   * @param id - L'identifiant du fichier à supprimer
   * @returns Une promesse void
   * @throws {NotFoundError} Si le fichier n'existe pas
   * @throws {DatabaseError} Si la suppression échoue
   *
   * @example
   * ```typescript
   * await repository.delete('file-123');
   * ```
   */
  delete(id: string): Promise<void>;

  /**
   * Recherche un fichier par sa clé de stockage
   *
   * Utile pour vérifier l'unicité ou retrouver un fichier
   * à partir de sa localisation dans le storage.
   *
   * @param storageKey - La clé unique de stockage dans Garage S3
   * @returns Une promesse contenant les métadonnées ou null
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const file = await repository.findByStorageKey('files/user-123/document.pdf');
   * ```
   */
  findByStorageKey(storageKey: string): Promise<FileMetadata | null>;

  /**
   * Recherche des fichiers par checksum
   *
   * Permet de détecter les doublons ou de retrouver des fichiers
   * identiques dans le système.
   *
   * @param checksum - Le checksum MD5 ou SHA256 à rechercher
   * @returns Une promesse contenant la liste des fichiers correspondants
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const duplicates = await repository.findByChecksum('abc123...');
   * if (duplicates.length > 0) {
   *   console.log('Fichier en double détecté');
   * }
   * ```
   */
  findByChecksum(checksum: string): Promise<FileMetadata[]>;

  /**
   * Recherche des fichiers par tags
   *
   * @param tags - Liste des tags à rechercher
   * @param matchAll - Si true, tous les tags doivent être présents
   * @returns Une promesse contenant la liste des fichiers correspondants
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const urgentFiles = await repository.findByTags(['urgent', 'project-alpha'], false);
   * const criticalFiles = await repository.findByTags(['urgent', 'critical'], true);
   * ```
   */
  findByTags(tags: string[], matchAll?: boolean): Promise<FileMetadata[]>;

  /**
   * Recherche les fichiers en attente de traitement
   *
   * Utilisé par les workers de traitement pour récupérer
   * les fichiers à traiter de manière asynchrone.
   *
   * @returns Une promesse contenant la liste des fichiers à traiter
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const pendingFiles = await repository.findPendingProcessing();
   * for (const file of pendingFiles) {
   *   await processFile(file.id);
   * }
   * ```
   */
  findPendingProcessing(): Promise<FileMetadata[]>;

  /**
   * Recherche les fichiers expirés
   *
   * Identifie les fichiers qui doivent être archivés ou supprimés
   * selon les politiques de rétention.
   *
   * @param olderThan - Date limite pour considérer un fichier comme expiré
   * @returns Une promesse contenant la liste des fichiers expirés
   * @throws {DatabaseError} Si la requête échoue
   *
   * @example
   * ```typescript
   * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * const expiredFiles = await repository.findExpiredFiles(thirtyDaysAgo);
   * ```
   */
  findExpiredFiles(olderThan: Date): Promise<FileMetadata[]>;

  /**
   * Calcule l'utilisation du stockage pour un utilisateur
   *
   * Fournit des statistiques détaillées sur l'utilisation
   * du stockage par un utilisateur spécifique.
   *
   * @param userId - L'identifiant de l'utilisateur
   * @returns Une promesse contenant les statistiques d'utilisation
   * @throws {DatabaseError} Si le calcul échoue
   *
   * @example
   * ```typescript
   * const usage = await repository.getUserStorageUsage('user-123');
   * console.log(`Utilisation totale: ${usage.totalSize} octets`);
   * console.log(`Nombre de fichiers: ${usage.fileCount}`);
   * console.log(`Tags populaires: ${usage.topTags.map(t => t.tag).join(', ')}`);
   * ```
   */
  getUserStorageUsage(userId: string): Promise<StorageUsage>;

  /**
   * Calcule l'utilisation du stockage pour un projet
   *
   * Fournit des statistiques détaillées sur l'utilisation
   * du stockage par un projet spécifique.
   *
   * @param projectId - L'identifiant du projet
   * @returns Une promesse contenant les statistiques d'utilisation
   * @throws {DatabaseError} Si le calcul échoue
   *
   * @example
   * ```typescript
   * const usage = await repository.getProjectStorageUsage('project-456');
   * for (const typeUsage of usage.byContentType) {
   *   console.log(`${typeUsage.contentType}: ${typeUsage.count} fichiers`);
   * }
   * for (const docType of usage.byDocumentType) {
   *   console.log(`${docType.documentType}: ${docType.count} documents`);
   * }
   * ```
   */
  getProjectStorageUsage(projectId: string): Promise<StorageUsage>;
}
