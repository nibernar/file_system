import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  FILE_PROCESSING_QUEUE_NAME,
  FileProcessingQueueConfigFactory,
} from './file-processing.queue';
import { FileProcessingProcessor } from './file-processing.processor';

import { DomainModule } from '../../domain/domain.module';
import { ProcessingModule } from '../processing/processing.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [
    ConfigModule,
    DomainModule,
    ProcessingModule,
    MonitoringModule,
    PersistenceModule,

    BullModule.registerQueueAsync({
      name: FILE_PROCESSING_QUEUE_NAME,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [FileProcessingProcessor, FileProcessingQueueConfigFactory],
  exports: [BullModule, FileProcessingProcessor],
})
export class QueueModule {}
