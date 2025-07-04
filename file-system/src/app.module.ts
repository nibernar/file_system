import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import fileSystemConfig from './config/file-system.config';
import { infrastructureConfig } from './infrastructure/config/infrastructure.config';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { GarageModule } from './infrastructure/garage/garage.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { ProcessingModule } from './infrastructure/processing/processing.module';
import { SecurityModule } from './infrastructure/security/security.module';
import { MonitoringModule } from './infrastructure/monitoring/monitoring.module';
import { ApplicationModule } from './application/application.module';
import { DomainModule } from './domain/domain.module';
import { PresentationModule } from './presentation/presentation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [fileSystemConfig, infrastructureConfig],
      cache: true,
      expandVariables: true,
    }),

    CacheModule.register({
      isGlobal: true,
      store: redisStore as any,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_CACHE_DB || '1'),
      ttl: 3600,
    }),

    PrismaModule,
    PersistenceModule,
    GarageModule.forRoot(),
    QueueModule,
    ProcessingModule,
    SecurityModule,
    MonitoringModule,
    ApplicationModule,
    DomainModule,
    PresentationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
