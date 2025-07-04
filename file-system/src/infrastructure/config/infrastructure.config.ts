/**
 * Configuration centralisée de l'infrastructure
 *
 * Regroupe toutes les configurations des services d'infrastructure
 *
 * @module InfrastructureConfig
 * @version 1.0
 */

import { registerAs } from '@nestjs/config';

export const infrastructureConfig = registerAs('infrastructure', () => ({
  // Configuration Storage
  storage: {
    garage: {
      endpoint: process.env.GARAGE_ENDPOINT || 'http://localhost:3900',
      region: process.env.GARAGE_REGION || 'garage',
      accessKey: process.env.GARAGE_ACCESS_KEY,
      secretKey: process.env.GARAGE_SECRET_KEY,
      bucket: {
        documents: process.env.GARAGE_BUCKET_DOCUMENTS || 'coders-documents',
        backups: process.env.GARAGE_BUCKET_BACKUPS || 'coders-backups',
        temp: process.env.GARAGE_BUCKET_TEMP || 'coders-temp',
      },
    },
  },

  // Configuration Cache
  cache: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_CACHE_DB || '1', 10),
    },
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
    maxItems: parseInt(process.env.CACHE_MAX_ITEMS || '10000', 10),
  },

  // Configuration Queue
  queue: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_QUEUE_DB || '0', 10),
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    maxJobs: parseInt(process.env.QUEUE_MAX_JOBS || '100', 10),
  },

  // Configuration Processing
  processing: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10), // 100MB
    timeout: parseInt(process.env.PROCESSING_TIMEOUT || '300000', 10), // 5min
    imageQuality: parseInt(process.env.IMAGE_QUALITY || '85', 10),
    thumbnailSize: parseInt(process.env.THUMBNAIL_SIZE || '200', 10),
  },

  // Configuration Security
  security: {
    virusScan: {
      enabled: process.env.VIRUS_SCAN_ENABLED === 'true',
      timeout: parseInt(process.env.VIRUS_SCAN_TIMEOUT || '30000', 10),
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
  },

  // Configuration Monitoring
  monitoring: {
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      port: parseInt(process.env.METRICS_PORT || '9090', 10),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
    },
  },
}));
