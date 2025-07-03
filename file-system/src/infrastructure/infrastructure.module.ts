/**
 * Module Principal d'Infrastructure
 * 
 * Ce module regroupe tous les modules d'infrastructure nécessaires
 * au fonctionnement du système de fichiers : storage, processing,
 * cache, monitoring, sécurité, etc.
 * 
 * @module InfrastructureModule
 * @version 1.0
 * @author DevOps Lead
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Modules d'infrastructure
import { GarageModule } from './garage/garage.module';
import { ProcessingModule } from './processing/processing.module';
import { QueueModule } from './queue/queue.module';
import { CacheModule } from './cache/cache.module';
import { SecurityModule } from './security/security.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PersistenceModule } from './persistence/persistence.module';

// Configuration spécifique à l'infrastructure
import { infrastructureConfig } from './config/infrastructure.config';

/**
 * Module d'infrastructure centralisant tous les services techniques
 * 
 * Architecture en couches :
 * - Storage : Garage S3 pour le stockage d'objets
 * - Processing : Traitement d'images, PDF, documents
 * - Queue : Traitement asynchrone avec Bull/Redis
 * - Cache : Cache distribué avec Redis
 * - Security : Antivirus, validation, rate limiting
 * - Monitoring : Métriques et logs
 * - Persistence : Accès base de données
 */
@Module({
  imports: [
    // Configuration infrastructure
    ConfigModule.forFeature(infrastructureConfig),
    
    // Modules de stockage et traitement
    GarageModule,
    ProcessingModule,
    
    // Modules de queue et cache
    QueueModule,
    CacheModule,
    
    // Modules de sécurité et monitoring
    SecurityModule,
    MonitoringModule,
    
    // Module de persistance
    PersistenceModule,
  ],
  exports: [
    // Export tous les modules pour utilisation dans l'application
    GarageModule,
    ProcessingModule,
    QueueModule,
    CacheModule,
    SecurityModule,
    MonitoringModule,
    PersistenceModule,
  ],
})
export class InfrastructureModule {}