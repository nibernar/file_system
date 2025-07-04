import { Injectable, Logger } from '@nestjs/common';
import { FileOperation } from '../../types/file-system.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async logFileAccess(
    fileId: string,
    userId: string,
    operation: FileOperation,
    metadata?: Record<string, any>,
  ): Promise<void> {
    this.logger.log('File access logged', { fileId, userId, operation });
  }

  async logSecurityEvent(event: any): Promise<void> {
    this.logger.warn('Security event', event);
  }
}
