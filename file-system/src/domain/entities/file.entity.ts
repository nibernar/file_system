import { FileMetadata, ProcessingStatus, VirusScanStatus } from '../../types/file-system.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Représente une version d'un fichier dans le système
 * 
 * @interface FileVersion
 */
export interface FileVersion {
  /** Identifiant unique de la version */
  id: string;
  /** Identifiant du fichier parent */
  fileId: string;
  /** Numéro de version (incrémental) */
  versionNumber: number;
  /** Date de création de la version */
  createdAt: Date;
  /** ID de l'utilisateur qui a créé la version */
  createdBy: string;
  /** Description des changements dans cette version */
  changeDescription?: string;
  /** Type de changement */
  changeType: VersionChangeType;
  /** Taille du fichier pour cette version */
  size: number;
  /** Checksum MD5 de cette version */
  checksumMd5: string;
  /** Checksum SHA256 de cette version */
  checksumSha256: string;
  /** Clé de stockage unique pour cette version */
  storageKey: string;
  /** Indique si c'est la version active */
  isActive: boolean;
}

/**
 * Types de changements possibles pour une version
 * 
 * @enum VersionChangeType
 */
export enum VersionChangeType {
  /** Upload initial du fichier */
  INITIAL_UPLOAD = 'INITIAL_UPLOAD',
  /** Modification manuelle par l'utilisateur */
  MANUAL_EDIT = 'MANUAL_EDIT',
  /** Traitement automatique (optimisation, etc.) */
  AUTOMATED_PROCESSING = 'AUTOMATED_PROCESSING',
  /** Restauration depuis une version antérieure */
  RESTORE = 'RESTORE',
  /** Remplacement complet du fichier */
  REPLACEMENT = 'REPLACEMENT'
}

/**
 * Représente un accès au fichier pour l'audit trail
 * 
 * @interface FileAccess
 */
export interface FileAccess {
  /** Identifiant unique de l'accès */
  id: string;
  /** Identifiant du fichier accédé */
  fileId: string;
  /** ID de l'utilisateur qui a accédé au fichier */
  userId: string;
  /** Type d'opération effectuée */
  operation: FileOperation;
  /** Date et heure de l'accès */
  accessedAt: Date;
  /** Adresse IP de l'utilisateur */
  ipAddress?: string;
  /** User agent du navigateur */
  userAgent?: string;
  /** Résultat de l'opération */
  result: 'SUCCESS' | 'FAILURE';
  /** Message d'erreur si échec */
  errorMessage?: string;
}

/**
 * Types d'opérations possibles sur un fichier
 * 
 * @enum FileOperation
 */
export enum FileOperation {
  /** Lecture/téléchargement du fichier */
  READ = 'READ',
  /** Écriture/modification du fichier */
  WRITE = 'WRITE',
  /** Suppression du fichier */
  DELETE = 'DELETE',
  /** Partage du fichier */
  SHARE = 'SHARE',
  /** Génération d'URL présignée */
  GENERATE_URL = 'GENERATE_URL',
  /** Création de version */
  CREATE_VERSION = 'CREATE_VERSION',
  /** Restauration de version */
  RESTORE_VERSION = 'RESTORE_VERSION'
}

/**
 * Détails du traitement d'un fichier
 * 
 * @interface ProcessingDetails
 */
export interface ProcessingDetails {
  /** Type de traitement effectué */
  processingType: string;
  /** Date de début du traitement */
  startedAt: Date;
  /** Date de fin du traitement */
  completedAt?: Date;
  /** Durée en millisecondes */
  duration?: number;
  /** Message d'erreur si échec */
  errorMessage?: string;
  /** Métadonnées additionnelles du traitement */
  metadata?: Record<string, any>;
}

/**
 * Événement domaine pour le système d'événements
 * 
 * @interface DomainEvent
 */
export interface DomainEvent {
  /** Type d'événement */
  type: string;
  /** Identifiant agrégat concerné */
  aggregateId: string;
  /** Timestamp de l'événement */
  timestamp: Date;
  /** Données de l'événement */
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
  /** Événements domaine émis par l'entité */
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
    public accessLogs: FileAccess[] = []
  ) {
    // Validation de l'état initial
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
    changeType: VersionChangeType = VersionChangeType.MANUAL_EDIT
  ): FileVersion {
    // Validation des règles métier
    if (this.metadata.processingStatus === ProcessingStatus.PROCESSING) {
      throw new Error('Cannot create version while file is being processed');
    }

    if (this.metadata.deletedAt) {
      throw new Error('Cannot create version for deleted file');
    }

    // Désactiver la version actuelle
    const currentVersion = this.getCurrentVersion();
    if (currentVersion) {
      currentVersion.isActive = false;
    }

    // Créer la nouvelle version
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
      isActive: true
    };

    // Ajouter la version
    this.versions.push(newVersion);
    this.metadata.versionCount++;

    // Émettre l'événement domaine
    this.addDomainEvent({
      type: 'FileVersionCreated',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        versionId: newVersion.id,
        versionNumber: newVersion.versionNumber,
        changedBy,
        changeType,
        description
      }
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
    // Le propriétaire a tous les droits
    if (userId === this.userId) {
      return true;
    }

    // Fichier supprimé : aucun accès sauf pour le propriétaire
    if (this.metadata.deletedAt) {
      return false;
    }

    // Fichier infecté : lecture seule pour investigation
    if (this.metadata.virusScanStatus === VirusScanStatus.INFECTED) {
      return operation === FileOperation.READ;
    }

    // Fichier en cours de traitement : lecture seule
    if (this.metadata.processingStatus === ProcessingStatus.PROCESSING) {
      return operation === FileOperation.READ;
    }

    // TODO: Implémenter les permissions partagées (RBAC)
    // Pour l'instant, seul le propriétaire a accès
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
  updateProcessingStatus(status: ProcessingStatus, details?: ProcessingDetails): void {
    const currentStatus = this.metadata.processingStatus;

    // Validation des transitions d'état
    if (!this.isValidStatusTransition(currentStatus, status)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${status}`
      );
    }

    // Mise à jour du statut
    const previousStatus = this.metadata.processingStatus;
    this.metadata.processingStatus = status;

    // Émettre l'événement domaine
    this.addDomainEvent({
      type: 'FileProcessingStatusChanged',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: {
        previousStatus,
        newStatus: status,
        details
      }
    });

    // Actions spécifiques selon le nouveau statut
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
        threatDetails
      }
    });

    // Si infecté, marquer pour quarantaine
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
    context?: { ipAddress?: string; userAgent?: string; errorMessage?: string }
  ): void {
    const access: FileAccess = {
      id: uuidv4(),
      fileId: this.id,
      userId,
      operation,
      accessedAt: new Date(),
      result,
      ...context
    };

    this.accessLogs.push(access);

    // Garder seulement les 100 derniers accès en mémoire
    if (this.accessLogs.length > 100) {
      this.accessLogs = this.accessLogs.slice(-100);
    }

    // Émettre l'événement pour l'audit permanent
    this.addDomainEvent({
      type: 'FileAccessed',
      aggregateId: this.id,
      timestamp: new Date(),
      payload: access
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
        deletedAt: this.metadata.deletedAt
      }
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
        previousDeletedAt
      }
    });
  }

  /**
   * Obtient la version active actuelle
   * 
   * @returns La version active ou undefined
   */
  getCurrentVersion(): FileVersion | undefined {
    return this.versions.find(v => v.isActive);
  }

  /**
   * Obtient une version spécifique par numéro
   * 
   * @param versionNumber - Numéro de version à récupérer
   * @returns La version ou undefined
   */
  getVersion(versionNumber: number): FileVersion | undefined {
    return this.versions.find(v => v.versionNumber === versionNumber);
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
   * @throws {Error} Si l'état est invalide
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
  private isValidStatusTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
    const validTransitions: Record<ProcessingStatus, ProcessingStatus[]> = {
      [ProcessingStatus.PENDING]: [
        ProcessingStatus.PROCESSING,
        ProcessingStatus.FAILED,
        ProcessingStatus.SKIPPED
      ],
      [ProcessingStatus.PROCESSING]: [
        ProcessingStatus.COMPLETED,
        ProcessingStatus.FAILED
      ],
      [ProcessingStatus.COMPLETED]: [
        ProcessingStatus.PROCESSING // Retraitement possible
      ],
      [ProcessingStatus.FAILED]: [
        ProcessingStatus.PROCESSING // Retry possible
      ],
      [ProcessingStatus.SKIPPED]: [
        ProcessingStatus.PROCESSING // Traitement manuel possible
      ]
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
        threatDetails
      }
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
        processingStatus: this.metadata.processingStatus
      }
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