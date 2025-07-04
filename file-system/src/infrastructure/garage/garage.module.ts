import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GarageStorageService } from './garage-storage.service';
import { GARAGE_STORAGE_SERVICE } from './garage-storage.interface';

/**
 * Module Garage S3 pour l'infrastructure de stockage
 *
 * Ce module configure et expose le service de stockage Garage S3
 * avec injection de dépendance et utilisation de votre système de configuration global.
 *
 * Fonctionnalités :
 * - Utilise votre ConfigModule global avancé
 * - Injection de dépendance avec interface abstraite
 * - Support configuration dynamique pour les tests
 * - Compatible avec votre système de validation sophistiqué
 *
 * @module GarageModule
 */
@Module({})
export class GarageModule {
  /**
   * Configuration statique pour l'utilisation normale
   * Utilise votre système de configuration global existant
   */
  static forRoot(): DynamicModule {
    return {
      module: GarageModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: GARAGE_STORAGE_SERVICE,
          useClass: GarageStorageService,
        },

        GarageStorageService,
      ],
      exports: [GARAGE_STORAGE_SERVICE, GarageStorageService],
      global: false,
    };
  }

  /**
   * Configuration pour les mocks (tests unitaires)
   * Permet d'injecter un mock du service
   */
  static forMocking(mockService: any): DynamicModule {
    return {
      module: GarageModule,
      providers: [
        {
          provide: GARAGE_STORAGE_SERVICE,
          useValue: mockService,
        },
        {
          provide: GarageStorageService,
          useValue: mockService,
        },
      ],
      exports: [GARAGE_STORAGE_SERVICE, GarageStorageService],
    };
  }
}
