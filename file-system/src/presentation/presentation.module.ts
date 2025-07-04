// src/presentation/presentation.module.ts
import { Module } from '@nestjs/common';
import { FileAccessGuard } from './guards/file-access.guard';
import { TestFilesController } from './controllers/test-files.controller';
import { FileSecurityService } from '../domain/services/file-security.service';
import { VirusScannerService } from '../infrastructure/security/virus-scanner.service';
import { FileValidatorService } from '../infrastructure/security/file-validator.service';
import { FileAuditInterceptor } from './interceptors/file-audit.interceptor';

/**
 * Providers temporaires pour les tests - remplacer par les vrais services plus tard
 */
const mockAuditService = {
  provide: 'IAuditService',
  useValue: {
    logSecurityValidation: async () =>
      console.log('Mock audit: security validation'),
    logFileAccess: async () => console.log('Mock audit: file access'),
    logUrlGeneration: async () => console.log('Mock audit: URL generation'),
  },
};

const mockRateLimitService = {
  provide: 'IRateLimitService',
  useValue: {
    checkLimit: async () => ({
      allowed: true,
      limit: 100,
      resetTime: new Date(),
    }),
    incrementCounter: async () =>
      console.log('Mock rate limit: counter incremented'),
  },
};

const mockFileMetadataService = {
  provide: 'IFileMetadataService',
  useValue: {
    getFileMetadata: async (fileId: string) => ({
      id: fileId,
      userId: 'test-user-123',
      filename: 'test.pdf',
      virusScanStatus: 'CLEAN',
      projectId: null,
    }),
    updateFileSecurityStatus: async () =>
      console.log('Mock metadata: status updated'),
  },
};

const mockStorageService = {
  provide: 'IStorageService',
  useValue: {
    generatePresignedUrl: async () => ({
      url: 'https://example.com/signed-url',
      expiresAt: new Date(Date.now() + 3600000),
    }),
    moveToQuarantine: async () =>
      console.log('Mock storage: moved to quarantine'),
  },
};

/**
 * Module de présentation regroupant les controllers, guards et interceptors
 *
 * Ce module gère la couche de présentation de l'API REST selon l'architecture
 * définie dans vos spécifications 03-06.
 */
@Module({
  controllers: [TestFilesController],
  providers: [
    FileAccessGuard,
    FileSecurityService,
    // Services existants (à adapter selon votre structure)
    VirusScannerService,
    FileValidatorService,
    // Providers temporaires pour les tests
    mockAuditService,
    mockRateLimitService,
    mockFileMetadataService,
    mockStorageService,
  ],
  exports: [FileAccessGuard],
})
export class PresentationModule {}
