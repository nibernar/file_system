// src/application/application.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ProcessFileAsyncUseCase } from './use-cases/process-file-async.use-case';
import { QueueModule } from '../infrastructure/queue/queue.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { MonitoringModule } from '../infrastructure/monitoring/monitoring.module';

@Module({
  imports: [
    QueueModule,
    PersistenceModule,
    MonitoringModule,

    CacheModule.register({
      store: 'memory',
      ttl: 300,
      max: 100,
    }),
  ],
  providers: [ProcessFileAsyncUseCase],
  exports: [ProcessFileAsyncUseCase],
})
export class ApplicationModule {}
