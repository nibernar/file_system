import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FileSecurityService } from '../../domain/services/file-security.service';
import { VirusScannerService } from './virus-scanner.service';
import { FileValidatorService } from './file-validator.service';
import { IpIntelligenceService } from './ip-intelligence.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [HttpModule],
  providers: [
    VirusScannerService,
    FileValidatorService,
    IpIntelligenceService,
    RateLimitService,
  ],
  exports: [
    VirusScannerService,
    FileValidatorService,
    IpIntelligenceService,
    RateLimitService,
  ],
})
export class SecurityModule {}
