import { Injectable } from '@nestjs/common';
import { FileMetadata } from '../../types/file-system.types';

@Injectable()
export class FileMetadataService {
  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    // TODO: Implémenter
    return null;
  }

  async updateFileMetadata(
    fileId: string,
    updates: Partial<FileMetadata>,
  ): Promise<FileMetadata> {
    // TODO: Implémenter
    throw new Error('Not implemented');
  }
}
