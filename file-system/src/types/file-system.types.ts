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
  PENDING = 'pending',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  INFECTED = 'infected',
  ERROR = 'error',
}

/**
 * Statut du traitement d'un fichier
 *
 * Cycle de vie : PENDING → PROCESSING → (COMPLETED | FAILED | SKIPPED)
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Classification des types de documents
 *
 * Utilisé pour l'organisation et l'application de règles métier spécifiques
 */
export enum DocumentType {
  DOCUMENT = 'document',
  TEMPLATE = 'template',
  PROJECT_DOCUMENT = 'project_document',
  CONFIDENTIAL = 'confidential',
  TEMPORARY = 'temporary',
  ARCHIVE = 'archive',
}

/**
 * Types d'opérations sur les fichiers pour le contrôle d'accès
 */
export enum FileOperation {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  SHARE = 'share',
  PROCESS = 'process',
}

/**
 * Types de changements pour le versioning
 */
export enum VersionChangeType {
  MANUAL_EDIT = 'manual_edit',
  AUTO_PROCESSING = 'auto_processing',
  RESTORATION = 'restoration',
  FORMAT_MIGRATION = 'format_migration',
}

/**
 * Formats d'image supportés pour la conversion
 */
export enum ImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  GIF = 'gif',
  AVIF = 'avif',
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
  id: string;
  userId: string;
  projectId?: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  storageKey: string;
  cdnUrl?: string;
  checksumMd5: string;
  checksumSha256: string;
  virusScanStatus: VirusScanStatus;
  processingStatus: ProcessingStatus;
  documentType: DocumentType;
  versionCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Version d'un fichier pour l'historique et la traçabilité
 *
 * Chaque modification importante d'un fichier crée une nouvelle version
 * permettant la restauration et l'audit des changements.
 */
export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  storageKey: string;
  size: number;
  checksum: string;
  changeDescription?: string;
  changeType: VersionChangeType;
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}

/**
 * Log d'accès à un fichier pour l'audit et la sécurité
 *
 * Chaque opération sur un fichier est tracée pour la sécurité,
 * la compliance et l'analyse d'usage.
 */
export interface FileAccess {
  id: string;
  fileId: string;
  userId?: string;
  operation: FileOperation;
  ipAddress: string;
  userAgent: string;
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  errorMessage?: string;
  metadata: Record<string, any>;
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
  id: string;
  fileId: string;
  jobType: ProcessingJobType;
  priority: number;
  status: ProcessingJobStatus;
  progress: number;
  options: ProcessingOptions;
  result?: ProcessingResult;
  errorMessage?: string;
  executionTime?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Types de jobs de traitement disponibles
 */
export enum ProcessingJobType {
  FULL_PROCESSING = 'full_processing',
  IMAGE_OPTIMIZATION = 'image_optimization',
  THUMBNAIL_GENERATION = 'thumbnail_generation',
  PDF_OPTIMIZATION = 'pdf_optimization',
  FORMAT_CONVERSION = 'format_conversion',
  VIRUS_RESCAN = 'virus_rescan',
}

/**
 * Statuts des jobs de traitement
 */
export enum ProcessingJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Options configurables pour le traitement
 */
export interface ProcessingOptions {
  generateThumbnail?: boolean;
  optimizeForWeb?: boolean;
  extractMetadata?: boolean;
  imageQuality?: number;
  thumbnailFormats?: ImageFormat[];
  pdfCompressionLevel?: number;
  forceReprocess?: boolean;
  priority?: number;
  urgent?: boolean;
  reason?: string;
}

/**
 * Résultat détaillé d'un traitement
 */
export interface ProcessingResult {
  success: boolean;
  optimizations?: FileOptimizations;
  thumbnailUrl?: string;
  extractedMetadata?: Record<string, any>;
  formatConversion?: FormatConversionResult;
  securityScan?: SecurityScanResult;
  processingTime: number;
  metadata?: FileMetadata;
}

/**
 * Détails des optimisations appliquées à un fichier
 */
export interface FileOptimizations {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  techniques: string[];
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
  passed: boolean;
  threats: SecurityThreat[];
  mitigations: string[];
  scanId: string;
  confidenceScore?: number;
  details?: Record<string, any>;
}

/**
 * Types de menaces de sécurité détectables
 */
export enum SecurityThreat {
  INVALID_FORMAT = 'invalid_format',
  MALWARE_DETECTED = 'malware_detected',
  SUSPICIOUS_CONTENT = 'suspicious_content',
  FILE_TOO_LARGE = 'file_too_large',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

/**
 * Résultat détaillé du scan antivirus
 */
export interface SecurityScanResult {
  safe: boolean;
  threatsFound: string[];
  engineVersion: string;
  signaturesDate: Date;
  scanDuration: number;
  scannedAt: Date;
  scanDetails?: Record<string, any>;
}

// ============================================================================
// INTERFACES STOCKAGE - Storage et CDN
// ============================================================================

/**
 * Résultat d'une opération d'upload vers le storage
 */
export interface UploadResult {
  uploadId: string;
  storageKey: string;
  etag: string;
  location: string;
  metadata: FileMetadata;
  uploadDuration: number;
}

/**
 * Résultat d'une opération de téléchargement
 */
export interface DownloadResult {
  body: Buffer;
  metadata: {
    contentType: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
  };
  fromCache: boolean;
}

/**
 * Options pour la génération d'URLs pré-signées
 */
export interface PresignedUrlOptions {
  key: string;
  operation: 'GET' | 'PUT' | 'DELETE';
  expiresIn: number;
  ipRestriction?: string[];
  userAgent?: string;
  // customPermissions?: Permission[];
  forceDownload?: boolean;
}

/**
 * URL pré-signée sécurisée avec métadonnées
 */
export interface PresignedUrl {
  url: string;
  expiresAt: Date;
  restrictions: {
    ipAddress?: string[];
    userAgent?: string;
    operations: string[];
  };
  securityToken?: string;
}

/**
 * Métadonnées d'un objet pour les opérations de storage bas niveau
 */
export interface ObjectMetadata {
  contentType: string;
  userId: string;
  projectId?: string;
  customMetadata?: Record<string, string>;
}

/**
 * Informations sur un objet stocké (métadonnées sans le contenu)
 */
export interface ObjectInfo {
  key: string;
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  customMetadata: Record<string, string>;
}

/**
 * Liste d'objets avec pagination (pour listObjects)
 */
export interface ObjectList {
  objects: Array<{
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
  }>;
  truncated: boolean;
  nextToken?: string;
  totalCount: number;
}

/**
 * Session d'upload multipart pour gros fichiers
 */
export interface MultipartUpload {
  uploadId: string;
  key: string;
  bucket: string;
}

/**
 * Résultat d'upload d'une partie multipart
 */
export interface PartUploadResult {
  partNumber: number;
  etag: string;
  size: number;
}

/**
 * Partie complétée pour finaliser un multipart upload
 */
export interface CompletedPart {
  partNumber: number;
  etag: string;
  size?: number;
}

/**
 * Résultat d'une opération de copie d'objet
 */
export interface CopyResult {
  sourceKey: string;
  destinationKey: string;
  etag: string;
  lastModified: Date;
}

// ============================================================================
// TYPES UTILITAIRES - DTOs et Helpers
// ============================================================================

/**
 * DTO pour l'upload d'un fichier
 */
export interface UploadFileDto {
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
  documentType: DocumentType;
  projectId?: string;
  tags?: string[];
  checksumSha256?: string;
}

/**
 * Options pour la liste des fichiers utilisateur
 */
export interface GetUserFilesOptions {
  page: number;
  limit: number;
  sortBy: keyof FileMetadata;
  sortOrder: 'asc' | 'desc';
  contentType?: string;
  processingStatus?: ProcessingStatus;
  projectId?: string;
  tags?: string[];
  includeDeleted?: boolean;
}

/**
 * Liste paginée de fichiers
 */
export interface PaginatedFileList {
  files: FileMetadata[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
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
  userId: string;
  usedBytes: number;
  fileCount: number;
  byContentType: Array<{
    contentType: string;
    count: number;
    totalSize: number;
  }>;
  byProject: Array<{
    projectId: string;
    count: number;
    totalSize: number;
  }>;
  lastUpdated: Date;
}

/**
 * Résultat d'une conversion de format
 */
export interface FormatConversionResult {
  fromFormat: string;
  toFormat: string;
  originalSize: number;
  convertedSize: number;
  qualityRetained: number;
  conversionTime: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * Métadonnées d'un bucket de stockage
 */
export interface BucketInfo {
  name: string;
  region: string;
  creationDate: Date;
  usage: {
    objectCount: number;
    totalSize: number;
    lastModified: Date;
  };
  versioning: boolean;
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
    typeof obj.success === 'boolean' && typeof obj.processingTime === 'number'
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
export type UpdateDto<T> = PartialWithId<
  Omit<T, 'id' | 'createdAt' | 'updatedAt'>
>;

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
  ip: string;
  threatLevel: 'low' | 'medium' | 'high';
  isVpn: boolean;
  isTor: boolean;
  isProxy: boolean;
  isHosting: boolean;
  countryCode: string;
  country: string;
  asn?: string;
  isp?: string;
  lastSeen?: Date;
  riskScore?: number;
  geolocation?: {
    city?: string;
    region?: string;
    timezone?: string;
    latitude?: number;
    longitude?: number;
  };
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
  jobId: string;
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
  // runtimeConfig?: ServiceRuntimeConfig;
  executionContext?: {
    workerId: string;
    nodeId: string;
    environment: string;
  };
  progressCallback?: (progress: number) => void;
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
  success: boolean;
  url: string;
  storageKey?: string;
  width: number;
  height: number;
  format: ImageFormat;
  size: number;
  quality: number;
  dimensions?: {
    width: number;
    height: number;
  };
  formats?: Array<{
    format: ImageFormat;
    url: string;
    size: number;
  }>;
  error?: string;
}

// export interface ConversionResult extends FormatConversionResult {}

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

export type FileSystemConfig =
  import('../config/file-system.config').FileSystemConfig;
