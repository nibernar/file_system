import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { FileSecurityService } from '../../domain/services/file-security.service';
import { FILE_OPERATION_KEY } from '../decorators/file-operation.decorator';
import { FileOperation } from '../../types/file-system.types';

/**
 * Interface pour étendre Request avec les informations utilisateur
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
    isAdmin?: boolean;
  };

  // Métadonnées de sécurité ajoutées par le middleware
  security?: {
    clientIp: string;
    threatLevel: 'low' | 'medium' | 'high';
    isVpn: boolean;
    isTor: boolean;
    country: string;
  };
}

/**
 * Interface pour le résultat de vérification d'accès
 */
interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: string;
  userPermissions?: string[];
  fileOwnership?: {
    isOwner: boolean;
    ownerId: string;
    sharedWith?: string[];
  };
}

/**
 * Guard de contrôle d'accès aux fichiers
 *
 * Ce guard vérifie les autorisations d'accès aux fichiers basées sur :
 * - L'ownership du fichier (propriétaire)
 * - Les permissions partagées (collaboration)
 * - Les rôles utilisateur (admin, etc.)
 * - Les restrictions de projet (si applicable)
 * - Les politiques de sécurité organisationnelles
 *
 * Le guard s'intègre avec votre FileSecurityService existant et utilise
 * les entités domaine définies dans file.entity.ts.
 *
 * @class FileAccessGuard
 */
@Injectable()
export class FileAccessGuard implements CanActivate {
  private readonly logger = new Logger(FileAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly fileSecurityService: FileSecurityService,
  ) {}

  /**
   * Méthode principale de vérification d'accès
   *
   * Délègue la vérification d'accès au FileSecurityService existant
   * et gère les aspects spécifiques au guard (logging, audit, erreurs).
   *
   * @param context - Contexte d'exécution NestJS contenant la requête
   * @returns true si l'accès est autorisé, false sinon
   *
   * @throws {UnauthorizedException} Si l'utilisateur n'est pas authentifié
   * @throws {BadRequestException} Si les paramètres de requête sont invalides
   * @throws {ForbiddenException} Si l'accès est explicitement refusé
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const handler = context.getHandler();

      const user = request.user;
      if (!user || !user.id) {
        this.logger.warn(`Access attempt without authentication`, {
          requestId,
        });
        throw new UnauthorizedException('Authentication required');
      }

      const requiredOperation = this.reflector.get<FileOperation>(
        FILE_OPERATION_KEY,
        handler,
      );
      if (!requiredOperation) {
        this.logger.debug(`No file operation required for endpoint`, {
          userId: user.id,
          path: request.path,
          requestId,
        });
        return true;
      }

      const fileId = this.extractFileId(request);
      if (!fileId) {
        this.logger.warn(`File access attempt without fileId`, {
          userId: user.id,
          operation: requiredOperation,
          path: request.path,
          requestId,
        });
        throw new BadRequestException('File ID is required');
      }

      if (!this.isValidFileId(fileId)) {
        this.logger.warn(`Invalid file ID format: ${fileId}`, {
          userId: user.id,
          requestId,
        });
        throw new BadRequestException('Invalid file ID format');
      }

      const hasAccess = await this.fileSecurityService.checkFileAccess(
        fileId,
        user.id,
        requiredOperation,
      );

      if (!hasAccess) {
        this.logger.warn(`File access denied`, {
          userId: user.id,
          fileId,
          operation: requiredOperation,
          ipAddress: request.security?.clientIp || request.ip,
          userAgent: request.headers['user-agent'],
          requestId,
        });

        console.warn(`File access denied`, {
          userId: user.id,
          fileId,
          operation: requiredOperation,
          ipAddress: request.security?.clientIp || request.ip,
        });
        throw new ForbiddenException('Access denied');
      }

      const duration = Date.now() - startTime;
      this.logger.log(`File access granted`, {
        userId: user.id,
        fileId,
        operation: requiredOperation,
        duration,
        requestId,
      });
      console.log(`File access granted`);

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`File access guard error: ${error.message}`, {
        duration,
        requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new ForbiddenException('Access verification failed');
    }
  }

  /**
   * Extrait l'ID du fichier depuis la requête
   *
   * Cherche l'ID du fichier dans différents emplacements selon les conventions REST :
   * - Paramètres de route (:fileId, :id)
   * - Query parameters (?fileId=...)
   * - Corps de la requête (body.fileId)
   *
   * @param request - Objet de requête Express
   * @returns ID du fichier ou null si non trouvé
   *
   * @private
   */
  private extractFileId(request: AuthenticatedRequest): string | null {
    if (request.params?.fileId) {
      return request.params.fileId;
    }

    if (request.params?.id) {
      return request.params.id;
    }

    if (request.query?.fileId && typeof request.query.fileId === 'string') {
      return request.query.fileId;
    }

    if (request.body?.fileId) {
      return request.body.fileId;
    }

    const headerFileId = request.headers['x-file-id'];
    if (headerFileId && typeof headerFileId === 'string') {
      return headerFileId;
    }

    return null;
  }

  /**
   * Génère un identifiant unique pour traçabilité des requêtes
   *
   * @returns Identifiant de requête unique
   *
   * @private
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Valide le format d'un ID de fichier - VERSION CORRIGÉE
   *
   * Accepte les formats UUID v4 standard ou IDs personnalisés
   * selon les conventions de votre système.
   *
   * @param fileId - ID du fichier à valider
   * @returns true si le format est valide, false sinon
   *
   * @private
   */
  private isValidFileId(fileId: string): boolean {
    if (!fileId || typeof fileId !== 'string') {
      return false;
    }

    const dangerousChars = /[<>'"&|;$`\\\/\.\.\s]/;
    if (dangerousChars.test(fileId)) {
      return false;
    }

    if (fileId.length < 8) {
      return false;
    }

    if (fileId.length > 255) {
      return false;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const prefixedIdRegex = /^[a-zA-Z]+[-_][a-zA-Z0-9-_]{2,}$/;

    const simpleIdRegex = /^[a-zA-Z0-9-_]{8,}$/;

    return (
      uuidRegex.test(fileId) ||
      prefixedIdRegex.test(fileId) ||
      simpleIdRegex.test(fileId)
    );
  }

  /**
   * Méthode utilitaire pour extraire des informations de contexte de la requête
   *
   * Utilisée pour enrichir les logs et l'audit avec des informations
   * de sécurité provenant du middleware de sécurité.
   *
   * @param request - Requête HTTP
   * @returns Contexte de sécurité enrichi
   *
   * @private
   */
  private extractSecurityContext(request: AuthenticatedRequest): {
    ipAddress: string;
    userAgent: string;
    threatLevel?: string;
    country?: string;
  } {
    return {
      ipAddress:
        request.security?.clientIp ||
        request.ip ||
        request.socket?.remoteAddress ||
        'unknown',
      userAgent: request.headers['user-agent'] || 'unknown',
      threatLevel: request.security?.threatLevel,
      country: request.security?.country,
    };
  }

  /**
   * Vérifie si l'utilisateur a des permissions administrateur
   *
   * Méthode utilitaire pour centraliser la logique de vérification
   * des rôles administrateur.
   *
   * @param user - Objet utilisateur de la requête
   * @returns true si l'utilisateur est admin
   *
   * @private
   */
  private isUserAdmin(
    user: NonNullable<AuthenticatedRequest['user']>,
  ): boolean {
    return (
      user.isAdmin === true ||
      user.roles?.includes('admin') === true ||
      user.roles?.includes('administrator') === true
    );
  }

  /**
   * Détermine le niveau de logging selon l'environnement
   *
   * En développement : logs détaillés
   * En production : logs essentiels seulement
   *
   * @param level - Niveau de log souhaité
   * @param data - Données à logger
   *
   * @private
   */
  private logSecurely(
    level: 'debug' | 'log' | 'warn' | 'error',
    message: string,
    data?: any,
  ): void {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const sanitizedData = isDevelopment ? data : this.sanitizeLogData(data);

    this.logger[level](message, sanitizedData);
  }

  /**
   * Sanitise les données de log pour la production
   *
   * Supprime ou masque les informations sensibles avant logging.
   *
   * @param data - Données à sanitiser
   * @returns Données sanitisées
   *
   * @private
   */
  private sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    if (sanitized.fileId && typeof sanitized.fileId === 'string') {
      sanitized.fileId =
        sanitized.fileId.length > 20
          ? sanitized.fileId.substring(0, 8) + '...'
          : sanitized.fileId;
    }

    return sanitized;
  }
}
