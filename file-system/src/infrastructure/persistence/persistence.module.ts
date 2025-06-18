// src/infrastructure/persistence/persistence.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { FileMetadataRepositoryImpl } from './file-metadata.repository.impl';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule.register({
      store: 'memory', // ou redis en production
      ttl: 300, // 5 minutes par défaut
    }),
  ],
  providers: [
    {
      provide: 'IFileMetadataRepository',
      useClass: FileMetadataRepositoryImpl,
    },
  ],
  exports: ['IFileMetadataRepository'],
})
export class PersistenceModule {}