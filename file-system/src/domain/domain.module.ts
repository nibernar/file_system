import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileProcessingService } from './services/file-processing.service';
import { FileSecurityService } from './services/file-security.service';
import { FileMetadataService } from './services/file-metadata.service';
import { FileVersioningService } from './services/file-versioning.service';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { GarageModule } from '../infrastructure/garage/garage.module';
import { SecurityModule } from '../infrastructure/security/security.module';
import { MonitoringModule } from '../infrastructure/monitoring/monitoring.module';
import { QueueModule } from '../infrastructure/queue/queue.module';
import fileSystemConfig, {
  FILE_SYSTEM_CONFIG,
} from '../config/file-system.config';
import { GarageStorageService } from '../infrastructure/garage/garage-storage.service';
import { AuditService } from '../infrastructure/monitoring/audit.service';
import { RateLimitService } from '../infrastructure/security/rate-limit.service';

@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    GarageModule.forRoot(),
    SecurityModule,
    MonitoringModule,
    forwardRef(() => QueueModule),
  ],
  providers: [
    {
      provide: FILE_SYSTEM_CONFIG,
      useFactory: () => fileSystemConfig(),
    },
    {
      provide: 'IAuditService',
      useExisting: AuditService,
    },
    {
      provide: 'IRateLimitService',
      useExisting: RateLimitService,
    },
    {
      provide: 'IFileMetadataService',
      useExisting: FileMetadataService,
    },
    {
      provide: 'IStorageService',
      useExisting: GarageStorageService,
    },

    FileProcessingService,
    FileSecurityService,
    FileMetadataService,
    FileVersioningService,
  ],
  exports: [
    FileProcessingService,
    FileSecurityService,
    FileMetadataService,
    FileVersioningService,
  ],
})
export class DomainModule {}
