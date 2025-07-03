/**
 * Use Case de Traitement Asynchrone de Fichiers
 * 
 * Ce use case orchestre le traitement asynchrone des fichiers uploadés
 * en les ajoutant à la queue de traitement avec la priorité appropriée.
 * Il gère la validation, la détermination de priorité et le suivi des jobs.
 * 
 * @module ProcessFileAsyncUseCase
 * @version 1.0
 * @author Backend Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 05-06-file-system-plan Phase 3.2
 */

import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  ProcessingOptions,
  QueueJobResult,
  FileMetadata,
  ProcessingStatus,
  ProcessingJobType,
  ProcessingJobData,
  ExtendedProcessingOptions,
  VirusScanStatus,
  ProcessingJobStatus,
  DocumentType
} from '../../types/file-system.types';
import { IFileMetadataRepository } from '../../domain/repositories/file-metadata.repository';
import {
  FileNotFoundException,
  InvalidProcessingStateException,
  ProcessingQueueException,
  FileProcessingException
} from '../../exceptions/file-system.exceptions';
import { MetricsService } from '../../infrastructure/monitoring/metrics.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

/**
 * Configuration des priorités de traitement
 * 
 * Définit les règles de priorité selon différents critères
 */
interface PriorityConfiguration {
  /** Priorité de base par type de document */
  documentTypePriority: Record<DocumentType, number>;
  
  /** Bonus de priorité pour utilisateurs premium */
  premiumUserBonus: number;
  
  /** Pénalité pour gros fichiers */
  largeSizePenalty: number;
  
  /** Seuil de taille pour pénalité (en bytes) */
  largeSizeThreshold: number;
  
  /** Priorité minimale et maximale */
  minPriority: number;
  maxPriority: number;
}

/**
 * Use Case pour le traitement asynchrone des fichiers
 * 
 * Responsabilités :
 * - Validation de l'état du fichier avant traitement
 * - Calcul intelligent de la priorité de traitement
 * - Ajout à la queue avec configuration optimale
 * - Suivi et monitoring des jobs créés
 * - Gestion des erreurs et retry logic
 */
@Injectable()
export class ProcessFileAsyncUseCase {
  private readonly logger = new Logger(ProcessFileAsyncUseCase.name);
  
  /**
   * Configuration des priorités par défaut
   */
  private readonly priorityConfig: PriorityConfiguration = {
    documentTypePriority: {
      [DocumentType.DOCUMENT]: 5,
      [DocumentType.TEMPLATE]: 7,
      [DocumentType.PROJECT_DOCUMENT]: 8,
      [DocumentType.CONFIDENTIAL]: 9,
      [DocumentType.TEMPORARY]: 3,
      [DocumentType.ARCHIVE]: 2
    },
    premiumUserBonus: 2,
    largeSizePenalty: -2,
    largeSizeThreshold: 50 * 1024 * 1024, // 50MB
    minPriority: 1,
    maxPriority: 10
  };

  /**
   * Statistiques de traitement pour monitoring
   */
  private processingStats = {
    totalJobsQueued: 0,
    averagePriority: 0,
    averageQueueTime: 0,
    lastJobQueuedAt: null as Date | null
  };

  constructor(
    @InjectQueue('file-processing') private readonly fileProcessingQueue: Queue,
    @Inject('IFileMetadataRepository')
    private readonly fileMetadataRepository: IFileMetadataRepository,
    private readonly metricsService: MetricsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache 
  ) {}

  
  /**
   * Exécute le traitement asynchrone d'un fichier
   * 
   * Workflow complet :
   * 1. Validation de l'existence et de l'état du fichier
   * 2. Calcul de la priorité selon multiple critères
   * 3. Création et configuration du job dans la queue
   * 4. Mise à jour du statut en base de données
   * 5. Retour des informations de suivi du job
   * 
   * @param fileId - Identifiant du fichier à traiter
   * @param options - Options de traitement (optionnel)
   * @returns Résultat contenant l'ID du job et les estimations
   * @throws FileNotFoundException si le fichier n'existe pas
   * @throws InvalidProcessingStateException si le fichier n'est pas dans un état valide
   * @throws ProcessingQueueException si l'ajout à la queue échoue
   */
  async execute(
    fileId: string,
    options: ProcessingOptions = {}
  ): Promise<QueueJobResult> {
    const startTime = Date.now();
    
    this.logger.log(`Processing file ${fileId} asynchronously`, { options });
    
    try {
      // Étape 1 : Validation du fichier
      const fileMetadata = await this.validateAndGetFile(fileId);
      
      // Étape 2 : Vérification de l'état de traitement
      this.validateProcessingState(fileMetadata);
      
      // Étape 3 : Calcul de la priorité
      const priority = this.calculateJobPriority(fileMetadata, options);
      
      this.logger.debug(`Calculated priority ${priority} for file ${fileId}`);
      
      // Étape 4 : Préparation des données du job
      const jobData = this.prepareJobData(fileId, fileMetadata, priority, options);
      
      // Étape 5 : Ajout à la queue avec configuration appropriée
      const job = await this.addToQueue(jobData, priority);
      
      // Étape 6 : Mise à jour du statut en base de données
      await this.updateFileStatus(fileId, ProcessingStatus.PROCESSING, {
        jobId: job.id as string,
        queuedAt: new Date()
      });
      
      // Étape 7 : Cache des informations du job pour suivi rapide
      await this.cacheJobInfo(fileId, job);
      
      // Étape 8 : Métriques et monitoring
      await this.recordMetrics(fileMetadata, priority, Date.now() - startTime);
      
      // Étape 9 : Estimation du temps de traitement
      const estimatedDuration = this.estimateProcessingDuration(fileMetadata, options);
      const queuePosition = await this.getQueuePosition(job);
      
      this.logger.log(`File ${fileId} queued successfully`, {
        jobId: job.id,
        priority,
        estimatedDuration,
        queuePosition
      });
      
      return {
        jobId: job.id as string,
        status: ProcessingJobStatus.RUNNING,
        progress: 0,
        estimatedDuration,
        queuePosition,
        priority,
        createdAt: new Date()
      };
      
    } catch (error) {
      this.logger.error(`Failed to queue file ${fileId} for processing`, error);
      
      // Mise à jour du statut en cas d'erreur
      await this.updateFileStatus(fileId, ProcessingStatus.FAILED, {
        error: error.message,
        failedAt: new Date()
      });
      
      throw error;
    }
  }

  /**
   * Récupère le statut actuel d'un job de traitement
   * 
   * @param jobId - Identifiant du job
   * @returns Statut détaillé du job
   */
  async getJobStatus(jobId: string): Promise<QueueJobResult> {
    try {
      const job = await this.fileProcessingQueue.getJob(jobId);
      
      if (!job) {
        throw new ProcessingQueueException(`Job ${jobId} not found`);
      }
      
      const state = await job.getState();
      const progress = job.progress();
      
      return {
        jobId: job.id as string,
        status: this.mapBullStateToJobStatus(state),
        progress: typeof progress === 'number' ? progress : 0,
        result: job.returnvalue,
        error: job.failedReason,
        startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        duration: job.finishedOn && job.processedOn 
          ? job.finishedOn - job.processedOn 
          : undefined
      };
      
    } catch (error) {
      this.logger.error(`Failed to get job status for ${jobId}`, error);
      throw new ProcessingQueueException(`Failed to retrieve job status: ${error.message}`);
    }
  }

  /**
   * Annule un job de traitement en cours
   * 
   * @param jobId - Identifiant du job à annuler
   * @param reason - Raison de l'annulation
   * @returns true si l'annulation a réussi
   */
  async cancelJob(jobId: string, reason: string): Promise<boolean> {
    try {
      const job = await this.fileProcessingQueue.getJob(jobId);
      
      if (!job) {
        throw new ProcessingQueueException(`Job ${jobId} not found`);
      }
      
      // Vérification que le job peut être annulé
      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        this.logger.warn(`Cannot cancel job ${jobId} in state ${state}`);
        return false;
      }
      
      // Annulation du job
      await job.remove();
      
      // Mise à jour du statut du fichier
      const jobData = job.data as ProcessingJobData;
      if (jobData.fileId) {
        await this.updateFileStatus(jobData.fileId, ProcessingStatus.PENDING, {
          cancelledAt: new Date(),
          cancelReason: reason
        });
      }
      
      this.logger.log(`Job ${jobId} cancelled successfully`, { reason });
      
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}`, error);
      throw new ProcessingQueueException(`Failed to cancel job: ${error.message}`);
    }
  }

  /**
   * Réessaye un job échoué
   * 
   * @param jobId - Identifiant du job à réessayer
   * @returns Nouveau résultat du job
   */
  async retryJob(jobId: string): Promise<QueueJobResult> {
    try {
      const job = await this.fileProcessingQueue.getJob(jobId);
      
      if (!job) {
        throw new ProcessingQueueException(`Job ${jobId} not found`);
      }
      
      // Vérification que le job est en échec
      const state = await job.getState();
      if (state !== 'failed') {
        throw new ProcessingQueueException(`Job ${jobId} is not in failed state`);
      }
      
      // Réessai du job
      await job.retry();
      
      this.logger.log(`Job ${jobId} retried successfully`);
      
      return this.getJobStatus(jobId);
      
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId}`, error);
      throw new ProcessingQueueException(`Failed to retry job: ${error.message}`);
    }
  }

  /**
   * Traite plusieurs fichiers en batch
   * 
   * @param fileIds - Liste des IDs de fichiers à traiter
   * @param options - Options de traitement communes
   * @returns Résultats pour chaque fichier
   */
  async executeBatch(
    fileIds: string[],
    options: ProcessingOptions = {}
  ): Promise<QueueJobResult[]> {
    this.logger.log(`Processing ${fileIds.length} files in batch`);
    
    const results: QueueJobResult[] = [];
    const errors: Array<{ fileId: string; error: Error }> = [];
    
    // Traitement parallèle avec limite de concurrence
    const batchSize = 10;
    for (let i = 0; i < fileIds.length; i += batchSize) {
      const batch = fileIds.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(fileId => this.execute(fileId, options))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            fileId: batch[index],
            error: result.reason
          });
        }
      });
    }
    
    if (errors.length > 0) {
      this.logger.warn(`Batch processing completed with ${errors.length} errors`, errors);
    }
    
    return results;
  }

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

  /**
   * Valide l'existence du fichier et retourne ses métadonnées
   * 
   * @param fileId - ID du fichier
   * @returns Métadonnées du fichier
   * @throws FileNotFoundException si non trouvé
   */
  private async validateAndGetFile(fileId: string): Promise<FileMetadata> {
    const fileMetadata = await this.fileMetadataRepository.findById(fileId);
    
    if (!fileMetadata) {
      throw new FileNotFoundException(fileId);
    }
    
    if (fileMetadata.deletedAt) {
      throw new FileNotFoundException(fileId, { reason: 'File has been deleted' });
    }
    
    return fileMetadata;
  }

  /**
   * Valide que le fichier est dans un état permettant le traitement
   * 
   * @param fileMetadata - Métadonnées du fichier
   * @throws InvalidProcessingStateException si état invalide
   */
  private validateProcessingState(fileMetadata: FileMetadata): void {
    const validStates = [
      ProcessingStatus.PENDING,
      ProcessingStatus.FAILED,
      ProcessingStatus.SKIPPED
    ];
    
    if (!validStates.includes(fileMetadata.processingStatus)) {
      throw new InvalidProcessingStateException(
        fileMetadata.id,
        fileMetadata.processingStatus
      );
    }
    
    // Vérification supplémentaire pour le scan antivirus
    if (fileMetadata.virusScanStatus === VirusScanStatus.INFECTED) {
      throw new FileProcessingException(
        `File ${fileMetadata.id} is infected and cannot be processed`
      );
    }
  }

  /**
   * Calcule la priorité du job selon multiple critères
   * 
   * @param fileMetadata - Métadonnées du fichier
   * @param options - Options de traitement
   * @returns Priorité calculée (1-10)
   */
  private calculateJobPriority(
    fileMetadata: FileMetadata,
    options: ProcessingOptions
  ): number {
    let priority = 5; // Priorité de base
    
    // 1. Priorité selon le type de document
    const typePriority = this.priorityConfig.documentTypePriority[fileMetadata.documentType];
    if (typePriority) {
      priority = typePriority;
    }
    
    // 2. Bonus pour utilisateur premium (à implémenter avec auth)
    // if (user.isPremium) {
    //   priority += this.priorityConfig.premiumUserBonus;
    // }
    
    // 3. Pénalité pour gros fichiers
    if (fileMetadata.size > this.priorityConfig.largeSizeThreshold) {
      priority += this.priorityConfig.largeSizePenalty;
    }
    
    // 4. Priorité explicite dans les options
    if (options.priority !== undefined) {
      priority = options.priority;
    }
    
    // 5. Ajustement selon l'urgence (si spécifié)
    if (options.urgent) {
      priority = Math.max(priority + 3, 8);
    }
    
    // 6. Normalisation dans les limites
    priority = Math.max(
      this.priorityConfig.minPriority,
      Math.min(this.priorityConfig.maxPriority, priority)
    );
    
    return Math.round(priority);
  }

  /**
   * Prépare les données du job pour la queue
   * 
   * @param fileId - ID du fichier
   * @param fileMetadata - Métadonnées du fichier
   * @param priority - Priorité calculée
   * @param options - Options de traitement
   * @returns Données formatées pour le job
   */
  private prepareJobData(
    fileId: string,
    fileMetadata: FileMetadata,
    priority: number,
    options: ProcessingOptions
  ): ProcessingJobData {
    const extendedOptions: ExtendedProcessingOptions = {
      generateThumbnail: options.generateThumbnail ?? true,
      optimizeForWeb: options.optimizeForWeb ?? true,
      extractMetadata: options.extractMetadata ?? true,
      imageQuality: options.imageQuality,
      thumbnailFormats: options.thumbnailFormats,
      pdfCompressionLevel: options.pdfCompressionLevel,
      forceReprocess: options.forceReprocess ?? false,
      userId: fileMetadata.userId,
      reason: options.reason || 'Automatic processing after upload'
    };
    
    return {
      id: uuidv4(),
      fileId,
      jobType: ProcessingJobType.FULL_PROCESSING,
      priority,
      status: ProcessingJobStatus.QUEUED,
      progress: 0,
      options: extendedOptions,
      result: undefined,
      errorMessage: undefined,
      executionTime: undefined,
      createdAt: new Date(),
      startedAt: undefined,
      completedAt: undefined,
      fileData: {
        buffer: Buffer.alloc(0), // Sera chargé par le processor
        metadata: fileMetadata
      },
      userId: fileMetadata.userId,
      reason: extendedOptions.reason
    };
  }

  /**
   * Ajoute le job à la queue avec configuration optimale
   * 
   * @param jobData - Données du job
   * @param priority - Priorité du job
   * @returns Job créé
   */
  private async addToQueue(
    jobData: ProcessingJobData,
    priority: number
  ): Promise<Job<ProcessingJobData>> {
    try {
      const job = await this.fileProcessingQueue.add(
        'process-uploaded-file',
        jobData,
        {
          priority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000 // 5s, 10s, 20s
          },
          removeOnComplete: {
            age: 24 * 3600, // Garder 24h pour historique
            count: 1000 // Garder max 1000 jobs complétés
          },
          removeOnFail: {
            age: 7 * 24 * 3600 // Garder 7 jours pour debug
          },
          timeout: this.calculateTimeout(jobData.fileData?.metadata)
        }
      );
      
      this.processingStats.totalJobsQueued++;
      this.processingStats.lastJobQueuedAt = new Date();
      
      return job;
      
    } catch (error) {
      throw new ProcessingQueueException(
        `Failed to add job to queue: ${error.message}`
      );
    }
  }

  /**
   * Calcule le timeout approprié selon le fichier
   * 
   * @param metadata - Métadonnées du fichier
   * @returns Timeout en millisecondes
   */
  private calculateTimeout(metadata?: FileMetadata): number {
    if (!metadata) return 60000; // 1 minute par défaut
    
    // Base: 30s + 1s par MB
    const baseTimeout = 30000;
    const sizeTimeout = Math.ceil(metadata.size / (1024 * 1024)) * 1000;
    
    // Ajustement selon le type
    let typeMultiplier = 1;
    if (metadata.contentType === 'application/pdf') {
      typeMultiplier = 1.5; // PDFs prennent plus de temps
    } else if (metadata.contentType.startsWith('video/')) {
      typeMultiplier = 2; // Vidéos encore plus
    }
    
    const timeout = (baseTimeout + sizeTimeout) * typeMultiplier;
    
    // Max 10 minutes
    return Math.min(timeout, 600000);
  }

  /**
   * Met à jour le statut du fichier en base de données
   * 
   * @param fileId - ID du fichier
   * @param status - Nouveau statut
   * @param additionalData - Données supplémentaires
   */
  private async updateFileStatus(
    fileId: string,
    status: ProcessingStatus,
    additionalData?: Record<string, any>
  ): Promise<void> {
    try {
      await this.fileMetadataRepository.update(fileId, {
        processingStatus: status,
        ...additionalData
      });
    } catch (error) {
      this.logger.error(`Failed to update file status for ${fileId}`, error);
      // Ne pas propager l'erreur pour ne pas bloquer le traitement
    }
  }

  /**
   * Cache les informations du job pour accès rapide
   * 
   * @param fileId - ID du fichier
   * @param job - Job créé
   */
  private async cacheJobInfo(fileId: string, job: Job): Promise<void> {
    const cacheKey = `file:job:${fileId}`;
    const jobInfo = {
      jobId: job.id,
      status: 'queued',
      priority: job.opts.priority,
      createdAt: new Date()
    };
    
    await this.cacheManager.set(cacheKey, jobInfo, 3600);
  }

  /**
   * Enregistre les métriques de traitement
   * 
   * @param fileMetadata - Métadonnées du fichier
   * @param priority - Priorité assignée
   * @param queueTime - Temps pour ajouter à la queue
   */
  private async recordMetrics(
    fileMetadata: FileMetadata,
    priority: number,
    queueTime: number
  ): Promise<void> {
    // Métriques de performance
    await this.metricsService.recordHistogram(
      'file_processing_queue_time',
      queueTime,
      {
        contentType: fileMetadata.contentType,
        documentType: fileMetadata.documentType
      }
    );
    
    // Métriques de priorité
    await this.metricsService.recordHistogram(
      'file_processing_priority',
      priority,
      {
        documentType: fileMetadata.documentType
      }
    );
    
    // Compteur de jobs
    await this.metricsService.incrementCounter(
      'file_processing_jobs_queued',
      {
        contentType: fileMetadata.contentType
      }
    );
  }

  /**
   * Estime la durée de traitement
   * 
   * @param fileMetadata - Métadonnées du fichier
   * @param options - Options de traitement
   * @returns Durée estimée en millisecondes
   */
  private estimateProcessingDuration(
    fileMetadata: FileMetadata,
    options: ProcessingOptions
  ): number {
    // Base: 5s + 0.5s par MB
    let duration = 5000 + (fileMetadata.size / (2 * 1024 * 1024)) * 1000;
    
    // Ajustements selon le type
    if (fileMetadata.contentType === 'application/pdf') {
      duration *= 1.5;
    } else if (fileMetadata.contentType.startsWith('video/')) {
      duration *= 3;
    }
    
    // Ajustements selon les options
    if (options.generateThumbnail) duration += 2000;
    if (options.optimizeForWeb) duration += 3000;
    if (options.extractMetadata) duration += 1000;
    
    return Math.round(duration);
  }

  /**
   * Obtient la position dans la queue
   * 
   * @param job - Job créé
   * @returns Position dans la queue
   */
  private async getQueuePosition(job: Job): Promise<number> {
    try {
      const counts = await this.fileProcessingQueue.getJobCounts();
      const priority = job.opts.priority || 0;
      
      // Estimation basique basée sur les jobs en attente
      // Les jobs de priorité plus élevée passeront devant
      const waitingJobs = counts.waiting || 0;
      const position = Math.ceil(waitingJobs * (11 - priority) / 10);
      
      return Math.max(1, position);
    } catch (error) {
      this.logger.warn('Failed to get queue position', error);
      return 0;
    }
  }

  /**
   * Mappe l'état Bull vers le statut de traitement
   * 
   * @param state - État Bull
   * @returns Statut de traitement
   */
  private mapJobStateToProcessingStatus(state: string): ProcessingStatus {
    switch (state) {
      case 'waiting':
      case 'delayed':
        return ProcessingStatus.PENDING;
      case 'active':
        return ProcessingStatus.PROCESSING;
      case 'completed':
        return ProcessingStatus.COMPLETED;
      case 'failed':
        return ProcessingStatus.FAILED;
      default:
        return ProcessingStatus.PENDING;
    }
  }

    /**
   * Mappe ProcessingStatus vers ProcessingJobStatus
   * 
   * @param status - Statut de traitement
   * @returns Statut de job correspondant
   */
  private mapProcessingStatusToJobStatus(status: ProcessingStatus): ProcessingJobStatus {
    switch (status) {
      case ProcessingStatus.PENDING:
        return ProcessingJobStatus.QUEUED;
      case ProcessingStatus.PROCESSING:
        return ProcessingJobStatus.RUNNING;
      case ProcessingStatus.COMPLETED:
        return ProcessingJobStatus.COMPLETED;
      case ProcessingStatus.FAILED:
        return ProcessingJobStatus.FAILED;
      case ProcessingStatus.SKIPPED:
        return ProcessingJobStatus.CANCELLED;
      default:
        return ProcessingJobStatus.QUEUED;
    }
  }

  /**
   * Mappe l'état Bull vers ProcessingJobStatus
   * 
   * @param state - État Bull
   * @returns Statut de job correspondant
   */
  private mapBullStateToJobStatus(state: string): ProcessingJobStatus {
    switch (state) {
      case 'waiting':
      case 'delayed':
        return ProcessingJobStatus.QUEUED;
      case 'active':
        return ProcessingJobStatus.RUNNING;
      case 'completed':
        return ProcessingJobStatus.COMPLETED;
      case 'failed':
        return ProcessingJobStatus.FAILED;
      default:
        return ProcessingJobStatus.QUEUED;
    }
  }
}