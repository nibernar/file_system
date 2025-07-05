import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UploadFileDto,
  FormatValidation,
  ContentValidation,
} from '../../types/file-system.types';
import {
  FILE_SIZE_LIMITS,
  SUPPORTED_MIME_TYPES,
} from '../../constants/file-system.constants';

/**
 * Service de validation des formats et contenus de fichiers
 * Implémente la validation sécurisée selon les spécifications 03-06
 */
@Injectable()
export class FileValidatorService {
  private readonly logger = new Logger(FileValidatorService.name);
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];
  private readonly strictValidation: boolean;

  private readonly magicNumbers = new Map<string, string[]>([
    ['image/jpeg', ['FFD8FF']],
    ['image/png', ['89504E47']],
    ['image/gif', ['474946383761', '474946383961']],
    ['image/webp', ['52494646', '57454250']],
    ['image/bmp', ['424D']],
    ['image/tiff', ['49492A00', '4D4D002A']],
    ['application/pdf', ['255044462D']],
    ['application/zip', ['504B0304', '504B0506', '504B0708']],
    ['application/x-rar-compressed', ['526172211A0700']],
    ['application/x-7z-compressed', ['377ABCAF271C']],

    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ['504B0304'],
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ['504B0304'],
    ],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ['504B0304'],
    ],

    ['text/plain', []],
    ['text/html', ['3C21444F43545950452068746D6C', '3C68746D6C']],
    ['text/xml', ['3C3F786D6C']],
    ['application/json', []],

    ['audio/mpeg', ['494433', 'FFFB', 'FFF3', 'FFF2']],
    ['audio/wav', ['52494646']],
    ['video/mp4', ['66747970']],
    ['video/avi', ['52494646']],
    ['application/x-executable', ['7F454C46', '4D5A']],
    ['application/x-msdos-program', ['4D5A']],
    ['application/x-msdownload', ['4D5A']],
  ]);

  constructor(private readonly configService: ConfigService) {
    this.maxFileSize = this.configService.get<number>(
      'MAX_FILE_SIZE',
      FILE_SIZE_LIMITS.MAX_FILE_SIZE_DEFAULT,
    );

    const mimeTypesFromEnv = this.configService.get('ALLOWED_MIME_TYPES');

    if (typeof mimeTypesFromEnv === 'string') {
      this.allowedMimeTypes = mimeTypesFromEnv
        .split(',')
        .map((type) => type.trim());
    } else if (Array.isArray(mimeTypesFromEnv)) {
      this.allowedMimeTypes = mimeTypesFromEnv;
    } else {
      this.allowedMimeTypes = [
        ...SUPPORTED_MIME_TYPES.IMAGES,
        ...SUPPORTED_MIME_TYPES.DOCUMENTS,
        ...SUPPORTED_MIME_TYPES.TEXT,
        ...SUPPORTED_MIME_TYPES.CODE,
      ];
    }

    this.strictValidation = this.configService.get<boolean>(
      'STRICT_FILE_VALIDATION',
      true,
    );

    this.logger.log(
      `FileValidatorService initialized with ${this.allowedMimeTypes.length} allowed MIME types:`,
      this.allowedMimeTypes,
    );
  }

  /**
   * Validation complète du format de fichier
   */
  async validateFormat(file: UploadFileDto): Promise<FormatValidation> {
    this.logger.log(
      `Validating format for file: ${file.filename} (${file.contentType}, ${file.size} bytes)`,
    );

    const validation: FormatValidation = {
      valid: true,
      errors: [],
      warnings: [],
      detectedMimeType: file.contentType,
      actualMimeType: null,
      fileSignature: null,
    };

    try {
      if (!this.validateFileSize(file.size, validation)) {
        return validation;
      }

      if (!this.validateFilename(file.filename, validation)) {
        return validation;
      }

      if (!this.validateDeclaredMimeType(file.contentType, validation)) {
        return validation;
      }

      if (file.buffer) {
        await this.validateMagicNumbers(file, validation);
      }

      this.validateExtensionMimeConsistency(file, validation);

      if (file.buffer && validation.valid) {
        await this.validateSpecificFormat(file, validation);
      }

      this.logger.log(
        `Format validation completed for ${file.filename}: ${validation.valid ? 'VALID' : 'INVALID'}`,
      );

      if (!validation.valid) {
        this.logger.warn(
          `Format validation errors for ${file.filename}:`,
          validation.errors,
        );
      }

      return validation;
    } catch (error) {
      this.logger.error(`Error validating format for ${file.filename}:`, error);
      validation.valid = false;
      validation.errors.push(`Validation error: ${error.message}`);
      return validation;
    }
  }

  /**
   * Validation sécurisée du contenu
   */
  async validateContent(file: UploadFileDto): Promise<ContentValidation> {
    this.logger.log(`Validating content for file: ${file.filename}`);

    const validation: ContentValidation = {
      safe: true,
      threats: [],
      warnings: [],
      metadata: {},
      analysis: {},
    };

    try {
      if (!file.buffer) {
        validation.warnings.push('No buffer available for content validation');
        return validation;
      }

      await this.performHeuristicAnalysis(file, validation);

      await this.validateContentByType(file, validation);

      await this.detectMaliciousScripts(file, validation);

      await this.validateEmbeddedMetadata(file, validation);

      this.analyzeEntropy(file, validation);

      this.logger.log(
        `Content validation completed for ${file.filename}: ${validation.safe ? 'SAFE' : 'UNSAFE'}`,
      );

      if (!validation.safe) {
        this.logger.warn(
          `Content validation threats for ${file.filename}:`,
          validation.threats,
        );
      }

      return validation;
    } catch (error) {
      this.logger.error(
        `Error validating content for ${file.filename}:`,
        error,
      );
      validation.safe = false;
      validation.threats.push(`Content validation error: ${error.message}`);
      return validation;
    }
  }

  /**
   * Validation taille fichier
   */
  private validateFileSize(
    size: number,
    validation: FormatValidation,
  ): boolean {
    if (size <= 0) {
      validation.valid = false;
      validation.errors.push('File size must be greater than 0');
      return false;
    }

    if (size > this.maxFileSize) {
      validation.valid = false;
      validation.errors.push(
        `File size ${size} exceeds maximum allowed size ${this.maxFileSize}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Validation nom de fichier sécurisé
   */
  private validateFilename(
    filename: string,
    validation: FormatValidation,
  ): boolean {
    const dangerousPatterns = [
      /\.\./,
      /[<>:"|?*]/,
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
      /^\.+$/,
      /\.(exe|scr|bat|cmd|com|pif|vbs|js|jar|app|deb|rpm)$/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(filename)) {
        validation.valid = false;
        validation.errors.push(
          `Filename contains dangerous pattern: ${pattern.source}`,
        );
        return false;
      }
    }

    if (filename.length > 255) {
      validation.valid = false;
      validation.errors.push('Filename too long (max 255 characters)');
      return false;
    }

    if (/[\x00-\x1F\x7F-\x9F]/.test(filename)) {
      validation.valid = false;
      validation.errors.push('Filename contains control characters');
      return false;
    }

    return true;
  }

  /**
   * Validation MIME type déclaré
   */
  private validateDeclaredMimeType(
    mimeType: string,
    validation: FormatValidation,
  ): boolean {
    if (!mimeType || mimeType.trim() === '') {
      validation.valid = false;
      validation.errors.push('MIME type is required');
      return false;
    }

    if (
      !/^[a-zA-Z][a-zA-Z0-9][a-zA-Z0-9\!\#\$\&\-\^]*\/[a-zA-Z0-9][a-zA-Z0-9\!\#\$\&\-\^]*$/.test(
        mimeType,
      )
    ) {
      validation.valid = false;
      validation.errors.push('Invalid MIME type format');
      return false;
    }

    const isAllowed = this.allowedMimeTypes.some((allowed) => {
      if (allowed.endsWith('/*')) {
        return mimeType.startsWith(allowed.slice(0, -1));
      }
      return mimeType === allowed;
    });

    if (!isAllowed) {
      validation.valid = false;
      validation.errors.push(`MIME type ${mimeType} not allowed`);
      return false;
    }

    return true;
  }

  /**
   * Validation magic numbers
   */
  private async validateMagicNumbers(
    file: UploadFileDto,
    validation: FormatValidation,
  ): Promise<void> {
    const buffer = file.buffer;
    const fileSignature = buffer
      .toString('hex', 0, Math.min(16, buffer.length))
      .toUpperCase();
    validation.fileSignature = fileSignature;

    const expectedMagics = this.magicNumbers.get(file.contentType) || [];

    if (expectedMagics.length > 0) {
      const signatureMatch = expectedMagics.some((magic) =>
        fileSignature.startsWith(magic.toUpperCase()),
      );

      if (!signatureMatch) {
        const detectedType = this.detectMimeTypeFromSignature(fileSignature);
        validation.actualMimeType = detectedType;

        if (this.strictValidation) {
          validation.valid = false;
          validation.errors.push(
            `File signature ${fileSignature} does not match declared MIME type ${file.contentType}`,
          );
        } else {
          validation.warnings.push(
            `File signature mismatch. Declared: ${file.contentType}, Detected: ${detectedType || 'unknown'}`,
          );
        }
      }
    }
  }

  /**
   * Détection MIME type par signature
   */
  private detectMimeTypeFromSignature(signature: string): string | null {
    for (const [mimeType, magics] of this.magicNumbers.entries()) {
      for (const magic of magics) {
        if (signature.startsWith(magic.toUpperCase())) {
          return mimeType;
        }
      }
    }
    return null;
  }

  /**
   * Validation cohérence extension/MIME
   */
  private validateExtensionMimeConsistency(
    file: UploadFileDto,
    validation: FormatValidation,
  ): void {
    const extension = this.extractFileExtension(file.filename);
    if (!extension) return;

    const expectedMimeTypes = this.getExpectedMimeTypesForExtension(extension);

    if (expectedMimeTypes.length > 0) {
      const mimeMatch = expectedMimeTypes.includes(file.contentType);

      if (!mimeMatch) {
        if (this.strictValidation) {
          validation.valid = false;
          validation.errors.push(
            `Extension .${extension} does not match MIME type ${file.contentType}`,
          );
        } else {
          validation.warnings.push(
            `Extension/MIME type mismatch: .${extension} vs ${file.contentType}`,
          );
        }
      }
    }
  }

  /**
   * Validation spécifique par format
   */
  private async validateSpecificFormat(
    file: UploadFileDto,
    validation: FormatValidation,
  ): Promise<void> {
    const buffer = file.buffer;

    switch (file.contentType) {
      case 'application/pdf':
        this.validatePDFStructure(buffer, validation);
        break;
      case 'application/json':
        this.validateJSONStructure(buffer, validation);
        break;
      case 'text/xml':
      case 'application/xml':
        this.validateXMLStructure(buffer, validation);
        break;
      default:
        if (file.contentType.startsWith('image/')) {
          this.validateImageStructure(buffer, file.contentType, validation);
        }
    }
  }

  /**
   * Analyse heuristique du contenu
   */
  private async performHeuristicAnalysis(
    file: UploadFileDto,
    validation: ContentValidation,
  ): Promise<void> {
    const buffer = file.buffer;

    const suspiciousPatterns = [
      /javascript:/gi,
      /<script[^>]*>/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /document\.write/gi,
      /innerHTML/gi,
      /\bexec\s*\(/gi,
      /system\s*\(/gi,
      /\$_GET|\$_POST|\$_REQUEST/gi,
      /base64_decode/gi,
    ];

    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 8192));

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        validation.threats.push(
          `Suspicious pattern detected: ${pattern.source}`,
        );
        validation.safe = false;
      }
    }
  }

  /**
   * Validation contenu par type
   */
  private async validateContentByType(
    file: UploadFileDto,
    validation: ContentValidation,
  ): Promise<void> {
    const buffer = file.buffer;

    if (file.contentType.startsWith('text/')) {
      try {
        const text = buffer.toString('utf8');
        validation.metadata.textLength = text.length;
        validation.metadata.encoding = 'utf8';
      } catch (error) {
        validation.warnings.push('Invalid UTF-8 encoding detected');
      }
    }

    if (file.contentType === 'application/json') {
      try {
        JSON.parse(buffer.toString('utf8'));
        validation.metadata.validJSON = true;
      } catch (error) {
        validation.threats.push('Invalid JSON structure');
        validation.safe = false;
      }
    }
  }

  /**
   * Détection scripts malveillants
   */
  private async detectMaliciousScripts(
    file: UploadFileDto,
    validation: ContentValidation,
  ): Promise<void> {
    const buffer = file.buffer;
    const content = buffer.toString('ascii', 0, Math.min(buffer.length, 16384));

    if (content.startsWith('#!')) {
      validation.threats.push('Shell script detected');
      validation.safe = false;
    }

    const dangerousCommands = [
      'rm -rf',
      'del /s',
      'format c:',
      'mkfs.',
      'dd if=',
      'chmod 777',
      'sudo rm',
      '>/dev/null',
    ];

    for (const cmd of dangerousCommands) {
      if (content.toLowerCase().includes(cmd)) {
        validation.threats.push(`Dangerous command detected: ${cmd}`);
        validation.safe = false;
      }
    }
  }

  /**
   * Validation métadonnées intégrées
   */
  private async validateEmbeddedMetadata(
    file: UploadFileDto,
    validation: ContentValidation,
  ): Promise<void> {
    validation.analysis.metadataExtracted = false;
  }

  /**
   * Analyse entropie
   */
  private analyzeEntropy(
    file: UploadFileDto,
    validation: ContentValidation,
  ): void {
    const buffer = file.buffer;
    const entropy = this.calculateEntropy(buffer);

    validation.analysis.entropy = entropy;

    if (entropy > 7.5) {
      validation.warnings.push(
        `High entropy detected (${entropy.toFixed(2)}), file may be encrypted or highly compressed`,
      );
    }
  }

  /**
   * Calcul entropie Shannon
   */
  private calculateEntropy(buffer: Buffer): number {
    const frequencies = new Map<number, number>();

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
    }

    let entropy = 0;
    const length = buffer.length;

    for (const count of frequencies.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Validation structure PDF
   */
  private validatePDFStructure(
    buffer: Buffer,
    validation: FormatValidation,
  ): void {
    const content = buffer.toString('ascii', 0, Math.min(buffer.length, 1024));

    if (!content.startsWith('%PDF-')) {
      validation.valid = false;
      validation.errors.push('Invalid PDF header');
      return;
    }

    const endContent = buffer.toString(
      'ascii',
      Math.max(0, buffer.length - 128),
    );
    if (!endContent.includes('%%EOF')) {
      validation.warnings.push('PDF may be truncated (missing %%EOF)');
    }
  }

  /**
   * Validation structure JSON
   */
  private validateJSONStructure(
    buffer: Buffer,
    validation: FormatValidation,
  ): void {
    try {
      JSON.parse(buffer.toString('utf8'));
    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Invalid JSON: ${error.message}`);
    }
  }

  /**
   * Validation structure XML
   */
  private validateXMLStructure(
    buffer: Buffer,
    validation: FormatValidation,
  ): void {
    const content = buffer.toString('utf8');

    if (!content.trim().startsWith('<')) {
      validation.valid = false;
      validation.errors.push('Invalid XML: must start with <');
      return;
    }
  }

  /**
   * Validation structure image
   */
  private validateImageStructure(
    buffer: Buffer,
    mimeType: string,
    validation: FormatValidation,
  ): void {
    switch (mimeType) {
      case 'image/jpeg':
        if (
          !buffer
            .toString('hex', buffer.length - 2)
            .toUpperCase()
            .includes('FFD9')
        ) {
          validation.warnings.push(
            'JPEG may be truncated (missing EOI marker)',
          );
        }
        break;
      case 'image/png':
        if (
          !buffer
            .toString('hex', buffer.length - 8)
            .toUpperCase()
            .includes('49454E44AE426082')
        ) {
          validation.warnings.push('PNG may be truncated (missing IEND chunk)');
        }
        break;
    }
  }

  /**
   * Extraction extension fichier
   */
  private extractFileExtension(filename: string): string | null {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return null;
    }
    return filename.substring(lastDot + 1).toLowerCase();
  }

  /**
   * MIME types attendus pour une extension
   */
  private getExpectedMimeTypesForExtension(extension: string): string[] {
    const extensionMap: Record<string, string[]> = {
      pdf: ['application/pdf'],
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
      webp: ['image/webp'],
      bmp: ['image/bmp'],
      txt: ['text/plain'],
      json: ['application/json'],
      xml: ['text/xml', 'application/xml'],
      html: ['text/html'],
      htm: ['text/html'],
      zip: ['application/zip'],
      docx: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      xlsx: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      pptx: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
    };

    return extensionMap[extension] || [];
  }
}
