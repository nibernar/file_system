/**
 * Module de Gestion du Cache
 * 
 * Ce module configure et expose les services de cache utilisant Redis
 * pour optimiser les performances du système de fichiers.
 * 
 * @module CacheModule
 * @version 1.0
 * @author DevOps Lead
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisDb = configService.get<number>('REDIS_CACHE_DB', 1);
        
        return {
          store: redisStore as any,
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          db: redisDb,
          ttl: configService.get<number>('CACHE_TTL', 3600),
          max: configService.get<number>('CACHE_MAX_ITEMS', 10000),
          // Retirer socket et autres options non supportées
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule {}