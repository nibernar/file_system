/**
 * Types et interfaces du système de fichiers Coders V1
 * 
 * Ce fichier centralise tous les types TypeScript nécessaires au fonctionnement
 * du composant C-06 File System, conformément aux spécifications 03-06-file-system-specs.md
 * et au référentiel 07-04 Data Models Reference.
 * 
 * @version 1.0
 * @author DevOps Lead
 * @conformsTo 07-04 Data Models Reference
 * @conformsTo 03-06-file-system-specs
 */

// ============================================================================
// ENUMS - Statuts et Classifications
// ============================================================================

/**
 * Statut du scan antivirus d'un fichier
 * 
 * Cycle de vie : PENDING → SCANNING → (CLEAN | INFECTED | ERROR)
 */
export enum VirusScanStatus {
  /** Scan en attente dans la queue */
  PENDING = 'pending',
  
  /** Scan en cours d'exécution */
  SCANNING = 'scanning',
  
  /** Fichier propre, aucune menace détectée */
  CLEAN = 'clean',
  
  /** Malware ou virus détecté, fichier en quarantaine */
  INFECTED = 'infected',
  
  /** Erreur lors du scan (service indisponible, timeout, etc.) */
  ERROR = 'error'
}

/**
 * Statut du traitement d'un fichier
 * 
 * Cycle de vie : PENDING → PROCESSING → (COMPLETED | FAILED | SKIPPED)
 */
export enum ProcessingStatus {
  /** Traitement en attente dans la queue */
  PENDING = 'pending',
  
  /** Traitement en cours (optimisation, thumbnail, etc.) */
  PROCESSING = 'processing',
  
  /** Traitement terminé avec succès */
  COMPLETED = 'completed',
  
  /** Échec du traitement (corruption, format non supporté, etc.) */
  FAILED = 'failed',
  
  /** Traitement volontairement ignoré (format non applicable) */
  SKIPPED = 'skipped'
}

/**
 * Classification des types de documents
 * 
 * Utilisé pour l'organisation et l'application de règles métier spécifiques
 */
export enum DocumentType {
  /** Document générique */
  DOCUMENT = 'document',
  
  /** Template de code ou document */
  TEMPLATE = 'template',
  
  /** Document lié à un projet spécifique */
  PROJECT_DOCUMENT = 'project_document',
  
  /** Document confidentiel avec restrictions d'accès */
  CONFIDENTIAL = 'confidential',
  
  /** Fichier temporaire (suppression automatique) */
  TEMPORARY = 'temporary',
  
  /** Archive ou sauvegarde */
  ARCHIVE = 'archive'
}

/**
 * Types d'opérations sur les fichiers pour le contrôle d'accès
 */
export enum FileOperation {
  /** Lecture du fichier ou de ses métadonnées */
  READ = 'read',
  
  /** Modification du fichier ou de ses métadonnées */
  WRITE = 'write',
  
  /** Suppression du fichier */
  DELETE = 'delete',
  
  /** Partage du fichier (génération URL) */
  SHARE = 'share',
  
  /** Traitement du fichier (optimisation, conversion) */
  PROCESS = 'process'
}

/**
 * Types de changements pour le versioning
 */
export enum VersionChangeType {
  /** Édition manuelle par l'utilisateur */
  MANUAL_EDIT = 'manual_edit',
  
  /** Traitement automatique (optimisation, etc.) */
  AUTO_PROCESSING = 'auto_processing',
  
  /** Restauration depuis une version antérieure */
  RESTORATION = 'restoration',
  
  /** Migration ou conversion de format */
  FORMAT_MIGRATION = 'format_migration'
}

/**
 * Formats d'image supportés pour la conversion
 */
export enum ImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  GIF = 'gif',
  AVIF = 'avif'
}

// ============================================================================
// INTERFACES PRINCIPALES - Entités Métier
// ============================================================================

/**
 * Métadonnées complètes d'un fichier dans le système
 * 
 * Interface principale représentant un fichier avec toutes ses propriétés
 * techniques, métiers et de traçabilité. Correspond à l'entité File en base.
 */
export interface FileMetadata {
  /** Identifiant unique du fichier (UUID) */
  id: string;
  
  /** Identifiant du propriétaire du fichier */
  userId: string;
  
  /** Identifiant du projet associé (optionnel) */
  projectId?: string;
  
  /** Nom de fichier nettoyé et sécurisé */
  filename: string;
  
  /** Nom de fichier original tel qu'uploadé */
  originalName: string;
  
  /** Type MIME du fichier (ex: application/pdf, image/jpeg) */
  contentType: string;
  
  /** Taille du fichier en octets */
  size: number;
  
  /** Clé de stockage dans Garage S3 (chemin interne) */
  storageKey: string;
  
  /** URL CDN pour l'accès public optimisé (optionnel) */
  cdnUrl?: string;
  
  /** Empreinte MD5 pour l'intégrité */
  checksumMd5: string;
  
  /** Empreinte SHA256 pour la sécurité */
  checksumSha256: string;
  
  /** Statut du scan antivirus */
  virusScanStatus: VirusScanStatus;
  
  /** Statut du traitement (optimisation, thumbnails, etc.) */
  processingStatus: ProcessingStatus;
  
  /** Classification métier du document */
  documentType: DocumentType;
  
  /** Nombre de versions créées pour ce fichier */
  versionCount: number;
  
  /** Tags pour l'organisation et la recherche */
  tags: string[];
  
  /** Date de création */
  createdAt: Date;
  
  /** Date de dernière modification */
  updatedAt: Date;
  
  /** Date de suppression (soft delete) */
  deletedAt?: Date;
}

/**
 * Version d'un fichier pour l'historique et la traçabilité
 * 
 * Chaque modification importante d'un fichier crée une nouvelle version
 * permettant la restauration et l'audit des changements.
 */
export interface FileVersion {
  /** Identifiant unique de la version */
  id: string;
  
  /** Identifiant du fichier parent */
  fileId: string;
  
  /** Numéro de version (séquentiel, commence à 1) */
  versionNumber: number;
  
  /** Clé de stockage de cette version spécifique */
  storageKey: string;
  
  /** Taille de cette version en octets */
  size: number;
  
  /** Empreinte pour vérifier l'intégrité de la version */
  checksum: string;
  
  /** Description du changement (fournie par l'utilisateur ou système) */
  changeDescription?: string;
  
  /** Type de changement ayant déclenché cette version */
  changeType: VersionChangeType;
  
  /** Identifiant de l'utilisateur ayant créé cette version */
  createdBy: string;
  
  /** Date de création de la version */
  createdAt: Date;
  
  /** Indique si cette version est la version active/courante */
  isActive: boolean;
}

/**
 * Log d'accès à un fichier pour l'audit et la sécurité
 * 
 * Chaque opération sur un fichier est tracée pour la sécurité,
 * la compliance et l'analyse d'usage.
 */
export interface FileAccess {
  /** Identifiant unique du log d'accès */
  id: string;
  
  /** Identifiant du fichier accédé */
  fileId: string;
  
  /** Identifiant de l'utilisateur (null si accès anonyme via URL) */
  userId?: string;
  
  /** Type d'opération effectuée */
  operation: FileOperation;
  
  /** Adresse IP d'origine de la requête */
  ipAddress: string;
  
  /** User-Agent du client */
  userAgent: string;
  
  /** Résultat de l'opération */
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  
  /** Message d'erreur en cas d'échec */
  errorMessage?: string;
  
  /** Métadonnées additionnelles sur l'accès */
  metadata: Record<string, any>;
  
  /** Timestamp de l'accès */
  timestamp: Date;
}

// ============================================================================
// INTERFACES DE TRAITEMENT - Processing et Jobs
// ============================================================================

/**
 * Job de traitement asynchrone d'un fichier
 * 
 * Représente une tâche de traitement en cours ou terminée dans la queue
 */
export interface ProcessingJob {
  /** Identifiant unique du job */
  id: string;
  
  /** Identifiant du fichier à traiter */
  fileId: string;
  
  /** Type de traitement à effectuer */
  jobType: ProcessingJobType;
  
  /** Priorité du job (1-10, 10 = highest) */
  priority: number;
  
  /** Statut actuel du job */
  status: ProcessingJobStatus;
  
  /** Progression du traitement (0-100) */
  progress: number;
  
  /** Options de traitement spécifiques */
  options: ProcessingOptions;
  
  /** Résultat du traitement (si terminé) */
  result?: ProcessingResult;
  
  /** Message d'erreur (si échec) */
  errorMessage?: string;
  
  /** Durée d'exécution en millisecondes */
  executionTime?: number;
  
  /** Date de création du job */
  createdAt: Date;
  
  /** Date de début d'exécution */
  startedAt?: Date;
  
  /** Date de fin d'exécution */
  completedAt?: Date;
}

/**
 * Types de jobs de traitement disponibles
 */
export enum ProcessingJobType {
  /** Traitement complet post-upload */
  FULL_PROCESSING = 'full_processing',
  
  /** Optimisation d'image uniquement */
  IMAGE_OPTIMIZATION = 'image_optimization',
  
  /** Génération de thumbnail */
  THUMBNAIL_GENERATION = 'thumbnail_generation',
  
  /** Optimisation PDF */
  PDF_OPTIMIZATION = 'pdf_optimization',
  
  /** Conversion de format */
  FORMAT_CONVERSION = 'format_conversion',
  
  /** Re-scan antivirus */
  VIRUS_RESCAN = 'virus_rescan'
}

/**
 * Statuts des jobs de traitement
 */
export enum ProcessingJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Options configurables pour le traitement
 */
export interface ProcessingOptions {
  /** Générer un thumbnail automatiquement */
  generateThumbnail?: boolean;
  
  /** Optimiser pour l'affichage web */
  optimizeForWeb?: boolean;
  
  /** Extraire les métadonnées du fichier */
  extractMetadata?: boolean;
  
  /** Niveau de qualité pour les images (0-100) */
  imageQuality?: number;
  
  /** Formats de thumbnail à générer */
  thumbnailFormats?: ImageFormat[];
  
  /** Niveau de compression PDF (0-9) */
  pdfCompressionLevel?: number;
  
  /** Forcer le re-traitement même si déjà traité */
  forceReprocess?: boolean;
  priority?: number;
  urgent?: boolean;
  reason?: string;
}

/**
 * Résultat détaillé d'un traitement
 */
export interface ProcessingResult {
  /** Indique si le traitement s'est bien déroulé */
  success: boolean;
  
  /** Optimisations appliquées */
  optimizations?: FileOptimizations;
  
  /** URL du thumbnail généré */
  thumbnailUrl?: string;
  
  /** Métadonnées extraites du fichier */
  extractedMetadata?: Record<string, any>;
  
  /** Détails de la conversion de format */
  formatConversion?: FormatConversionResult;
  
  /** Résultat du scan sécurité */
  securityScan?: SecurityScanResult;
  
  /** Temps total de traitement en millisecondes */
  processingTime: number;
  metadata?: FileMetadata;
}

/**
 * Détails des optimisations appliquées à un fichier
 */
export interface FileOptimizations {
  /** Taille originale en octets */
  originalSize: number;
  
  /** Taille après optimisation en octets */
  optimizedSize: number;
  
  /** Ratio de compression (optimizedSize / originalSize) */
  compressionRatio: number;
  
  /** Techniques d'optimisation appliquées */
  techniques: string[];
  
  /** Gain en pourcentage */
  spaceSavingPercent: number;
}

/**
 * Données pour job de génération de thumbnail
 */
export interface ThumbnailJobData {
  fileId: string;
  sizes: string | string[];
  format?: string;
  quality?: number;
}

/**
 * Données pour job de conversion
 */
export interface ConversionJobData {
  fileId: string;
  targetFormat: string;
  options?: any;
}

// ============================================================================
// INTERFACES SÉCURITÉ - Security et Validation
// ============================================================================

/**
 * Résultat de validation sécurité lors de l'upload
 */
export interface SecurityValidation {
  /** Indique si la validation a réussi */
  passed: boolean;
  
  /** Liste des menaces détectées */
  threats: SecurityThreat[];
  
  /** Mesures de mitigation appliquées */
  mitigations: string[];
  
  /** Identifiant du scan pour traçabilité */
  scanId: string;
  
  /** Score de confiance (0-100, 100 = totalement sûr) */
  confidenceScore?: number;
  
  /** Détails additionnels sur l'analyse */
  details?: Record<string, any>;
}

/**
 * Types de menaces de sécurité détectables
 */
export enum SecurityThreat {
  /** Format de fichier invalide ou non autorisé */
  INVALID_FORMAT = 'invalid_format',
  
  /** Malware ou virus détecté */
  MALWARE_DETECTED = 'malware_detected',
  
  /** Contenu suspect (scripts malveillants, etc.) */
  SUSPICIOUS_CONTENT = 'suspicious_content',
  
  /** Fichier trop volumineux */
  FILE_TOO_LARGE = 'file_too_large',
  
  /** Limite de taux d'upload dépassée */
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  
  /** Tentative d'injection de code */
  CODE_INJECTION_ATTEMPT = 'code_injection_attempt',
  
  /** Métadonnées suspectes */
  SUSPICIOUS_METADATA = 'suspicious_metadata'
}

/**
 * Résultat détaillé du scan antivirus
 */
export interface SecurityScanResult {
  /** Fichier est-il propre ? */
  safe: boolean;
  
  /** Noms des menaces détectées */
  threatsFound: string[];
  
  /** Version de l'engine antivirus utilisé */
  engineVersion: string;
  
  /** Date des signatures virales */
  signaturesDate: Date;
  
  /** Durée du scan en millisecondes */
  scanDuration: number;
  
  /** Date et heure du scan */
  scannedAt: Date;
  
  /** Détails techniques du scan */
  scanDetails?: Record<string, any>;
}

// ============================================================================
// INTERFACES STOCKAGE - Storage et CDN
// ============================================================================

/**
 * Résultat d'une opération d'upload vers le storage
 */
export interface UploadResult {
  /** Identifiant unique de l'upload */
  uploadId: string;
  
  /** Clé de stockage générée */
  storageKey: string;
  
  /** ETag retourné par le storage */
  etag: string;
  
  /** URL directe vers le fichier (si accessible) */
  location: string;
  
  /** Métadonnées du fichier uploadé */
  metadata: FileMetadata;
  
  /** Durée de l'upload en millisecondes */
  uploadDuration: number;
}

/**
 * Résultat d'une opération de téléchargement
 */
export interface DownloadResult {
  /** Contenu du fichier */
  body: Buffer;
  
  /** Métadonnées du fichier */
  metadata: {
    contentType: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
  };
  
  /** Indique si le contenu vient du cache */
  fromCache: boolean;
}

/**
 * Options pour la génération d'URLs pré-signées
 */
export interface PresignedUrlOptions {
  /** Clé du fichier à cibler */
  key: string;

  /** Type d'opération autorisée */
  operation: 'GET' | 'PUT' | 'DELETE';
  
  /** Durée de validité en secondes */
  expiresIn: number;
  
  /** Restriction par adresses IP */
  ipRestriction?: string[];
  
  /** Restriction par User-Agent */
  userAgent?: string;
  
  /** Permissions personnalisées */
  customPermissions?: Permission[];
  
  /** Forcer téléchargement (Content-Disposition: attachment) */
  forceDownload?: boolean;
}

/**
 * URL pré-signée sécurisée avec métadonnées
 */
export interface PresignedUrl {
  /** URL pré-signée complète */
  url: string;
  
  /** Date d'expiration */
  expiresAt: Date;
  
  /** Restrictions appliquées */
  restrictions: {
    ipAddress?: string[];
    userAgent?: string;
    operations: string[];
  };
  
  /** Token de sécurité pour validation */
  securityToken?: string;
}

/**
 * Résultat de distribution CDN
 */
export interface DistributionResult {
  /** URL CDN finale */
  cdnUrl: string;
  
  /** Emplacements edge où le fichier est distribué */
  edgeLocations: string[];
  
  /** Configuration de cache appliquée */
  cacheControl: string;
  
  /** Temps estimé de propagation en secondes */
  estimatedPropagationTime: number;
  
  /** Identifiant de la distribution */
  distributionId: string;
}

/**
 * Métadonnées d'un objet pour les opérations de storage bas niveau
 */
export interface ObjectMetadata {
  /** Type MIME du fichier */
  contentType: string;
  
  /** Identifiant du propriétaire */
  userId: string;
  
  /** Identifiant du projet associé (optionnel) */
  projectId?: string;
  
  /** Métadonnées personnalisées arbitraires */
  customMetadata?: Record<string, string>;
}

/**
 * Informations sur un objet stocké (métadonnées sans le contenu)
 */
export interface ObjectInfo {
  /** Clé de l'objet dans le storage */
  key: string;
  
  /** Taille en octets */
  size: number;
  
  /** Type MIME */
  contentType: string;
  
  /** ETag pour l'intégrité */
  etag: string;
  
  /** Date de dernière modification */
  lastModified: Date;
  
  /** Métadonnées personnalisées */
  customMetadata: Record<string, string>;
}

/**
 * Liste d'objets avec pagination (pour listObjects)
 */
export interface ObjectList {
  /** Objets de la page courante */
  objects: Array<{
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
  }>;
  
  /** Indique s'il y a plus d'objets */
  truncated: boolean;
  
  /** Token pour la page suivante */
  nextToken?: string;
  
  /** Nombre total d'objets dans cette page */
  totalCount: number;
}

/**
 * Session d'upload multipart pour gros fichiers
 */
export interface MultipartUpload {
  /** Identifiant unique de la session */
  uploadId: string;
  
  /** Clé de l'objet final */
  key: string;
  
  /** Nom du bucket */
  bucket: string;
}

/**
 * Résultat d'upload d'une partie multipart
 */
export interface PartUploadResult {
  /** Numéro de la partie */
  partNumber: number;
  
  /** ETag de la partie */
  etag: string;
  
  /** Taille de la partie */
  size: number;
}

/**
 * Partie complétée pour finaliser un multipart upload
 */
export interface CompletedPart {
  /** Numéro de la partie */
  partNumber: number;
  
  /** ETag de la partie */
  etag: string;
  
  /** Taille de la partie (optionnel) */
  size?: number;
}

/**
 * Résultat d'une opération de copie d'objet
 */
export interface CopyResult {
  /** Clé source */
  sourceKey: string;
  
  /** Clé de destination */
  destinationKey: string;
  
  /** ETag du fichier copié */
  etag: string;
  
  /** Date de dernière modification */
  lastModified: Date;
}

/**
 * Alias pour la compatibilité avec PresignedUrl existant
 */
export interface PresignedUrlResult extends PresignedUrl {
  /** Operation pour compatibilité */
  operation: string;
}

// ============================================================================
// TYPES UTILITAIRES - DTOs et Helpers
// ============================================================================

/**
 * DTO pour l'upload d'un fichier
 */
export interface UploadFileDto {
  /** Nom du fichier */
  filename: string;
  
  /** Type MIME */
  contentType: string;
  
  /** Taille en octets */
  size: number;
  
  /** Contenu du fichier */
  buffer: Buffer;
  
  /** Classification du document */
  documentType: DocumentType;
  
  /** Projet associé (optionnel) */
  projectId?: string;
  
  /** Tags pour organisation */
  tags?: string[];
  
  /** Empreinte SHA256 pour validation intégrité */
  checksumSha256?: string;
}

/**
 * Options pour la liste des fichiers utilisateur
 */
export interface GetUserFilesOptions {
  /** Page pour la pagination (commence à 1) */
  page: number;
  
  /** Nombre d'éléments par page */
  limit: number;
  
  /** Champ de tri */
  sortBy: keyof FileMetadata;
  
  /** Ordre de tri */
  sortOrder: 'asc' | 'desc';
  
  /** Filtrage par type de contenu */
  contentType?: string;
  
  /** Filtrage par statut de traitement */
  processingStatus?: ProcessingStatus;
  
  /** Filtrage par projet */
  projectId?: string;
  
  /** Filtrage par tags */
  tags?: string[];
  
  /** Inclure les fichiers supprimés (soft delete) */
  includeDeleted?: boolean;
}

/**
 * Liste paginée de fichiers
 */
export interface PaginatedFileList {
  /** Fichiers de la page courante */
  files: FileMetadata[];
  
  /** Informations de pagination */
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  
  /** Statistiques d'utilisation */
  stats?: {
    totalSize: number;
    fileCount: number;
    lastActivity: Date;
  };
}

/**
 * Statistiques d'utilisation du stockage
 */
export interface StorageUsage {
  /** Utilisateur concerné */
  userId: string;
  
  /** Espace total utilisé en octets */
  usedBytes: number;
  
  /** Nombre total de fichiers */
  fileCount: number;
  
  /** Breakdown par type de fichier */
  byContentType: Array<{
    contentType: string;
    count: number;
    totalSize: number;
  }>;
  
  /** Breakdown par projet */
  byProject: Array<{
    projectId: string;
    count: number;
    totalSize: number;
  }>;
  
  /** Date de dernière mise à jour */
  lastUpdated: Date;
}

/**
 * Options pour la suppression de fichier
 */
export interface DeleteFileOptions {
  /** Suppression définitive (false = soft delete) */
  hardDelete?: boolean;
  
  /** Raison de la suppression */
  reason?: string;
  
  /** Durée de rétention avant suppression définitive (jours) */
  retentionDays?: number;
  
  /** Notifier l'utilisateur de la suppression */
  notifyUser?: boolean;
}

/**
 * Résultat d'une conversion de format
 */
export interface FormatConversionResult {
  /** Format source */
  fromFormat: string;
  
  /** Format de destination */
  toFormat: string;
  
  /** Taille avant conversion */
  originalSize: number;
  
  /** Taille après conversion */
  convertedSize: number;
  
  /** Qualité préservée (0-100) */
  qualityRetained: number;
  
  /** Durée de conversion en millisecondes */
  conversionTime: number;
  
  /** Succès de la conversion */
  success: boolean;
  
  /** Message d'erreur si échec */
  errorMessage?: string;
}

/**
 * Permission granulaire pour le contrôle d'accès
 */
export interface Permission {
  /** Type d'opération */
  operation: FileOperation;
  
  /** Conditions d'application */
  conditions?: {
    timeRange?: {
      start: Date;
      end: Date;
    };
    ipRange?: string[];
    userRoles?: string[];
  };
  
  /** Accordée ou refusée */
  granted: boolean;
}

// ============================================================================
// TYPES DE CONFIGURATION - Extension pour runtime
// ============================================================================

/**
 * Configuration runtime pour une instance de service
 */
export interface ServiceRuntimeConfig {
  /** Niveau de logging */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  /** Métriques activées */
  metricsEnabled: boolean;
  
  /** Mode de développement */
  developmentMode: boolean;
  
  /** Timeout global pour les opérations en millisecondes */
  operationTimeout: number;
  
  /** Retry policy */
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
    exponentialBackoff: boolean;
  };
}

/**
 * Métadonnées d'un bucket de stockage
 */
export interface BucketInfo {
  /** Nom du bucket */
  name: string;
  
  /** Région du bucket */
  region: string;
  
  /** Date de création */
  creationDate: Date;
  
  /** Statistiques d'utilisation */
  usage: {
    objectCount: number;
    totalSize: number;
    lastModified: Date;
  };
  
  /** Configuration de versioning */
  versioning: boolean;
  
  /** Politiques de lifecycle */
  lifecycle?: Array<{
    rule: string;
    days: number;
    action: 'delete' | 'archive';
  }>;
}

// ============================================================================
// TYPES GUARDS ET UTILITAIRES
// ============================================================================

/**
 * Type guard pour vérifier si un objet est une FileMetadata valide
 */
export function isFileMetadata(obj: any): obj is FileMetadata {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.userId === 'string' &&
    typeof obj.filename === 'string' &&
    typeof obj.contentType === 'string' &&
    typeof obj.size === 'number' &&
    Object.values(VirusScanStatus).includes(obj.virusScanStatus) &&
    Object.values(ProcessingStatus).includes(obj.processingStatus)
  );
}

/**
 * Type guard pour vérifier si un objet est un ProcessingResult valide
 */
export function isProcessingResult(obj: any): obj is ProcessingResult {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  return (
    typeof obj.success === 'boolean' &&
    typeof obj.processingTime === 'number'
  );
}

/**
 * Utility type pour les propriétés partielles avec ID requis
 */
export type PartialWithId<T> = Partial<T> & { id: string };

/**
 * Utility type pour les opérations de création (sans ID ni timestamps)
 */
export type CreateDto<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Utility type pour les opérations de mise à jour (ID requis, autres optionnels)
 */
export type UpdateDto<T> = PartialWithId<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

// ============================================================================
// CONSTANTS TYPES - Pour éviter magic strings
// ============================================================================

/**
 * Types MIME supportés par le système
 */
export const SUPPORTED_MIME_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  DOCUMENTS: ['application/pdf', 'application/msword', 'text/plain'] as const,
  TEMPLATES: ['text/markdown', 'application/json'] as const,
} as const;

/**
 * Tailles de fichier standard
 */
export const FILE_SIZES = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  MAX_UPLOAD: 100 * 1024 * 1024, // 100MB
} as const;

/**
 * Durées standard en millisecondes
 */
export const DURATIONS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// ============================================================================
// AJOUTS POUR SERVICES SÉCURITÉ - Types manquants seulement
// ============================================================================

/**
 * Validation du format de fichier
 */
export interface FormatValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedMimeType: string;
  actualMimeType: string | null;
  fileSignature: string | null;
}

/**
 * Validation du type MIME
 */
export interface MimeTypeValidation {
  valid: boolean;
  declaredType: string;
  detectedType: string | null;
  mismatch: boolean;
  supportedType: boolean;
}

/**
 * Validation du contenu de fichier
 */
export interface ContentValidation {
  safe: boolean;
  threats: string[];
  warnings: string[];
  metadata: Record<string, any>;
  analysis: Record<string, any>;
}

/**
 * Résultat scan antivirus détaillé pour le service
 */
export interface VirusScanResult {
  clean: boolean;
  threats?: string[];
  scanId: string;
  fileHash: string;
  scanDate: Date;
  scanDuration: number;
  scannerVersion: string;
  attempt?: number;
  details?: Record<string, any>;
}

/**
 * Résultat rate limiting
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  resetAt: Date;
  retryAfter?: number;
}

/**
 * URL pré-signée sécurisée étendue
 */
export interface SecurePresignedUrl extends PresignedUrl {
  restrictions: {
    ipAddress?: string[];
    userAgent?: string;
    operations: string[];
  };
  securityToken: string;
  auditId: string;
}

/**
 * Résultat quarantaine fichier
 */
export interface QuarantineResult {
  quarantineId: string;
  fileId: string;
  reason: string;
  threats: string[];
  quarantineDate: Date;
  automaticAction: boolean;
}

/**
 * Interface pour les informations d'intelligence IP
 * Utilisée par le middleware de sécurité pour analyser les adresses IP
 */
export interface IpIntelligence {
  /** Adresse IP analysée */
  ip: string;
  
  /** Niveau de menace évalué */
  threatLevel: 'low' | 'medium' | 'high';
  
  /** Détection VPN */
  isVpn: boolean;
  
  /** Détection réseau Tor */
  isTor: boolean;
  
  /** Détection proxy */
  isProxy: boolean;
  
  /** Détection hébergement (datacenter) */
  isHosting: boolean;
  
  /** Code pays ISO 2 lettres */
  countryCode: string;
  
  /** Nom du pays complet */
  country: string;
  
  /** Numéro de système autonome (optionnel) */
  asn?: string;
  
  /** Fournisseur d'accès Internet (optionnel) */
  isp?: string;
  
  /** Date de dernière observation (optionnel) */
  lastSeen?: Date;
  
  /** Score de risque de 0 à 100 (optionnel) */
  riskScore?: number;
  
  /** Détails supplémentaires sur la géolocalisation */
  geolocation?: {
    city?: string;
    region?: string;
    timezone?: string;
    latitude?: number;
    longitude?: number;
  };
  
  /** Métadonnées additionnelles */
  metadata?: Record<string, any>;
}

/**
 * Options avancées de versioning pour les fichiers
 */
export interface VersionOptions {
  createVersion: boolean;
  versionComment?: string;
  keepOldVersions: boolean;
  maxVersions?: number;
  changeType: VersionChangeType;
  namingStrategy?: 'sequential' | 'timestamp' | 'semantic';
  description?: string;
  userId?: string;
}

/**
 * Résultat d'un job dans la queue de traitement
 */
export interface QueueJobResult {
  jobId: string | number;
  status: ProcessingJobStatus;
  result?: ProcessingResult;
  error?: string;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  metadata?: Record<string, any>;
  estimatedDuration?: number;
  queuePosition?: number;
  priority?: number;
  createdAt?: Date;
}

/**
 * Données spécifiques pour les jobs de traitement
 */
export interface ProcessingJobData extends ProcessingJob {
  fileData?: {
    buffer: Buffer;
    metadata: FileMetadata;
  };
  runtimeConfig?: ServiceRuntimeConfig;
  executionContext?: {
    workerId: string;
    nodeId: string;
    environment: string;
  };
  progressCallback?: (progress: number) => void;
  // NOUVELLES PROPRIÉTÉS
  userId?: string;
  reason?: string;
}

/**
 * Options étendues de traitement avec configuration avancée
 */
export interface ExtendedProcessingOptions extends ProcessingOptions {
  retryConfig?: {
    maxAttempts: number;
    backoffMs: number;
    exponentialBackoff: boolean;
  };
  timeout?: number;
  priority?: number;
  debug?: boolean;
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
  typeSpecific?: {
    image?: {
      preserveExif?: boolean;
      autoOrient?: boolean;
      progressive?: boolean;
    };
    pdf?: {
      linearize?: boolean;
      removeMetadata?: boolean;
      flattenForms?: boolean;
    };
    document?: {
      detectEncoding?: boolean;
      normalizeLineEndings?: boolean;
    };
  };
  userId?: string;
  reason?: string;
}

/**
 * DTO pour mise à jour des métadonnées d'un fichier
 */
export interface UpdateFileMetadataDto {
  filename?: string;
  tags?: string[];
  documentType?: DocumentType;
  projectId?: string;
  customMetadata?: Record<string, any>;
  force?: boolean;
  processingStatus?: ProcessingStatus;
}

/**
 * Résultat de génération de miniature
 */
export interface LocalThumbnailResult {
  /** Succès de la génération */
  success: boolean;
  
  /** URL du thumbnail principal */
  url: string;
  
  /** Clé de stockage */
  storageKey?: string;
  
  /** Largeur en pixels */
  width: number;
  
  /** Hauteur en pixels */
  height: number;
  
  /** Format du thumbnail */
  format: ImageFormat;
  
  /** Taille en bytes */
  size: number;
  
  /** Qualité appliquée */
  quality: number;
  
  /** Dimensions du thumbnail */
  dimensions?: {
    width: number;
    height: number;
  };
  
  /** Formats générés */
  formats?: Array<{
    format: ImageFormat;
    url: string;
    size: number;
  }>;
  
  /** Message d'erreur si échec */
  error?: string;
}

export interface ConversionResult extends FormatConversionResult {
}

export interface ThumbnailResult {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  format: ImageFormat;
  size: number;
  generationTime: number;
  quality: number;
  variants?: LocalThumbnailResult[];
}

export type FileSystemConfig = import('../config/file-system.config').FileSystemConfig;