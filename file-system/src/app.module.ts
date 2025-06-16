// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ❌ MANQUAIT
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import de votre configuration file system
import fileSystemConfig from './config/file-system.config';

// Import du module Garage S3
import { GarageModule } from './infrastructure/garage/garage.module';

@Module({
  imports: [
    // Configuration globale avec votre config file system
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [fileSystemConfig], // Charge la configuration
      cache: true, // Cache la configuration pour les performances
      expandVariables: true, // Support des variables dans les env vars
    }),
    
    // Module Garage S3 pour le stockage
    GarageModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}