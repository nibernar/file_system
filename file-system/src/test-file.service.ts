// A SUPR une fois integré
import { Injectable, Inject } from '@nestjs/common';
import { IFileMetadataRepository } from './domain/repositories/file-metadata.repository';

@Injectable()
export class TestFileService {
  constructor(
    @Inject('IFileMetadataRepository')
    private readonly fileRepository: IFileMetadataRepository,
  ) {}

  async testCreateFile() {
    const result = await this.fileRepository.create({
      userId: 'test-user-123',
      filename: 'test-document.pdf',
      originalName: 'Mon Document Test.pdf',
      contentType: 'application/pdf',
      size: 1024 * 1024, // 1MB
      storageKey: 'files/test-user-123/test-document.pdf',
      checksumMd5: 'abc123',
      checksumSha256: 'def456',
    });
    
    console.log('File created:', result);
    return result;
  }
}
