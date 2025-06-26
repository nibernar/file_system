/**
 * Service de traitement PDF pour le système Coders V1
 * 
 * Ce service spécialisé gère toutes les opérations sur les fichiers PDF :
 * optimisation et compression, extraction de métadonnées, génération de previews,
 * extraction de texte pour indexation, et conversion vers formats web-optimisés.
 * 
 * Fonctionnalités principales :
 * - Compression PDF intelligente préservant la qualité
 * - Optimisation images intégrées dans le PDF
 * - Extraction métadonnées (titre, auteur, pages, etc.)
 * - Génération previews images des premières pages
 * - Extraction texte pour recherche et indexation
 * - Linearisation pour visualisation web progressive
 * - Suppression métadonnées sensibles pour sécurité
 * 
 * @version 1.0
 * @author Backend Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 05-06-file-system-plan Phase 3.1
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ThumbnailResult,
  ImageFormat
} from '../../types/file-system.types';
import type { FileSystemConfig } from '../../config/file-system.config';
import { GarageStorageService } from '../garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../config/file-system.config';
import {
  ProcessingException,
  ThumbnailGenerationException,
  OptimizationException,
  FileNotFoundException
} from '../../exceptions/file-system.exceptions';

/**
 * Options pour l'optimisation PDF
 */
export interface PdfOptimizationOptions {
  /** Niveau de compression (0-9, 9 = maximum) */
  compressionLevel?: number;
  
  /** Optimiser les images intégrées */
  optimizeImages?: boolean;
  
  /** Supprimer les métadonnées sensibles */
  removeMetadata?: boolean;
  
  /** Lineariser pour affichage web progressif */
  linearize?: boolean;
  
  /** Qualité des images compressées (0-100) */
  imageQuality?: number;
  
  /** Convertir les images en noir et blanc si possible */
  grayscaleImages?: boolean;
  
  /** Résolution maximale des images en DPI */
  maxImageDpi?: number;
}

/**
 * Résultat d'optimisation PDF détaillé
 */
export interface OptimizedPdf {
  /** Buffer du PDF optimisé */
  buffer: Buffer;
  
  /** Taille originale en octets */
  originalSize: number;
  
  /** Taille optimisée en octets */
  optimizedSize: number;
  
  /** Ratio de compression */
  compressionRatio: number;
  
  /** Techniques d'optimisation appliquées */
  techniques: string[];
  
  /** Nombre de pages du document */
  pageCount: number;
  
  /** Métadonnées préservées */
  metadata?: PdfMetadata;
  
  /** Clé de stockage du PDF optimisé */
  storageKey?: string;
  
  /** Durée d'optimisation en millisecondes */
  processingTime: number;
}

/**
 * Métadonnées extraites d'un PDF
 */
export interface PdfMetadata {
  /** Titre du document */
  title?: string;
  
  /** Auteur du document */
  author?: string;
  
  /** Sujet/description */
  subject?: string;
  
  /** Mots-clés */
  keywords?: string;
  
  /** Créateur (application) */
  creator?: string;
  
  /** Producteur (bibliothèque PDF) */
  producer?: string;
  
  /** Date de création */
  creationDate?: Date;
  
  /** Date de modification */
  modificationDate?: Date;
  
  /** Nombre de pages */
  pageCount: number;
  
  /** Version PDF */
  pdfVersion?: string;
  
  /** Taille des pages (première page) */
  pageSize?: {
    width: number;
    height: number;
    unit: string;
  };
  
  /** Présence de formulaires interactifs */
  hasAcroForm?: boolean;
  
  /** Document chiffré/protégé */
  encrypted?: boolean;
  
  /** Texte extrait (échantillon) */
  textContent?: string;
  
  /** Nombre d'images dans le document */
  imageCount?: number;
  
  /** Taille estimée après extraction du texte */
  textLength?: number;
}

/**
 * Résultat de génération de preview PDF
 */
export interface PdfPreview {
  /** Succès de la génération */
  success: boolean;
  
  /** URL du thumbnail principal */
  thumbnailUrl: string;
  
  /** URLs des previews par page */
  pagePreview: Array<{
    pageNumber: number;
    url: string;
    dimensions: { width: number; height: number };
  }>;
  
  /** Dimensions originales des pages */
  originalDimensions: {
    width: number;
    height: number;
  };
  
  /** Message d'erreur si échec */
  error?: string;
}

/**
 * Service de traitement PDF avec outils système
 * 
 * Utilise des outils système spécialisés pour le traitement PDF :
 * - Ghostscript pour compression et optimisation
 * - Poppler (pdftoppm) pour génération d'images
 * - qpdf pour manipulation structure PDF
 * - pdfinfo pour extraction métadonnées
 * 
 * Architecture :
 * - Exécution sécurisée via spawn avec timeout
 * - Gestion fichiers temporaires avec nettoyage automatique
 * - Cache des résultats dans le storage
 * - Logging détaillé pour debugging
 * - Validation sécuritaire des entrées
 */
@Injectable()
export class PdfProcessorService {
  /** Logger spécialisé pour le traitement PDF */
  private readonly logger = new Logger(PdfProcessorService.name);

  /** Répertoire temporaire pour fichiers de travail */
  private readonly tempDir = path.join(os.tmpdir(), 'coders-pdf-processing');

  /** Timeout par défaut pour opérations PDF (30 secondes) */
  private readonly defaultTimeout = 30000;

  /** Extensions d'outils PDF requis */
  private readonly requiredTools = ['gs', 'pdftoppm', 'qpdf', 'pdfinfo'];

  /**
   * Constructeur avec injection de dépendances
   * 
   * @param storageService - Service de stockage pour sauvegarder les PDF traités
   * @param config - Configuration du système de fichiers
   */
  constructor(
    private readonly storageService: GarageStorageService,
    @Inject(FILE_SYSTEM_CONFIG)
    private readonly config: FileSystemConfig
  ) {
    // Création répertoire temporaire si nécessaire
    this.ensureTempDirectory();
    
    // Vérification outils PDF disponibles
    this.checkRequiredTools();
  }

  /**
   * Optimise un PDF avec compression intelligente
   * 
   * Applique diverses techniques d'optimisation selon les options :
   * - Compression texte et images avec Ghostscript
   * - Suppression métadonnées sensibles pour sécurité
   * - Linearisation pour chargement web progressif
   * - Optimisation spécifique images (résolution, couleur)
   * - Déduplication ressources internes
   * 
   * @param fileId - Identifiant du fichier PDF source
   * @param options - Options d'optimisation personnalisées
   * @returns Résultat détaillé avec PDF optimisé
   * @throws OptimizationException si l'optimisation échoue
   * @throws FileNotFoundException si le fichier source n'existe pas
   * 
   * @example
   * ```typescript
   * const optimized = await pdfProcessor.optimizePdf('pdf-123', {
   *   compressionLevel: 8,
   *   optimizeImages: true,
   *   removeMetadata: true,
   *   linearize: true,
   *   imageQuality: 75
   * });
   * console.log(`Compression: ${optimized.compressionRatio.toFixed(2)}`);
   * ```
   */
  async optimizePdf(fileId: string, options: PdfOptimizationOptions = {}): Promise<OptimizedPdf> {
    const startTime = Date.now();
    
    this.logger.debug(`Optimisation PDF ${fileId} avec options:`, options);
    
    let tempInputPath: string | undefined;
    let tempOutputPath: string | undefined;
    
    try {
      // Configuration optimisation avec defaults
      const config = {
        compressionLevel: options.compressionLevel ?? this.config.processing.pdfCompressionLevel,
        optimizeImages: options.optimizeImages ?? true,
        removeMetadata: options.removeMetadata ?? true,
        linearize: options.linearize ?? true,
        imageQuality: options.imageQuality ?? 75,
        grayscaleImages: options.grayscaleImages ?? false,
        maxImageDpi: options.maxImageDpi ?? 150
      };
      
      // Récupération PDF source depuis storage
      const sourceBuffer = await this.getPdfBuffer(fileId);
      const originalSize = sourceBuffer.length;
      
      // Écriture fichier temporaire source
      tempInputPath = await this.writeTempFile(sourceBuffer, 'input.pdf');
      tempOutputPath = this.getTempFilePath('optimized.pdf');
      
      // Extraction métadonnées avant optimisation
      const originalMetadata = await this.extractMetadata(tempInputPath);
      
      this.logger.debug(
        `PDF source ${fileId}: ${originalMetadata.pageCount} pages, ` +
        `${originalSize} octets, version ${originalMetadata.pdfVersion}`
      );
      
      // Construction commande Ghostscript avec optimisations
      const gsArgs = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook', // Optimisation taille vs qualité
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-dDownsampleColorImages=${config.optimizeImages}`,
        `-dDownsampleGrayImages=${config.optimizeImages}`,
        `-dDownsampleMonoImages=${config.optimizeImages}`,
        `-dColorImageResolution=${config.maxImageDpi}`,
        `-dGrayImageResolution=${config.maxImageDpi}`,
        `-dMonoImageResolution=${config.maxImageDpi}`,
        `-dJPEGQ=${config.imageQuality}`,
        `-sOutputFile=${tempOutputPath}`,
        tempInputPath
      ];
      
      // Ajout options spécialisées
      if (config.grayscaleImages) {
        gsArgs.push('-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray');
      }
      
      if (config.removeMetadata) {
        gsArgs.push('-dPrinted=false');
      }
      
      // Exécution Ghostscript avec timeout
      await this.executeCommand('gs', gsArgs, {
        timeout: this.config.processing.virusScanTimeout,
        description: `Optimisation PDF ${fileId}`
      });
      
      // Vérification fichier optimisé créé
      const optimizedBuffer = await this.readTempFile(tempOutputPath);
      const optimizedSize = optimizedBuffer.length;
      const compressionRatio = optimizedSize / originalSize;
      
      // Linearisation pour web si demandé
      if (config.linearize) {
        const linearizedPath = this.getTempFilePath('linearized.pdf');
        
        await this.executeCommand('qpdf', [
          '--linearize',
          tempOutputPath,
          linearizedPath
        ], {
          timeout: 15000,
          description: `Linearisation PDF ${fileId}`
        });
        
        // Remplacement par version linearisée
        const linearizedBuffer = await this.readTempFile(linearizedPath);
        await fs.writeFile(tempOutputPath, linearizedBuffer);
      }
      
      // Lecture résultat final
      const finalBuffer = await this.readTempFile(tempOutputPath);
      const finalSize = finalBuffer.length;
      const finalRatio = finalSize / originalSize;
      
      // Sauvegarde PDF optimisé dans storage
      const optimizedKey = `${fileId}/optimized/${Date.now()}.pdf`;
      await this.storageService.uploadObject(optimizedKey, finalBuffer, {
        contentType: 'application/pdf',
        userId: 'system',
        customMetadata: {
          originalFileId: fileId,
          optimizationType: 'pdf_optimization',
          compressionRatio: finalRatio.toString(),
          originalSize: originalSize.toString(),
          optimizedSize: finalSize.toString()
        }
      });
      
      const processingTime = Date.now() - startTime;
      
      // Compilation techniques appliquées
      const techniques = ['pdf_compression'];
      if (config.optimizeImages) techniques.push('image_optimization');
      if (config.removeMetadata) techniques.push('metadata_removal');
      if (config.linearize) techniques.push('linearization');
      if (config.grayscaleImages) techniques.push('grayscale_conversion');
      
      this.logger.log(
        `PDF ${fileId} optimisé en ${processingTime}ms: ` +
        `${originalSize} → ${finalSize} octets (ratio: ${finalRatio.toFixed(3)}), ` +
        `techniques: ${techniques.join(', ')}`
      );
      
      return {
        buffer: finalBuffer,
        originalSize,
        optimizedSize: finalSize,
        compressionRatio: finalRatio,
        techniques,
        pageCount: originalMetadata.pageCount,
        metadata: config.removeMetadata ? undefined : originalMetadata,
        storageKey: optimizedKey,
        processingTime
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Échec optimisation PDF ${fileId} après ${processingTime}ms: ${error.message}`);
      
      if (error instanceof OptimizationException) {
        throw error;
      }
      
      throw new OptimizationException(
        fileId,
        'pdf_optimization',
        `Erreur Ghostscript: ${error.message}`
      );
      
    } finally {
      // Nettoyage fichiers temporaires
      await this.cleanupTempFiles([tempInputPath, tempOutputPath]);
    }
  }

  /**
   * Génère des previews images des premières pages PDF
   * 
   * Convertit les premières pages du PDF en images haute qualité
   * pour affichage rapide et génération de thumbnails.
   * 
   * @param fileId - Identifiant du fichier PDF
   * @param pageCount - Nombre de pages à convertir (défaut: 3)
   * @param dpi - Résolution des images générées (défaut: 150)
   * @returns URLs des previews générés
   * @throws ThumbnailGenerationException si la génération échoue
   * 
   * @example
   * ```typescript
   * const preview = await pdfProcessor.generatePreview('pdf-123', 3, 200);
   * console.log(`Preview principal: ${preview.thumbnailUrl}`);
   * preview.pagePreview.forEach(p => console.log(`Page ${p.pageNumber}: ${p.url}`));
   * ```
   */
  async generatePreview(
    fileId: string, 
    pageCount: number = 3,
    dpi: number = 150
  ): Promise<PdfPreview> {
    this.logger.debug(`Génération preview PDF ${fileId}: ${pageCount} pages à ${dpi} DPI`);
    
    let tempInputPath: string | undefined;
    
    try {
      // Validation paramètres
      if (pageCount < 1 || pageCount > 10) {
        throw new ThumbnailGenerationException(
          fileId,
          'page_validation',
          `Nombre de pages invalide: ${pageCount} (1-10 autorisées)`
        );
      }
      
      if (dpi < 72 || dpi > 300) {
        throw new ThumbnailGenerationException(
          fileId,
          'dpi_validation', 
          `DPI invalide: ${dpi} (72-300 autorisés)`
        );
      }
      
      // Récupération PDF source
      const sourceBuffer = await this.getPdfBuffer(fileId);
      tempInputPath = await this.writeTempFile(sourceBuffer, 'source.pdf');
      
      // Extraction métadonnées pour validation
      const metadata = await this.extractMetadata(tempInputPath);
      const actualPageCount = Math.min(pageCount, metadata.pageCount);
      
      this.logger.debug(`PDF ${fileId}: ${metadata.pageCount} pages totales, génération ${actualPageCount} previews`);
      
      // Génération images avec pdftoppm
      const outputPrefix = this.getTempFilePath('page');
      
      await this.executeCommand('pdftoppm', [
        '-jpeg',
        '-r', dpi.toString(),
        '-f', '1', // Première page
        '-l', actualPageCount.toString(), // Dernière page
        '-jpegopt', 'quality=85,progressive=y',
        tempInputPath,
        outputPrefix
      ], {
        timeout: 60000, // 1 minute pour conversion images
        description: `Génération preview PDF ${fileId}`
      });
      
      // Lecture et sauvegarde des images générées
      const pagePreview: Array<{
        pageNumber: number;
        url: string;
        dimensions: { width: number; height: number };
      }> = [];
      
      let primaryThumbnailUrl = '';
      
      for (let i = 1; i <= actualPageCount; i++) {
        const pageImagePath = `${outputPrefix}-${i.toString().padStart(2, '0')}.jpg`;
        
        try {
          const imageBuffer = await this.readTempFile(pageImagePath);
          
          // Sauvegarde page dans storage
          const previewKey = `${fileId}/preview/page-${i}-${dpi}dpi.jpg`;
          await this.storageService.uploadObject(previewKey, imageBuffer, {
            contentType: 'image/jpeg',
            userId: 'system',
            customMetadata: {
              originalFileId: fileId,
              pageNumber: i.toString(),
              dpi: dpi.toString(),
              previewType: 'pdf_page'
            }
          });
          
          // Génération URL CDN
          const previewUrl = await this.generateCDNUrl(previewKey);
          
          // Première page = thumbnail principal
          if (i === 1) {
            primaryThumbnailUrl = previewUrl;
          }
          
          pagePreview.push({
            pageNumber: i,
            url: previewUrl,
            dimensions: { width: 0, height: 0 } // TODO: Extraire dimensions réelles
          });
          
          this.logger.debug(`Preview page ${i} généré: ${previewKey} (${imageBuffer.length} octets)`);
          
          // Nettoyage fichier temporaire de la page
          await this.cleanupTempFiles([pageImagePath]);
          
        } catch (pageError) {
          this.logger.warn(`Échec génération preview page ${i} pour ${fileId}: ${pageError.message}`);
          // Continuer avec autres pages
        }
      }
      
      if (pagePreview.length === 0) {
        throw new ThumbnailGenerationException(
          fileId,
          'preview_generation',
          'Aucune page preview générée avec succès'
        );
      }
      
      this.logger.log(`Previews PDF générés pour ${fileId}: ${pagePreview.length} pages`);
      
      return {
        success: true,
        thumbnailUrl: primaryThumbnailUrl,
        pagePreview,
        originalDimensions: {
          width: metadata.pageSize?.width || 0,
          height: metadata.pageSize?.height || 0
        }
      };
      
    } catch (error) {
      this.logger.error(`Échec génération preview PDF ${fileId}: ${error.message}`);
      
      if (error instanceof ThumbnailGenerationException) {
        throw error;
      }
      
      return {
        success: false,
        thumbnailUrl: '',
        pagePreview: [],
        originalDimensions: { width: 0, height: 0 },
        error: error.message
      };
      
    } finally {
      // Nettoyage fichiers temporaires
      await this.cleanupTempFiles([tempInputPath]);
    }
  }

  /**
   * Extrait les métadonnées complètes d'un PDF
   * 
   * Utilise pdfinfo pour extraire toutes les métadonnées disponibles :
   * titre, auteur, nombre de pages, dates, sécurité, etc.
   * 
   * @param fileId - Identifiant du fichier PDF
   * @returns Métadonnées complètes du PDF
   * @throws ProcessingException si l'extraction échoue
   * 
   * @example
   * ```typescript
   * const metadata = await pdfProcessor.extractMetadata('pdf-123');
   * console.log(`${metadata.title} par ${metadata.author}`);
   * console.log(`${metadata.pageCount} pages, créé le ${metadata.creationDate}`);
   * ```
   */
  async extractMetadata(fileIdOrPath: string): Promise<PdfMetadata> {
    this.logger.debug(`Extraction métadonnées PDF ${fileIdOrPath}`);
    
    let tempInputPath: string | undefined;
    let isFilePath = false;
    
    try {
      // Détermination si c'est un chemin de fichier ou un ID
      if (fileIdOrPath.includes('/') || fileIdOrPath.endsWith('.pdf')) {
        tempInputPath = fileIdOrPath;
        isFilePath = true;
      } else {
        // Récupération depuis storage
        const sourceBuffer = await this.getPdfBuffer(fileIdOrPath);
        tempInputPath = await this.writeTempFile(sourceBuffer, 'metadata.pdf');
      }
      
      // Extraction métadonnées avec pdfinfo
      const metadataOutput = await this.executeCommand('pdfinfo', [tempInputPath], {
        timeout: 15000,
        description: `Extraction métadonnées PDF ${fileIdOrPath}`,
        captureOutput: true
      });
      
      // Parsing sortie pdfinfo
      const metadata = this.parseMetadataOutput(metadataOutput);
      
      // Extraction texte échantillon pour indexation
      try {
        const textOutput = await this.executeCommand('pdftotext', [
          '-l', '3', // 3 premières pages seulement
          '-raw',
          tempInputPath,
          '-'
        ], {
          timeout: 10000,
          description: `Extraction texte PDF ${fileIdOrPath}`,
          captureOutput: true
        });
        
        metadata.textContent = textOutput.substring(0, 1000); // Limite 1000 caractères
        metadata.textLength = textOutput.length;
        
      } catch (textError) {
        this.logger.debug(`Échec extraction texte ${fileIdOrPath}: ${textError.message}`);
        // Non bloquant
      }
      
      this.logger.debug(`Métadonnées extraites pour ${fileIdOrPath}: ${JSON.stringify(metadata, null, 2)}`);
      
      return metadata;
      
    } catch (error) {
      this.logger.error(`Échec extraction métadonnées PDF ${fileIdOrPath}: ${error.message}`);
      throw new ProcessingException(
        'unknown-file',
        'metadata_extraction',
        `Extraction métadonnées échouée: ${error.message}`
      );
    } finally {
      // Nettoyage seulement si fichier temporaire créé
      if (!isFilePath && tempInputPath) {
        await this.cleanupTempFiles([tempInputPath]);
      }
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - Utilitaires et Helpers
  // ============================================================================

  /**
   * Récupère le buffer d'un PDF depuis le storage
   * 
   * @private
   * @param fileId - Identifiant du fichier
   * @returns Buffer du PDF
   * @throws FileNotFoundException si le fichier n'existe pas
   */
  private async getPdfBuffer(fileId: string): Promise<Buffer> {
    try {
      // TODO: Récupérer storageKey depuis metadata repository
      const downloadResult = await this.storageService.downloadObject(fileId);
      return downloadResult.body;
      
    } catch (error) {
      this.logger.error(`Échec récupération PDF ${fileId}: ${error.message}`);
      throw new FileNotFoundException(fileId, { 
        reason: 'PDF buffer non accessible',
        originalError: error.message 
      });
    }
  }

  /**
   * Écrit un buffer dans un fichier temporaire
   * 
   * @private
   * @param buffer - Données à écrire
   * @param filename - Nom du fichier temporaire
   * @returns Chemin du fichier créé
   */
  private async writeTempFile(buffer: Buffer, filename: string): Promise<string> {
    const tempPath = path.join(this.tempDir, `${Date.now()}-${filename}`);
    await fs.writeFile(tempPath, buffer);
    return tempPath;
  }

  /**
   * Lit un fichier temporaire
   * 
   * @private
   * @param filePath - Chemin du fichier à lire
   * @returns Buffer du fichier
   */
  private async readTempFile(filePath: string): Promise<Buffer> {
    return await fs.readFile(filePath);
  }

  /**
   * Génère un chemin de fichier temporaire
   * 
   * @private
   * @param filename - Nom du fichier
   * @returns Chemin temporaire complet
   */
  private getTempFilePath(filename: string): string {
    return path.join(this.tempDir, `${Date.now()}-${filename}`);
  }

  /**
   * Nettoie les fichiers temporaires
   * 
   * @private
   * @param filePaths - Chemins des fichiers à supprimer
   */
  private async cleanupTempFiles(filePaths: (string | undefined)[]): Promise<void> {
    for (const filePath of filePaths) {
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          this.logger.debug(`Échec suppression fichier temporaire ${filePath}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Exécute une commande système avec timeout et gestion d'erreurs
   * 
   * @private
   * @param command - Commande à exécuter
   * @param args - Arguments de la commande
   * @param options - Options d'exécution
   * @returns Sortie de la commande si captureOutput=true
   */
  private async executeCommand(
    command: string,
    args: string[],
    options: {
      timeout?: number;
      description?: string;
      captureOutput?: boolean;
    } = {}
  ): Promise<string> {
    const { timeout = this.defaultTimeout, description = 'Commande PDF', captureOutput = false } = options;
    
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      
      let stdout = '';
      let stderr = '';
      
      if (captureOutput) {
        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Timeout handling
      const timer = setTimeout(() => {
        process.kill('SIGKILL');
        reject(new ProcessingException('unknown', 'timeout', `Timeout ${description} après ${timeout}ms`));
      }, timeout);
      
      process.on('close', (code) => {
        clearTimeout(timer);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new ProcessingException('unknown', 'command_execution', `${description} échoué (code ${code}): ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timer);
        reject(new ProcessingException('unknown', 'command_error', `Erreur exécution ${command}: ${error.message}`));
      });
    });
  }

  /**
   * Parse la sortie de pdfinfo en métadonnées structurées
   * 
   * @private
   * @param output - Sortie brute de pdfinfo
   * @returns Métadonnées structurées
   */
  private parseMetadataOutput(output: string): PdfMetadata {
    const lines = output.split('\n');
    const metadata: any = { pageCount: 0 };
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (!key || !value) continue;
      
      switch (key.trim()) {
        case 'Title':
          metadata.title = value;
          break;
        case 'Author':
          metadata.author = value;
          break;
        case 'Subject':
          metadata.subject = value;
          break;
        case 'Keywords':
          metadata.keywords = value;
          break;
        case 'Creator':
          metadata.creator = value;
          break;
        case 'Producer':
          metadata.producer = value;
          break;
        case 'CreationDate':
          metadata.creationDate = new Date(value);
          break;
        case 'ModDate':
          metadata.modificationDate = new Date(value);
          break;
        case 'Pages':
          metadata.pageCount = parseInt(value, 10);
          break;
        case 'PDF version':
          metadata.pdfVersion = value;
          break;
        case 'Encrypted':
          metadata.encrypted = value.toLowerCase().includes('yes');
          break;
        case 'Form':
          metadata.hasAcroForm = value.toLowerCase().includes('acroform');
          break;
        case 'Page size':
          // Parse page size: "612 x 792 pts (letter)"
          const sizeMatch = value.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*pts/);
          if (sizeMatch) {
            metadata.pageSize = {
              width: parseFloat(sizeMatch[1]),
              height: parseFloat(sizeMatch[2]),
              unit: 'pts'
            };
          }
          break;
      }
    }
    
    return metadata as PdfMetadata;
  }

  /**
   * Génère une URL CDN pour un fichier
   * 
   * @private
   * @param storageKey - Clé de stockage
   * @returns URL CDN complète
   */
  private async generateCDNUrl(storageKey: string): Promise<string> {
    // TODO: Intégration avec service CDN
    return `${this.config.cdn.baseUrl}/${storageKey}`;
  }

  /**
   * Assure l'existence du répertoire temporaire
   * 
   * @private
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      this.logger.debug(`Répertoire temporaire créé: ${this.tempDir}`);
    }
  }

  /**
   * Vérifie la disponibilité des outils PDF requis
   * 
   * @private
   */
  private async checkRequiredTools(): Promise<void> {
    for (const tool of this.requiredTools) {
      try {
        await this.executeCommand(tool, ['--version'], { 
          timeout: 5000, 
          captureOutput: true 
        });
        this.logger.debug(`Outil PDF disponible: ${tool}`);
      } catch (error) {
        this.logger.warn(`Outil PDF manquant: ${tool} - ${error.message}`);
      }
    }
  }
}