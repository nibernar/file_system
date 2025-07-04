/**
 * Tests unitaires pour FileSecurityMiddleware - VERSION CORRIGÉE
 *
 * Corrections apportées :
 * - Types Jest correctly mocked
 * - Interface compatibility issues fixed
 * - Proper mock implementations
 *
 * @author Backend Team
 * @version 1.2 - Fixed compilation issues
 * @since Phase 2.2 - Middleware Sécurité et Guards
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import { FileSecurityMiddleware } from '../file-security.middleware';
import { RateLimitService } from '../../../infrastructure/security/rate-limit.service';
import { IpIntelligenceService } from '../../../infrastructure/security/ip-intelligence.service';
import {
  RateLimitResult,
  IpIntelligence,
} from '../../../types/file-system.types';

class TooManyRequestsException extends Error {
  constructor(message?: string) {
    super(message || 'Too Many Requests');
    this.name = 'TooManyRequestsException';
  }
}

/**
 * Interface pour étendre Request dans les tests - version simplifiée
 */
interface TestAuthenticatedRequest {
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
  method?: string;
  originalUrl?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: {
    remoteAddress?: string;
  };
  socket?: {
    remoteAddress?: string;
  };
}

describe('FileSecurityMiddleware', () => {
  let middleware: FileSecurityMiddleware;
  let mockRateLimitService: {
    checkLimit: jest.MockedFunction<any>;
    incrementCounter: jest.MockedFunction<any>;
  };
  let mockIpIntelligenceService: {
    getIpIntelligence: jest.MockedFunction<any>;
    recordIpActivity: jest.MockedFunction<any>;
    isIpBlocked: jest.MockedFunction<any>;
  };
  let mockRequest: TestAuthenticatedRequest;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  /**
   * Configuration initiale des tests
   */
  beforeEach(async () => {
    mockRateLimitService = {
      checkLimit: jest.fn(),
      incrementCounter: jest.fn(),
    };

    mockIpIntelligenceService = {
      getIpIntelligence: jest.fn(),
      recordIpActivity: jest.fn(),
      isIpBlocked: jest.fn(),
    };

    mockRequest = {
      ip: '192.168.1.100',
      originalUrl: '/api/v1/files/upload',
      method: 'POST',
      path: '/api/v1/files/upload',
      headers: {
        'user-agent': 'Mozilla/5.0 Test Browser',
        'x-forwarded-for': undefined,
      },
      user: {
        id: 'user-123',
        email: 'test@coders.com',
        roles: ['user'],
        isAdmin: false,
      },
    };

    mockResponse = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockNext = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSecurityMiddleware,
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
        {
          provide: IpIntelligenceService,
          useValue: mockIpIntelligenceService,
        },
      ],
    }).compile();

    middleware = module.get<FileSecurityMiddleware>(FileSecurityMiddleware);
  });

  /**
   * Nettoyage après chaque test
   */
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('IP Intelligence and Security Checks', () => {
    /**
     * Test : Validation des requêtes avec IP sécurisée
     */
    it('should allow requests from legitimate IPs with low threat level', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        isProxy: false,
        isHosting: false,
        countryCode: 'FR',
        country: 'France',
      };

      const mockRateLimitResult: RateLimitResult = {
        allowed: true,
        limit: 100,
        remaining: 95,
        resetTime: new Date(Date.now() + 3600000),
        resetAt: new Date(Date.now() + 3600000),
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );
      mockIpIntelligenceService.isIpBlocked.mockResolvedValue(false);
      mockRateLimitService.checkLimit.mockResolvedValue(mockRateLimitResult);
      mockRateLimitService.incrementCounter.mockResolvedValue();

      await middleware.use(
        mockRequest as any,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.security).toEqual({
        clientIp: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        country: 'FR',
      });
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        100,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        95,
      );
    });

    /**
     * Test : Blocage des connexions Tor
     */
    it('should block Tor exit node connections when configured', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'medium',
        isVpn: false,
        isTor: true,
        isProxy: false,
        isHosting: false,
        countryCode: 'US',
        country: 'United States',
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Access denied: Tor connections not allowed');

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockIpIntelligenceService.getIpIntelligence).toHaveBeenCalledWith(
        '192.168.1.100',
      );
    });

    /**
     * Test : Blocage des IPs avec niveau de menace élevé
     */
    it('should block high threat level IPs', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'high',
        isVpn: true,
        isTor: false,
        isProxy: false,
        isHosting: false,
        countryCode: 'CN',
        country: 'China',
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Access denied: IP threat level too high');

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRateLimitService.checkLimit).not.toHaveBeenCalled();
    });

    /**
     * Test : Blocage des IPs explicitement blacklistées
     */
    it('should block explicitly blacklisted IPs', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        isProxy: false,
        isHosting: false,
        countryCode: 'US',
        country: 'United States',
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );
      mockIpIntelligenceService.isIpBlocked.mockResolvedValue(true);

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Access denied: IP address blocked');

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockIpIntelligenceService.isIpBlocked).toHaveBeenCalledWith(
        '192.168.1.100',
      );
    });
  });

  describe('Rate Limiting', () => {
    /**
     * Test : Enforcement du rate limiting
     */
    it('should enforce rate limiting and reject excess requests', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        isProxy: false,
        isHosting: false,
        countryCode: 'FR',
        country: 'France',
      };

      const mockRateLimitResult: RateLimitResult = {
        allowed: false,
        limit: 100,
        remaining: 0,
        resetTime: new Date(Date.now() + 3600000),
        resetAt: new Date(Date.now() + 3600000),
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );
      mockIpIntelligenceService.isIpBlocked.mockResolvedValue(false);
      mockRateLimitService.checkLimit.mockResolvedValue(mockRateLimitResult);

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', 60);
      expect(mockRateLimitService.incrementCounter).not.toHaveBeenCalled();
    });

    /**
     * Test : Incrémentation du compteur pour requêtes autorisées
     */
    it('should increment rate limit counter for allowed requests', async () => {
      const mockIpIntelligence: IpIntelligence = {
        ip: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        isProxy: false,
        isHosting: false,
        countryCode: 'FR',
        country: 'France',
      };

      const mockRateLimitResult: RateLimitResult = {
        allowed: true,
        limit: 100,
        remaining: 95,
        resetTime: new Date(Date.now() + 3600000),
        resetAt: new Date(Date.now() + 3600000),
      };

      mockIpIntelligenceService.getIpIntelligence.mockResolvedValue(
        mockIpIntelligence,
      );
      mockIpIntelligenceService.isIpBlocked.mockResolvedValue(false);
      mockRateLimitService.checkLimit.mockResolvedValue(mockRateLimitResult);
      mockRateLimitService.incrementCounter.mockResolvedValue();

      await middleware.use(
        mockRequest as any,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRateLimitService.incrementCounter).toHaveBeenCalledWith(
        'user-123',
        'POST:/api/v1/files/upload',
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Exemptions and Special Cases', () => {
    /**
     * Test : Exemption des endpoints de santé
     */
    it('should exempt health check endpoints from security checks', async () => {
      mockRequest.path = '/health';

      await middleware.use(
        mockRequest as any,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(
        mockIpIntelligenceService.getIpIntelligence,
      ).not.toHaveBeenCalled();
      expect(mockRateLimitService.checkLimit).not.toHaveBeenCalled();
    });

    /**
     * Test : Exemption des endpoints de métriques
     */
    it('should exempt metrics endpoints from security checks', async () => {
      mockRequest.path = '/metrics';

      await middleware.use(
        mockRequest as any,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(
        mockIpIntelligenceService.getIpIntelligence,
      ).not.toHaveBeenCalled();
      expect(mockRateLimitService.checkLimit).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    /**
     * Test : Gestion gracieuse des erreurs de service
     */
    it('should handle service errors gracefully in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      mockIpIntelligenceService.getIpIntelligence.mockRejectedValue(
        new Error('IP Intelligence service unavailable'),
      );

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Security check failed');

      expect(mockNext).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    /**
     * Test : Strict error handling en production
     */
    it('should handle service errors strictly in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockIpIntelligenceService.getIpIntelligence.mockRejectedValue(
        new Error('IP Intelligence service unavailable'),
      );

      await expect(
        middleware.use(mockRequest as any, mockResponse as Response, mockNext),
      ).rejects.toThrow('Security check failed');

      expect(mockNext).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Configuration Management', () => {
    /**
     * Test : Configuration par défaut valide
     */
    it('should have secure default configuration', () => {
      const config = middleware.getConfig();

      expect(config.blockTor).toBe(true);
      expect(config.blockVpn).toBe(false);
      expect(config.maxThreatLevel).toBe('medium');
      expect(config.blockedCountries).toEqual([]);
      expect(config.rateLimitExemptions).toContain('/health');
      expect(config.rateLimitExemptions).toContain('/metrics');
    });
  });
});
