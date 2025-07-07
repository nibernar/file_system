/**
 * Constantes du système de fichiers Coders V1
 *
 * Ce fichier centralise toutes les constantes, limites techniques, patterns
 * et valeurs fixes utilisées dans le composant C-06 File System.
 * Complément au fichier de configuration pour les valeurs non-configurables.
 *
 * @version 1.0
 * @author DevOps Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 07-08-coding-standards
 */

// ============================================================================
// LIMITES TECHNIQUES - Tailles et Performances
// ============================================================================

/**
 * Limites de taille pour les fichiers et opérations
 */
export const FILE_SIZE_LIMITS = {
  MIN_FILE_SIZE: 1,
  MAX_FILE_SIZE_DEFAULT: 100 * 1024 * 1024,
  MAX_FILE_SIZE_ABSOLUTE: 500 * 1024 * 1024,
  MULTIPART_THRESHOLD: 50 * 1024 * 1024,
  MULTIPART_PART_SIZE: 10 * 1024 * 1024,
  MAX_CHUNK_SIZE: 64 * 1024,
  THUMBNAIL_DEFAULT_SIZE: 200,
  THUMBNAIL_MAX_SIZE: 1024,
} as const;

/**
 * Unités de taille standardisées
 */
export const SIZE_UNITS = {
  BYTE: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
} as const;

/**
 * Limites de performance et timeouts
 */
export const PERFORMANCE_LIMITS = {
  UPLOAD_TIMEOUT_MS: 5 * 60 * 1000,
  DOWNLOAD_TIMEOUT_MS: 2 * 60 * 1000,
  VIRUS_SCAN_TIMEOUT_MS: 30 * 1000,
  IMAGE_PROCESSING_TIMEOUT_MS: 60 * 1000,
  PDF_PROCESSING_TIMEOUT_MS: 120 * 1000,
  THUMBNAIL_TIMEOUT_MS: 30 * 1000,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF_MS: 1000,
  MAX_CONCURRENT_PROCESSING: 10,
  MAX_CONCURRENT_UPLOADS_PER_USER: 5,
} as const;

// ============================================================================
// FORMATS ET TYPES MIME - Support de fichiers
// ============================================================================

/**
 * Types MIME supportés par catégorie
 */
export const SUPPORTED_MIME_TYPES = {
  IMAGES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
  ],

  DOCUMENTS: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],

  TEXT: [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
  ],

  CODE: [
    'application/json',
    'application/xml',
    'application/yaml',
    'text/x-python',
    'text/x-typescript',
    'text/x-javascript',
  ],

  ARCHIVES: [
    'application/zip',
    'application/x-tar',
    'application/gzip',
    'application/x-7z-compressed',
  ],
} as const;

/**
 * Extensions de fichiers autorisées
 */
export const ALLOWED_EXTENSIONS = {
  IMAGES: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.svg'],
  DOCUMENTS: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
  TEXT: ['.txt', '.md', '.csv', '.html', '.css', '.js'],
  CODE: ['.json', '.xml', '.yml', '.yaml', '.py', '.ts', '.js'],
  ARCHIVES: ['.zip', '.tar', '.gz', '.7z'],
} as const;

/**
 * Magic numbers pour la détection de type réel de fichier
 */
export const FILE_MAGIC_NUMBERS = {
  PDF: [0x25, 0x50, 0x44, 0x46],
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  GIF87A: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  GIF89A: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  WEBP: [0x52, 0x49, 0x46, 0x46],
  ZIP: [0x50, 0x4b, 0x03, 0x04],
  PE_EXECUTABLE: [0x4d, 0x5a], // MZ
  ELF_EXECUTABLE: [0x7f, 0x45, 0x4c, 0x46], // .ELF
} as const;

// ============================================================================
// SÉCURITÉ - Limitations et patterns
// ============================================================================

/**
 * Limites de sécurité et anti-abus
 */
export const SECURITY_LIMITS = {
  MAX_UPLOADS_PER_MINUTE: 10,
  MAX_UPLOADS_PER_IP_PER_MINUTE: 20,
  MAX_FILES_PER_USER: 10000,
  PRESIGNED_URL_DEFAULT_EXPIRY: 3600,
  PRESIGNED_URL_MAX_EXPIRY: 24 * 3600,
  MAX_PRESIGNED_URLS_PER_USER: 50,
  ABUSE_BLOCK_DURATION_MS: 5 * 60 * 1000,
  MAX_FAILED_ATTEMPTS_BEFORE_BLOCK: 10,
  MIN_SECURITY_TOKEN_LENGTH: 32,
  MAX_FILENAME_LENGTH: 255,
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,
  MAX_STORAGE_PATH_DEPTH: 10,
} as const;

/**
 * Patterns de validation pour noms de fichiers
 */
export const FILENAME_PATTERNS = {
  ALLOWED_CHARS: /^[a-zA-Z0-9._\-\s()[\]{}]+$/,
  SAFE_FILENAME: /^[a-zA-Z0-9._-]+$/,
  DANGEROUS_CHARS: /[<>:"/\\|?*\x00-\x1f]/g,
  DANGEROUS_EXTENSIONS: /\.(exe|bat|cmd|com|scr|pif|vbs|js|jar|app|deb|rpm)$/i,
  PATH_TRAVERSAL: /\.\.(\/|\\)/,
  VALID_EXTENSION: /\.[a-zA-Z0-9]{1,10}$/,
} as const;

/**
 * Patterns de validation pour stockage
 */
export const STORAGE_PATTERNS = {
  STORAGE_KEY: /^[a-zA-Z0-9!_.*'()-\/]+$/,
  BUCKET_NAME: /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  MD5_CHECKSUM: /^[a-f0-9]{32}$/i,
  SHA256_CHECKSUM: /^[a-f0-9]{64}$/i,
} as const;

// ============================================================================
// TRAITEMENT - Qualité et optimisation
// ============================================================================

/**
 * Paramètres de qualité pour le traitement d'images
 */
export const IMAGE_QUALITY = {
  MAX: 100,
  HIGH: 95,
  DEFAULT: 85,
  MEDIUM: 75,
  LOW: 60,
  MIN: 30,
} as const;

/**
 * Niveaux de compression PDF
 */
export const PDF_COMPRESSION = {
  NONE: 0,
  LOW: 3,
  DEFAULT: 6,
  HIGH: 9,
} as const;

/**
 * Tailles standard pour thumbnails
 */
export const THUMBNAIL_SIZES = {
  TINY: 64,
  SMALL: 128,
  DEFAULT: 200,
  MEDIUM: 400,
  LARGE: 800,
} as const;

/**
 * Formats de sortie pour optimisation
 */
export const OUTPUT_FORMATS = {
  WEB_IMAGES: ['webp', 'jpeg', 'png'],
  THUMBNAIL_FORMATS: ['webp', 'jpeg'],
  DOCUMENT_FORMATS: ['pdf'],
} as const;

// ============================================================================
// CDN ET CACHE - Configuration de distribution
// ============================================================================

/**
 * Durées de vie du cache (TTL) en secondes
 */
export const CACHE_TTL = {
  SHORT: 5 * 60,
  DEFAULT: 3600,
  MEDIUM: 6 * 3600,
  LONG: 24 * 3600,
  VERY_LONG: 7 * 24 * 3600,
  PERMANENT: 365 * 24 * 3600,
  METADATA: 300,
} as const;

/**
 * Headers de cache par type de contenu
 */
export const CACHE_HEADERS = {
  IMAGES: 'public, max-age=604800, immutable',
  DOCUMENTS: 'public, max-age=86400',
  THUMBNAILS: 'public, max-age=2592000, immutable',
  METADATA: 'public, max-age=300',
  PRIVATE: 'private, no-cache, no-store, must-revalidate',
} as const;

/**
 * Emplacements edge par région
 */
export const CDN_EDGE_LOCATIONS = {
  EUROPE: ['eu-west-1', 'eu-central-1', 'eu-north-1'],
  NORTH_AMERICA: ['us-east-1', 'us-west-2', 'ca-central-1'],
  ASIA_PACIFIC: ['ap-southeast-1', 'ap-northeast-1', 'ap-south-1'],
  SOUTH_AMERICA: ['sa-east-1'],
  ALL: ['eu-west-1', 'us-east-1', 'ap-southeast-1'],
} as const;

// ============================================================================
// MESSAGES ET CODES D'ERREUR - Standardisation
// ============================================================================

/**
 * Messages d'erreur standardisés
 */
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'Le fichier dépasse la taille maximale autorisée',
  FILE_TOO_SMALL: 'Le fichier est trop petit',
  INVALID_FILE_TYPE: 'Type de fichier non supporté',
  INVALID_FILENAME: 'Nom de fichier invalide ou dangereux',
  MISSING_FILE: 'Aucun fichier fourni',
  VIRUS_DETECTED: "Fichier infecté détecté par l'antivirus",
  SUSPICIOUS_CONTENT: 'Contenu suspect détecté dans le fichier',
  ACCESS_DENIED: 'Accès refusé à ce fichier',
  RATE_LIMIT_EXCEEDED: 'Limite de téléchargement dépassée',
  PROCESSING_FAILED: 'Échec du traitement du fichier',
  PROCESSING_TIMEOUT: 'Timeout lors du traitement',
  UNSUPPORTED_FORMAT: 'Format de fichier non supporté pour le traitement',
  CORRUPTION_DETECTED: 'Fichier corrompu détecté',
  STORAGE_UNAVAILABLE: 'Service de stockage temporairement indisponible',
  STORAGE_QUOTA_EXCEEDED: 'Quota de stockage dépassé',
  FILE_NOT_FOUND: 'Fichier introuvable',
  UPLOAD_FAILED: "Échec de l'upload du fichier",
  CDN_DISTRIBUTION_FAILED: 'Échec de la distribution CDN',
  CDN_INVALIDATION_FAILED: "Échec de l'invalidation du cache CDN",
  INTERNAL_ERROR: 'Erreur interne du serveur',
  TEMPORARY_UNAVAILABLE: 'Service temporairement indisponible',
  CONFIGURATION_ERROR: 'Erreur de configuration du système',
} as const;

/**
 * Codes d'erreur pour logging et monitoring
 */
export const ERROR_CODES = {
  INVALID_FILE_SIZE: 'FS_1001',
  INVALID_MIME_TYPE: 'FS_1002',
  INVALID_FILENAME: 'FS_1003',
  INVALID_CHECKSUM: 'FS_1004',
  VIRUS_FOUND: 'FS_1101',
  MALICIOUS_CONTENT: 'FS_1102',
  UNAUTHORIZED_ACCESS: 'FS_1103',
  RATE_LIMITED: 'FS_1104',
  PROCESSING_ERROR: 'FS_1201',
  PROCESSING_TIMEOUT: 'FS_1202',
  OPTIMIZATION_FAILED: 'FS_1203',
  THUMBNAIL_FAILED: 'FS_1204',
  STORAGE_ERROR: 'FS_1301',
  UPLOAD_ERROR: 'FS_1302',
  DOWNLOAD_ERROR: 'FS_1303',
  DELETE_ERROR: 'FS_1304',
  CDN_ERROR: 'FS_1401',
  DISTRIBUTION_ERROR: 'FS_1402',
  INVALIDATION_ERROR: 'FS_1403',
} as const;

// ============================================================================
// METRICS ET MONITORING - KPIs et alertes
// ============================================================================

/**
 * Métriques de performance cibles
 */
export const PERFORMANCE_TARGETS = {
  MIN_UPLOAD_SPEED: 1,
  TARGET_UPLOAD_SPEED: 10,
  TARGET_DOWNLOAD_SPEED_CDN: 50,
  API_RESPONSE_TIME_METADATA: 100,
  API_RESPONSE_TIME_PRESIGNED: 500,
  MIN_AVAILABILITY: 99.9,
  MIN_CDN_CACHE_HIT_RATIO: 90,
  MAX_IMAGE_PROCESSING_TIME: 10,
  MAX_PDF_PROCESSING_TIME: 30,
} as const;

/**
 * Seuils d'alerte pour monitoring
 */
export const ALERT_THRESHOLDS = {
  MAX_ERROR_RATE: 5,
  MAX_CPU_USAGE: 80,
  MAX_MEMORY_USAGE: 85,
  MAX_LATENCY: 2000,
  MAX_QUEUE_SIZE: 1000,
  MIN_DISK_SPACE: 20,
} as const;

/**
 * Intervalles de nettoyage et maintenance
 */
export const MAINTENANCE_INTERVALS = {
  TEMP_CLEANUP: 60 * 60 * 1000, // 1 heure
  EXPIRED_URLS_CLEANUP: 6 * 60 * 60 * 1000, // 6 heures
  DB_COMPACTION: 24 * 60 * 60 * 1000, // 24 heures
  INTEGRITY_CHECK: 7 * 24 * 60 * 60 * 1000, // 7 jours
  LOG_ARCHIVAL: 30 * 24 * 60 * 60 * 1000, // 30 jours
} as const;

// ============================================================================
// PATHS ET TEMPLATES - Organisation du stockage
// ============================================================================

/**
 * Templates de chemins pour le stockage
 */
export const STORAGE_PATH_TEMPLATES = {
  USER_FILES: 'files/{userId}/{year}/{month}/{fileId}',
  FILE_VERSIONS: 'files/{userId}/versions/{fileId}/{versionNumber}',
  THUMBNAILS: 'thumbnails/{userId}/{fileId}/{size}',
  TEMP_FILES: 'temp/{uploadId}/{partNumber}',
  BACKUPS: 'backups/{year}/{month}/{day}/{fileId}',
  QUARANTINE: 'quarantine/{scanId}/{fileId}',
} as const;

/**
 * Préfixes pour organisation par environnement
 */
export const ENVIRONMENT_PREFIXES = {
  PRODUCTION: 'prod',
  STAGING: 'staging',
  DEVELOPMENT: 'dev',
  TEST: 'test',
} as const;

// ============================================================================
// ÉVÉNEMENTS ET HOOKS - Integration système
// ============================================================================

/**
 * Types d'événements émis par le système de fichiers
 */
export const FILE_EVENTS = {
  FILE_UPLOADED: 'file.uploaded',
  FILE_PROCESSED: 'file.processed',
  FILE_DELETED: 'file.deleted',
  FILE_RESTORED: 'file.restored',
  VIRUS_DETECTED: 'security.virus_detected',
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
  ACCESS_DENIED: 'security.access_denied',
  PROCESSING_SLOW: 'performance.processing_slow',
  STORAGE_FULL: 'performance.storage_full',
  CDN_ERROR: 'performance.cdn_error',
  VERSION_CREATED: 'version.created',
  VERSION_RESTORED: 'version.restored',
} as const;

/**
 * Priorités pour les événements
 */
export const EVENT_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  INFO: 5,
} as const;

// ============================================================================
// EXPORT GROUPÉ - Pour faciliter les imports
// ============================================================================

/**
 * Toutes les constantes exportées pour import facile
 */
export const FILE_SYSTEM_CONSTANTS = {
  FILE_SIZE_LIMITS,
  SIZE_UNITS,
  PERFORMANCE_LIMITS,
  SUPPORTED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  FILE_MAGIC_NUMBERS,
  SECURITY_LIMITS,
  FILENAME_PATTERNS,
  STORAGE_PATTERNS,
  IMAGE_QUALITY,
  PDF_COMPRESSION,
  THUMBNAIL_SIZES,
  OUTPUT_FORMATS,
  CACHE_TTL,
  CACHE_HEADERS,
  CDN_EDGE_LOCATIONS,
  ERROR_MESSAGES,
  ERROR_CODES,
  PERFORMANCE_TARGETS,
  ALERT_THRESHOLDS,
  MAINTENANCE_INTERVALS,
  STORAGE_PATH_TEMPLATES,
  ENVIRONMENT_PREFIXES,
  FILE_EVENTS,
  EVENT_PRIORITIES,
} as const;

/**
 * Type pour validation des constantes
 */
export type FileSystemConstants = typeof FILE_SYSTEM_CONSTANTS;

// ============================================================================
// HELPER FUNCTIONS - Corrigées pour les types readonly
// ============================================================================

/**
 * Helper pour vérifier si une extension est autorisée
 */
export function isAllowedExtension(extension: string): boolean {
  const lowerExt = extension.toLowerCase();
  return Object.values(ALLOWED_EXTENSIONS).some((exts) =>
    (exts as readonly string[]).includes(lowerExt),
  );
}

/**
 * Helper pour vérifier si un MIME type est supporté
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return Object.values(SUPPORTED_MIME_TYPES).some((types) =>
    (types as readonly string[]).includes(mimeType),
  );
}

/**
 * Helper pour obtenir la catégorie d'un MIME type
 */
export function getMimeTypeCategory(mimeType: string): string | null {
  for (const [category, types] of Object.entries(SUPPORTED_MIME_TYPES)) {
    if ((types as readonly string[]).includes(mimeType)) {
      return category.toLowerCase();
    }
  }
  return null;
}

/**
 * Helper pour générer un chemin de stockage
 */
export function generateStoragePath(
  template: keyof typeof STORAGE_PATH_TEMPLATES,
  variables: Record<string, string>,
): string {
  let path: string = STORAGE_PATH_TEMPLATES[template];

  for (const [key, value] of Object.entries(variables)) {
    path = path.replace(`{${key}}`, value);
  }

  return path;
}

/**
 * Helper pour valider un nom de fichier
 */
export function isValidFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename.length <= SECURITY_LIMITS.MAX_FILENAME_LENGTH &&
    filename.trim().length > 0 && // Refuse les noms avec que des espaces
    filename !== '.' &&
    filename !== '..' &&
    FILENAME_PATTERNS.ALLOWED_CHARS.test(filename) &&
    !FILENAME_PATTERNS.DANGEROUS_EXTENSIONS.test(filename) &&
    !FILENAME_PATTERNS.PATH_TRAVERSAL.test(filename)
  );
}

/**
 * Helper pour obtenir la qualité d'image recommandée selon le contexte
 */
export function getRecommendedImageQuality(
  context: 'thumbnail' | 'web' | 'print' | 'archive',
): number {
  switch (context) {
    case 'thumbnail':
      return IMAGE_QUALITY.MEDIUM;
    case 'web':
      return IMAGE_QUALITY.DEFAULT;
    case 'print':
      return IMAGE_QUALITY.HIGH;
    case 'archive':
      return IMAGE_QUALITY.MAX;
    default:
      return IMAGE_QUALITY.DEFAULT;
  }
}
