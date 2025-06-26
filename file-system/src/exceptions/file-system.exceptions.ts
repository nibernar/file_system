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
export class FileNotFoundException extends Error {
  public readonly fileId: string;
  public readonly reason?: string;
  public readonly originalError?: string;

  constructor(fileId: string, options?: { reason?: string; originalError?: string }) {
    const message = options?.reason 
      ? `Fichier non trouvé: ${fileId} - ${options.reason}`
      : `Fichier non trouvé: ${fileId}`;
    
    super(message);
    this.name = 'FileNotFoundException';
    this.fileId = fileId;
    this.reason = options?.reason;
    this.originalError = options?.originalError;
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
export class ProcessingException extends Error {
  public readonly fileId: string;
  public readonly operation: string;
  public readonly reason: string;

  constructor(fileId: string, operation: string, reason: string) {
    super(`Erreur de traitement pour ${fileId} (${operation}): ${reason}`);
    this.name = 'ProcessingException';
    this.fileId = fileId;
    this.operation = operation;
    this.reason = reason;
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

/**
 * Exception levée lors d'un échec d'optimisation de fichier
 */
export class OptimizationException extends Error {
  public readonly fileId: string;
  public readonly operation: string;
  public readonly reason: string;
  public readonly originalError?: Error;

  constructor(
    fileId: string, 
    operation: string, 
    reason: string, 
    originalError?: Error
  ) {
    super(`Optimisation échouée pour ${fileId} (${operation}): ${reason}`);
    this.name = 'OptimizationException';
    this.fileId = fileId;
    this.operation = operation;
    this.reason = reason;
    this.originalError = originalError;
  }
}

/**
 * Exception levée lors d'un échec de génération de miniature
 */
export class ThumbnailGenerationException extends Error {
  public readonly fileId: string;
  public readonly operation: string;
  public readonly reason: string;
  public readonly originalError?: Error;

  constructor(
    fileId: string, 
    operation: string, 
    reason: string, 
    originalError?: Error
  ) {
    super(`Génération miniature échouée pour ${fileId} (${operation}): ${reason}`);
    this.name = 'ThumbnailGenerationException';
    this.fileId = fileId;
    this.operation = operation;
    this.reason = reason;
    this.originalError = originalError;
  }
}

/**
 * Exception levée lors d'un échec de conversion de format
 */
export class FormatConversionException extends Error {
  public readonly fileId: string;
  public readonly operation: string;
  public readonly reason: string;
  public readonly fromFormat: string;
  public readonly toFormat: string;
  public readonly originalError?: Error;

  constructor(
    fileId: string, 
    operation: string, 
    reason: string,
    fromFormat: string,
    toFormat: string,
    originalError?: Error
  ) {
    super(`Conversion format échouée pour ${fileId} (${fromFormat} → ${toFormat}): ${reason}`);
    this.name = 'FormatConversionException';
    this.fileId = fileId;
    this.operation = operation;
    this.reason = reason;
    this.fromFormat = fromFormat;
    this.toFormat = toFormat;
    this.originalError = originalError;
  }
}