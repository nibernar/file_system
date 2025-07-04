import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Inject,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Interface pour l'utilisateur authentifié dans la requête
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
    isAdmin?: boolean;
  };

  security?: {
    clientIp: string;
    threatLevel: 'low' | 'medium' | 'high';
    isVpn: boolean;
    isTor: boolean;
    country: string;
  };
}

/**
 * Interface pour les événements d'audit des fichiers
 */
interface FileAuditEvent {
  id: string;
  fileId?: string;
  userId?: string;
  action: string;
  method: string;
  endpoint: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  duration: number;
  success: boolean;
  statusCode: number;
  errorMessage?: string;
  requestSize?: number;
  responseSize?: number;
  securityContext?: {
    threatLevel: string;
    isVpn: boolean;
    isTor: boolean;
    country: string;
  };
  additionalMetadata?: Record<string, any>;
}

/**
 * Interface pour le service d'audit (injecté via DI)
 */
interface IAuditService {
  logFileOperation(event: FileAuditEvent): Promise<void>;
  logSecurityEvent(event: Partial<FileAuditEvent>): Promise<void>;
  logPerformanceMetric(metric: {
    operation: string;
    duration: number;
    success: boolean;
  }): Promise<void>;
}

/**
 * Interceptor d'audit pour traçabilité complète des opérations sur fichiers
 *
 * Cet interceptor capture automatiquement toutes les interactions avec les APIs
 * de gestion de fichiers pour créer un audit trail complet conforme aux
 * exigences de sécurité et de compliance.
 *
 * Fonctionnalités :
 * - Logging automatique de toutes les opérations CRUD sur fichiers
 * - Traçabilité des accès autorisés et refusés
 * - Métriques de performance des opérations
 * - Détection d'activités suspectes
 * - Intégration avec le système de monitoring (C-08)
 * - Compliance RGPD et audit réglementaire
 *
 * @class FileAuditInterceptor
 * @implements {NestInterceptor}
 *
 * @example
 * ```typescript
 * // Usage dans un controller
 * @Controller('/api/v1/files')
 * @UseInterceptors(FileAuditInterceptor)
 * export class FilesController {
 *   // Toutes les méthodes seront automatiquement auditées
 * }
 * ```
 */
@Injectable()
export class FileAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FileAuditInterceptor.name);

  constructor(
    @Inject('IAuditService') private readonly auditService: IAuditService,
  ) {}

  /**
   * Méthode principale d'interception des requêtes
   *
   * Intercepte chaque requête vers les endpoints de fichiers et :
   * 1. Capture les métadonnées de la requête
   * 2. Mesure le temps d'exécution
   * 3. Log le résultat (succès ou échec)
   * 4. Envoie les événements au service d'audit
   * 5. Déclenche des alertes si nécessaire
   *
   * @param context - Contexte d'exécution NestJS contenant la requête/réponse
   * @param next - Handler suivant dans la chaîne d'interceptors
   * @returns Observable avec le résultat de l'opération
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const auditEventId = this.generateAuditEventId();

    const baseAuditEvent = this.extractBaseAuditData(
      request,
      response,
      context,
      auditEventId,
    );

    this.logger.debug(
      `Starting audit for ${baseAuditEvent.method} ${baseAuditEvent.endpoint}`,
      {
        auditEventId,
        userId: baseAuditEvent.userId,
        fileId: baseAuditEvent.fileId,
      },
    );

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          this.logSuccessfulOperation(
            baseAuditEvent,
            startTime,
            response,
            responseData,
          );
        },
      }),
      catchError((error) => {
        this.logFailedOperation(baseAuditEvent, startTime, response, error);

        return throwError(() => error);
      }),
    );
  }

  /**
   * Extrait les données de base pour l'audit depuis la requête
   *
   * Récupère toutes les informations nécessaires pour l'audit :
   * - Identifiants utilisateur et fichier
   * - Informations de sécurité (IP, User-Agent, etc.)
   * - Contexte d'authentification
   * - Métadonnées de la requête
   *
   * @param request - Objet requête Express étendu avec auth
   * @param response - Objet réponse Express
   * @param context - Contexte d'exécution NestJS
   * @param auditEventId - ID unique de l'événement d'audit
   * @returns Données d'audit de base
   *
   * @private
   */
  private extractBaseAuditData(
    request: AuthenticatedRequest,
    response: Response,
    context: ExecutionContext,
    auditEventId: string,
  ): Omit<FileAuditEvent, 'duration' | 'success' | 'statusCode'> {
    const fileId = this.extractFileId(request);

    const action = this.extractActionFromContext(context);

    const securityContext = this.extractSecurityContext(request);

    return {
      id: auditEventId,
      fileId,
      userId: request.user?.id,
      action,
      method: request.method,
      endpoint: request.route?.path || request.path,
      timestamp: new Date(),
      ipAddress: this.extractClientIp(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      requestSize: this.calculateRequestSize(request),
      securityContext,
      additionalMetadata: {
        isAdmin: request.user?.isAdmin,
        userRoles: request.user?.roles,
        query: request.query,
        hasBody: !!request.body && Object.keys(request.body).length > 0,
      },
    };
  }

  /**
   * Log une opération réussie dans le système d'audit
   *
   * Enregistre tous les détails d'une opération qui s'est terminée avec succès :
   * - Durée d'exécution
   * - Code de statut HTTP
   * - Taille de la réponse
   * - Métriques de performance
   *
   * @param baseEvent - Données d'audit de base
   * @param startTime - Timestamp de début d'opération
   * @param response - Objet réponse Express
   * @param responseData - Données de réponse (sans données sensibles)
   *
   * @private
   */
  private async logSuccessfulOperation(
    baseEvent: Omit<FileAuditEvent, 'duration' | 'success' | 'statusCode'>,
    startTime: number,
    response: Response,
    responseData: any,
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      const statusCode = response.statusCode;

      const auditEvent: FileAuditEvent = {
        ...baseEvent,
        duration,
        success: true,
        statusCode,
        responseSize: this.calculateResponseSize(responseData),
      };

      this.logger.log(`File operation successful: ${baseEvent.action}`, {
        auditEventId: baseEvent.id,
        userId: baseEvent.userId,
        fileId: baseEvent.fileId,
        duration,
        statusCode,
        endpoint: baseEvent.endpoint,
      });

      await this.auditService.logFileOperation(auditEvent);

      await this.auditService.logPerformanceMetric({
        operation: baseEvent.action,
        duration,
        success: true,
      });

      if (duration > 10000) {
        this.logger.warn(`Slow file operation detected`, {
          auditEventId: baseEvent.id,
          operation: baseEvent.action,
          duration,
          userId: baseEvent.userId,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to log successful audit event`, {
        auditEventId: baseEvent.id,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Log une opération échouée dans le système d'audit
   *
   * Enregistre les détails d'une opération qui a échoué :
   * - Message d'erreur (sanitisé)
   * - Stack trace si en mode développement
   * - Analyse du type d'erreur pour détection d'intrusion
   * - Alertes sécurité si nécessaire
   *
   * @param baseEvent - Données d'audit de base
   * @param startTime - Timestamp de début d'opération
   * @param response - Objet réponse Express
   * @param error - Erreur qui s'est produite
   *
   * @private
   */
  private async logFailedOperation(
    baseEvent: Omit<FileAuditEvent, 'duration' | 'success' | 'statusCode'>,
    startTime: number,
    response: Response,
    error: any,
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      const statusCode = error.status || error.statusCode || 500;

      const auditEvent: FileAuditEvent = {
        ...baseEvent,
        duration,
        success: false,
        statusCode,
        errorMessage: this.sanitizeErrorMessage(
          error.message || 'Unknown error',
        ),
        responseSize: 0,
      };

      const logLevel = this.determineErrorLogLevel(error);
      this.logger[logLevel](`File operation failed: ${baseEvent.action}`, {
        auditEventId: baseEvent.id,
        userId: baseEvent.userId,
        fileId: baseEvent.fileId,
        duration,
        statusCode,
        error: error.message,
        endpoint: baseEvent.endpoint,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      });

      await this.auditService.logFileOperation(auditEvent);

      await this.auditService.logPerformanceMetric({
        operation: baseEvent.action,
        duration,
        success: false,
      });

      if (this.isSuspiciousError(error, baseEvent)) {
        await this.auditService.logSecurityEvent({
          ...baseEvent,
          action: 'SUSPICIOUS_ACTIVITY',
          errorMessage: 'Potential security threat detected',
          additionalMetadata: {
            ...baseEvent.additionalMetadata,
            suspiciousReason: this.analyzeSuspiciousActivity(error, baseEvent),
          },
        });

        this.logger.warn(`Suspicious activity detected`, {
          auditEventId: baseEvent.id,
          userId: baseEvent.userId,
          ipAddress: baseEvent.ipAddress,
          errorType: error.constructor.name,
        });
      }
    } catch (auditError) {
      this.logger.error(`Failed to log failed audit event`, {
        auditEventId: baseEvent.id,
        originalError: error.message,
        auditError: auditError.message,
      });
    }
  }

  /**
   * Extrait l'ID du fichier depuis la requête
   *
   * Cherche l'ID du fichier dans différents emplacements :
   * - Paramètres de route (:fileId, :id)
   * - Query parameters
   * - Headers personnalisés
   * - Corps de la requête
   *
   * @param request - Objet requête Express
   * @returns ID du fichier ou undefined si non trouvé
   *
   * @private
   */
  private extractFileId(request: AuthenticatedRequest): string | undefined {
    if (request.params?.fileId) {
      return request.params.fileId;
    }

    if (request.params?.id) {
      return request.params.id;
    }

    if (request.query?.fileId && typeof request.query.fileId === 'string') {
      return request.query.fileId;
    }

    const headerFileId = request.headers['x-file-id'];
    if (headerFileId && typeof headerFileId === 'string') {
      return headerFileId;
    }

    if (request.body?.fileId) {
      return request.body.fileId;
    }

    return undefined;
  }

  /**
   * Extrait l'action/opération depuis le contexte d'exécution
   *
   * Détermine le type d'opération effectuée :
   * - Depuis le nom de la méthode du controller
   * - Depuis la route et la méthode HTTP
   * - Depuis les métadonnées du décorateur
   *
   * @param context - Contexte d'exécution NestJS
   * @returns Action identifiée
   *
   * @private
   */
  private extractActionFromContext(context: ExecutionContext): string {
    const handler = context.getHandler();
    const className = context.getClass().name;
    const methodName = handler.name;

    const actionMap: Record<string, string> = {
      uploadFile: 'FILE_UPLOAD',
      downloadFile: 'FILE_DOWNLOAD',
      getFile: 'FILE_ACCESS',
      deleteFile: 'FILE_DELETE',
      getFileMetadata: 'METADATA_ACCESS',
      processFile: 'FILE_PROCESS',
      generateDownloadUrl: 'URL_GENERATION',
      createVersion: 'VERSION_CREATE',
      getVersionHistory: 'VERSION_ACCESS',
      getSecurityStatus: 'SECURITY_CHECK',
    };

    return (
      actionMap[methodName] ||
      `${className.toUpperCase()}_${methodName.toUpperCase()}`
    );
  }

  /**
   * Extrait le contexte de sécurité depuis la requête
   *
   * Récupère les informations de sécurité ajoutées par le middleware :
   * - Niveau de menace
   * - Détection VPN/Tor
   * - Géolocalisation
   *
   * @param request - Requête avec contexte sécurité
   * @returns Contexte de sécurité ou undefined
   *
   * @private
   */
  private extractSecurityContext(
    request: AuthenticatedRequest,
  ): FileAuditEvent['securityContext'] {
    if (!request.security) {
      return undefined;
    }

    return {
      threatLevel: request.security.threatLevel,
      isVpn: request.security.isVpn,
      isTor: request.security.isTor,
      country: request.security.country,
    };
  }

  /**
   * Extrait l'adresse IP réelle du client
   *
   * Prend en compte les proxies et load balancers :
   * - X-Forwarded-For
   * - X-Real-IP
   * - X-Client-IP
   * - Remote address de la connexion
   *
   * @param request - Objet requête Express
   * @returns Adresse IP du client
   *
   * @private
   */
  private extractClientIp(request: AuthenticatedRequest): string {
    if (request.security?.clientIp) {
      return request.security.clientIp;
    }

    const forwardedFor = request.headers['x-forwarded-for'] as string;
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIp = request.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp.trim();
    }

    const clientIp = request.headers['x-client-ip'] as string;
    if (clientIp) {
      return clientIp.trim();
    }

    return (
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      (request as any).ip ||
      'Unknown'
    );
  }

  /**
   * Calcule la taille approximative de la requête
   *
   * @param request - Objet requête Express
   * @returns Taille en bytes ou undefined
   *
   * @private
   */
  private calculateRequestSize(
    request: AuthenticatedRequest,
  ): number | undefined {
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      return parseInt(contentLength, 10);
    }

    if (request.body) {
      try {
        return Buffer.byteLength(JSON.stringify(request.body), 'utf8');
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Calcule la taille approximative de la réponse
   *
   * @param responseData - Données de réponse
   * @returns Taille en bytes ou undefined
   *
   * @private
   */
  private calculateResponseSize(responseData: any): number | undefined {
    if (!responseData) {
      return 0;
    }

    try {
      if (typeof responseData === 'string') {
        return Buffer.byteLength(responseData, 'utf8');
      }

      if (typeof responseData === 'object') {
        return Buffer.byteLength(JSON.stringify(responseData), 'utf8');
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Sanitise le message d'erreur pour éviter la fuite d'informations sensibles
   *
   * @param errorMessage - Message d'erreur original
   * @returns Message d'erreur sanitisé
   *
   * @private
   */
  private sanitizeErrorMessage(errorMessage: string): string {
    if (!errorMessage) {
      return 'Unknown error';
    }

    let sanitized = errorMessage
      .replace(/password[=:]\s*[^\s]+/gi, 'password=***')
      .replace(/token[=:]\s*[^\s]+/gi, 'token=***')
      .replace(/key[=:]\s*[^\s]+/gi, 'key=***')
      .replace(/secret[=:]\s*[^\s]+/gi, 'secret=***');

    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 497) + '...';
    }

    return sanitized;
  }

  /**
   * Détermine le niveau de log approprié pour une erreur
   *
   * @param error - Erreur qui s'est produite
   * @returns Niveau de log ('error', 'warn', 'log')
   *
   * @private
   */
  private determineErrorLogLevel(error: any): 'error' | 'warn' | 'log' {
    if (
      error.name?.includes('Security') ||
      error.name?.includes('Unauthorized')
    ) {
      return 'error';
    }

    if (error.status >= 400 && error.status < 500) {
      return 'warn';
    }

    if (error.status >= 500) {
      return 'error';
    }

    return 'log';
  }

  /**
   * Vérifie si une erreur indique une activité suspecte
   *
   * @param error - Erreur qui s'est produite
   * @param auditEvent - Données d'audit de base
   * @returns true si l'activité est suspecte
   *
   * @private
   */
  private isSuspiciousError(
    error: any,
    auditEvent: Omit<FileAuditEvent, 'duration' | 'success' | 'statusCode'>,
  ): boolean {
    if (error.name?.includes('Unauthorized') && auditEvent.fileId) {
      return true;
    }

    if (auditEvent.fileId && /[<>'"&]/.test(auditEvent.fileId)) {
      return true;
    }

    if (
      auditEvent.userAgent === 'Unknown' ||
      auditEvent.userAgent.includes('bot')
    ) {
      return true;
    }

    if (auditEvent.securityContext?.threatLevel === 'high') {
      return true;
    }

    return false;
  }

  /**
   * Analyse le type d'activité suspecte détectée
   *
   * @param error - Erreur qui s'est produite
   * @param auditEvent - Données d'audit de base
   * @returns Description de l'activité suspecte
   *
   * @private
   */
  private analyzeSuspiciousActivity(
    error: any,
    auditEvent: Omit<FileAuditEvent, 'duration' | 'success' | 'statusCode'>,
  ): string {
    const reasons: string[] = [];

    if (error.name?.includes('Unauthorized')) {
      reasons.push('Unauthorized access attempt');
    }

    if (auditEvent.fileId && /[<>'"&]/.test(auditEvent.fileId)) {
      reasons.push('Potential injection attempt in fileId');
    }

    if (auditEvent.userAgent === 'Unknown') {
      reasons.push('Missing or suspicious User-Agent');
    }

    if (auditEvent.securityContext?.threatLevel === 'high') {
      reasons.push('High threat level IP address');
    }

    if (auditEvent.securityContext?.isTor) {
      reasons.push('Tor exit node detected');
    }

    return reasons.join(', ') || 'Unknown suspicious pattern';
  }

  /**
   * Génère un identifiant unique pour l'événement d'audit
   *
   * @returns ID unique de l'événement
   *
   * @private
   */
  private generateAuditEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `audit_${timestamp}_${random}`;
  }
}
