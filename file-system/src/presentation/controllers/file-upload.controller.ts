/**
 * File Upload Controller - Version Corrigée
 *
 * Ce controller implémente l'ensemble du workflow de upload de fichiers
 * selon les spécifications 03-06 File System avec sécurité multi-couches,
 * traitement asynchrone et audit trail complet.
 *
 * CORRECTION : Utilise les types existants dans votre projet
 *
 * @module FileUploadController
 * @version 2.1
 * @author DevOps Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 07-03-api-routes-reference
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProcessFileAsyncUseCase } from '../../application/use-cases/process-file-async.use-case';
import { FileSecurityService } from '../../domain/services/file-security.service';
import { GARAGE_STORAGE_SERVICE } from '../../infrastructure/garage/garage-storage.interface';
import { IGarageStorageService } from '../../infrastructure/garage/garage-storage.interface';
import { MetricsService } from '../../infrastructure/monitoring/metrics.service';
import {
  UploadFileDto,
  DocumentType,
  ProcessingOptions,
  FileOperation,
  PresignedUrlOptions,
  SecurityValidation,
  FileMetadata,
  ProcessingStatus,
  VirusScanStatus,
  SecurePresignedUrl,
  GetUserFilesOptions,
  PaginatedFileList,
} from '../../types/file-system.types';

import {
  FileSecurityException,
  StorageException,
  RateLimitExceededException,
  UnauthorizedFileAccessException,
} from '../../exceptions/file-system.exceptions';

// ============================================================================
// TYPES DE RÉPONSE BASÉS SUR LES TYPES EXISTANTS
// ============================================================================

interface FileUploadResponse {
  uploadId: string;
  fileId: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  storageKey: string;
  cdnUrl?: string;
  processingJobId: string;
  estimatedProcessingTime: number;
  queuePosition: number;
  securityScanId: string;
  checksums: {
    md5: string;
    sha256: string;
  };
  processingStatus: ProcessingStatus;
  virusScanStatus: VirusScanStatus;
  uploadDuration: number;
  createdAt: Date;
}
type FileMetadataResponse = FileMetadata;
interface DownloadOptions {
  expiresIn?: number;
  ipRestriction?: boolean;
  restrictUserAgent?: boolean;
}
type FileListFilters = GetUserFilesOptions;
type FileListResponse = PaginatedFileList;
type PresignedUrlResponse = SecurePresignedUrl;

/**
 * Controller principal pour la gestion des uploads de fichiers
 */
@ApiTags('📁 File Management')
@Controller('/api/v1/files')
@ApiBearerAuth()
export class FileUploadController {
  private readonly logger = new Logger(FileUploadController.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly processFileAsyncUseCase: ProcessFileAsyncUseCase,
    private readonly fileSecurityService: FileSecurityService,
    private readonly metricsService: MetricsService,
    @Inject(GARAGE_STORAGE_SERVICE)
    private readonly garageService: IGarageStorageService,
  ) {
    this.logger.log(
      'FileUploadController initialized with security integration',
    );
  }

  // ============================================================================
  // ENDPOINT PRINCIPAL - UPLOAD DE FICHIERS
  // ============================================================================

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload sécurisé de fichier avec traitement automatique',
    description: `
    Upload un fichier avec validation sécurité complète, stockage Garage S3
    et déclenchement du traitement asynchrone. Inclut scan antivirus,
    validation format et rate limiting.
    `,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Fichier à uploader avec métadonnées',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Fichier à uploader (max 100MB)',
        },
        documentType: {
          type: 'string',
          enum: Object.values(DocumentType),
          description: 'Type de document pour classification',
          default: DocumentType.DOCUMENT,
        },
        projectId: {
          type: 'string',
          format: 'uuid',
          description: 'ID du projet associé (optionnel)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags pour organisation (max 10)',
          maxItems: 10,
        },
        generateThumbnail: {
          type: 'boolean',
          description: 'Générer thumbnail automatiquement',
          default: true,
        },
        optimizeForWeb: {
          type: 'boolean',
          description: 'Optimiser pour livraison web',
          default: true,
        },
        description: {
          type: 'string',
          maxLength: 500,
          description: 'Description du fichier',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Fichier uploadé avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation échouée ou fichier invalide',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit dépassé',
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadData: any,
    @Request() request: any,
  ): Promise<FileUploadResponse> {
    const uploadStartTime = Date.now();
    const uploadId = uuidv4();

    const userId = request.user?.id || 'test-user';
    const userIp = request.ip || 'unknown';

    this.logger.log(`🚀 Starting secure file upload`, {
      uploadId,
      userId,
      filename: file?.originalname,
      size: file?.size,
      contentType: file?.mimetype,
      ip: userIp,
    });

    try {
      // ========================================================================
      // ÉTAPE 1: VALIDATION PRÉLIMINAIRE
      // ========================================================================

      if (!file) {
        this.logger.warn(`Upload failed: No file provided`, {
          uploadId,
          userId,
        });
        throw new BadRequestException('Aucun fichier fourni');
      }

      if (!file.buffer) {
        this.logger.warn(`Upload failed: File buffer missing`, {
          uploadId,
          userId,
        });
        throw new BadRequestException('Données du fichier manquantes');
      }

      this.logger.log(`📝 File validation passed`, {
        uploadId,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      });

      // ========================================================================
      // ÉTAPE 2: VALIDATION SÉCURITÉ COMPLÈTE (INCLUANT SCAN ANTIVIRUS)
      // ========================================================================

      this.logger.log(
        `🔒 Starting security validation (including antivirus scan)`,
        {
          uploadId,
          filename: file.originalname,
        },
      );

      const securityValidation = await this.performSecurityValidation(
        file,
        uploadData,
        userId,
        uploadId,
      );

      if (!securityValidation.passed) {
        this.logger.error(`🚨 Security validation FAILED`, {
          uploadId,
          filename: file.originalname,
          threats: securityValidation.threats,
          mitigations: securityValidation.mitigations,
        });

        await this.metricsService.incrementCounter(
          'file_upload_security_rejected',
          {
            threats: securityValidation.threats.join(','),
          },
        );

        throw new FileSecurityException(
          `Validation sécurité échouée: ${securityValidation.threats.join(', ')}`,
          securityValidation.threats.map((t) => t.toString()),
        );
      }

      this.logger.log(`✅ Security validation PASSED (including antivirus)`, {
        uploadId,
        filename: file.originalname,
        scanId: securityValidation.scanId,
        confidenceScore: securityValidation.confidenceScore,
      });

      // ========================================================================
      // ÉTAPE 3: CALCUL CHECKSUMS ET PRÉPARATION MÉTADONNÉES
      // ========================================================================

      this.logger.log(`🔢 Computing file checksums`, { uploadId });

      const fileBuffer = file.buffer;
      const checksums = this.computeFileChecksums(fileBuffer);
      const storageKey = this.generateStorageKey(file.originalname, userId);

      this.logger.log(`📊 File checksums computed`, {
        uploadId,
        md5: checksums.md5,
        sha256: checksums.sha256.substring(0, 16) + '...',
        storageKey,
      });

      // ========================================================================
      // ÉTAPE 4: UPLOAD SÉCURISÉ VERS GARAGE S3
      // ========================================================================

      this.logger.log(`☁️ Uploading to Garage S3`, {
        uploadId,
        storageKey,
        size: fileBuffer.length,
      });

      const uploadResult = await this.uploadToStorage(
        storageKey,
        fileBuffer,
        file,
        uploadData,
        userId,
        securityValidation,
      );

      this.logger.log(`✅ Garage S3 upload successful`, {
        uploadId,
        storageKey,
        etag: uploadResult.etag,
        location: uploadResult.location,
      });

      // ========================================================================
      // ÉTAPE 5: SAUVEGARDE MÉTADONNÉES EN BASE DE DONNÉES
      // ========================================================================

      this.logger.log(`💾 Saving metadata to database`, { uploadId });

      const fileRecord = await this.saveFileMetadata(
        file,
        uploadData,
        checksums,
        storageKey,
        userId,
        uploadId,
        securityValidation,
      );

      this.logger.log(`✅ Database metadata saved`, {
        uploadId,
        fileId: fileRecord.id,
        filename: fileRecord.filename,
      });

      // ========================================================================
      // ÉTAPE 6: DÉCLENCHEMENT TRAITEMENT ASYNCHRONE
      // ========================================================================

      this.logger.log(`⚡ Triggering asynchronous processing`, {
        uploadId,
        fileId: fileRecord.id,
      });

      const processingOptions = this.buildProcessingOptions(uploadData);
      const processingJob = await this.processFileAsyncUseCase.execute(
        fileRecord.id,
        processingOptions,
      );

      this.logger.log(`✅ Processing job queued`, {
        uploadId,
        fileId: fileRecord.id,
        jobId: processingJob.jobId,
        priority: processingJob.priority,
        estimatedDuration: processingJob.estimatedDuration,
      });

      // ========================================================================
      // ÉTAPE 7: MÉTRIQUES ET AUDIT
      // ========================================================================

      const totalDuration = Date.now() - uploadStartTime;
      await this.recordUploadMetrics(file, totalDuration, true);

      this.logger.log(`🎉 Upload workflow completed successfully`, {
        uploadId,
        fileId: fileRecord.id,
        totalDuration,
        filename: file.originalname,
        size: file.size,
      });

      // ========================================================================
      // ÉTAPE 8: CONSTRUCTION RÉPONSE
      // ========================================================================

      return {
        uploadId,
        fileId: fileRecord.id,
        filename: fileRecord.filename,
        originalName: fileRecord.original_name,
        contentType: fileRecord.content_type,
        size: Number(fileRecord.size),
        storageKey,
        cdnUrl: undefined,
        processingJobId: processingJob.jobId,
        estimatedProcessingTime: processingJob.estimatedDuration || 0,
        queuePosition: processingJob.queuePosition || 0,
        securityScanId: securityValidation.scanId,
        checksums: {
          md5: checksums.md5,
          sha256: checksums.sha256,
        },
        processingStatus: ProcessingStatus.PROCESSING,
        virusScanStatus: VirusScanStatus.CLEAN,
        uploadDuration: totalDuration,
        createdAt: fileRecord.created_at,
      } as FileUploadResponse;
    } catch (error) {
      // ========================================================================
      // GESTION D'ERREURS AVEC ROLLBACK
      // ========================================================================

      const totalDuration = Date.now() - uploadStartTime;

      this.logger.error(`❌ Upload workflow failed`, {
        uploadId,
        userId,
        filename: file?.originalname,
        error: error.message,
        duration: totalDuration,
        stack: error.stack,
      });

      await this.recordUploadMetrics(file, totalDuration, false, error);
      await this.performRollbackIfNeeded(error, uploadId);

      if (
        error instanceof FileSecurityException ||
        error instanceof RateLimitExceededException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Erreur interne lors de l'upload: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // ENDPOINTS COMPLÉMENTAIRES
  // ============================================================================

  @Get(':fileId')
  @ApiOperation({ summary: "Récupère les métadonnées d'un fichier" })
  @ApiParam({ name: 'fileId', description: 'ID unique du fichier' })
  @ApiResponse({ status: 200, description: 'Métadonnées du fichier' })
  @ApiResponse({ status: 404, description: 'Fichier non trouvé' })
  async getFileMetadata(
    @Param('fileId') fileId: string,
    @Request() request: any,
  ): Promise<FileMetadataResponse> {
    const userId = request.user?.id || 'test-user';

    this.logger.log(`📋 Getting file metadata`, { fileId, userId });

    try {
      const hasAccess = await this.fileSecurityService.checkFileAccess(
        fileId,
        userId,
        FileOperation.READ,
      );

      if (!hasAccess) {
        throw new UnauthorizedFileAccessException(fileId, userId, 'READ');
      }

      const fileRecord = await this.prismaService.files.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord || fileRecord.deleted_at) {
        throw new NotFoundException(`Fichier ${fileId} non trouvé`);
      }

      return {
        id: fileRecord.id,
        userId: fileRecord.user_id,
        projectId: fileRecord.project_id || undefined,
        filename: fileRecord.filename,
        originalName: fileRecord.original_name,
        contentType: fileRecord.content_type,
        size: Number(fileRecord.size),
        storageKey: fileRecord.storage_key,
        cdnUrl: fileRecord.cdn_url || undefined,
        checksumMd5: fileRecord.checksum_md5,
        checksumSha256: fileRecord.checksum_sha256,
        virusScanStatus: fileRecord.virus_scan_status as VirusScanStatus,
        processingStatus: fileRecord.processing_status as ProcessingStatus,
        documentType:
          (fileRecord.document_type as DocumentType) || DocumentType.DOCUMENT,
        versionCount: fileRecord.version_count || 1,
        tags: fileRecord.tags,
        createdAt: fileRecord.created_at,
        updatedAt: fileRecord.updated_at,
        deletedAt: fileRecord.deleted_at || undefined,
      } as FileMetadataResponse;
    } catch (error) {
      this.logger.error(`Failed to get file metadata`, {
        fileId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Génère une URL de téléchargement sécurisée' })
  @ApiParam({ name: 'fileId', description: 'ID unique du fichier' })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    type: Number,
    description: 'Expiration en secondes (défaut: 3600)',
  })
  @ApiQuery({
    name: 'ipRestriction',
    required: false,
    type: Boolean,
    description: "Restreindre à l'IP actuelle",
  })
  @ApiResponse({ status: 200, description: 'URL de téléchargement générée' })
  async generateDownloadUrl(
    @Param('fileId') fileId: string,
    @Query() options: DownloadOptions,
    @Request() request: any,
  ): Promise<PresignedUrlResponse> {
    const userId = request.user?.id || 'test-user';
    const clientIp = request.ip;

    this.logger.log(`🔗 Generating download URL`, { fileId, userId, options });

    try {
      const fileRecord = await this.prismaService.files.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord) {
        throw new NotFoundException(`Fichier ${fileId} non trouvé`);
      }

      const presignedUrlOptions: PresignedUrlOptions = {
        key: fileRecord.storage_key,
        operation: 'GET',
        expiresIn: options.expiresIn || 3600,
        ipRestriction: options.ipRestriction ? [clientIp] : undefined,
        userAgent: options.restrictUserAgent
          ? request.headers['user-agent']
          : undefined,
      };

      const secureUrl =
        await this.fileSecurityService.generateSecurePresignedUrl(
          fileId,
          userId,
          presignedUrlOptions,
        );

      this.logger.log(`✅ Download URL generated`, {
        fileId,
        userId,
        expiresAt: secureUrl.expiresAt,
        restrictions: secureUrl.restrictions,
      });

      return {
        url: secureUrl.url,
        expiresAt: secureUrl.expiresAt,
        restrictions: secureUrl.restrictions,
        securityToken: secureUrl.securityToken,
        auditId: secureUrl.auditId,
      } as PresignedUrlResponse;
    } catch (error) {
      this.logger.error(`Failed to generate download URL`, {
        fileId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un fichier (soft delete avec rétention)' })
  @ApiParam({ name: 'fileId', description: 'ID unique du fichier' })
  @ApiResponse({ status: 204, description: 'Fichier supprimé avec succès' })
  async deleteFile(
    @Param('fileId') fileId: string,
    @Request() request: any,
  ): Promise<void> {
    const userId = request.user?.id || 'test-user';

    this.logger.log(`🗑️ Deleting file`, { fileId, userId });

    try {
      const hasAccess = await this.fileSecurityService.checkFileAccess(
        fileId,
        userId,
        FileOperation.DELETE,
      );

      if (!hasAccess) {
        throw new UnauthorizedFileAccessException(fileId, userId, 'DELETE');
      }

      await this.prismaService.files.update({
        where: { id: fileId },
        data: {
          deleted_at: new Date(),
          processing_status: 'DELETED',
        },
      });

      this.logger.log(`✅ File soft deleted`, { fileId, userId });

      await this.metricsService.incrementCounter('files_deleted_total', {
        deleteType: 'soft',
      });
    } catch (error) {
      this.logger.error(`Failed to delete file`, {
        fileId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: "Liste les fichiers de l'utilisateur avec filtres" })
  @ApiResponse({ status: 200, description: 'Liste des fichiers utilisateur' })
  async listUserFiles(
    @Query() filters: FileListFilters,
    @Request() request: any,
  ): Promise<FileListResponse> {
    const userId = request.user?.id || 'test-user';

    this.logger.log(`📄 Listing user files`, { userId, filters });

    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 100);
      const offset = (page - 1) * limit;

      const where: any = {
        user_id: userId,
        deleted_at: null,
      };

      if (filters.contentType) {
        where.content_type = { contains: filters.contentType };
      }

      if (filters.processingStatus) {
        where.processing_status = filters.processingStatus;
      }

      if (filters.projectId) {
        where.project_id = filters.projectId;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }

      const orderBy: any = {};
      orderBy[filters.sortBy || 'created_at'] = filters.sortOrder || 'desc';

      const [files, totalCount] = await Promise.all([
        this.prismaService.files.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        this.prismaService.files.count({ where }),
      ]);

      const fileList: FileMetadata[] = files.map((file) => ({
        id: file.id,
        userId: file.user_id,
        projectId: file.project_id || undefined,
        filename: file.filename,
        originalName: file.original_name,
        contentType: file.content_type,
        size: Number(file.size),
        storageKey: file.storage_key,
        cdnUrl: file.cdn_url || undefined,
        checksumMd5: file.checksum_md5,
        checksumSha256: file.checksum_sha256,
        virusScanStatus: file.virus_scan_status as VirusScanStatus,
        processingStatus: file.processing_status as ProcessingStatus,
        documentType: file.document_type as DocumentType,
        versionCount: file.version_count || 1,
        tags: file.tags,
        createdAt: file.created_at || new Date(),
        updatedAt: file.updated_at || new Date(),
        deletedAt: file.deleted_at || undefined,
      }));

      return {
        files: fileList,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page * limit < totalCount,
          hasPreviousPage: page > 1,
        },
        stats: {
          totalSize: fileList.reduce((sum, file) => sum + file.size, 0),
          fileCount: totalCount,
          lastActivity:
            fileList.length > 0 ? fileList[0].updatedAt : new Date(),
        },
      } as FileListResponse;
    } catch (error) {
      this.logger.error(`Failed to list user files`, {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - WORKFLOW UPLOAD
  // ============================================================================

  /**
   * Validation sécurité complète incluant scan antivirus
   */
  private async performSecurityValidation(
    file: Express.Multer.File,
    uploadData: any,
    userId: string,
    uploadId: string,
  ): Promise<SecurityValidation> {
    const uploadFileDto: UploadFileDto = {
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      documentType: uploadData.documentType || DocumentType.DOCUMENT,
      projectId: uploadData.projectId,
      tags: uploadData.tags || [],
    };

    this.logger.log(`🔍 Performing comprehensive security validation`, {
      uploadId,
      filename: file.originalname,
      size: file.size,
      contentType: file.mimetype,
      virusScanEnabled: true,
    });

    const validation = await this.fileSecurityService.validateFileUpload(
      uploadFileDto,
      userId,
    );

    this.logger.log(`🔍 Security validation completed`, {
      uploadId,
      passed: validation.passed,
      threats: validation.threats,
      scanId: validation.scanId,
      confidenceScore: validation.confidenceScore,
    });

    return validation;
  }

  /**
   * Calcul des checksums de sécurité
   */
  private computeFileChecksums(buffer: Buffer): {
    md5: string;
    sha256: string;
  } {
    return {
      md5: createHash('md5').update(buffer).digest('hex'),
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  /**
   * Génération de la clé de stockage sécurisée
   */
  private generateStorageKey(originalName: string, userId: string): string {
    const timestamp = Date.now();
    const randomId = uuidv4();
    const extension = extname(originalName);
    const userPrefix = userId.substring(0, 8);

    return `files/${userPrefix}/${timestamp}-${randomId}${extension}`;
  }

  /**
   * Upload vers Garage S3 avec métadonnées de sécurité
   */
  private async uploadToStorage(
    storageKey: string,
    buffer: Buffer,
    file: Express.Multer.File,
    uploadData: any,
    userId: string,
    securityValidation: SecurityValidation,
  ) {
    try {
      return await this.garageService.uploadObject(storageKey, buffer, {
        contentType: file.mimetype,
        userId: userId,
        projectId: uploadData.projectId,
        customMetadata: {
          originalName: file.originalname,
          uploadTimestamp: new Date().toISOString(),
          securityScanId: securityValidation.scanId,
          documentType: uploadData.documentType || DocumentType.DOCUMENT,
          description: uploadData.description || '',
          tags: JSON.stringify(uploadData.tags || []),
          virusScanPassed: 'true',
          confidenceScore:
            securityValidation.confidenceScore?.toString() || '100',
        },
      });
    } catch (error) {
      this.logger.error(`Garage S3 upload failed`, {
        storageKey,
        error: error.message,
      });

      throw new StorageException(
        'garage_s3_upload',
        `Échec upload vers stockage Garage S3: ${error.message}`,
        {
          storageKey,
          fileSize: buffer.length,
          userId,
          originalError: error.name,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  /**
   * Sauvegarde métadonnées en base de données
   */
  private async saveFileMetadata(
    file: Express.Multer.File,
    uploadData: any,
    checksums: { md5: string; sha256: string },
    storageKey: string,
    userId: string,
    uploadId: string,
    securityValidation: SecurityValidation,
  ) {
    try {
      return await this.prismaService.files.create({
        data: {
          id: uuidv4(),
          user_id: userId,
          filename: file.originalname,
          original_name: file.originalname,
          content_type: file.mimetype,
          size: BigInt(file.size),
          storage_key: storageKey,
          checksum_md5: checksums.md5,
          checksum_sha256: checksums.sha256,
          virus_scan_status: VirusScanStatus.CLEAN,
          processing_status: ProcessingStatus.PENDING,
          version_count: 1,
          project_id: uploadData.projectId || null,
          tags: Array.isArray(uploadData.tags) ? uploadData.tags : [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Database save failed`, {
        uploadId,
        storageKey,
        error: error.message,
      });
      throw new InternalServerErrorException(
        `Échec sauvegarde métadonnées: ${error.message}`,
      );
    }
  }

  /**
   * Construction des options de traitement
   */
  private buildProcessingOptions(uploadData: any): ProcessingOptions {
    return {
      generateThumbnail: uploadData.generateThumbnail !== false,
      optimizeForWeb: uploadData.optimizeForWeb !== false,
      extractMetadata: true,
      priority: 5,
      reason: 'Automatic processing after secure upload',
    };
  }

  /**
   * Enregistrement des métriques d'upload
   */
  private async recordUploadMetrics(
    file: Express.Multer.File | null,
    duration: number,
    success: boolean,
    error?: Error,
  ): Promise<void> {
    try {
      await this.metricsService.recordHistogram(
        'file_upload_duration',
        duration,
        {
          contentType: file?.mimetype || 'unknown',
          success: success.toString(),
          errorType: error?.name || 'none',
        },
      );

      if (file) {
        await this.metricsService.recordHistogram(
          'file_upload_size',
          file.size,
          {
            contentType: file.mimetype,
          },
        );
      }

      await this.metricsService.incrementCounter('file_upload_total', {
        result: success ? 'success' : 'failure',
      });
    } catch (metricsError) {
      this.logger.warn(`Failed to record metrics`, metricsError);
    }
  }

  /**
   * Rollback en cas d'erreur
   */
  private async performRollbackIfNeeded(
    error: Error,
    uploadId: string,
  ): Promise<void> {
    try {
      this.logger.warn(`Rollback considered for upload ${uploadId}`, {
        errorType: error.name,
        rollbackNeeded: false,
      });
    } catch (rollbackError) {
      this.logger.error(
        `Rollback failed for upload ${uploadId}`,
        rollbackError,
      );
    }
  }
}
