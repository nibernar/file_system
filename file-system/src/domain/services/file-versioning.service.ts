import { Injectable } from '@nestjs/common';
import { FileVersion } from '../../types/file-system.types';

@Injectable()
export class FileVersioningService {
  async createVersion(fileId: string, description: string): Promise<FileVersion> {
    // TODO: Implémenter
    throw new Error('Not implemented');
  }

  async getVersions(fileId: string): Promise<FileVersion[]> {
    // TODO: Implémenter
    return [];
  }
}