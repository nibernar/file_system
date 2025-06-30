
import { Module, DynamicModule, Type } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { FileProcessingService } from '../../domain/services/file-processing.service';
import { ExtendedProcessingOptions } from '../../types/file-system.types';

export interface ProcessingModuleOptions {
  config?: ExtendedProcessingOptions;
  inject?: any[];
  global?: boolean;
  useFactory?: (...args: any[]) => ProcessingModuleOptions | Promise<ProcessingModuleOptions>;
}

/**
 * Configuration optionnelle pour le module de traitement
 */
export interface ProcessingModuleOptions {
  enableImageProcessing?: boolean;
  enablePdfProcessing?: boolean;
  enableDocumentProcessing?: boolean;
  queueConfig?: {
    name?: string;
    redis?: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
    };
  };
}

/**
 * Module de traitement de fichiers - Version simplifiée
 */
@Module({})
export class ProcessingModule {
  /**
   * Configuration statique du module
   */
  static forRoot(options: ProcessingModuleOptions = {}): DynamicModule {
    const {
      enableImageProcessing = true,
      enablePdfProcessing = true,
      enableDocumentProcessing = true,
      queueConfig = {}
    } = options;

    // Providers de base
    const providers: Type<any>[] = [FileProcessingService];
    const exports: Type<any>[] = [FileProcessingService];
    const imports: any[] = [];

    // Services spécialisés (à ajouter quand disponibles)
    if (enableImageProcessing) {
      try {
        const { ImageProcessorService } = require('./image-processor.service');
        providers.push(ImageProcessorService);
        exports.push(ImageProcessorService);
      } catch (error) {
        // Service non disponible, on continue sans
      }
    }

    if (enablePdfProcessing) {
      try {
        const { PdfProcessorService } = require('./pdf-processor.service');
        providers.push(PdfProcessorService);
        exports.push(PdfProcessorService);
      } catch (error) {
        // Service non disponible, on continue sans
      }
    }

    if (enableDocumentProcessing) {
      try {
        const { DocumentProcessorService } = require('./document-processor.service');
        providers.push(DocumentProcessorService);
        exports.push(DocumentProcessorService);
      } catch (error) {
        // Service non disponible, on continue sans
      }
    }

    // Configuration queue Redis
    const queueName = queueConfig.name || 'file-processing';
    imports.push(
      BullModule.registerQueue({
        name: queueName,
        redis: {
          host: queueConfig.redis?.host || process.env.REDIS_HOST || 'localhost',
          port: queueConfig.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
          password: queueConfig.redis?.password || process.env.REDIS_PASSWORD,
          db: queueConfig.redis?.db || parseInt(process.env.REDIS_DB || '0', 10),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      })
    );

    return {
      module: ProcessingModule,
      imports,
      providers,
      exports,
    };
  }

  /**
   * Configuration asynchrone du module
   */
  static forRootAsync(options: {
    imports?: any[];
    useFactory?: (...args: any[]) => ProcessingModuleOptions | Promise<ProcessingModuleOptions>;
    inject?: any[];
  }): DynamicModule {
    const asyncProviders = [];

    if (options && typeof options === 'object' && 'useFactory' in options && options.useFactory) {
      const provider = {
        provide: 'PROCESSING_MODULE_OPTIONS',
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
      (asyncProviders as any[]).push(provider);
    }

    return {
      module: ProcessingModule,
      imports: options.imports || [],
      providers: [
        ...asyncProviders,
        FileProcessingService,
      ],
      exports: [
        FileProcessingService,
      ],
    };
  }
}