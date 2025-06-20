import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception de base pour le système de fichiers
 */
export class FileSystemException extends HttpException {
  constructor(message: string, details?: any) {
    super(
      {
        message,
        error: 'File System Error',
        details,
        timestamp: new Date().toISOString()
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Exception de sécurité des fichiers
 */
export class FileSecurityException extends HttpException {
  constructor(message: string, threats: string[] = [], details?: any) {
    super(
      {
        message,
        error: 'File Security Violation',
        threats,
        details,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Exception de fichier trop volumineux
 */
export class FileTooLargeException extends HttpException {
  constructor(size: number, maxSize: number) {
    super(
      {
        message: `File size ${size} bytes exceeds maximum allowed size ${maxSize} bytes`,
        error: 'File Too Large',
        size,
        maxSize,
        timestamp: new Date().toISOString()
      },
      HttpStatus.PAYLOAD_TOO_LARGE
    );
  }
}

/**
 * Exception de type de fichier non supporté
 */
export class UnsupportedFileTypeException extends HttpException {
  constructor(contentType: string, allowedTypes?: string[]) {
    super(
      {
        message: `File type ${contentType} is not supported`,
        error: 'Unsupported File Type',
        contentType,
        allowedTypes,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Exception de nom de fichier invalide
 */
export class InvalidFilenameException extends HttpException {
  constructor(filename: string, reason?: string) {
    super(
      {
        message: `Invalid filename: ${filename}`,
        error: 'Invalid Filename',
        filename,
        reason,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Exception de rate limiting
 */
export class RateLimitExceededException extends HttpException {
  constructor(userId: string, limit: number, resetTime?: Date) {
    super(
      {
        message: `Rate limit exceeded for user ${userId}`,
        error: 'Rate Limit Exceeded',
        userId,
        limit,
        resetTime,
        timestamp: new Date().toISOString()
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}

/**
 * Exception d'accès non autorisé à un fichier
 */
export class UnauthorizedFileAccessException extends HttpException {
  constructor(fileId: string, userId: string, operation: string) {
    super(
      {
        message: `User ${userId} is not authorized to ${operation} file ${fileId}`,
        error: 'Unauthorized File Access',
        fileId,
        userId,
        operation,
        timestamp: new Date().toISOString()
      },
      HttpStatus.FORBIDDEN
    );
  }
}

/**
 * Exception de fichier non trouvé
 */
export class FileNotFoundException extends HttpException {
  constructor(fileId: string) {
    super(
      {
        message: `File with id ${fileId} not found`,
        error: 'File Not Found',
        fileId,
        timestamp: new Date().toISOString()
      },
      HttpStatus.NOT_FOUND
    );
  }
}

/**
 * Exception de scan antivirus
 */
export class VirusScanException extends HttpException {
  constructor(message: string, details?: any) {
    super(
      {
        message,
        error: 'Virus Scan Error',
        details,
        timestamp: new Date().toISOString()
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Exception de timeout de scan antivirus
 */
export class VirusScanTimeoutException extends HttpException {
  constructor(fileHash: string, timeoutMs: number) {
    super(
      {
        message: `Virus scan timed out after ${timeoutMs}ms for file ${fileHash}`,
        error: 'Virus Scan Timeout',
        fileHash,
        timeoutMs,
        timestamp: new Date().toISOString()
      },
      HttpStatus.REQUEST_TIMEOUT
    );
  }
}

/**
 * Exception de quarantaine de fichier
 */
export class QuarantineException extends HttpException {
  constructor(fileId: string, reason: string) {
    super(
      {
        message: `Failed to quarantine file ${fileId}: ${reason}`,
        error: 'Quarantine Error',
        fileId,
        reason,
        timestamp: new Date().toISOString()
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Exception de validation de format
 */
export class FormatValidationException extends HttpException {
  constructor(filename: string, errors: string[]) {
    super(
      {
        message: `Format validation failed for file ${filename}`,
        error: 'Format Validation Error',
        filename,
        validationErrors: errors,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Exception de validation de contenu
 */
export class ContentValidationException extends HttpException {
  constructor(filename: string, threats: string[]) {
    super(
      {
        message: `Content validation failed for file ${filename}`,
        error: 'Content Validation Error',
        filename,
        threats,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Exception de traitement de fichier
 */
export class ProcessingException extends HttpException {
  constructor(fileId: string, operation: string, reason: string) {
    super(
      {
        message: `Processing failed for file ${fileId} during ${operation}: ${reason}`,
        error: 'File Processing Error',
        fileId,
        operation,
        reason,
        timestamp: new Date().toISOString()
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Exception de timeout de traitement
 */
export class ProcessingTimeoutException extends HttpException {
  constructor(fileId: string, operation: string, timeoutMs: number) {
    super(
      {
        message: `Processing timed out for file ${fileId} during ${operation} after ${timeoutMs}ms`,
        error: 'Processing Timeout',
        fileId,
        operation,
        timeoutMs,
        timestamp: new Date().toISOString()
      },
      HttpStatus.REQUEST_TIMEOUT
    );
  }
}

/**
 * Exception de stockage
 */
export class StorageException extends HttpException {
  constructor(operation: string, reason: string, details?: any) {
    super(
      {
        message: `Storage operation ${operation} failed: ${reason}`,
        error: 'Storage Error',
        operation,
        reason,
        details,
        timestamp: new Date().toISOString()
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Exception de service de stockage
 */
export class StorageServiceException extends HttpException {
  constructor(message: string, details?: any) {
    super(
      {
        message,
        error: 'Storage Service Error',
        details,
        timestamp: new Date().toISOString()
      },
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }
}

/**
 * Exception de réseau
 */
export class NetworkError extends Error {
  constructor(message: string, public readonly details?: any) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Exception d'authentification
 */
export class AuthenticationError extends Error {
  constructor(message: string, public readonly details?: any) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Exception d'état de traitement invalide
 */
export class InvalidProcessingStateException extends HttpException {
  constructor(fileId: string, currentState: string) {
    super(
      {
        message: `File ${fileId} is in invalid state for processing: ${currentState}`,
        error: 'Invalid Processing State',
        fileId,
        currentState,
        timestamp: new Date().toISOString()
      },
      HttpStatus.CONFLICT
    );
  }
}

/**
 * Exception de fichier non distribué
 */
export class FileNotDistributedException extends HttpException {
  constructor(fileId: string) {
    super(
      {
        message: `File ${fileId} is not distributed to CDN`,
        error: 'File Not Distributed',
        fileId,
        timestamp: new Date().toISOString()
      },
      HttpStatus.NOT_FOUND
    );
  }
}

/**
 * Exception de distribution CDN
 */
export class CDNDistributionException extends HttpException {
  constructor(fileId: string, reason: string) {
    super(
      {
        message: `CDN distribution failed for file ${fileId}: ${reason}`,
        error: 'CDN Distribution Error',
        fileId,
        reason,
        timestamp: new Date().toISOString()
      },
      HttpStatus.BAD_GATEWAY
    );
  }
}