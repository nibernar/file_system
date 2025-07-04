import {
  FileMetadata,
  ProcessingStatus,
  VirusScanStatus,
  FileOperation,
} from '../../types/file-system.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Représente une version d'un fichier dans le système
 *
 * @interface FileVersion
 */
export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
  changeDescription?: string;
  changeType: VersionChangeType;
  size: number;
  checksumMd5: string;
  checksumSha256: string;
  storageKey: string;
  isActive: boolean;
}

/**
 * Types de changements possibles pour une version
 *
 * @enum VersionChangeType
 */
export enum VersionChangeType {
  INITIAL_UPLOAD = 'INITIAL_UPLOAD',
  MANUAL_EDIT = 'MANUAL_EDIT',
  AUTOMATED_PROCESSING = 'AUTOMATED_PROCESSING',
  RESTORE = 'RESTORE',
  REPLACEMENT = 'REPLACEMENT',
}

/**
 * Représente un accès au fichier pour l'audit trail
 *
 * @interface FileAccess
 */
export interface FileAccess {
  id: string;
  fileId: string;
  userId: string;
  operation: FileOperation;
  accessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  result: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}

/**
 * Détails du traitement d'un fichier
 *
 * @interface ProcessingDetails
 */
export interface ProcessingDetails {
  processingType: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Événement domaine pour le système d'événements
 *
 * @interface DomainEvent
 */
export interface DomainEvent {
  type: string;
  aggregateId: string;
  timestamp: Date;
  payload: any;
}

/**
 * Entité domaine File représentant un fichier dans le système
 *
 * Cette classe encapsule la logique métier liée aux fichiers,
 * incluant la gestion des versions, les contrôles d'accès,
 * et les transitions d'état.
 *
 * @class File
 */
export class File {
  private _domainEvents: DomainEvent[] = [];

  /**
   * Constructeur de l'entité File
   *
   * @param id - Identifiant unique du fichier
   * @param userId - ID de l'utilisateur propriétaire
   * @param metadata - Métadonnées complètes du fichier
   * @param versions - Historique des versions (optionnel)
   * @param accessLogs - Logs d'accès récents (optionnel)
   */
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public metadata: FileMetadata,
    public versions: FileVersion[] = [],
    public accessLogs: FileAccess[] = [],
  ) {
    this.validateInitialState();
  }

  /**
   * Crée une nouvelle version du fichier
   *
   * Cette méthode applique les règles métier pour la création
   * de versions et émet les événements domaine appropriés.
   *
   * @param description - Description des changements
   * @param changedBy - ID de l'utilisateur effectuant le changement
   * @param changeType - Type de changement (par défaut MANUAL_EDIT)
   * @returns La nouvelle version créée
   * @throws {Error} Si le fichier est en cours de traitement
   *
   * @example
   * ```typescript
   * const newVersion = file.createVersion(
   *   'Correction des fautes d\'orthographe',
   *   'user-123',
   *   VersionChangeType.MANUAL_EDIT
   * );
   * ```
   */
  createVersion(
    description: string,
    changedBy: string,
    changeType: VersionChangeType = VersionChangeType.MANUAL_EDIT,
  ): FileVersion {
    if (this.metadata.processingStatus === ProcessingStatus.PROCESSING) {
      throw new Error('Cannot create version while file is being processed');
    }

    if (this.metadata.deletedAt) {
      throw new Error('Cannot create version for deleted file');
    }

    const currentVersion = this.getCurrentVersion();
    if (currentVersion) {
      currentVersion.isActive = false;
    }

    const newVersion: FileVersion = {
      id: uuidv4(),
      fileId: this.id,
      versionNumber: this.metadata.versionCount + 1,
      createdAt: new Date(),
      createdBy: changedBy,
      changeDescription: description,
      changeType,
      size: this.metadata.size,
      checksumMd5: this.metadata.checksumMd5,
      checksumSha256: this.metadata.checksumSha256,
      storageKey: `${this.id}/versions/${Date.now()}`,
      isActive: true,
    };

    this.versions.push(newVersion);
    this.metadata.versionCount++;

    this.addDomainEvent({
      type: 'FileVersionCreated',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        versionId: newVersion.id,
        versionNumber: newVersion.versionNumber,
        changedBy,
        changeType,
        description,
      },
    });

    return newVersion;
  }

  /**
   * Vérifie si un utilisateur peut accéder au fichier
   *
   * Applique les règles métier de contrôle d'accès basées sur
   * la propriété, les permissions et l'état du fichier.
   *
   * @param userId - ID de l'utilisateur demandant l'accès
   * @param operation - Type d'opération demandée
   * @returns true si l'accès est autorisé, false sinon
   *
   * @example
   * ```typescript
   * if (file.canBeAccessedBy('user-123', FileOperation.READ)) {
   *   // Autoriser le téléchargement
   * }
   * ```
   */
  canBeAccessedBy(userId: string, operation: FileOperation): boolean {
    if (this.metadata.deletedAt) {
      return userId === this.userId && operation === FileOperation.READ;
    }

    if (this.metadata.virusScanStatus === VirusScanStatus.INFECTED) {
      return operation === FileOperation.READ;
    }

    if (this.metadata.processingStatus === ProcessingStatus.PROCESSING) {
      return operation === FileOperation.READ;
    }

    if (userId === this.userId) {
      return true;
    }

    return false;
  }

  /**
   * Met à jour le statut de traitement du fichier
   *
   * Gère les transitions d'état valides et émet les événements
   * appropriés pour le monitoring et l'audit.
   *
   * @param status - Nouveau statut de traitement
   * @param details - Détails optionnels du traitement
   * @throws {Error} Si la transition d'état est invalide
   *
   * @example
   * ```typescript
   * file.updateProcessingStatus(ProcessingStatus.COMPLETED, {
   *   processingType: 'IMAGE_OPTIMIZATION',
   *   startedAt: startTime,
   *   completedAt: new Date(),
   *   duration: Date.now() - startTime.getTime()
   * });
   * ```
   */
  updateProcessingStatus(
    status: ProcessingStatus,
    details?: ProcessingDetails,
  ): void {
    const currentStatus = this.metadata.processingStatus;

    if (!this.isValidStatusTransition(currentStatus, status)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${status}`,
      );
    }

    const previousStatus = this.metadata.processingStatus;
    this.metadata.processingStatus = status;

    this.addDomainEvent({
      type: 'FileProcessingStatusChanged',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        previousStatus,
        newStatus: status,
        details,
      },
    });

    if (status === ProcessingStatus.FAILED && details?.errorMessage) {
      this.logProcessingError(details.errorMessage);
    }
  }

  /**
   * Met à jour le statut de scan antivirus
   *
   * @param status - Nouveau statut de scan
   * @param threatDetails - Détails des menaces détectées (si infecté)
   */
  updateVirusScanStatus(status: VirusScanStatus, threatDetails?: string): void {
    const previousStatus = this.metadata.virusScanStatus;
    this.metadata.virusScanStatus = status;

    this.addDomainEvent({
      type: 'FileVirusScanStatusChanged',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        previousStatus,
        newStatus: status,
        threatDetails,
      },
    });

    if (status === VirusScanStatus.INFECTED) {
      this.markForQuarantine(threatDetails);
    }
  }

  /**
   * Enregistre un accès au fichier
   *
   * @param userId - ID de l'utilisateur accédant au fichier
   * @param operation - Type d'opération effectuée
   * @param result - Résultat de l'opération
   * @param context - Contexte additionnel (IP, user agent, etc.)
   */
  logAccess(
    userId: string,
    operation: FileOperation,
    result: 'SUCCESS' | 'FAILURE',
    context?: { ipAddress?: string; userAgent?: string; errorMessage?: string },
  ): void {
    const access: FileAccess = {
      id: uuidv4(),
      fileId: this.id,
      userId,
      operation,
      accessedAt: new Date(),
      result,
      ...context,
    };

    this.accessLogs.push(access);

    if (this.accessLogs.length > 100) {
      this.accessLogs = this.accessLogs.slice(-100);
    }

    this.addDomainEvent({
      type: 'FileAccessed',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: access,
    });
  }

  /**
   * Marque le fichier comme supprimé (soft delete)
   *
   * @param deletedBy - ID de l'utilisateur effectuant la suppression
   * @param reason - Raison de la suppression
   */
  markAsDeleted(deletedBy: string, reason: string): void {
    if (this.metadata.deletedAt) {
      throw new Error('File is already deleted');
    }

    this.metadata.deletedAt = new Date();

    this.addDomainEvent({
      type: 'FileDeleted',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        deletedBy,
        reason,
        deletedAt: this.metadata.deletedAt,
      },
    });
  }

  /**
   * Restaure un fichier supprimé
   *
   * @param restoredBy - ID de l'utilisateur restaurant le fichier
   */
  restore(restoredBy: string): void {
    if (!this.metadata.deletedAt) {
      throw new Error('File is not deleted');
    }

    const previousDeletedAt = this.metadata.deletedAt;
    this.metadata.deletedAt = undefined;

    this.addDomainEvent({
      type: 'FileRestored',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        restoredBy,
        previousDeletedAt,
      },
    });
  }

  /**
   * Obtient la version active actuelle
   *
   * @returns La version active ou undefined
   */
  getCurrentVersion(): FileVersion | undefined {
    return this.versions.find((v) => v.isActive);
  }

  /**
   * Obtient une version spécifique par numéro
   *
   * @param versionNumber - Numéro de version à récupérer
   * @returns La version ou undefined
   */
  getVersion(versionNumber: number): FileVersion | undefined {
    return this.versions.find((v) => v.versionNumber === versionNumber);
  }

  /**
   * Calcule la taille totale utilisée par toutes les versions
   *
   * @returns La taille totale en octets
   */
  getTotalVersionsSize(): number {
    return this.versions.reduce((total, version) => total + version.size, 0);
  }

  /**
   * Obtient les événements domaine et les vide
   *
   * @returns Les événements domaine accumulés
   */
  getAndClearDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  /**
   * Valide l'état initial de l'entité
   *
   * @throws {Error}
   */
  private validateInitialState(): void {
    if (!this.id || !this.userId || !this.metadata) {
      throw new Error('Invalid file entity state: missing required fields');
    }

    if (this.metadata.size < 0) {
      throw new Error('Invalid file size: cannot be negative');
    }

    if (!this.metadata.checksumMd5 || !this.metadata.checksumSha256) {
      throw new Error('Invalid file entity state: missing checksums');
    }
  }

  /**
   * Vérifie si une transition d'état est valide
   *
   * @param from - État actuel
   * @param to - État cible
   * @returns true si la transition est valide
   */
  private isValidStatusTransition(
    from: ProcessingStatus,
    to: ProcessingStatus,
  ): boolean {
    const validTransitions: Record<ProcessingStatus, ProcessingStatus[]> = {
      [ProcessingStatus.PENDING]: [
        ProcessingStatus.PROCESSING,
        ProcessingStatus.FAILED,
        ProcessingStatus.SKIPPED,
      ],
      [ProcessingStatus.PROCESSING]: [
        ProcessingStatus.COMPLETED,
        ProcessingStatus.FAILED,
      ],
      [ProcessingStatus.COMPLETED]: [ProcessingStatus.PROCESSING],
      [ProcessingStatus.FAILED]: [ProcessingStatus.PROCESSING],
      [ProcessingStatus.SKIPPED]: [ProcessingStatus.PROCESSING],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Marque le fichier pour quarantaine
   *
   * @param threatDetails - Détails de la menace détectée
   */
  private markForQuarantine(threatDetails?: string): void {
    this.addDomainEvent({
      type: 'FileQuarantined',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        reason: 'VIRUS_DETECTED',
        threatDetails,
      },
    });
  }

  /**
   * Enregistre une erreur de traitement
   *
   * @param errorMessage - Message d'erreur
   */
  private logProcessingError(errorMessage: string): void {
    this.addDomainEvent({
      type: 'FileProcessingError',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        errorMessage,
        processingStatus: this.metadata.processingStatus,
      },
    });
  }

  /**
   * Ajoute un événement domaine
   *
   * @param event - L'événement à ajouter
   */
  private addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }
}

export {
  FileOperation,
  VirusScanStatus,
  ProcessingStatus,
} from '../../types/file-system.types';
export type { FileMetadata } from '../../types/file-system.types';
