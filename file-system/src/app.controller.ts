// src/app.controller.ts
import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { IFileMetadataRepository } from './domain/repositories/file-metadata.repository';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    
    @Inject('IFileMetadataRepository')
    private readonly fileRepository: IFileMetadataRepository,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test')
  async test() {
    // Test création
    const file = await this.fileRepository.create({
      userId: 'test-123',
      filename: 'test.pdf',
      originalName: 'Test.pdf',
      contentType: 'application/pdf',
      size: 1000,
      storageKey: `test-${Date.now()}.pdf`,
      checksumMd5: 'test-md5',
      checksumSha256: 'test-sha256',
    });

    // Test récupération
    const retrieved = await this.fileRepository.findById(file.id);
    
    return { created: file, retrieved };
  }
}
