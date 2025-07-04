import {
  Injectable,
  NestMiddleware,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RateLimitService } from '../../infrastructure/security/rate-limit.service';
import { IpIntelligenceService } from '../../infrastructure/security/ip-intelligence.service';

/**
 * Exception personnalisée pour les erreurs de rate limiting
 * (NestJS n'exporte pas TooManyRequestsException par défaut)
 */
export class TooManyRequestsException extends HttpException {
  constructor(message?: string) {
    super(message || 'Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}

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

  security?: {
    clientIp: string;
    threatLevel: 'low' | 'medium' | 'high';
    isVpn: boolean;
    isTor: boolean;
    country: string;
  };
}

/**
 * Configuration du middleware de sécurité
 */
interface SecurityConfig {
  blockTor: boolean;
  blockVpn: boolean;
  maxThreatLevel: 'low' | 'medium' | 'high';
  blockedCountries: string[];
  rateLimitExemptions: string[];
  devMode: boolean;
}

/**
 * Middleware de sécurité pour les fichiers
 *
 * Ce middleware gère :
 * - La détection et le blocage des IPs malveillantes
 * - Le rate limiting par utilisateur et par IP
 * - L'analyse de l'intelligence IP (géolocalisation, VPN, Tor, etc.)
 * - La journalisation des activités suspectes
 * - Les headers de sécurité
 *
 * @class FileSecurityMiddleware
 */
@Injectable()
export class FileSecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FileSecurityMiddleware.name);

  /**
   * Configuration par défaut du middleware
   */
  private readonly config: SecurityConfig = {
    blockTor: true,
    blockVpn: false,
    maxThreatLevel: 'medium',
    blockedCountries: [],
    rateLimitExemptions: ['/health', '/metrics'],
    devMode: process.env.NODE_ENV === 'development',
  };

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly ipIntelligenceService: IpIntelligenceService,
  ) {}

  /**
   * Méthode principale du middleware
   */
  async use(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const clientIp = this.getClientIp(req);

      if (this.config.devMode) {
        this.logger.debug(
          `Processing request from IP: ${clientIp}, Path: ${req.path}, Method: ${req.method}`,
        );
      }

      if (this.isExemptEndpoint(req.path)) {
        this.logger.debug(
          `Endpoint ${req.path} is exempt from security checks`,
        );
        return next();
      }

      const ipIntelligence =
        await this.ipIntelligenceService.getIpIntelligence(clientIp);

      req.security = {
        clientIp,
        threatLevel: ipIntelligence.threatLevel,
        isVpn: ipIntelligence.isVpn,
        isTor: ipIntelligence.isTor,
        country: ipIntelligence.countryCode,
      };

      await this.checkIpSecurity(ipIntelligence, clientIp);

      const rateLimitResult = await this.rateLimitService.checkLimit(
        req.user?.id || clientIp,
        {
          endpoint: req.path,
          method: req.method,
          userId: req.user?.id,
        },
      );

      this.setRateLimitHeaders(res, rateLimitResult);

      if (!rateLimitResult.allowed) {
        res.setHeader('Retry-After', rateLimitResult.retryAfter || 60);

        this.logger.warn(
          `Rate limit exceeded for ${req.user?.id || clientIp} on ${req.path}`,
        );

        throw new TooManyRequestsException(
          `Rate limit exceeded. Please retry after ${rateLimitResult.resetTime.toISOString()}`,
        );
      }

      await this.rateLimitService.incrementCounter(
        req.user?.id || clientIp,
        `${req.method}:${req.path}`,
      );

      await this.ipIntelligenceService.recordIpActivity(
        clientIp,
        `${req.method}:${req.path}`,
      );

      this.setSecurityHeaders(res, req.security);

      if (this.config.devMode || ipIntelligence.threatLevel !== 'low') {
        const processingTime = Date.now() - startTime;
        this.logger.log(
          `Security check completed for ${clientIp}: ${processingTime}ms, Threat: ${ipIntelligence.threatLevel}, User: ${req.user?.id || 'anonymous'}`,
        );
      }

      next();
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof HttpException) {
        this.logger.warn(
          `Security check failed for ${req.ip}: ${error.message} (${processingTime}ms)`,
        );
        throw error;
      } else {
        this.logger.error(
          `Unexpected error in security middleware: ${error.message}`,
          error.stack,
        );

        if (this.config.devMode) {
          next();
        } else {
          throw new BadRequestException('Security check failed');
        }
      }
    }
  }

  /**
   * Vérifie la sécurité de l'IP
   */
  private async checkIpSecurity(
    ipIntelligence: any,
    clientIp: string,
  ): Promise<void> {
    if (this.isThreatLevelBlocked(ipIntelligence.threatLevel)) {
      this.logger.warn(
        `High threat IP blocked: ${clientIp} (Level: ${ipIntelligence.threatLevel})`,
      );
      throw new BadRequestException(`Access denied: IP threat level too high`);
    }

    if (this.config.blockTor && ipIntelligence.isTor) {
      this.logger.warn(`Tor exit node blocked: ${clientIp}`);
      throw new BadRequestException(
        'Access denied: Tor connections not allowed',
      );
    }

    if (this.config.blockVpn && ipIntelligence.isVpn) {
      this.logger.warn(`VPN connection blocked: ${clientIp}`);
      throw new BadRequestException(
        'Access denied: VPN connections not allowed',
      );
    }

    if (this.config.blockedCountries.includes(ipIntelligence.countryCode)) {
      this.logger.warn(
        `Blocked country access: ${clientIp} from ${ipIntelligence.country}`,
      );
      throw new BadRequestException('Access denied: Geographic restriction');
    }

    const isBlocked = await this.ipIntelligenceService.isIpBlocked(clientIp);
    if (isBlocked) {
      this.logger.warn(`Explicitly blocked IP: ${clientIp}`);
      throw new BadRequestException('Access denied: IP address blocked');
    }
  }

  /**
   * Vérifie si le niveau de menace doit être bloqué
   */
  private isThreatLevelBlocked(threatLevel: string): boolean {
    const levels = { low: 1, medium: 2, high: 3 };
    const maxLevel = levels[this.config.maxThreatLevel];
    const currentLevel = levels[threatLevel];

    return currentLevel > maxLevel;
  }

  /**
   * Vérifie si l'endpoint est exempté des vérifications de sécurité
   */
  private isExemptEndpoint(path: string): boolean {
    return this.config.rateLimitExemptions.some((exemption) =>
      path.startsWith(exemption),
    );
  }

  /**
   * Définit les headers de rate limiting
   */
  private setRateLimitHeaders(res: Response, rateLimitResult: any): void {
    res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toISOString());

    if (this.config.devMode) {
      res.setHeader(
        'X-RateLimit-Used',
        rateLimitResult.limit - rateLimitResult.remaining,
      );
    }
  }

  /**
   * Définit les headers de sécurité supplémentaires
   */
  private setSecurityHeaders(res: Response, security: any): void {
    if (this.config.devMode) {
      res.setHeader('X-Client-Country', security.country);
      res.setHeader('X-Threat-Level', security.threatLevel);
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    res.setHeader('X-Security-Check', 'passed');
  }

  /**
   * Extraction de l'adresse IP du client
   * Prend en compte les proxies et load balancers
   */
  private getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'] as string;
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp.trim();
    }

    const clientIp = req.headers['x-client-ip'] as string;
    if (clientIp) {
      return clientIp.trim();
    }

    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req as any).ip ||
      '127.0.0.1'
    );
  }

  /**
   * Met à jour la configuration du middleware (utile pour les tests ou l'admin)
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Security middleware configuration updated');
  }

  /**
   * Obtient la configuration actuelle
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}
