import { registerAs } from '@nestjs/config';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  validateSync,
} from 'class-validator';
import { plainToClass, Transform } from 'class-transformer';

/**
 * Configuration principale du système de fichiers Coders V1
 *
 * Cette configuration centralise tous les paramètres nécessaires au fonctionnement
 * du composant C-06 File System selon les spécifications 03-06-file-system-specs.md
 * et le référentiel 07-06 Configuration Reference.
 *
 * @version 1.0
 * @author DevOps Lead
 * @conformsTo 07-06 Configuration Reference
 */

/**
 * Interface de configuration pour le service Garage S3
 *
 * Garage S3 est notre solution de stockage auto-hébergée compatible AWS S3,
 * offrant autonomie infrastructure et contrôle complet des données.
 */
export interface GarageConfig {
  /** URL d'endpoint du service Garage S3 (ex: https://s3.coders.com) */
  endpoint: string;

  /** Clé d'accès pour l'authentification Garage S3 */
  accessKey: string;

  /** Clé secrète pour l'authentification Garage S3 */
  secretKey: string;

  /** Configuration des buckets S3 pour différents types de données */
  buckets: {
    /** Bucket principal pour les documents utilisateur */
    documents: string;
    /** Bucket pour les sauvegardes et archivage */
    backups: string;
    /** Bucket pour les fichiers temporaires pendant traitement */
    temp: string;
  };

  /** Région AWS compatible pour Garage S3 (ex: eu-west-1) */
  region: string;

  /** Force path-style pour compatibilité Garage S3 */
  forcePathStyle: boolean;
}

/**
 * Interface de configuration pour le service CDN
 *
 * Configuration de la distribution de contenu globale pour optimiser
 * les performances d'accès aux fichiers depuis le monde entier.
 */
export interface CDNConfig {
  /** URL de base du CDN (ex: https://cdn.coders.com) */
  baseUrl: string;

  /** Directives de contrôle de cache par défaut */
  cacheControl: string;

  /** Token d'authentification pour l'API d'invalidation CDN */
  invalidationToken: string;

  /** Liste des emplacements edge disponibles pour la distribution */
  edgeLocations: string[];

  /** TTL par défaut du cache CDN en secondes */
  defaultTtl: number;

  /** TTL maximum du cache CDN en secondes */
  maxTtl: number;
}

/**
 * Interface de configuration pour le traitement des fichiers
 *
 * Paramètres contrôlant le traitement automatique, l'optimisation
 * et la validation des fichiers uploadés.
 */
export interface ProcessingConfig {
  /** Taille maximale autorisée pour un fichier en octets (100MB par défaut) */
  maxFileSize: number;

  /** Liste des types MIME autorisés pour l'upload */
  allowedMimeTypes: string[];

  /** Timeout pour le scan antivirus en millisecondes */
  virusScanTimeout: number;

  /** Qualité de compression pour l'optimisation d'images (0-100) */
  imageOptimizationQuality: number;

  /** Taille des thumbnails générés en pixels */
  thumbnailSize: number;

  /** Niveau de compression PDF (0-9, 9 = maximum) */
  pdfCompressionLevel: number;

  /** Nombre maximum de workers pour le traitement parallèle */
  maxWorkers: number;

  /** Taille des chunks pour le traitement streaming en octets */
  chunkSize: number;
}

/**
 * Interface de configuration pour la sécurité
 *
 * Paramètres de sécurité multi-couches incluant l'authentification,
 * la validation, le scan antivirus et le contrôle d'accès.
 */
export interface SecurityConfig {
  /** Durée d'expiration des URLs pré-signées en secondes */
  presignedUrlExpiry: number;

  /** Nombre maximum d'URLs pré-signées par utilisateur */
  maxPresignedUrls: number;

  /** Activation des restrictions par adresse IP */
  ipRestrictionEnabled: boolean;

  /** Activation du scan antivirus pour tous les fichiers */
  scanVirusEnabled: boolean;

  /** Nombre maximum d'uploads par utilisateur par minute */
  rateLimitUploadsPerMinute: number;

  /** Durée de blacklist temporaire en cas d'abus (secondes) */
  abuseBlockDuration: number;

  /** Activation du device fingerprinting avancé */
  deviceFingerprintingEnabled: boolean;

  /** Clé secrète pour la signature des tokens sécurisés */
  securityTokenSecret: string;
}

/**
 * Interface principale de configuration du système de fichiers
 *
 * Regroupe toutes les configurations des sous-systèmes pour une
 * gestion centralisée et cohérente.
 */
export interface FileSystemConfig {
  /** Configuration du service de stockage Garage S3 */
  garage: GarageConfig;

  /** Configuration du service CDN */
  cdn: CDNConfig;

  /** Configuration du traitement des fichiers */
  processing: ProcessingConfig;

  /** Configuration de la sécurité */
  security: SecurityConfig;
}

/**
 * Classe de validation pour la configuration avec decorators class-validator
 *
 * Permet la validation automatique des variables d'environnement au démarrage
 * de l'application selon les contraintes définies.
 */
class FileSystemConfigValidation {
  // Configuration Garage S3
  @IsString()
  GARAGE_ENDPOINT: string;

  @IsString()
  GARAGE_ACCESS_KEY: string;

  @IsString()
  GARAGE_SECRET_KEY: string;

  @IsString()
  GARAGE_BUCKET_DOCUMENTS: string;

  @IsString()
  GARAGE_BUCKET_BACKUPS: string;

  @IsString()
  GARAGE_BUCKET_TEMP: string;

  @IsString()
  GARAGE_REGION: string;

  // Configuration CDN
  @IsString()
  CDN_BASE_URL: string;

  @IsString()
  @IsOptional()
  CDN_CACHE_CONTROL: string;

  @IsString()
  CDN_INVALIDATION_TOKEN: string;

  @IsArray()
  @Transform(({ value }) => value.split(',').map((s: string) => s.trim()))
  @IsOptional()
  CDN_EDGE_LOCATIONS: string[];

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  CDN_DEFAULT_TTL: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  CDN_MAX_TTL: number;

  // Configuration Processing
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  MAX_FILE_SIZE: number;

  @IsArray()
  @Transform(({ value }) => value.split(',').map((s: string) => s.trim()))
  @IsOptional()
  ALLOWED_MIME_TYPES: string[];

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  VIRUS_SCAN_TIMEOUT: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  IMAGE_OPTIMIZATION_QUALITY: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  THUMBNAIL_SIZE: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  PDF_COMPRESSION_LEVEL: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  PROCESSING_MAX_WORKERS: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  PROCESSING_CHUNK_SIZE: number;

  // Configuration Security
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  PRESIGNED_URL_EXPIRY: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  MAX_PRESIGNED_URLS: number;

  @Transform(({ value }) => {
    // Si pas défini, utiliser la valeur par défaut (true)
    if (value === undefined || value === null) return true;
    // Sinon convertir : 'true' donne true, tout le reste donne false
    return String(value).toLowerCase() === 'true';
  })
  IP_RESTRICTION_ENABLED: boolean;

  @Transform(({ value }) => {
    // Si pas défini, utiliser la valeur par défaut (true)
    if (value === undefined || value === null) return true;
    // Sinon convertir : 'true' donne true, tout le reste donne false
    return String(value).toLowerCase() === 'true';
  })
  SCAN_VIRUS_ENABLED: boolean;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  RATE_LIMIT_UPLOADS_PER_MINUTE: number;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  ABUSE_BLOCK_DURATION: number;

  @Transform(({ value }) => {
    // Si pas défini, utiliser la valeur par défaut (true)
    if (value === undefined || value === null) return true;
    // Sinon convertir : 'true' donne true, tout le reste donne false
    return String(value).toLowerCase() === 'true';
  })
  DEVICE_FINGERPRINTING_ENABLED: boolean;

  @IsString()
  @Transform(({ value }) => {
    if (typeof value === 'string' && value.length < 32) {
      throw new Error(
        'SECURITY_TOKEN_SECRET must be at least 32 characters long',
      );
    }
    return value;
  })
  SECURITY_TOKEN_SECRET: string;
}

/**
 * Fonction de validation de la configuration
 *
 * Valide toutes les variables d'environnement selon les contraintes définies
 * et lève une exception si la configuration est invalide.
 *
 * @param config - Variables d'environnement à valider
 * @returns Configuration validée
 * @throws Error si la validation échoue
 */
function validateConfig(
  config: Record<string, unknown>,
): FileSystemConfigValidation {
  // Vérification des chaînes vides pour les champs requis
  const requiredStringFields = [
    'GARAGE_ENDPOINT',
    'GARAGE_ACCESS_KEY',
    'GARAGE_SECRET_KEY',
    'GARAGE_BUCKET_DOCUMENTS',
    'GARAGE_BUCKET_BACKUPS',
    'GARAGE_BUCKET_TEMP',
    'GARAGE_REGION',
    'CDN_BASE_URL',
    'CDN_INVALIDATION_TOKEN',
    'SECURITY_TOKEN_SECRET',
  ];

  for (const field of requiredStringFields) {
    if (!config[field] || config[field] === '') {
      throw new Error(
        `Configuration validation failed: ${field} is required and cannot be empty`,
      );
    }
  }

  const validatedConfig = plainToClass(FileSystemConfigValidation, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => Object.values(error.constraints || {}).join(', '))
      .join('; ');

    throw new Error(`Configuration validation failed: ${errorMessages}`);
  }

  return validatedConfig;
}

/**
 * Configuration par défaut du système de fichiers
 *
 * Valeurs par défaut sécurisées et optimisées pour un environnement
 * de production standard. Ces valeurs peuvent être surchargées par
 * les variables d'environnement.
 */
const DEFAULT_CONFIG: Partial<FileSystemConfig> = {
  processing: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    virusScanTimeout: 30000, // 30 secondes
    imageOptimizationQuality: 85,
    thumbnailSize: 200,
    pdfCompressionLevel: 6,
    maxWorkers: 4,
    chunkSize: 64 * 1024, // 64KB
  },
  security: {
    presignedUrlExpiry: 3600, // 1 heure
    maxPresignedUrls: 10,
    ipRestrictionEnabled: true,
    scanVirusEnabled: true,
    rateLimitUploadsPerMinute: 10,
    abuseBlockDuration: 300, // 5 minutes
    deviceFingerprintingEnabled: true,
    securityTokenSecret: '', // Sera rempli par l'env var
  },
  cdn: {
    baseUrl: '', // Sera rempli par l'env var
    cacheControl: 'public, max-age=86400', // 24 heures
    invalidationToken: '', // Sera rempli par l'env var
    edgeLocations: ['eu-west-1', 'us-east-1', 'ap-southeast-1'],
    defaultTtl: 86400, // 24 heures
    maxTtl: 604800, // 7 jours
  },
};

/**
 * Factory de configuration du système de fichiers
 *
 * Charge et valide la configuration depuis les variables d'environnement,
 * applique les valeurs par défaut et retourne une configuration complète
 * et validée.
 *
 * @returns Configuration complète du système de fichiers
 * @throws Error si des variables requises sont manquantes ou invalides
 */
export default registerAs('fileSystem', (): FileSystemConfig => {
  // Validation des variables d'environnement
  const validatedEnv = validateConfig(process.env);

  // Construction de la configuration finale
  const config: FileSystemConfig = {
    garage: {
      endpoint: validatedEnv.GARAGE_ENDPOINT,
      accessKey: validatedEnv.GARAGE_ACCESS_KEY,
      secretKey: validatedEnv.GARAGE_SECRET_KEY,
      buckets: {
        documents: validatedEnv.GARAGE_BUCKET_DOCUMENTS,
        backups: validatedEnv.GARAGE_BUCKET_BACKUPS,
        temp: validatedEnv.GARAGE_BUCKET_TEMP,
      },
      region: validatedEnv.GARAGE_REGION,
      forcePathStyle: true, // Toujours true pour Garage S3
    },

    cdn: {
      baseUrl: validatedEnv.CDN_BASE_URL,
      cacheControl:
        validatedEnv.CDN_CACHE_CONTROL || DEFAULT_CONFIG.cdn!.cacheControl,
      invalidationToken: validatedEnv.CDN_INVALIDATION_TOKEN,
      edgeLocations:
        validatedEnv.CDN_EDGE_LOCATIONS || DEFAULT_CONFIG.cdn!.edgeLocations,
      defaultTtl:
        validatedEnv.CDN_DEFAULT_TTL || DEFAULT_CONFIG.cdn!.defaultTtl,
      maxTtl: validatedEnv.CDN_MAX_TTL || DEFAULT_CONFIG.cdn!.maxTtl,
    },

    processing: {
      maxFileSize:
        validatedEnv.MAX_FILE_SIZE || DEFAULT_CONFIG.processing!.maxFileSize,
      allowedMimeTypes:
        validatedEnv.ALLOWED_MIME_TYPES ||
        DEFAULT_CONFIG.processing!.allowedMimeTypes,
      virusScanTimeout:
        validatedEnv.VIRUS_SCAN_TIMEOUT ||
        DEFAULT_CONFIG.processing!.virusScanTimeout,
      imageOptimizationQuality:
        validatedEnv.IMAGE_OPTIMIZATION_QUALITY ||
        DEFAULT_CONFIG.processing!.imageOptimizationQuality,
      thumbnailSize:
        validatedEnv.THUMBNAIL_SIZE || DEFAULT_CONFIG.processing!.thumbnailSize,
      pdfCompressionLevel:
        validatedEnv.PDF_COMPRESSION_LEVEL ||
        DEFAULT_CONFIG.processing!.pdfCompressionLevel,
      maxWorkers:
        validatedEnv.PROCESSING_MAX_WORKERS ||
        DEFAULT_CONFIG.processing!.maxWorkers,
      chunkSize:
        validatedEnv.PROCESSING_CHUNK_SIZE ||
        DEFAULT_CONFIG.processing!.chunkSize,
    },

    security: {
      presignedUrlExpiry:
        validatedEnv.PRESIGNED_URL_EXPIRY ||
        DEFAULT_CONFIG.security!.presignedUrlExpiry,
      maxPresignedUrls:
        validatedEnv.MAX_PRESIGNED_URLS ||
        DEFAULT_CONFIG.security!.maxPresignedUrls,
      // Gestion booléens : undefined = défaut, 'true' = true, tout le reste = false
      ipRestrictionEnabled:
        process.env.IP_RESTRICTION_ENABLED === undefined
          ? DEFAULT_CONFIG.security!.ipRestrictionEnabled
          : process.env.IP_RESTRICTION_ENABLED === 'true',
      scanVirusEnabled:
        process.env.SCAN_VIRUS_ENABLED === undefined
          ? DEFAULT_CONFIG.security!.scanVirusEnabled
          : process.env.SCAN_VIRUS_ENABLED === 'true',
      rateLimitUploadsPerMinute:
        validatedEnv.RATE_LIMIT_UPLOADS_PER_MINUTE ||
        DEFAULT_CONFIG.security!.rateLimitUploadsPerMinute,
      abuseBlockDuration:
        validatedEnv.ABUSE_BLOCK_DURATION ||
        DEFAULT_CONFIG.security!.abuseBlockDuration,
      deviceFingerprintingEnabled:
        process.env.DEVICE_FINGERPRINTING_ENABLED === undefined
          ? DEFAULT_CONFIG.security!.deviceFingerprintingEnabled
          : process.env.DEVICE_FINGERPRINTING_ENABLED === 'true',
      securityTokenSecret: validatedEnv.SECURITY_TOKEN_SECRET,
    },
  };

  return config;
});

/**
 * Token d'injection pour la configuration du système de fichiers
 *
 * Utilisé pour l'injection de dépendance dans les services NestJS
 * qui ont besoin d'accéder à la configuration.
 */
export const FILE_SYSTEM_CONFIG = 'fileSystem';

/**
 * Type guard pour vérifier si une configuration est valide
 *
 * @param config - Configuration à vérifier
 * @returns true si la configuration est valide
 */
export function isValidFileSystemConfig(
  config: any,
): config is FileSystemConfig {
  try {
    return !!(
      config &&
      typeof config === 'object' &&
      config.garage &&
      typeof config.garage === 'object' &&
      config.garage.endpoint &&
      config.garage.accessKey &&
      config.garage.secretKey &&
      config.garage.buckets &&
      config.garage.buckets.documents &&
      config.garage.buckets.backups &&
      config.garage.buckets.temp &&
      config.garage.region &&
      typeof config.garage.forcePathStyle === 'boolean' &&
      config.cdn &&
      typeof config.cdn === 'object' &&
      config.cdn.baseUrl &&
      config.cdn.invalidationToken &&
      Array.isArray(config.cdn.edgeLocations) &&
      typeof config.cdn.defaultTtl === 'number' &&
      typeof config.cdn.maxTtl === 'number' &&
      config.processing &&
      typeof config.processing === 'object' &&
      typeof config.processing.maxFileSize === 'number' &&
      Array.isArray(config.processing.allowedMimeTypes) &&
      typeof config.processing.virusScanTimeout === 'number' &&
      typeof config.processing.imageOptimizationQuality === 'number' &&
      typeof config.processing.thumbnailSize === 'number' &&
      typeof config.processing.pdfCompressionLevel === 'number' &&
      typeof config.processing.maxWorkers === 'number' &&
      typeof config.processing.chunkSize === 'number' &&
      config.security &&
      typeof config.security === 'object' &&
      typeof config.security.presignedUrlExpiry === 'number' &&
      typeof config.security.maxPresignedUrls === 'number' &&
      typeof config.security.ipRestrictionEnabled === 'boolean' &&
      typeof config.security.scanVirusEnabled === 'boolean' &&
      typeof config.security.rateLimitUploadsPerMinute === 'number' &&
      typeof config.security.abuseBlockDuration === 'number' &&
      typeof config.security.deviceFingerprintingEnabled === 'boolean' &&
      config.security.securityTokenSecret &&
      typeof config.security.securityTokenSecret === 'string' &&
      config.security.securityTokenSecret.length >= 32
    );
  } catch {
    return false;
  }
}

/**
 * Utilitaire pour obtenir une configuration d'environnement spécifique
 *
 * @param env - Environnement cible ('development', 'staging', 'production')
 * @returns Configuration adaptée à l'environnement
 */
export function getEnvironmentConfig(env: string): Partial<FileSystemConfig> {
  const baseConfig = DEFAULT_CONFIG;

  switch (env) {
    case 'development':
      return {
        ...baseConfig,
        processing: {
          ...baseConfig.processing!,
          maxFileSize: 10 * 1024 * 1024, // 10MB en dev
          maxWorkers: 2,
          allowedMimeTypes: baseConfig.processing!.allowedMimeTypes,
          virusScanTimeout: baseConfig.processing!.virusScanTimeout,
          imageOptimizationQuality:
            baseConfig.processing!.imageOptimizationQuality,
          thumbnailSize: baseConfig.processing!.thumbnailSize,
          pdfCompressionLevel: baseConfig.processing!.pdfCompressionLevel,
          chunkSize: baseConfig.processing!.chunkSize,
        },
        security: {
          ...baseConfig.security!,
          scanVirusEnabled: false, // Désactivé en dev
          deviceFingerprintingEnabled: false,
          securityTokenSecret: baseConfig.security!.securityTokenSecret,
          presignedUrlExpiry: baseConfig.security!.presignedUrlExpiry,
          maxPresignedUrls: baseConfig.security!.maxPresignedUrls,
          ipRestrictionEnabled: baseConfig.security!.ipRestrictionEnabled,
          rateLimitUploadsPerMinute:
            baseConfig.security!.rateLimitUploadsPerMinute,
          abuseBlockDuration: baseConfig.security!.abuseBlockDuration,
        },
      };

    case 'staging':
      return {
        ...baseConfig,
        processing: {
          ...baseConfig.processing!,
          maxFileSize: 50 * 1024 * 1024, // 50MB en staging
          allowedMimeTypes: baseConfig.processing!.allowedMimeTypes,
          virusScanTimeout: baseConfig.processing!.virusScanTimeout,
          imageOptimizationQuality:
            baseConfig.processing!.imageOptimizationQuality,
          thumbnailSize: baseConfig.processing!.thumbnailSize,
          pdfCompressionLevel: baseConfig.processing!.pdfCompressionLevel,
          maxWorkers: baseConfig.processing!.maxWorkers,
          chunkSize: baseConfig.processing!.chunkSize,
        },
        security: {
          ...baseConfig.security!,
          rateLimitUploadsPerMinute: 20, // Plus permissif en staging
          securityTokenSecret: baseConfig.security!.securityTokenSecret,
          presignedUrlExpiry: baseConfig.security!.presignedUrlExpiry,
          maxPresignedUrls: baseConfig.security!.maxPresignedUrls,
          ipRestrictionEnabled: baseConfig.security!.ipRestrictionEnabled,
          scanVirusEnabled: baseConfig.security!.scanVirusEnabled,
          abuseBlockDuration: baseConfig.security!.abuseBlockDuration,
          deviceFingerprintingEnabled:
            baseConfig.security!.deviceFingerprintingEnabled,
        },
      };

    case 'production':
    default:
      return baseConfig;
  }
}
