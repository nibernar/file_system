// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import fileSystemConfig from './config/file-system.config';

// Import du module Garage S3
import { GarageModule } from './infrastructure/garage/garage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [fileSystemConfig],
      cache: true,
      expandVariables: true,
    }),
    PrismaModule,
    PersistenceModule,
    GarageModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
