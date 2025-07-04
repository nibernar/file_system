// src/presentation/decorators/file-operation.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { FileOperation } from '../../types/file-system.types';

/**
 * Clé de métadonnée pour l'opération de fichier requise
 */
export const FILE_OPERATION_KEY = 'fileOperation';

/**
 * Décorateur pour spécifier l'opération requise sur un fichier
 *
 * Utilise SetMetadata de NestJS pour attacher l'opération requise
 * aux métadonnées du handler de route.
 *
 * @param operation - Type d'opération FileOperation
 *
 * @example
 * ```typescript
 * @Get(':fileId')
 * @RequireFileOperation(FileOperation.READ)
 * async getFile(@Param('fileId') fileId: string) {
 *   // Implementation
 * }
 * ```
 */
export const RequireFileOperation = (operation: FileOperation) =>
  SetMetadata(FILE_OPERATION_KEY, operation);
