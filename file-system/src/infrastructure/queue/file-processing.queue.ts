/**
 * Configuration et Initialisation de la Queue de Traitement de Fichiers
 *
 * Ce module configure la queue Bull pour le traitement asynchrone des fichiers.
 * Il définit les types de jobs, les configurations de queue et les options
 * de traitement selon les spécifications du système de fichiers.
 *
 * @module FileProcessingQueue
 * @version 1.0
 * @author DevOps Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 05-06-file-system-plan Phase 3.2
 */

import { BullModule, BullModuleOptions } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueOptions, JobOptions } from 'bull';
import { ProcessingJobType } from '../../types/file-system.types';

/**
 * Nom de la queue principale de traitement de fichiers
 */
export const FILE_PROCESSING_QUEUE_NAME = 'file-processing';

/**
 * Configuration des différents types de jobs disponibles
 *
 * Chaque type de job a ses propres caractéristiques et paramètres
 * de traitement optimisés selon le cas d'usage.
 */
export const JOB_TYPES = {
  /**
   * Traitement complet post-upload
   * Inclut scan virus, optimisation, thumbnail et distribution CDN
   */
  PROCESS_UPLOADED_FILE: 'process-uploaded-file',

  /**
   * Génération de thumbnail uniquement
   * Pour régénération ou création à la demande
   */
  GENERATE_THUMBNAIL: 'generate-thumbnail',

  /**
   * Optimisation de PDF
   * Compression et optimisation pour le web
   */
  OPTIMIZE_PDF: 'optimize-pdf',

  /**
   * Conversion de format de fichier
   * Ex: PNG vers WebP, DOCX vers PDF
   */
  CONVERT_FORMAT: 'convert-format',

  /**
   * Re-scan antivirus
   * Pour vérifications périodiques ou mises à jour
   */
  VIRUS_RESCAN: 'virus-rescan',

  /**
   * Extraction de métadonnées
   * Pour indexation et recherche
   */
  EXTRACT_METADATA: 'extract-metadata',

  /**
   * Distribution CDN
   * Pour propagation vers edge locations
   */
  DISTRIBUTE_CDN: 'distribute-cdn',

  /**
   * Nettoyage et archivage
   * Pour maintenance périodique
   */
  CLEANUP_ARCHIVE: 'cleanup-archive',
} as const;

/**
 * Options par défaut pour les jobs selon leur type
 *
 * Définit les paramètres optimaux pour chaque type de traitement
 * incluant priorité, timeout, retry et politique de conservation.
 */
export const DEFAULT_JOB_OPTIONS: Record<string, JobOptions> = {
  [JOB_TYPES.PROCESS_UPLOADED_FILE]: {
    priority: 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    timeout: 300000, // 5 minutes max
    removeOnComplete: {
      age: 24 * 3600, // 24h
      count: 100,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 jours pour debug
      count: 500,
    },
  },

  [JOB_TYPES.GENERATE_THUMBNAIL]: {
    priority: 4,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 3000,
    },
    timeout: 60000, // 1 minute
    removeOnComplete: {
      age: 12 * 3600, // 12h
      count: 50,
    },
    removeOnFail: {
      age: 3 * 24 * 3600, // 3 jours
    },
  },

  [JOB_TYPES.OPTIMIZE_PDF]: {
    priority: 3,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    timeout: 600000, // 10 minutes pour gros PDFs
    removeOnComplete: {
      age: 24 * 3600,
      count: 50,
    },
    removeOnFail: {
      age: 3 * 24 * 3600,
    },
  },

  [JOB_TYPES.CONVERT_FORMAT]: {
    priority: 4,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 300000, // 5 minutes
    removeOnComplete: {
      age: 24 * 3600,
      count: 50,
    },
    removeOnFail: {
      age: 3 * 24 * 3600,
    },
  },

  [JOB_TYPES.VIRUS_RESCAN]: {
    priority: 8, // Haute priorité pour sécurité
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
    timeout: 120000, // 2 minutes
    removeOnComplete: {
      age: 48 * 3600, // 48h pour audit
      count: 200,
    },
    removeOnFail: {
      age: 14 * 24 * 3600, // 14 jours pour investigation
    },
  },

  [JOB_TYPES.EXTRACT_METADATA]: {
    priority: 2,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
    timeout: 30000, // 30 secondes
    removeOnComplete: {
      age: 6 * 3600, // 6h
      count: 50,
    },
    removeOnFail: {
      age: 24 * 3600, // 1 jour
    },
  },

  [JOB_TYPES.DISTRIBUTE_CDN]: {
    priority: 6,
    attempts: 4, // Plus de retry pour réseau
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    timeout: 180000, // 3 minutes
    removeOnComplete: {
      age: 12 * 3600,
      count: 100,
    },
    removeOnFail: {
      age: 3 * 24 * 3600,
    },
  },

  [JOB_TYPES.CLEANUP_ARCHIVE]: {
    priority: 1, // Basse priorité
    attempts: 1,
    timeout: 3600000, // 1 heure pour gros batches
    removeOnComplete: {
      age: 7 * 24 * 3600, // 7 jours pour audit
      count: 30,
    },
    removeOnFail: {
      age: 30 * 24 * 3600, // 30 jours
    },
  },
};

/**
 * Configuration des limites de rate pour éviter la surcharge
 *
 * Définit les limites de traitement par type de job pour
 * protéger le système et garantir la performance.
 */
export const RATE_LIMITS = {
  /**
   * Limite globale de jobs concurrents
   */
  GLOBAL_CONCURRENCY: 10,

  /**
   * Limites par type de job
   */
  JOB_CONCURRENCY: {
    [JOB_TYPES.PROCESS_UPLOADED_FILE]: 5,
    [JOB_TYPES.GENERATE_THUMBNAIL]: 3,
    [JOB_TYPES.OPTIMIZE_PDF]: 2,
    [JOB_TYPES.CONVERT_FORMAT]: 3,
    [JOB_TYPES.VIRUS_RESCAN]: 4,
    [JOB_TYPES.EXTRACT_METADATA]: 5,
    [JOB_TYPES.DISTRIBUTE_CDN]: 3,
    [JOB_TYPES.CLEANUP_ARCHIVE]: 1,
  },

  /**
   * Limite de jobs par utilisateur par minute
   */
  USER_RATE_LIMIT: {
    DEFAULT: 10,
    PREMIUM: 30,
    ADMIN: 100,
  },
};

/**
 * Configuration des événements de queue pour monitoring
 *
 * Liste des événements à surveiller pour métriques et alertes
 */
export const QUEUE_EVENTS = {
  // Événements de job
  JOB_ACTIVE: 'active',
  JOB_COMPLETED: 'completed',
  JOB_FAILED: 'failed',
  JOB_PROGRESS: 'progress',
  JOB_STALLED: 'stalled',
  JOB_REMOVED: 'removed',

  // Événements de queue
  QUEUE_ERROR: 'error',
  QUEUE_WAITING: 'waiting',
  QUEUE_CLEANED: 'cleaned',
  QUEUE_DRAINED: 'drained',
  QUEUE_PAUSED: 'paused',
  QUEUE_RESUMED: 'resumed',
} as const;

/**
 * Configuration avancée de la queue Bull
 *
 * Paramètres optimisés pour le traitement de fichiers
 * avec gestion de la charge et de la résilience.
 */
export interface FileProcessingQueueConfig extends QueueOptions {
  /**
   * Configuration Redis spécifique
   */
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest?: number;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
  };

  /**
   * Paramètres de performance
   */
  defaultJobOptions?: JobOptions;

  /**
   * Limites et quotas
   */
  rateLimiter?: {
    max: number;
    duration: number;
    bounceBack?: boolean;
  };

  /**
   * Configuration des metrics
   */
  metrics?: {
    collectInterval?: number;
    maxDataPoints?: number;
  };
}

/**
 * Factory pour créer la configuration de queue
 *
 * Génère la configuration optimale selon l'environnement
 * et les paramètres du système.
 */
@Injectable()
export class FileProcessingQueueConfigFactory {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Crée la configuration complète de la queue
   *
   * @returns Configuration Bull optimisée pour le traitement de fichiers
   */
  createQueueConfig(): FileProcessingQueueConfig {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    return {
      redis: {
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      },

      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 3600, // 24h par défaut
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // 7 jours par défaut
          count: 5000,
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },

      // Rate limiter pour éviter la surcharge
      rateLimiter: {
        max: 100, // Max 100 jobs
        duration: 60000, // Par minute
        bounceBack: false,
      },

      // Configuration des métriques
      metrics: {
        collectInterval: 5000, // 5 secondes
        maxDataPoints: 1000,
      },
    };
  }

  /**
   * Crée les options Bull pour NestJS
   *
   * @returns Options formatées pour BullModule
   */
  createBullModuleOptions(): BullModuleOptions {
    const config = this.createQueueConfig();

    return {
      redis: config.redis,
      defaultJobOptions: config.defaultJobOptions,
      settings: {
        stalledInterval: 30000, // Vérifier les jobs bloqués toutes les 30s
        maxStalledCount: 3, // Max 3 fois bloqué avant échec
      },
    };
  }
}

/**
 * Module d'export pour la configuration de queue
 *
 * Fournit la configuration centralisée pour l'import dans
 * d'autres modules NestJS.
 */
export const FileProcessingQueueModule = BullModule.registerQueueAsync({
  name: FILE_PROCESSING_QUEUE_NAME,
  useFactory: (configFactory: FileProcessingQueueConfigFactory) => {
    return configFactory.createBullModuleOptions();
  },
  inject: [FileProcessingQueueConfigFactory],
});

/**
 * Utilitaires pour la gestion de queue
 */
export class QueueUtils {
  /**
   * Calcule la priorité ajustée selon la charge
   *
   * @param basePriority - Priorité de base
   * @param queueSize - Taille actuelle de la queue
   * @returns Priorité ajustée
   */
  static adjustPriorityForLoad(
    basePriority: number,
    queueSize: number,
  ): number {
    // Si la queue est chargée, augmenter légèrement la priorité
    // des jobs vraiment prioritaires
    if (queueSize > 100 && basePriority >= 7) {
      return Math.min(10, basePriority + 1);
    }

    return basePriority;
  }

  /**
   * Détermine si un job doit être retardé
   *
   * @param jobType - Type de job
   * @param currentLoad - Charge actuelle du système
   * @returns Délai en millisecondes (0 si pas de délai)
   */
  static getDelayForLoad(jobType: string, currentLoad: number): number {
    // Jobs de maintenance peuvent être retardés si charge élevée
    if (jobType === JOB_TYPES.CLEANUP_ARCHIVE && currentLoad > 0.8) {
      return 300000; // Retarder de 5 minutes
    }

    if (jobType === JOB_TYPES.EXTRACT_METADATA && currentLoad > 0.9) {
      return 60000; // Retarder de 1 minute
    }

    return 0; // Pas de délai
  }

  /**
   * Valide les options de job
   *
   * @param jobType - Type de job
   * @param options - Options fournies
   * @returns Options validées et complétées
   */
  static validateJobOptions(
    jobType: string,
    options: Partial<JobOptions>,
  ): JobOptions {
    const defaults =
      DEFAULT_JOB_OPTIONS[jobType] ||
      DEFAULT_JOB_OPTIONS[JOB_TYPES.PROCESS_UPLOADED_FILE];

    return {
      ...defaults,
      ...options,
      // S'assurer que certaines valeurs restent dans des limites raisonnables
      priority: Math.max(
        0,
        Math.min(10, options.priority || defaults.priority || 5),
      ),
      attempts: Math.max(
        1,
        Math.min(10, options.attempts || defaults.attempts || 3),
      ),
      timeout: Math.max(
        1000,
        Math.min(3600000, options.timeout || defaults.timeout || 60000),
      ),
    };
  }
}

/**
 * Interface pour les statistiques de queue
 *
 * Structure des métriques collectées pour monitoring
 */
export interface QueueStatistics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;

  // Métriques de performance
  avgProcessingTime: number;
  avgWaitTime: number;
  successRate: number;

  // Par type de job
  jobTypeStats: Record<
    string,
    {
      count: number;
      avgDuration: number;
      successRate: number;
    }
  >;
}

/**
 * Classe helper pour les statistiques de queue
 */
export class QueueStatisticsCollector {
  /**
   * Collecte les statistiques complètes de la queue
   *
   * @param queue - Instance de la queue Bull
   * @returns Statistiques agrégées
   */
  static async collectStatistics(queue: Queue): Promise<QueueStatistics> {
    const counts = await queue.getJobCounts();
    const isPaused = await queue.isPaused();

    // TODO: Implémenter la collecte des métriques détaillées
    // depuis Redis ou un système de métriques externe

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: isPaused,

      // Valeurs par défaut, à implémenter avec vraies métriques
      avgProcessingTime: 0,
      avgWaitTime: 0,
      successRate: 0,
      jobTypeStats: {},
    };
  }
}
