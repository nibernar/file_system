/**
 * Module de Monitoring et Métriques
 *
 * Ce module fournit les services de monitoring, métriques et logging
 * pour surveiller le système de fichiers en temps réel.
 *
 * @module MonitoringModule
 * @version 1.0
 * @author DevOps Lead
 */

import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { AuditService } from './audit.service';
import { HealthCheckService } from './health-check.service';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

/**
 * Module global de monitoring
 *
 * Fournit :
 * - Métriques Prometheus pour Grafana
 * - Service d'audit pour traçabilité
 * - Health checks pour Kubernetes
 */
@Global()
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'file_system_',
        },
      },
      defaultLabels: {
        app: 'file-system',
        version: process.env.APP_VERSION || '1.0.0',
      },
    }),
  ],
  providers: [MetricsService, AuditService, HealthCheckService],
  exports: [MetricsService, AuditService, HealthCheckService],
})
export class MonitoringModule {}
