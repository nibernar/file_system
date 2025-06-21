import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { FILE_SYSTEM_CONSTANTS } from '../../constants/file-system.constants';
import { RateLimitResult } from '../../types/file-system.types';

/**
 * Service de rate limiting pour contrôler le nombre de requêtes par utilisateur/IP
 * 
 * Utilise Redis via le cache manager pour stocker les compteurs de requêtes
 * avec expiration automatique.
 * 
 * @class RateLimitService
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  
  /**
   * Préfixes pour les clés Redis selon le type de rate limit
   */
  private readonly CACHE_PREFIXES = {
    USER: 'rate_limit:user:',
    IP: 'rate_limit:ip:',
    ENDPOINT: 'rate_limit:endpoint:'
  };

  /**
   * Fenêtre de temps pour le rate limiting (en secondes)
   */
  private readonly WINDOW_SIZE_SECONDS = 60; // 1 minute

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Vérifie si une opération est autorisée selon les limites de taux
   * 
   * @param identifier - Identifiant unique (userId, IP, etc.)
   * @param options - Options pour le rate limiting (endpoint, method, etc.)
   * @returns Résultat avec autorisation et informations de limite
   */
  async checkLimit(
    identifier: string, 
    options?: { endpoint?: string; method?: string; userId?: string }
  ): Promise<RateLimitResult> {
    try {
      // Détermination du type et de la limite
      const { key, limit } = this.getRateLimitConfig(identifier, options);
      
      // Récupération du compteur actuel
      const currentCount = await this.getCurrentCount(key);
      
      // Calcul du temps de reset
      const now = Date.now();
      const resetTime = new Date(now + (this.WINDOW_SIZE_SECONDS * 1000)); // Convertir en Date
      
      // Vérification de la limite
      const allowed = currentCount < limit;
      const remaining = Math.max(0, limit - currentCount);
      
      this.logger.debug(`Rate limit check for ${key}: ${currentCount}/${limit} (allowed: ${allowed})`);
      
      return {
        allowed,
        limit,
        remaining,
        resetTime, // Maintenant c'est un objet Date
        resetAt: resetTime, // Utilisez resetTime au lieu de new Date(resetTime)
        retryAfter: allowed ? 0 : this.WINDOW_SIZE_SECONDS
      };
      
    } catch (error) {
      this.logger.error(`Rate limit check error: ${error.message}`, error.stack);
      
      // En cas d'erreur, on autorise par défaut (fail-open)
      return {
        allowed: true,
        limit: 0,
        remaining: 0,
        resetTime: new Date(), // Objet Date
        resetAt: new Date(),   // Objet Date
        retryAfter: 0
      };
    }
  }

  /**
   * Incrémente le compteur pour un identifiant
   * 
   * @param identifier - Identifiant unique
   * @param operation - Type d'opération (optionnel)
   */
  async incrementCounter(identifier: string, operation?: string): Promise<void> {
    try {
      const { key } = this.getRateLimitConfig(identifier, { endpoint: operation });
      
      // Récupération et incrémentation atomique
      const currentCount = await this.getCurrentCount(key);
      const newCount = currentCount + 1;
      
      // Stockage avec TTL
      await this.cacheManager.set(
        key, 
        newCount, 
        this.WINDOW_SIZE_SECONDS * 1000 // TTL en millisecondes
      );
      
      this.logger.debug(`Rate limit counter incremented for ${key}: ${newCount}`);
      
      // Alerte si proche de la limite
      const { limit } = this.getRateLimitConfig(identifier, { endpoint: operation });
      if (newCount >= limit * 0.8) {
        this.logger.warn(`Rate limit warning: ${key} at ${newCount}/${limit} (${Math.round(newCount/limit*100)}%)`);
      }
      
    } catch (error) {
      this.logger.error(`Rate limit increment error: ${error.message}`, error.stack);
    }
  }

  /**
   * Réinitialise le compteur pour un identifiant (utile pour les tests ou admin)
   * 
   * @param identifier - Identifiant unique
   */
  async resetCounter(identifier: string): Promise<void> {
    try {
      const keys = [
        `${this.CACHE_PREFIXES.USER}${identifier}`,
        `${this.CACHE_PREFIXES.IP}${identifier}`
      ];
      
      await Promise.all(keys.map(key => this.cacheManager.del(key)));
      
      this.logger.log(`Rate limit counters reset for ${identifier}`);
      
    } catch (error) {
      this.logger.error(`Rate limit reset error: ${error.message}`, error.stack);
    }
  }

  /**
   * Obtient les statistiques de rate limiting pour un identifiant
   * 
   * @param identifier - Identifiant unique
   * @returns Statistiques détaillées
   */
  async getStats(identifier: string): Promise<{
    userCount: number;
    ipCount: number;
    limits: { user: number; ip: number };
  }> {
    try {
      const userKey = `${this.CACHE_PREFIXES.USER}${identifier}`;
      const ipKey = `${this.CACHE_PREFIXES.IP}${identifier}`;
      
      const [userCount, ipCount] = await Promise.all([
        this.getCurrentCount(userKey),
        this.getCurrentCount(ipKey)
      ]);
      
      return {
        userCount,
        ipCount,
        limits: {
          user: FILE_SYSTEM_CONSTANTS.SECURITY_LIMITS.MAX_UPLOADS_PER_MINUTE,
          ip: FILE_SYSTEM_CONSTANTS.SECURITY_LIMITS.MAX_UPLOADS_PER_IP_PER_MINUTE
        }
      };
      
    } catch (error) {
      this.logger.error(`Rate limit stats error: ${error.message}`, error.stack);
      return {
        userCount: 0,
        ipCount: 0,
        limits: { user: 0, ip: 0 }
      };
    }
  }

  /**
   * Détermine la configuration de rate limit appropriée
   * 
   * @param identifier - Identifiant unique
   * @param options - Options supplémentaires
   * @returns Clé de cache et limite
   */
  private getRateLimitConfig(
    identifier: string,
    options?: { endpoint?: string; method?: string; userId?: string }
  ): { key: string; limit: number } {
    // Si c'est une IP
    if (this.isIpAddress(identifier)) {
      return {
        key: `${this.CACHE_PREFIXES.IP}${identifier}${options?.endpoint ? `:${options.endpoint}` : ''}`,
        limit: FILE_SYSTEM_CONSTANTS.SECURITY_LIMITS.MAX_UPLOADS_PER_IP_PER_MINUTE
      };
    }
    
    // Si c'est un userId
    return {
      key: `${this.CACHE_PREFIXES.USER}${identifier}${options?.endpoint ? `:${options.endpoint}` : ''}`,
      limit: FILE_SYSTEM_CONSTANTS.SECURITY_LIMITS.MAX_UPLOADS_PER_MINUTE
    };
  }

  /**
   * Récupère le compteur actuel depuis le cache
   * 
   * @param key - Clé de cache
   * @returns Compteur actuel (0 si inexistant)
   */
  private async getCurrentCount(key: string): Promise<number> {
    try {
      const count = await this.cacheManager.get<number>(key);
      return count || 0;
    } catch (error) {
      this.logger.error(`Error getting rate limit count for ${key}:`, error);
      return 0;
    }
  }

  /**
   * Vérifie si une chaîne est une adresse IP
   * 
   * @param value - Valeur à vérifier
   * @returns true si c'est une IP valide
   */
  private isIpAddress(value: string): boolean {
    // Regex simple pour IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // Regex simple pour IPv6
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    return ipv4Regex.test(value) || ipv6Regex.test(value);
  }
}
