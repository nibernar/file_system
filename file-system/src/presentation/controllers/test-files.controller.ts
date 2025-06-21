// src/presentation/controllers/test-files.controller.ts
import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileAccessGuard } from '../guards/file-access.guard';
import { RequireFileOperation } from '../decorators/file-operation.decorator';
import { FileOperation } from '../../types/file-system.types';
import { FileAuditInterceptor } from '../interceptors/file-audit.interceptor';

/**
 * Controller de test pour valider le fonctionnement du FileAccessGuard
 * 
 * Ce controller permet de tester différents scénarios d'accès aux fichiers
 * sans impacter les vraies APIs de production.
 */
@Controller('/test/files')
@UseInterceptors(FileAuditInterceptor)
export class TestFilesController {

  /**
   * Test basique du guard avec opération de lecture
   * 
   * Endpoint: GET /test/files/:fileId/test-access
   * Opération requise: READ
   */
  @Get(':fileId/test-access')
  @RequireFileOperation(FileOperation.READ)
  @UseGuards(FileAccessGuard)
  async testFileAccess(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `Access test successful for file ${fileId}`,
      operation: 'read',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test du guard avec opération d'écriture
   * 
   * Endpoint: GET /test/files/:fileId/test-write
   * Opération requise: WRITE
   */
  @Get(':fileId/test-write')
  @RequireFileOperation(FileOperation.WRITE)
  @UseGuards(FileAccessGuard)
  async testFileWrite(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `Write access test successful for file ${fileId}`,
      operation: 'write',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test du guard avec opération de suppression
   * 
   * Endpoint: GET /test/files/:fileId/test-delete
   * Opération requise: DELETE
   */
  @Get(':fileId/test-delete')
  @RequireFileOperation(FileOperation.DELETE)
  @UseGuards(FileAccessGuard)
  async testFileDelete(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `Delete access test successful for file ${fileId}`,
      operation: 'delete',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test du guard avec opération de partage
   * 
   * Endpoint: GET /test/files/:fileId/test-share
   * Opération requise: SHARE
   */
  @Get(':fileId/test-share')
  @RequireFileOperation(FileOperation.SHARE)
  @UseGuards(FileAccessGuard)
  async testFileShare(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `Share access test successful for file ${fileId}`,
      operation: 'share',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test sans guard pour comparaison
   * 
   * Endpoint: GET /test/files/:fileId/no-guard
   * Aucun guard appliqué
   */
  @Get(':fileId/no-guard')
  async testNoGuard(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `No guard test for file ${fileId}`,
      operation: 'NONE',
      note: 'This endpoint has no file access guard',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test d'endpoint sans opération requise
   * 
   * Endpoint: GET /test/files/:fileId/no-operation
   * Guard appliqué mais sans @RequireFileOperation
   */
  @Get(':fileId/no-operation')
  @UseGuards(FileAccessGuard)
  async testNoOperation(@Param('fileId') fileId: string) {
    return { 
      success: true, 
      message: `No operation required for file ${fileId}`,
      operation: 'NONE_REQUIRED',
      note: 'Guard applied but no @RequireFileOperation decorator',
      timestamp: new Date().toISOString()
    };
  }
}