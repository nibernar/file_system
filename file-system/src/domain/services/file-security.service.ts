import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  SecurityValidation,
  SecurityThreat,
  UploadFileDto,
  VirusScanResult,
  FormatValidation,
  ContentValidation,
  RateLimitResult,
  SecurityScanResult,
  FileOperation,
  PresignedUrlOptions,
  SecurePresignedUrl,
  QuarantineResult,
} from '../../types/file-system.types';
import {
  FileSecurityException,
  RateLimitExceededException,
  UnauthorizedFileAccessException,
  QuarantineException,
} from '../../exceptions/file-system.exceptions';
import { VirusScannerService } from '../../infrastructure/security/virus-scanner.service';
import { FileValidatorService } from '../../infrastructure/security/file-validator.service';
import { FileSystemConfig } from '../../config/file-system.config';

export interface IAuditService {
  logSecurityValidation(
    userId: string,
    validation: SecurityValidation,
  ): Promise<void>;
  logFileAccess(
    userId: string,
    fileId: string,
    operation: FileOperation,
    result: 'SUCCESS' | 'FAILURE',
    details?: any,
  ): Promise<void>;
  logUrlGeneration(
    fileId: string,
    userId: string,
    options: PresignedUrlOptions,
  ): Promise<void>;
}

export interface IRateLimitService {
  checkLimit(userId: string, operation?: string): Promise<RateLimitResult>;
  incrementCounter(userId: string, operation?: string): Promise<void>;
}

export interface IFileMetadataService {
  getFileMetadata(fileId: string): Promise<any>;
  updateFileSecurityStatus(fileId: string, status: any): Promise<void>;
}

export interface IStorageService {
  generatePresignedUrl(options: any): Promise<any>;
  moveToQuarantine(fileId: string, reason: string): Promise<void>;
}

/**
 * Service de sécurité principal pour le système de fichiers
 * Implémente la sécurité multi-couches selon les spécifications 03-06
 */
@Injectable()
export class FileSecurityService {
  private readonly logger = new Logger(FileSecurityService.name);

  constructor(
    private readonly virusScanner: VirusScannerService,
    private readonly fileValidator: FileValidatorService,
    private readonly configService: ConfigService,
    @Inject('IAuditService') private readonly auditService: IAuditService,
    @Inject('IRateLimitService')
    private readonly rateLimitService: IRateLimitService,
    @Inject('IFileMetadataService')
    private readonly fileMetadataService: IFileMetadataService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
  ) {}

  /**
   * Validation sécurité complète d'un fichier uploadé
   * Couvre : format, contenu, virus, rate limiting
   */
  async validateFileUpload(
    file: UploadFileDto,
    userId: string,
  ): Promise<SecurityValidation> {
    const validation: SecurityValidation = {
      passed: true,
      threats: [],
      mitigations: [],
      scanId: uuidv4(),
      confidenceScore: 100,
    };

    try {
      this.logger.log(
        `Starting security validation for file ${file.filename} by user ${userId}`,
      );

      // Récupération config depuis votre fichier existant
      const fileSystemConfig =
        this.configService.get<FileSystemConfig>('fileSystem');
      if (!fileSystemConfig) {
        throw new Error('File system configuration not loaded');
      }

      // 🔧 FIX 1: Rate limiting en PREMIER pour éviter le catch général
      const rateLimitCheck = await this.rateLimitService.checkLimit(
        userId,
        'upload',
      );
      if (!rateLimitCheck.allowed) {
        validation.passed = false;
        validation.threats.push(SecurityThreat.RATE_LIMIT_EXCEEDED);
        validation.mitigations.push('TEMPORARY_BLOCK');
        this.logger.warn(`Rate limit exceeded for user ${userId}`);

        // Audit avant de lancer l'exception
        await this.auditService.logSecurityValidation(userId, validation);

        throw new RateLimitExceededException(
          userId,
          rateLimitCheck.limit,
          rateLimitCheck.resetTime,
        );
      }

      // 1. Validation format et taille
      const formatValidation = await this.fileValidator.validateFormat(file);
      if (!formatValidation.valid) {
        validation.passed = false;
        validation.threats.push(SecurityThreat.INVALID_FORMAT);
        validation.mitigations.push('FORMAT_REJECTION');
        this.logger.warn(
          `Format validation failed for ${file.filename}: ${formatValidation.errors.join(', ')}`,
        );
      }

      // 2. Validation contenu et structure
      const contentValidation = await this.fileValidator.validateContent(file);
      if (!contentValidation.safe) {
        validation.passed = false;
        validation.threats.push(SecurityThreat.SUSPICIOUS_CONTENT);
        validation.mitigations.push('CONTENT_SANITIZATION');
        this.logger.warn(
          `Content validation failed for ${file.filename}:`,
          contentValidation.threats,
        );
      }

      // 3. Scan antivirus si activé
      if (fileSystemConfig.security.scanVirusEnabled) {
        const virusScan = await this.virusScanner.scanFile(file.buffer);

        if (!virusScan.clean) {
          validation.passed = false;
          validation.threats.push(SecurityThreat.MALWARE_DETECTED);
          validation.mitigations.push('QUARANTINE');
          this.logger.error(
            `Malware detected in ${file.filename}:`,
            virusScan.threats,
          );

          // Quarantaine immédiate
          await this.quarantineFile(file, virusScan);
        }
      }

      // 5. Device fingerprinting et analyse comportementale
      await this.analyzeUploadBehavior(userId, file, validation);

      // 6. Audit et logging
      await this.auditService.logSecurityValidation(userId, validation);

      if (validation.passed) {
        // Incrémenter compteur rate limit seulement si validation réussie
        await this.rateLimitService.incrementCounter(userId, 'upload');
        this.logger.log(`Security validation passed for ${file.filename}`);
      } else {
        this.logger.error(
          `Security validation failed for ${file.filename}:`,
          validation.threats,
        );
      }

      return validation;
    } catch (error) {
      // 🔧 FIX 1: Re-lancer les exceptions spécifiques sans les transformer
      if (error instanceof RateLimitExceededException) {
        throw error;
      }

      this.logger.error(
        `Security validation error for ${file.filename}:`,
        error,
      );

      // En cas d'erreur système, on rejette par sécurité
      validation.passed = false;
      validation.threats.push(SecurityThreat.SUSPICIOUS_CONTENT);
      validation.mitigations.push('SYSTEM_REJECTION');
      validation.details = { error: error.message };

      await this.auditService.logSecurityValidation(userId, validation);

      throw new FileSecurityException(
        'Security validation system error',
        validation.threats.map((t) => t.toString()),
      );
    }
  }

  /**
   * Vérification des permissions d'accès à un fichier
   */
  async checkFileAccess(
    fileId: string,
    userId: string,
    operation: FileOperation,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `Checking file access: ${operation} on ${fileId} by user ${userId}`,
      );

      // 1. Récupération métadonnées fichier
      const fileMetadata =
        await this.fileMetadataService.getFileMetadata(fileId);
      if (!fileMetadata) {
        this.logger.warn(`File not found: ${fileId}`);
        await this.auditService.logFileAccess(
          userId,
          fileId,
          operation,
          'FAILURE',
          { reason: 'FILE_NOT_FOUND' },
        );
        return false;
      }

      // 🔧 FIX 2: Vérification correcte de l'ownership
      if (fileMetadata.userId === userId) {
        this.logger.log(`Access granted: user ${userId} owns file ${fileId}`);
        await this.auditService.logFileAccess(
          userId,
          fileId,
          operation,
          'SUCCESS',
          { reason: 'OWNER_ACCESS' },
        );
        return true;
      }

      // 3. Vérification permissions projet si applicable
      if (fileMetadata.projectId) {
        const hasProjectAccess = await this.checkProjectAccess(
          userId,
          fileMetadata.projectId,
          operation,
        );
        if (hasProjectAccess) {
          this.logger.log(
            `Access granted: user ${userId} has project access to file ${fileId}`,
          );
          await this.auditService.logFileAccess(
            userId,
            fileId,
            operation,
            'SUCCESS',
            { reason: 'PROJECT_ACCESS' },
          );
          return true;
        }
      }

      // 4. Vérification permissions spéciales (admin, etc.)
      const hasSpecialAccess = await this.checkSpecialPermissions(
        userId,
        operation,
      );
      if (hasSpecialAccess) {
        this.logger.log(
          `Access granted: user ${userId} has special permissions for file ${fileId}`,
        );
        await this.auditService.logFileAccess(
          userId,
          fileId,
          operation,
          'SUCCESS',
          { reason: 'SPECIAL_PERMISSIONS' },
        );
        return true;
      }

      // 5. Accès refusé - audit de sécurité
      this.logger.warn(
        `Access denied: user ${userId} cannot ${operation} file ${fileId}`,
      );
      await this.auditService.logFileAccess(
        userId,
        fileId,
        operation,
        'FAILURE',
        { reason: 'INSUFFICIENT_PERMISSIONS' },
      );

      return false;
    } catch (error) {
      this.logger.error(`Error checking file access for ${fileId}:`, error);
      await this.auditService.logFileAccess(
        userId,
        fileId,
        operation,
        'FAILURE',
        { reason: 'SYSTEM_ERROR', error: error.message },
      );
      return false;
    }
  }

  /**
   * Génération d'URL pré-signée sécurisée avec restrictions
   */
  async generateSecurePresignedUrl(
    fileId: string,
    userId: string,
    options: PresignedUrlOptions,
  ): Promise<SecurePresignedUrl> {
    try {
      this.logger.log(
        `Generating secure presigned URL for file ${fileId} by user ${userId}`,
      );

      // 1. Validation permissions
      const hasAccess = await this.checkFileAccess(
        fileId,
        userId,
        FileOperation.READ,
      );
      if (!hasAccess) {
        throw new UnauthorizedFileAccessException(
          fileId,
          userId,
          FileOperation.READ.toString(),
        );
      }

      // 2. Récupération métadonnées fichier
      const fileMetadata =
        await this.fileMetadataService.getFileMetadata(fileId);
      if (!fileMetadata) {
        throw new FileSecurityException('File not found', ['FILE_NOT_FOUND']);
      }

      // 3. Validation expiration selon politique sécurité
      const fileSystemConfig =
        this.configService.get<FileSystemConfig>('fileSystem');
      const maxExpiry = fileSystemConfig?.security.presignedUrlExpiry || 3600;
      const expiresIn = Math.min(options.expiresIn || 3600, maxExpiry);

      // 4. Application restrictions sécurité
      const securityConditions = this.buildSecurityConditions(options);

      // 5. Génération URL avec restrictions
      const presignedUrl = await this.storageService.generatePresignedUrl({
        key: fileMetadata.storageKey,
        operation: options.operation,
        expiresIn,
        conditions: securityConditions,
      });

      // 🔧 FIX 3: Vérification que presignedUrl n'est pas undefined
      if (!presignedUrl || !presignedUrl.url) {
        throw new FileSecurityException(
          'Storage service failed to generate URL',
          ['STORAGE_ERROR'],
        );
      }

      // 6. Construction réponse sécurisée
      const secureUrl: SecurePresignedUrl = {
        url: presignedUrl.url,
        expiresAt:
          presignedUrl.expiresAt || new Date(Date.now() + expiresIn * 1000),
        restrictions: {
          operations: [options.operation],
          ipAddress: options.ipRestriction,
          userAgent: options.userAgent,
        },
        securityToken: this.generateSecurityToken(fileId, userId, options),
        auditId: uuidv4(),
      };

      // 7. Audit de génération URL
      await this.auditService.logUrlGeneration(fileId, userId, options);

      this.logger.log(
        `Secure presigned URL generated for file ${fileId}, expires in ${expiresIn}s`,
      );

      return secureUrl;
    } catch (error) {
      this.logger.error(
        `Error generating secure presigned URL for ${fileId}:`,
        error,
      );

      // 🔧 FIX 3: Re-lancer les exceptions spécifiques
      if (error instanceof UnauthorizedFileAccessException) {
        throw error;
      }

      if (error instanceof FileSecurityException) {
        throw error;
      }

      throw new FileSecurityException(
        'Failed to generate secure presigned URL',
        ['URL_GENERATION_ERROR'],
      );
    }
  }

  /**
   * Récupération du statut de scan sécurité d'un fichier
   */
  async getLatestScanResult(fileId: string): Promise<SecurityScanResult> {
    try {
      const fileMetadata =
        await this.fileMetadataService.getFileMetadata(fileId);

      return {
        safe: fileMetadata.virusScanStatus === 'CLEAN',
        threatsFound: fileMetadata.detectedThreats || [],
        engineVersion: fileMetadata.scannerVersion || 'unknown',
        signaturesDate: new Date(),
        scanDuration: fileMetadata.scanDuration || 0,
        scannedAt: fileMetadata.lastScanDate || fileMetadata.createdAt,
        scanDetails: {
          scanId: fileMetadata.lastScanId || 'unknown',
          status: fileMetadata.virusScanStatus,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting scan result for ${fileId}:`, error);
      throw new FileSecurityException('Failed to get security scan result', [
        'SCAN_RESULT_ERROR',
      ]);
    }
  }

  /**
   * Mise en quarantaine d'un fichier infecté ou suspect
   */
  private async quarantineFile(
    file: UploadFileDto,
    scanResult: VirusScanResult,
  ): Promise<QuarantineResult> {
    try {
      const quarantineId = uuidv4();

      this.logger.error(
        `Quarantining file ${file.filename} - threats: ${scanResult.threats?.join(', ')}`,
      );

      // 1. Déplacement vers zone de quarantaine
      await this.storageService.moveToQuarantine(
        file.filename,
        `Malware detected: ${scanResult.threats?.join(', ')}`,
      );

      // 2. Mise à jour statut sécurité
      const quarantineResult: QuarantineResult = {
        quarantineId,
        fileId: file.filename,
        reason: 'MALWARE_DETECTED',
        threats: scanResult.threats || [],
        quarantineDate: new Date(),
        automaticAction: true,
      };

      // 3. Notification équipe sécurité (si configuré)
      await this.notifySecurityTeam(quarantineResult);

      // 4. Audit de quarantaine
      await this.auditService.logFileAccess(
        'SYSTEM',
        file.filename,
        FileOperation.DELETE,
        'SUCCESS',
        quarantineResult,
      );

      return quarantineResult;
    } catch (error) {
      this.logger.error(`Error quarantining file ${file.filename}:`, error);
      throw new QuarantineException(file.filename, error.message);
    }
  }

  /**
   * Analyse comportementale des uploads pour détection d'anomalies
   */
  private async analyzeUploadBehavior(
    userId: string,
    file: UploadFileDto,
    validation: SecurityValidation,
  ): Promise<void> {
    try {
      const behaviorAnalysis: {
        suspiciousPatterns: string[];
        riskScore: number;
      } = {
        suspiciousPatterns: [],
        riskScore: 0,
      };

      // Vérification extensions multiples
      if (this.hasSuspiciousExtensions(file.filename)) {
        behaviorAnalysis.suspiciousPatterns.push('MULTIPLE_EXTENSIONS');
        behaviorAnalysis.riskScore += 30;
      }

      // Vérification taille anormale pour le type
      if (this.hasSuspiciousSize(file.contentType, file.size)) {
        behaviorAnalysis.suspiciousPatterns.push('SUSPICIOUS_SIZE');
        behaviorAnalysis.riskScore += 20;
      }

      // Si score de risque élevé, ajouter à la validation
      if (behaviorAnalysis.riskScore >= 50) {
        validation.threats.push(SecurityThreat.SUSPICIOUS_CONTENT);
        validation.mitigations.push('ENHANCED_MONITORING');
        this.logger.warn(
          `Suspicious upload behavior detected for user ${userId}:`,
          behaviorAnalysis,
        );
      }
    } catch (error) {
      this.logger.error('Error analyzing upload behavior:', error);
    }
  }

  /**
   * Construction des conditions de sécurité pour URLs pré-signées
   */
  private buildSecurityConditions(options: PresignedUrlOptions): any {
    const conditions: any = {};

    // Restriction IP si spécifiée
    if (options.ipRestriction && options.ipRestriction.length > 0) {
      conditions.ipAddress = options.ipRestriction;
    }

    // Restriction User-Agent si spécifiée
    if (options.userAgent) {
      conditions.userAgent = options.userAgent;
    }

    return conditions;
  }

  /**
   * Génération d'un token de sécurité pour l'URL pré-signée
   */
  private generateSecurityToken(
    fileId: string,
    userId: string,
    options: PresignedUrlOptions,
  ): string {
    const tokenData = {
      fileId,
      userId,
      operation: options.operation,
      timestamp: Date.now(),
    };

    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }

  /**
   * Vérification d'accès projet (à implémenter selon logique métier)
   */
  private async checkProjectAccess(
    userId: string,
    projectId: string,
    operation: FileOperation,
  ): Promise<boolean> {
    // TODO: Implémenter selon la logique d'autorisation des projets
    return false;
  }

  /**
   * Vérification permissions spéciales (admin, etc.)
   */
  private async checkSpecialPermissions(
    userId: string,
    operation: FileOperation,
  ): Promise<boolean> {
    // TODO: Implémenter selon la logique des rôles utilisateur
    return false;
  }

  /**
   * Notification équipe sécurité pour quarantaine
   */
  private async notifySecurityTeam(
    quarantineResult: QuarantineResult,
  ): Promise<void> {
    try {
      this.logger.warn(
        `Security team notification needed for quarantine ${quarantineResult.quarantineId}`,
      );
    } catch (error) {
      this.logger.error('Error notifying security team:', error);
    }
  }

  /**
   * Détection d'extensions suspectes
   */
  private hasSuspiciousExtensions(filename: string): boolean {
    const suspiciousPatterns = [
      /\.[^.]{1,3}\.[^.]{1,4}$/, // Double extensions
      /\.(exe|scr|bat|cmd|com|pif)$/i, // Exécutables
      /\.(js|vbs|ps1)$/i, // Scripts
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Détection de taille suspecte pour le type de fichier
   */
  private hasSuspiciousSize(contentType: string, size: number): boolean {
    const sizeLimits = {
      'text/plain': 10 * 1024 * 1024, // 10MB max pour texte
      'application/json': 5 * 1024 * 1024, // 5MB max pour JSON
      'image/png': 50 * 1024 * 1024, // 50MB max pour PNG
      'image/jpeg': 50 * 1024 * 1024, // 50MB max pour JPEG
    };

    const limit = sizeLimits[contentType];
    if (limit && size > limit) {
      return true;
    }

    // Fichier anormalement petit pour certains types
    if (contentType.startsWith('image/') && size < 100) {
      return true;
    }

    return false;
  }
}
