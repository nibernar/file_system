// src/infrastructure/processing/processing.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ImageProcessorService } from './image-processor.service';
import { PdfProcessorService } from './pdf-processor.service';
import { DocumentProcessorService } from './document-processor.service';
import { GarageModule } from '../garage/garage.module';
import fileSystemConfig, { FILE_SYSTEM_CONFIG } from '../../config/file-system.config';

@Module({
  imports: [
    ConfigModule.forFeature(fileSystemConfig),
    GarageModule.forRoot(),
  ],
  providers: [
    {
      provide: FILE_SYSTEM_CONFIG,
      useFactory: (configService: ConfigService) => {
        return configService.get('fileSystem') || fileSystemConfig();
      },
      inject: [ConfigService],
    },
    
    ImageProcessorService,
    PdfProcessorService,
    DocumentProcessorService,
  ],
  exports: [
    ImageProcessorService,
    PdfProcessorService,
    DocumentProcessorService,
  ],
})
export class ProcessingModule {}