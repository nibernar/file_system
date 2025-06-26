/**
 * Service de traitement de documents texte pour le système Coders V1
 * 
 * Ce service spécialisé gère toutes les opérations sur les documents texte :
 * analyse de contenu, extraction de métadonnées, validation de structure,
 * optimisation d'encodage, génération de résumés, et détection de langage.
 * 
 * @version 1.0
 * @author Backend Lead
 * @conformsTo 03-06-file-system-specs
 * @conformsTo 05-06-file-system-plan Phase 3.1
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import * as iconv from 'iconv-lite';
import * as chardet from 'chardet';
import type { FileSystemConfig } from '../../config/file-system.config';
import { GarageStorageService } from '../garage/garage-storage.service';
import { FILE_SYSTEM_CONFIG } from '../../config/file-system.config';
import {
  ProcessingException,
  FileNotFoundException
} from '../../exceptions/file-system.exceptions';

/**
 * Options pour le traitement de documents
 */
export interface DocumentProcessingOptions {
  /** Extraire le contenu textuel complet */
  extractText?: boolean;
  
  /** Valider la structure du document selon son type */
  validateStructure?: boolean;
  
  /** Optimiser l'encodage pour compatibilité */
  optimizeEncoding?: boolean;
  
  /** Générer un résumé automatique */
  generateSummary?: boolean;
  
  /** Détecter automatiquement le langage */
  detectLanguage?: boolean;
  
  /** Extraire les métadonnées spécialisées */
  extractSpecializedMetadata?: boolean;
  
  /** Taille maximale pour génération résumé (octets) */
  maxSizeForSummary?: number;
  
  /** Encodage cible pour optimisation */
  targetEncoding?: string;
}

/**
 * Résultat du traitement de document
 */
export interface ProcessedDocument {
  /** Succès du traitement */
  success: boolean;
  
  /** Contenu textuel extrait */
  textContent?: string;
  
  /** Encodage détecté du document source */
  encoding: string;
  
  /** Encodage optimisé (si différent) */
  optimizedEncoding?: string;
  
  /** Nombre de lignes dans le document */
  lineCount: number;
  
  /** Nombre de mots estimé */
  wordCount: number;
  
  /** Nombre de caractères (avec espaces) */
  characterCount: number;
  
  /** Nombre de caractères (sans espaces) */
  characterCountNoSpaces: number;
  
  /** Langage détecté du contenu */
  detectedLanguage?: string;
  
  /** Résumé automatique généré */
  summary?: string;
  
  /** Métadonnées spécialisées selon le type */
  specializedMetadata?: Record<string, any>;
  
  /** Validation de structure */
  structureValidation?: DocumentStructureValidation;
  
  /** Durée de traitement en millisecondes */
  processingTime: number;
  
  /** Messages d'avertissement */
  warnings?: string[];
  
  /** Message d'erreur si échec */
  error?: string;
}

/**
 * Résultat de validation de structure
 */
export interface DocumentStructureValidation {
  /** Structure valide selon le format */
  valid: boolean;
  
  /** Type de format détecté */
  detectedFormat: string;
  
  /** Erreurs de structure trouvées */
  errors: string[];
  
  /** Avertissements de structure */
  warnings: string[];
  
  /** Métadonnées de structure spécialisées */
  structureMetadata?: Record<string, any>;
}

/**
 * Résultat de détection de langage
 */
export interface LanguageDetectionResult {
  /** Langage détecté (code ISO 639-1) */
  language: string;
  
  /** Nom complet du langage */
  languageName: string;
  
  /** Score de confiance (0-1) */
  confidence: number;
  
  /** Langages alternatifs possibles */
  alternatives?: Array<{
    language: string;
    languageName: string;
    confidence: number;
  }>;
}

/**
 * Service de traitement de documents texte
 * 
 * Fournit toutes les opérations de traitement de documents texte nécessaires
 * au système de fichiers, avec analyse intelligente du contenu.
 */
@Injectable()
export class DocumentProcessorService {
  /** Logger spécialisé pour le traitement de documents */
  private readonly logger = new Logger(DocumentProcessorService.name);

  /** Mots vides courants pour analyse (français et anglais) */
  private readonly stopWords = new Set([
    // Français
    'le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour',
    'dans', 'ce', 'son', 'une', 'sur', 'avec', 'ne', 'se', 'pas', 'tout', 'plus',
    'par', 'grand', 'celui', 'me', 'si', 'très', 'ou', 'du', 'la', 'les', 'des',
    // Anglais
    'the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was',
    'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i', 'at', 'be', 'this',
    'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what'
  ]);

  /**
   * Constructeur avec injection de dépendances
   */
  constructor(
    private readonly storageService: GarageStorageService,
    @Inject(FILE_SYSTEM_CONFIG)
    private readonly config: FileSystemConfig
  ) {
    this.logger.log('Service de traitement de documents initialisé');
  }

  /**
   * Traite un document avec analyse complète
   * 
   * Effectue une analyse complète du document incluant :
   * - Détection et validation d'encodage
   * - Extraction de contenu et métadonnées
   * - Analyse linguistique et détection de langage
   * - Validation de structure selon le format
   * - Génération de résumé si applicable
   * 
   * @param fileId - Identifiant du fichier document source
   * @param options - Options de traitement personnalisées
   * @returns Résultat détaillé avec analyse complète
   */
  async processDocument(fileId: string, options: DocumentProcessingOptions = {}): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    this.logger.debug(`Traitement document ${fileId} avec options:`, options);
    
    try {
      // Configuration avec defaults intelligents
      const config = {
        extractText: options.extractText !== false,
        validateStructure: options.validateStructure !== false,
        optimizeEncoding: options.optimizeEncoding !== false,
        generateSummary: options.generateSummary !== false,
        detectLanguage: options.detectLanguage !== false,
        extractSpecializedMetadata: options.extractSpecializedMetadata !== false,
        maxSizeForSummary: options.maxSizeForSummary || 1024 * 1024, // 1MB max pour résumé
        targetEncoding: options.targetEncoding || 'utf8'
      };
      
      // Récupération document source depuis storage
      const sourceBuffer = await this.getDocumentBuffer(fileId);
      
      this.logger.debug(`Document source ${fileId}: ${sourceBuffer.length} octets`);
      
      // 1. Détection d'encodage automatique
      const detectedEncoding = chardet.detect(sourceBuffer) || 'utf8';
      this.logger.debug(`Encodage détecté pour ${fileId}: ${detectedEncoding}`);
      
      // 2. Conversion en texte avec encodage approprié
      let textContent = '';
      try {
        if (iconv.encodingExists(detectedEncoding)) {
          textContent = iconv.decode(sourceBuffer, detectedEncoding);
        } else {
          this.logger.warn(`Encodage ${detectedEncoding} non supporté, fallback UTF-8`);
          textContent = sourceBuffer.toString('utf8');
        }
      } catch (encodingError) {
        this.logger.warn(`Erreur décodage ${detectedEncoding}, fallback UTF-8: ${encodingError.message}`);
        textContent = sourceBuffer.toString('utf8');
      }
      
      // 3. Calcul métadonnées basiques
      const lineCount = textContent.split(/\r?\n/).length;
      const characterCount = textContent.length;
      const characterCountNoSpaces = textContent.replace(/\s/g, '').length;
      const wordCount = this.countWords(textContent);
      
      // Initialisation résultat
      const result: ProcessedDocument = {
        success: true,
        encoding: detectedEncoding,
        lineCount,
        wordCount,
        characterCount,
        characterCountNoSpaces,
        processingTime: 0,
        warnings: []
      };
      
      // 4. Extraction texte si demandé
      if (config.extractText) {
        result.textContent = textContent;
      }
      
      // 5. Détection de langage si demandé
      if (config.detectLanguage && textContent.length > 50) {
        try {
          const languageResult = await this.detectLanguage(textContent);
          result.detectedLanguage = languageResult.language;
        } catch (langError) {
          this.logger.debug(`Échec détection langage ${fileId}: ${langError.message}`);
          result.warnings?.push('Détection de langage échouée');
        }
      }
      
      // 6. Validation de structure si demandé
      if (config.validateStructure) {
        try {
          result.structureValidation = await this.validateDocumentStructure(textContent, fileId);
        } catch (structError) {
          this.logger.debug(`Échec validation structure ${fileId}: ${structError.message}`);
          result.warnings?.push('Validation de structure échouée');
        }
      }
      
      // 7. Génération résumé si demandé et applicable
      if (config.generateSummary && sourceBuffer.length <= config.maxSizeForSummary && wordCount > 100) {
        try {
          result.summary = await this.generateSummary(textContent);
        } catch (summaryError) {
          this.logger.debug(`Échec génération résumé ${fileId}: ${summaryError.message}`);
          result.warnings?.push('Génération de résumé échouée');
        }
      }
      
      // 8. Métadonnées spécialisées si demandé
      if (config.extractSpecializedMetadata) {
        try {
          result.specializedMetadata = await this.extractSpecializedMetadata(textContent, result.structureValidation);
        } catch (metaError) {
          this.logger.debug(`Échec extraction métadonnées spécialisées ${fileId}: ${metaError.message}`);
          result.warnings?.push('Extraction métadonnées spécialisées échouée');
        }
      }
      
      // 9. Optimisation encodage si demandé et nécessaire
      if (config.optimizeEncoding && detectedEncoding !== config.targetEncoding) {
        try {
          const optimizedBuffer = iconv.encode(textContent, config.targetEncoding);
          result.optimizedEncoding = config.targetEncoding;
          
          // Sauvegarde version optimisée
          const optimizedKey = `${fileId}/optimized/${config.targetEncoding}/${Date.now()}`;
          await this.storageService.uploadObject(optimizedKey, optimizedBuffer, {
            contentType: 'text/plain',
            userId: 'system',
            customMetadata: {
              originalFileId: fileId,
              optimizationType: 'encoding_optimization',
              originalEncoding: detectedEncoding,
              optimizedEncoding: config.targetEncoding
            }
          });
          
          this.logger.debug(`Encodage optimisé ${fileId}: ${detectedEncoding} → ${config.targetEncoding}`);
          
        } catch (optimizeError) {
          this.logger.debug(`Échec optimisation encodage ${fileId}: ${optimizeError.message}`);
          result.warnings?.push('Optimisation d\'encodage échouée');
        }
      }
      
      // Finalisation
      result.processingTime = Date.now() - startTime;
      
      this.logger.log(
        `Document ${fileId} traité en ${result.processingTime}ms: ` +
        `${wordCount} mots, ${lineCount} lignes, encodage ${detectedEncoding}` +
        (result.detectedLanguage ? `, langue ${result.detectedLanguage}` : '')
      );
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Échec traitement document ${fileId} après ${processingTime}ms: ${error.message}`);
      
      if (error instanceof ProcessingException || error instanceof FileNotFoundException) {
        throw error;
      }
      
      return {
        success: false,
        encoding: 'unknown',
        lineCount: 0,
        wordCount: 0,
        characterCount: 0,
        characterCountNoSpaces: 0,
        processingTime,
        error: error.message
      };
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - Analyse et Traitement Spécialisé
  // ============================================================================

  /**
   * Détecte le langage d'un texte
   */
  private async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    // Implémentation basique de détection de langage
    // TODO: Intégrer une vraie bibliothèque de détection (franc, langdetect, etc.)
    
    const sampleText = text.substring(0, 1000).toLowerCase();
    
    // Patterns basiques pour français/anglais
    const frenchPatterns = ['le ', 'la ', 'les ', 'de ', 'du ', 'des ', 'et ', 'ou ', 'où ', 'que ', 'qui ', 'avec '];
    const englishPatterns = ['the ', 'and ', 'or ', 'but ', 'with ', 'from ', 'that ', 'this ', 'have ', 'has '];
    
    let frenchScore = 0;
    let englishScore = 0;
    
    for (const pattern of frenchPatterns) {
      const matches = (sampleText.match(new RegExp(pattern, 'g')) || []).length;
      frenchScore += matches;
    }
    
    for (const pattern of englishPatterns) {
      const matches = (sampleText.match(new RegExp(pattern, 'g')) || []).length;
      englishScore += matches;
    }
    
    const totalScore = frenchScore + englishScore;
    
    if (totalScore === 0) {
      return {
        language: 'unknown',
        languageName: 'Inconnu',
        confidence: 0
      };
    }
    
    if (frenchScore > englishScore) {
      return {
        language: 'fr',
        languageName: 'Français',
        confidence: frenchScore / totalScore,
        alternatives: [{
          language: 'en',
          languageName: 'Anglais',
          confidence: englishScore / totalScore
        }]
      };
    } else {
      return {
        language: 'en',
        languageName: 'Anglais',
        confidence: englishScore / totalScore,
        alternatives: [{
          language: 'fr',
          languageName: 'Français',
          confidence: frenchScore / totalScore
        }]
      };
    }
  }

  /**
   * Valide la structure d'un document selon son format
   */
  private async validateDocumentStructure(content: string, fileId: string): Promise<DocumentStructureValidation> {
    const result: DocumentStructureValidation = {
      valid: true,
      detectedFormat: 'text/plain',
      errors: [],
      warnings: []
    };
    
    try {
      // Détection de format basée sur le contenu
      if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
        // Probable JSON
        result.detectedFormat = 'application/json';
        try {
          const parsed = JSON.parse(content);
          result.structureMetadata = {
            type: 'json',
            rootType: Array.isArray(parsed) ? 'array' : 'object',
            keyCount: typeof parsed === 'object' ? Object.keys(parsed).length : 0
          };
        } catch (jsonError) {
          result.valid = false;
          result.errors.push(`JSON invalide: ${jsonError.message}`);
        }
        
      } else if (content.includes('---') || content.match(/^#+\s/m)) {
        // Probable Markdown
        result.detectedFormat = 'text/markdown';
        const headings = (content.match(/^#+\s.+$/gm) || []).length;
        const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
        const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
        
        result.structureMetadata = {
          type: 'markdown',
          headingCount: headings,
          codeBlockCount: codeBlocks,
          linkCount: links
        };
        
      } else if (content.includes(',') && content.split('\n').length > 1) {
        // Probable CSV
        result.detectedFormat = 'text/csv';
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        const headers = lines[0]?.split(',').length || 0;
        
        result.structureMetadata = {
          type: 'csv',
          rowCount: lines.length,
          columnCount: headers,
          hasHeaders: true // Assumption basique
        };
        
        // Validation cohérence colonnes
        const inconsistentRows = lines.slice(1).filter(line => 
          line.split(',').length !== headers
        ).length;
        
        if (inconsistentRows > 0) {
          result.warnings.push(`${inconsistentRows} ligne(s) avec nombre de colonnes incohérent`);
        }
        
      } else if (content.includes('<') && content.includes('>')) {
        // Probable XML/HTML
        result.detectedFormat = content.includes('<!DOCTYPE html') ? 'text/html' : 'application/xml';
        
        const tags = (content.match(/<[^>]+>/g) || []).length;
        const closingTags = (content.match(/<\/[^>]+>/g) || []).length;
        
        result.structureMetadata = {
          type: result.detectedFormat.includes('html') ? 'html' : 'xml',
          tagCount: tags,
          closingTagCount: closingTags
        };
        
        if (tags !== closingTags * 2) { // Approximation
          result.warnings.push('Possible déséquilibre dans les balises XML/HTML');
        }
      }
      
      this.logger.debug(`Structure validée pour ${fileId}: ${result.detectedFormat}, valide: ${result.valid}`);
      
    } catch (error) {
      this.logger.warn(`Erreur validation structure ${fileId}: ${error.message}`);
      result.errors.push(`Erreur validation: ${error.message}`);
      result.valid = false;
    }
    
    return result;
  }

  /**
   * Génère un résumé automatique du texte
   */
  private async generateSummary(text: string): Promise<string> {
    // Implémentation basique de résumé extractif
    // TODO: Intégrer une vraie bibliothèque NLP (compromise, natural, etc.)
    
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 200);
    
    if (sentences.length <= 3) {
      return sentences.join('. ') + '.';
    }
    
    // Scoring basique des phrases (longueur + mots clés)
    const scoredSentences = sentences.map(sentence => {
      let score = 0;
      
      // Bonus pour longueur optimale
      if (sentence.length >= 50 && sentence.length <= 120) {
        score += 2;
      }
      
      // Bonus pour position (début/fin de paragraphes)
      if (sentences.indexOf(sentence) < 3 || sentences.indexOf(sentence) >= sentences.length - 3) {
        score += 1;
      }
      
      // Malus pour mots vides excessifs
      const words = sentence.toLowerCase().split(/\s+/);
      const stopWordCount = words.filter(word => this.stopWords.has(word)).length;
      if (stopWordCount / words.length > 0.5) {
        score -= 1;
      }
      
      return { sentence, score };
    });
    
    // Sélection des 3 meilleures phrases
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.sentence);
    
    return topSentences.join('. ') + '.';
  }

  /**
   * Extrait des métadonnées spécialisées selon le format
   */
  private async extractSpecializedMetadata(
    content: string,
    structureValidation?: DocumentStructureValidation
  ): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {};
    
    try {
      switch (structureValidation?.detectedFormat) {
        case 'application/json':
          try {
            const parsed = JSON.parse(content);
            metadata.jsonStructure = {
              depth: this.calculateObjectDepth(parsed),
              arrayCount: this.countArrays(parsed),
              objectCount: this.countObjects(parsed),
              nullCount: this.countNulls(parsed)
            };
          } catch {
            // JSON invalide, pas de métadonnées spécialisées
          }
          break;
          
        case 'text/markdown':
          metadata.markdownStructure = {
            h1Count: (content.match(/^# /gm) || []).length,
            h2Count: (content.match(/^## /gm) || []).length,
            h3Count: (content.match(/^### /gm) || []).length,
            imageCount: (content.match(/!\[.*?\]\(.*?\)/g) || []).length,
            tableCount: (content.match(/\|.*\|/g) || []).length,
            listItemCount: (content.match(/^[\s]*[-*+]\s/gm) || []).length
          };
          break;
          
        case 'text/csv':
          const lines = content.split('\n').filter(line => line.trim());
          metadata.csvStructure = {
            delimiter: this.detectCsvDelimiter(content),
            hasQuotedFields: content.includes('"'),
            estimatedDataTypes: this.analyzeColumnTypes(lines.slice(0, 10)) // Échantillon
          };
          break;
          
        default:
          // Métadonnées génériques pour texte plain
          metadata.textStructure = {
            paragraphCount: content.split(/\n\s*\n/).length,
            avgWordsPerLine: content.split('\n').reduce((acc, line) => 
              acc + line.split(/\s+/).length, 0) / content.split('\n').length,
            emptyLineCount: (content.match(/^\s*$/gm) || []).length
          };
      }
      
    } catch (error) {
      this.logger.debug(`Erreur extraction métadonnées spécialisées: ${error.message}`);
    }
    
    return metadata;
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - Utilitaires
  // ============================================================================

  /**
   * Récupère le buffer d'un document depuis le storage
   */
  private async getDocumentBuffer(fileId: string): Promise<Buffer> {
    try {
      // TODO: Récupérer storageKey depuis metadata repository
      const downloadResult = await this.storageService.downloadObject(fileId);
      return downloadResult.body;
      
    } catch (error) {
      this.logger.error(`Échec récupération document ${fileId}: ${error.message}`);
      throw new FileNotFoundException(fileId, { 
        reason: 'Document buffer non accessible',
        originalError: error.message 
      });
    }
  }

  /**
   * Compte les mots dans un texte
   */
  private countWords(text: string): number {
    return text
      .replace(/[^\w\s\u00C0-\u017F\u0400-\u04FF]/g, '') // Préserver accents et cyrillique
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }

  /**
   * Calcule la profondeur d'un objet JSON
   */
  private calculateObjectDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) {
      return 0;
    }
    
    if (Array.isArray(obj)) {
      return 1 + Math.max(0, ...obj.map(item => this.calculateObjectDepth(item)));
    }
    
    return 1 + Math.max(0, ...Object.values(obj).map(value => this.calculateObjectDepth(value)));
  }

  /**
   * Compte récursivement les tableaux dans un objet
   * @param obj - Objet à analyser
   * @returns Nombre de tableaux trouvés
   */
  private countArrays(obj: unknown): number {
    if (Array.isArray(obj)) {
      const arrayCount = 1;
      let nestedCount = 0;
      for (const value of obj) {
        nestedCount += this.countArrays(value);
      }
      return arrayCount + nestedCount;
    }
    
    if (obj && typeof obj === 'object' && obj !== null) {
      const objAsRecord = obj as Record<string, unknown>;
      const values = Object.values(objAsRecord);
      let nestedCount = 0;
      for (const value of values) {
        nestedCount += this.countArrays(value);
      }
      return nestedCount;
    }
    
    return 0;
  }

  /**
   * Compte récursivement les objets dans une structure
   */
  private countObjects(obj: unknown): number {
    if (Array.isArray(obj)) {
      let nestedCount = 0;
      for (const value of obj) {
        nestedCount += this.countObjects(value);
      }
      return nestedCount;
    }
    
    if (obj && typeof obj === 'object' && obj !== null) {
      const objectCount = 1;
      const objAsRecord = obj as Record<string, unknown>;
      const values = Object.values(objAsRecord);
      let nestedCount = 0;
      for (const value of values) {
        nestedCount += this.countObjects(value);
      }
      return objectCount + nestedCount;
    }
    
    return 0;
  }

  /**
   * Compte récursivement les valeurs null/undefined dans un objet
   */
  private countNulls(obj: unknown): number {
    if (obj === null || obj === undefined) {
      return 1;
    }
    
    if (Array.isArray(obj)) {
      let nestedCount = 0;
      for (const value of obj) {
        nestedCount += this.countNulls(value);
      }
      return nestedCount;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const objAsRecord = obj as Record<string, unknown>;
      const values = Object.values(objAsRecord);
      let nestedCount = 0;
      for (const value of values) {
        nestedCount += this.countNulls(value);
      }
      return nestedCount;
    }
    
    return 0;
  }




  /**
   * Détecte le délimiteur d'un fichier CSV
   */
  private detectCsvDelimiter(content: string): string {
    const firstLine = content.split('\n')[0];
    const delimiters = [',', ';', '\t', '|'];
    
    let maxCount = 0;
    let bestDelimiter = ',';
    
    for (const delimiter of delimiters) {
      const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = delimiter;
      }
    }
    
    return bestDelimiter;
  }

  /**
   * Analyse les types de colonnes d'un CSV
   */
  private analyzeColumnTypes(sampleLines: string[]): string[] {
    if (sampleLines.length === 0) return [];
    
    const delimiter = this.detectCsvDelimiter(sampleLines[0]);
    const columnCount = sampleLines[0].split(delimiter).length;
    const types: string[] = new Array(columnCount).fill('string');
    
    for (let col = 0; col < columnCount; col++) {
      let isNumber = true;
      let isDate = true;
      let isEmpty = true;
      
      for (let row = 1; row < sampleLines.length; row++) {
        const cells = sampleLines[row].split(delimiter);
        const value = cells[col]?.trim() || '';
        
        if (value.length > 0) {
          isEmpty = false;
          
          if (isNaN(Number(value))) {
            isNumber = false;
          }
          
          if (isNaN(Date.parse(value))) {
            isDate = false;
          }
        }
      }
      
      if (isEmpty) {
        types[col] = 'empty';
      } else if (isNumber) {
        types[col] = 'number';
      } else if (isDate) {
        types[col] = 'date';
      } else {
        types[col] = 'string';
      }
    }
    
    return types;
  }
}