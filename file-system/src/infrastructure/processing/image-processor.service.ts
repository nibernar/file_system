/**
 * Service de traitement d'images pour le système Coders V1
 *
 * Ce service spécialisé gère toutes les opérations de traitement d'images :
 * optimisation, redimensionnement, conversion de format, génération de thumbnails,
 * et compression intelligente. Il utilise Sharp pour des performances optimales
 * et supporte les formats modernes comme WebP et AVIF.
 *
 * @version 1.0
 * @author Backend Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 05-06-file-system-plan Phase 3.1
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import * as sharp from 'sharp';
import {
  ImageFormat,
  LocalThumbnailResult,
} from '../../types/file-system.types';
import type { FileSystemConfig } from '../../config/file-system.config';
import { GarageStorageService } from '../garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../config/file-system.config';
import {
  FileNotFoundException,
  OptimizationException,
  ThumbnailGenerationException,
  FormatConversionException,
} from '../../exceptions/file-system.exceptions';

/**
 * Options pour l'optimisation d'images
 */
export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: ImageFormat;
  preserveExif?: boolean;
  progressive?: boolean;
  optimizeForWeb?: boolean;
}

/**
 * Résultat d'optimisation d'image détaillé
 */
export interface LocalOptimizedImage {
  buffer: Buffer;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  format: string;
  dimensions: {
    width: number;
    height: number;
  };
  metadata?: Record<string, any>;
  storageKey?: string;
}

/**
 * Résultat de conversion de format
 */
export interface LocalConversionResult {
  success: boolean;
  fromFormat: string;
  toFormat: string;
  buffer: Buffer;
  originalSize: number;
  convertedSize: number;
  compressionRatio: number;
  qualityRetained: number;
  conversionTime: number;
  error?: string;
}

/**
 * Service de traitement d'images avec Sharp
 *
 * Fournit toutes les opérations de traitement d'images nécessaires au système
 * de fichiers, avec optimisations pour la performance et la qualité.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  private readonly supportedInputFormats = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/avif',
  ];

  private readonly formatDefaults = {
    jpeg: { progressive: true, mozjpeg: true },
    png: { compressionLevel: 9, adaptiveFiltering: true },
    webp: { effort: 6, smartSubsample: true },
    avif: { effort: 9, chromaSubsampling: '4:2:0' as const },
  };

  /**
   * Constructeur avec injection de dépendances
   */
  constructor(
    private readonly storageService: GarageStorageService,
    @Inject(FILE_SYSTEM_CONFIG)
    private readonly config: FileSystemConfig,
  ) {
    this.logger.log("Service de traitement d'images initialisé");
  }

  /**
   * Optimise une image avec compression intelligente
   *
   * Applique les meilleures pratiques d'optimisation selon le format et l'usage :
   * - Redimensionnement intelligent préservant le ratio
   * - Compression adaptative selon qualité cible
   * - Conversion vers formats modernes (WebP, AVIF)
   * - Suppression métadonnées sensibles par défaut
   *
   * @param fileId - Identifiant du fichier image source
   * @param options - Options d'optimisation personnalisées
   * @returns Résultat détaillé avec image optimisée
   */
  async optimizeImage(
    fileId: string,
    options: ImageOptimizationOptions = {},
  ): Promise<LocalOptimizedImage> {
    const startTime = Date.now();

    this.logger.debug(`Optimisation image ${fileId} avec options:`, options);

    try {
      const sourceBuffer = await this.getImageBuffer(fileId);
      const originalSize = sourceBuffer.length;

      const config = {
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        quality:
          options.quality || this.config.processing.imageOptimizationQuality,
        format: options.format || ImageFormat.WEBP,
        preserveExif: options.preserveExif || false,
        progressive: options.progressive !== false,
        optimizeForWeb: options.optimizeForWeb !== false,
      };

      let pipeline = sharp(sourceBuffer);

      const metadata = await pipeline.metadata();

      this.logger.debug(
        `Image source ${fileId}: ${metadata.width}x${metadata.height}, ` +
          `format: ${metadata.format}, taille: ${originalSize} octets`,
      );

      if (!this.isFormatSupported(metadata.format)) {
        throw new OptimizationException(
          fileId,
          'format_validation',
          `Format '${metadata.format}' non supporté pour optimisation`,
        );
      }

      if (
        metadata.width &&
        metadata.height &&
        (metadata.width > config.maxWidth || metadata.height > config.maxHeight)
      ) {
        pipeline = pipeline.resize(config.maxWidth, config.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        });

        this.logger.debug(
          `Redimensionnement ${fileId}: ${metadata.width}x${metadata.height} → ` +
            `max ${config.maxWidth}x${config.maxHeight}`,
        );
      }

      if (!config.preserveExif) {
        pipeline = pipeline.withMetadata({});
      }

      switch (config.format) {
        case ImageFormat.WEBP:
          pipeline = pipeline.webp({
            quality: config.quality,
            effort: config.optimizeForWeb ? 6 : 4,
            smartSubsample: true,
            preset: 'photo',
          });
          break;

        case ImageFormat.JPEG:
          pipeline = pipeline.jpeg({
            quality: config.quality,
            progressive: config.progressive,
            mozjpeg: true,
            optimiseScans: config.optimizeForWeb,
          });
          break;

        case ImageFormat.PNG:
          pipeline = pipeline.png({
            compressionLevel: config.optimizeForWeb ? 9 : 6,
            adaptiveFiltering: true,
            progressive: config.progressive,
          });
          break;

        case ImageFormat.AVIF:
          pipeline = pipeline.avif({
            quality: config.quality,
            effort: config.optimizeForWeb ? 9 : 6,
            chromaSubsampling: '4:2:0',
          });
          break;

        default:
          throw new OptimizationException(
            fileId,
            'unsupported_output_format',
            `Format de sortie '${config.format}' non supporté`,
          );
      }

      const optimizedBuffer = await pipeline.toBuffer({
        resolveWithObject: true,
      });
      const optimizedSize = optimizedBuffer.data.length;
      const compressionRatio = optimizedSize / originalSize;

      const optimizedKey = `${fileId}/optimized/${config.format}/${Date.now()}`;
      await this.storageService.uploadObject(
        optimizedKey,
        optimizedBuffer.data,
        {
          contentType: `image/${config.format}`,
          userId: 'system',
          customMetadata: {
            originalFileId: fileId,
            optimizationType: 'image_optimization',
            compressionRatio: compressionRatio.toString(),
            originalSize: originalSize.toString(),
            optimizedSize: optimizedSize.toString(),
          },
        },
      );

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `Image ${fileId} optimisée en ${processingTime}ms: ` +
          `${originalSize} → ${optimizedSize} octets (ratio: ${compressionRatio.toFixed(3)}), ` +
          `format: ${config.format}`,
      );

      return {
        buffer: optimizedBuffer.data,
        originalSize,
        optimizedSize,
        compressionRatio,
        format: config.format,
        dimensions: {
          width: optimizedBuffer.info.width,
          height: optimizedBuffer.info.height,
        },
        metadata: config.preserveExif ? metadata : undefined,
        storageKey: optimizedKey,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Échec optimisation image ${fileId} après ${processingTime}ms: ${error.message}`,
      );

      if (error instanceof OptimizationException) {
        throw error;
      }

      throw new OptimizationException(
        fileId,
        'image_optimization',
        `Erreur Sharp: ${error.message}`,
      );
    }
  }

  /**
   * Génère des thumbnails dans plusieurs formats
   *
   * Crée des miniatures optimisées pour l'affichage rapide dans l'interface.
   * Génère automatiquement WebP + JPEG pour compatibilité maximale.
   *
   * @param fileId - Identifiant de l'image source
   * @param size - Taille du thumbnail en pixels (carré)
   * @param formats - Formats à générer (défaut: WebP + JPEG)
   * @returns URLs des thumbnails générés
   */
  async generateThumbnail(
    fileId: string,
    size: number = this.config.processing.thumbnailSize,
    formats: ImageFormat[] = [ImageFormat.WEBP, ImageFormat.JPEG],
  ): Promise<LocalThumbnailResult> {
    this.logger.debug(
      `Génération thumbnail ${size}px pour ${fileId} en formats: ${formats.join(', ')}`,
    );

    try {
      const sourceBuffer = await this.getImageBuffer(fileId);

      if (size < 50 || size > 1000) {
        throw new ThumbnailGenerationException(
          fileId,
          'size_validation',
          `Taille thumbnail invalide: ${size}px (50-1000px autorisés)`,
        );
      }

      const generatedFormats: Array<{
        format: ImageFormat;
        url: string;
        size: number;
      }> = [];
      let primaryUrl = '';

      for (const format of formats) {
        try {
          const thumbnailBuffer = await sharp(sourceBuffer)
            .resize(size, size, {
              fit: 'cover',
              position: 'center',
              kernel: sharp.kernel.lanczos3,
            })
            .withMetadata({})
            .toFormat(format, this.getThumbnailFormatOptions(format))
            .toBuffer();

          const thumbnailKey = `${fileId}/thumbnails/${size}/${format}/${Date.now()}`;
          await this.storageService.uploadObject(
            thumbnailKey,
            thumbnailBuffer,
            {
              contentType: `image/${format}`,
              userId: 'system',
              customMetadata: {
                originalFileId: fileId,
                thumbnailSize: size.toString(),
                thumbnailFormat: format,
              },
            },
          );

          const thumbnailUrl = await this.generateCDNUrl(thumbnailKey);

          generatedFormats.push({
            format,
            url: thumbnailUrl,
            size: thumbnailBuffer.length,
          });

          if (!primaryUrl) {
            primaryUrl = thumbnailUrl;
          }

          this.logger.debug(
            `Thumbnail ${format} généré: ${thumbnailKey} (${thumbnailBuffer.length} octets)`,
          );
        } catch (formatError) {
          this.logger.warn(
            `Échec génération thumbnail ${format} pour ${fileId}: ${formatError.message}`,
          );
        }
      }

      if (generatedFormats.length === 0) {
        throw new ThumbnailGenerationException(
          fileId,
          'thumbnail_generation',
          'Aucun format de thumbnail généré avec succès',
        );
      }

      this.logger.log(
        `Thumbnails ${size}px générés pour ${fileId}: ${generatedFormats.length} formats`,
      );

      return {
        success: true,
        url: primaryUrl,
        storageKey: `${fileId}/thumbnails/${size}`,
        width: size,
        height: size,
        format: generatedFormats[0]?.format || ImageFormat.WEBP,
        size: generatedFormats[0]?.size || 0,
        quality: 85,
        dimensions: { width: size, height: size },
        formats: generatedFormats,
      };
    } catch (error) {
      this.logger.error(
        `Échec génération thumbnail ${fileId}: ${error.message}`,
      );

      if (error instanceof ThumbnailGenerationException) {
        throw error;
      }

      return {
        success: false,
        url: '',
        storageKey: undefined,
        width: 0,
        height: 0,
        format: ImageFormat.WEBP,
        size: 0,
        quality: 0,
        dimensions: { width: 0, height: 0 },
        formats: [],
        error: error.message,
      };
    }
  }

  /**
   * Génère plusieurs formats d'une image pour compatibilité web
   *
   * Convertit une image source vers plusieurs formats optimisés (WebP, AVIF, JPEG)
   * pour servir le format le plus adapté selon le navigateur client.
   *
   * @param fileId - Identifiant de l'image source
   * @param targetFormats - Formats cibles à générer
   * @returns Résultats de conversion par format
   */
  async generateMultipleFormats(
    fileId: string,
    targetFormats: ImageFormat[],
  ): Promise<LocalConversionResult[]> {
    this.logger.debug(
      `Génération formats multiples pour ${fileId}: ${targetFormats.join(', ')}`,
    );

    const results: LocalConversionResult[] = [];

    try {
      const sourceBuffer = await this.getImageBuffer(fileId);
      const sourceMetadata = await sharp(sourceBuffer).metadata();

      for (const format of targetFormats) {
        try {
          const conversionResult = await this.convertToFormat(
            sourceBuffer,
            sourceMetadata.format || 'unknown',
            format,
            fileId,
          );

          results.push(conversionResult);
        } catch (error) {
          this.logger.warn(
            `Échec conversion ${format} pour ${fileId}: ${error.message}`,
          );

          results.push({
            success: false,
            fromFormat: sourceMetadata.format || 'unknown',
            toFormat: format,
            buffer: Buffer.alloc(0),
            originalSize: sourceBuffer.length,
            convertedSize: 0,
            compressionRatio: 0,
            qualityRetained: 0,
            conversionTime: 0,
            error: error.message,
          });
        }
      }

      const successfulConversions = results.filter((r) => r.success).length;

      if (successfulConversions === 0) {
        throw new FormatConversionException(
          fileId,
          'format_conversion',
          'Aucune conversion de format réussie',
          sourceMetadata.format || 'unknown',
          targetFormats?.[0] || 'unknown',
        );
      }

      this.logger.log(
        `Formats générés pour ${fileId}: ${successfulConversions}/${targetFormats.length} succès`,
      );

      return results;
    } catch (error) {
      this.logger.error(
        `Échec génération formats multiples ${fileId}: ${error.message}`,
      );
      throw error;
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - Utilitaires et Helpers
  // ============================================================================

  /**
   * Récupère le buffer d'une image depuis le storage
   */
  private async getImageBuffer(fileId: string): Promise<Buffer> {
    try {
      const downloadResult = await this.storageService.downloadObject(fileId);
      return downloadResult.body;
    } catch (error) {
      this.logger.error(`Échec récupération image ${fileId}: ${error.message}`);
      throw new FileNotFoundException(fileId, {
        reason: 'Image buffer non accessible',
        originalError: error.message,
      });
    }
  }

  /**
   * Vérifie si un format d'image est supporté
   */
  private isFormatSupported(format?: string): boolean {
    if (!format) return false;

    const mimeType = format.startsWith('image/') ? format : `image/${format}`;
    return this.supportedInputFormats.includes(mimeType);
  }

  /**
   * Obtient les options d'optimisation par format pour thumbnails
   */
  private getThumbnailFormatOptions(format: ImageFormat): any {
    const quality = Math.round(
      this.config.processing.imageOptimizationQuality * 0.9,
    );

    switch (format) {
      case ImageFormat.WEBP:
        return {
          quality,
          effort: 6,
          smartSubsample: true,
          preset: 'photo',
        };
      case ImageFormat.JPEG:
        return {
          quality,
          progressive: true,
          mozjpeg: true,
        };
      case ImageFormat.PNG:
        return {
          compressionLevel: 9,
          adaptiveFiltering: true,
        };
      case ImageFormat.AVIF:
        return {
          quality,
          effort: 9,
          chromaSubsampling: '4:2:0' as const,
        };
      case ImageFormat.GIF:
        return {
          progressive: true,
        };
      default:
        return { quality };
    }
  }

  /**
   * Convertit une image vers un format spécifique
   */
  private async convertToFormat(
    sourceBuffer: Buffer,
    sourceFormat: string,
    targetFormat: ImageFormat,
    fileId: string,
  ): Promise<LocalConversionResult> {
    const startTime = Date.now();

    try {
      const quality = this.config.processing.imageOptimizationQuality;

      const convertedBuffer = await sharp(sourceBuffer)
        .toFormat(targetFormat, this.getFormatOptions(targetFormat, quality))
        .toBuffer();

      const conversionTime = Date.now() - startTime;
      const compressionRatio = convertedBuffer.length / sourceBuffer.length;

      const convertedKey = `${fileId}/formats/${targetFormat}/${Date.now()}`;
      await this.storageService.uploadObject(convertedKey, convertedBuffer, {
        contentType: `image/${targetFormat}`,
        userId: 'system',
        customMetadata: {
          originalFileId: fileId,
          convertedFrom: sourceFormat,
          convertedTo: targetFormat,
          compressionRatio: compressionRatio.toString(),
        },
      });

      this.logger.debug(
        `Conversion ${sourceFormat} → ${targetFormat} pour ${fileId}: ` +
          `${sourceBuffer.length} → ${convertedBuffer.length} octets en ${conversionTime}ms`,
      );

      return {
        success: true,
        fromFormat: sourceFormat,
        toFormat: targetFormat,
        buffer: convertedBuffer,
        originalSize: sourceBuffer.length,
        convertedSize: convertedBuffer.length,
        compressionRatio,
        qualityRetained: Math.round(
          quality * (compressionRatio > 1 ? 1 : compressionRatio),
        ),
        conversionTime,
      };
    } catch (error) {
      throw new FormatConversionException(
        fileId,
        'sharp_conversion',
        `Erreur Sharp: ${error.message}`,
        sourceFormat,
        targetFormat || 'unknown',
      );
    }
  }

  /**
   * Obtient les options de format optimisées
   */
  private getFormatOptions(format: ImageFormat, quality: number): any {
    switch (format) {
      case ImageFormat.WEBP:
        return {
          quality,
          effort: 6,
          smartSubsample: true,
          preset: 'photo',
        };
      case ImageFormat.JPEG:
        return {
          quality,
          progressive: true,
          mozjpeg: true,
        };
      case ImageFormat.PNG:
        return {
          compressionLevel: 9,
          adaptiveFiltering: true,
        };
      case ImageFormat.AVIF:
        return {
          quality,
          effort: 9,
          chromaSubsampling: '4:2:0' as const,
        };
      case ImageFormat.GIF:
        return {
          progressive: true,
        };
      default:
        return { quality };
    }
  }

  /**
   * Génère une URL CDN pour un fichier
   */
  private async generateCDNUrl(storageKey: string): Promise<string> {
    return `${this.config.cdn.baseUrl}/${storageKey}`;
  }
}
