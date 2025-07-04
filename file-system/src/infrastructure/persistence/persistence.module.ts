import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { FileMetadataRepositoryImpl } from './file-metadata.repository.impl';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule.register({
      store: 'memory',
      ttl: 300,
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
