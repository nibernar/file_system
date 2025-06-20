import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { VirusScanResult } from '../../types/file-system.types';
import { VirusScanException, VirusScanTimeoutException } from '../../exceptions/file-system.exceptions';

/**
 * Service de scan antivirus intégrant ClamAV
 * Implémente le scanning sécurisé avec timeout et retry selon 03-06 specs
 */
@Injectable()
export class VirusScannerService {
  private readonly logger = new Logger(VirusScannerService.name);
  private readonly scanTimeout: number;
  private readonly retryAttempts: number;
  private readonly enabledScanning: boolean;

  constructor(private readonly configService: ConfigService) {
    this.scanTimeout = this.configService.get<number>('VIRUS_SCAN_TIMEOUT', 30000);
    this.retryAttempts = this.configService.get<number>('VIRUS_SCAN_RETRIES', 2);
    this.enabledScanning = this.configService.get<boolean>('SCAN_VIRUS_ENABLED', true);
  }

  /**
   * Scan principal d'un buffer de fichier
   */
  async scanFile(buffer: Buffer): Promise<VirusScanResult> {
    const scanStartTime = Date.now();
    const fileHash = this.generateFileHash(buffer);

    this.logger.log(`Starting virus scan for file hash ${fileHash}, size: ${buffer.length} bytes`);

    // Si le scanning est désactivé (dev/test), retourner clean
    if (!this.enabledScanning) {
      this.logger.log('Virus scanning disabled, returning clean result');
      return this.createCleanResult(fileHash, 0);
    }

    try {
      // Vérification taille fichier
      if (buffer.length === 0) {
        throw new VirusScanException('Cannot scan empty file');
      }

      if (buffer.length > 100 * 1024 * 1024) { // 100MB max
        this.logger.warn(`File too large for virus scan: ${buffer.length} bytes`);
        return this.createSkippedResult(fileHash, 'FILE_TOO_LARGE');
      }

      let lastError: Error | null = null;

      // Retry logic: 1 tentative initiale + N retries
      for (let attempt = 1; attempt <= this.retryAttempts + 1; attempt++) {
        try {
          this.logger.log(`Virus scan attempt ${attempt}/${this.retryAttempts + 1} for file ${fileHash}`);
          const scanResult = await this.performVirusScan(buffer, fileHash);
          const scanDuration = Date.now() - scanStartTime;
          this.logger.log(`Virus scan completed for file ${fileHash} in ${scanDuration}ms - Result: ${scanResult.clean ? 'CLEAN' : 'INFECTED'}`);
          scanResult.scanDuration = scanDuration;
          scanResult.attempt = attempt;
          return scanResult;
        } catch (error) {
          lastError = error;
          this.logger.error(`Virus scan attempt ${attempt} failed for file ${fileHash}:`, error);

          // Échec rapide en cas de timeout, pas de nouvelle tentative
          if (error instanceof VirusScanTimeoutException) {
            const scanDuration = Date.now() - scanStartTime;
            return this.createTimeoutResult(fileHash, scanDuration);
          }
          
          // Attente progressive seulement s'il reste des tentatives
          if (attempt <= this.retryAttempts) {
            const delay = Math.pow(2, attempt) * 1000;
            await this.delay(delay);
          }
        }
      }

      // Toutes les tentatives ont échoué
      const scanDuration = Date.now() - scanStartTime;
      this.logger.error(`All virus scan attempts failed for file ${fileHash}`);
      return this.createErrorResult(fileHash, lastError?.message || 'Unknown scan error', scanDuration);

    } catch (error) {
      this.logger.error(`Virus scan error for file ${fileHash}:`, error);

      // Ce catch gère les erreurs en dehors de la boucle (ex: fichier vide)
      if (error instanceof VirusScanException) {
          throw error;
      }
      
      const scanDuration = Date.now() - scanStartTime;
      
      if (error instanceof VirusScanTimeoutException) {
        return this.createTimeoutResult(fileHash, scanDuration);
      }
      
      // Gérer les erreurs inattendues
      return this.createErrorResult(fileHash, error.message, scanDuration);
    }
  }
  
  /**
   * Scan streaming pour gros fichiers
   */
  async scanFileStream(stream: ReadableStream): Promise<VirusScanResult> {
    // TODO: Implémenter scan streaming pour très gros fichiers
    // Pour l'instant, conversion en buffer
    this.logger.warn('Stream scanning not yet implemented, converting to buffer');
    
    try {
      const chunks: Buffer[] = [];
      const reader = stream.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      
      const buffer = Buffer.concat(chunks);
      return await this.scanFile(buffer);
      
    } catch (error) {
      this.logger.error('Error converting stream to buffer for scanning:', error);
      throw new VirusScanException('Failed to scan file stream');
    }
  }

  /**
   * Vérification santé du scanner
   */
  async checkScannerHealth(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    try {
      // Test avec fichier EICAR standard
      const eicarTest = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const result = await this.performVirusScan(eicarTest, 'eicar-test');
      
      // EICAR doit être détecté comme infecté
      if (result.clean) {
        return { 
          healthy: false, 
          error: 'Scanner failed to detect EICAR test file' 
        };
      }
      
      return { 
        healthy: true, 
        version: await this.getScannerVersion() 
      };
      
    } catch (error) {
      this.logger.error('Scanner health check failed:', error);
      return { 
        healthy: false, 
        error: error.message 
      };
    }
  }

  /**
   * Scan réel avec ClamAV (implémentation basique)
   */
  private async performVirusScan(buffer: Buffer, fileHash: string): Promise<VirusScanResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new VirusScanTimeoutException(fileHash, this.scanTimeout));
      }, this.scanTimeout);

      try {
        // Simulation du scan ClamAV
        // En production, ceci ferait appel à ClamAV via:
        // - Socket Unix
        // - TCP connection
        // - Commande système clamd
        this.simulateClamAVScan(buffer, fileHash)
          .then(result => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            reject(error);
          });

      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Simulation ClamAV pour développement/test
   * À remplacer par vraie intégration ClamAV en production
   */
  private async simulateClamAVScan(buffer: Buffer, fileHash: string): Promise<VirusScanResult> {
    // Délai simulation scan
    await this.delay(100 + Math.random() * 500);

    // Détection patterns malveillants connus
    const maliciousPatterns = [
      'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}',
      'MALWARE_SIGNATURE',
      '#!/bin/bash',
      'rm -rf /',
      '<script>alert',
      'eval(',
      'WScript.Shell'
    ];

    const fileContent = buffer.toString('ascii', 0, Math.min(buffer.length, 8192));
    const detectedThreats: string[] = [];

    for (const pattern of maliciousPatterns) {
      if (fileContent.includes(pattern)) {
        detectedThreats.push(`Trojan.Generic.${this.generateThreatName(pattern)}`);
      }
    }

    // Vérification magic numbers suspects
    const suspiciousMagicNumbers = [
      'MZ', // PE executable
      '!<arch>', // Archive
      'PK\x03\x04' // ZIP (potentiel)
    ];

    const fileHeader = buffer.toString('ascii', 0, 10);
    for (const magic of suspiciousMagicNumbers) {
      if (fileHeader.startsWith(magic)) {
        // Analyse plus poussée pour executables
        if (this.isExecutableContent(buffer)) {
          detectedThreats.push('Suspicious.Executable.Generic');
        }
      }
    }

    const isClean = detectedThreats.length === 0;

    return {
      clean: isClean,
      threats: detectedThreats,
      scanId: this.generateScanId(),
      fileHash,
      scanDate: new Date(),
      scanDuration: 0, // Sera renseigné par l'appelant
      scannerVersion: await this.getScannerVersion(),
      details: {
        patternsChecked: maliciousPatterns.length,
        fileSize: buffer.length,
        scanMethod: 'SIMULATION'
      }
    };
  }

  /**
   * Détection contenu exécutable
   */
  private isExecutableContent(buffer: Buffer): boolean {
    // Vérification headers PE, ELF, Mach-O
    const peHeader = buffer.toString('ascii', 0, 2) === 'MZ';
    const elfHeader = buffer.toString('ascii', 0, 4) === '\x7fELF';
    const machOHeader = buffer.readUInt32BE(0) === 0xfeedface || buffer.readUInt32BE(0) === 0xfeedfacf;
    return peHeader || elfHeader || machOHeader;
  }

  /**
   * Génération nom de menace à partir du pattern
   */
  private generateThreatName(pattern: string): string {
    return crypto.createHash('md5').update(pattern).digest('hex').substring(0, 8);
  }

  /**
   * Génération ID unique de scan
   */
  private generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Génération hash fichier pour identification
   */
  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Version du scanner (simulation)
   */
  private async getScannerVersion(): Promise<string> {
    return 'ClamAV-Simulator-1.0.0';
  }

  /**
   * Création résultat "clean"
   */
  private createCleanResult(fileHash: string, scanDuration: number): VirusScanResult {
    return {
      clean: true, threats: [], scanId: this.generateScanId(),
      fileHash, scanDate: new Date(), scanDuration, scannerVersion: 'disabled',
      details: { scanMethod: 'DISABLED' }
    };
  }

  /**
   * Création résultat "skipped"
   */
  private createSkippedResult(fileHash: string, reason: string): VirusScanResult {
    return {
      clean: true, // Considéré clean par défaut si non scannable
      threats: [],
      scanId: this.generateScanId(),
      fileHash,
      scanDate: new Date(),
      scanDuration: 0,
      scannerVersion: 'skipped',
      details: {
        scanMethod: 'SKIPPED',
        reason
      }
    };
  }

  /**
   * Création résultat "error"
   */
  private createErrorResult(fileHash: string, error: string, scanDuration: number): VirusScanResult {
    return {
      clean: false,
      threats: ['SCAN_ERROR'],
      scanId: this.generateScanId(),
      fileHash,
      scanDate: new Date(),
      scanDuration,
      scannerVersion: 'error',
      details: {
        scanMethod: 'ERROR',
        error
      }
    };
  }

  /**
   * Création résultat "timeout"
   */
  private createTimeoutResult(fileHash: string, scanDuration: number): VirusScanResult {
    return {
      clean: false, // Considéré suspect en cas de timeout
      threats: ['SCAN_TIMEOUT'],
      scanId: this.generateScanId(),
      fileHash,
      scanDate: new Date(),
      scanDuration,
      scannerVersion: 'timeout',
      details: {
        scanMethod: 'TIMEOUT',
        timeoutMs: this.scanTimeout
      }
    };
  }

  /**
   * Utilitaire délai
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
