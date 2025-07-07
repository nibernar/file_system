# backlog de developpement - file systeme

## 🚀 Initialisation du projet
  Création du projet NestJS
  bashnest new file-system:

  ✅ Projet NestJS initialisé avec structure de base
  ✅ Configuration TypeScript et ESLint
  ✅ Tests Jest configurés

  📦 Installation des dépendances
  🧪 Tests et validation
  Objectif : Configuration des tests unitaires, d'intégration et validation des données
  bash# Tests Jest et TypeScript
 ` npm install --save-dev jest @types/jest ts-jest`
  `npm install --save-dev @nestjs/testing`

# Validation et transformation des données
  `npm install class-validator class-transformer`

# Configuration centralisée
  `npm install @nestjs/config`
  Packages installés :

  ```bash
  jest, @types/jest, ts-jest - Framework de tests
  @nestjs/testing - Utilitaires de test NestJS
  class-validator - Validation automatique des DTOs
  class-transformer - Transformation et sérialisation
  @nestjs/config - Gestion configuration centralisée
  ```


# 🗄️ Storage Garage S3
  Objectif : Interface avec Garage S3 pour stockage d'objets autonome
  bash# SDK AWS pour compatibilité S3
  `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/lib-storage`

# Génération d'UUID pour identifiants uniques
  `npm install uuid`
  `npm install --save-dev @types/uuid`
  Packages installés :

  ```bash
  @aws-sdk/client-s3 - Client S3 compatible Garage
  @aws-sdk/s3-request-presigner - URLs pré-signées sécurisées
  @aws-sdk/lib-storage - Upload multipart pour gros fichiers
  uuid + @types/uuid - Génération d'identifiants uniques
  ```


# 💾 Base de données et cache
  Objectif : Persistence des métadonnées et cache haute performance
  bash# ORM Prisma pour PostgreSQL
  `npm install @prisma/client prisma`

# Cache Redis intégré à NestJS
  `npm install @nestjs/cache-manager cache-manager`
  `npm install cache-manager-redis-store`
  `npm install --save-dev @types/cache-manager`
  Packages installés :

  `@prisma/client, prisma` **Info :**- ORM pour base de données
  `@nestjs/cache-manager` **Info :**- Module cache NestJS
  `cache-manager-redis-store` **Info :**- Store Redis pour cache
  `@types/cache-manager` **Info :**- Types TypeScript cache


# 📋 Queue et traitement asynchrone
  Objectif : Traitement asynchrone des fichiers avec Bull/Redis
  bash# Queue Bull pour Redis
  `npm install @nestjs/bull bull`
  `npm install --save-dev @types/bull`

# Interface de monitoring des queues
npm install @bull-board/express @bull-board/api
Packages installés :

`@nestjs/bull, bull` **Info :** - Système de queues Redis
`@types/bull` **Info :** - Types TypeScript pour Bull
`@bull-board/express, @bull-board/api` **Info :** - Interface web monitoring


# 🌐 APIs et communication
  Objectif : Client HTTP pour services externes et documentation API
  bash# Client HTTP pour CDN et services externes
  `npm install @nestjs/axios axios`

# Documentation Swagger automatique
 `npm install @nestjs/swagger swagger-ui-express`
  Packages installés :

  `@nestjs/axios, axios` **Info :** - Client HTTP intégré NestJS
  `@nestjs/swagger` **Info :** - Génération documentation OpenAPI
  `swagger-ui-express` **Info :** - Interface Swagger UI


# 🖼️ Traitement de fichiers
  Objectif : Traitement, optimisation et conversion de fichiers
  bash# Traitement d'images haute performance
  `npm install sharp`

# Détection d'encodage et conversion de texte
  `npm install iconv-lite chardet`
  `npm install --save-dev @types/iconv-lite` **Info :** _ (deprecated - types inclus)
  Packages installés :

  sharp - Traitement d'images (redimensionnement, conversion)
  `iconv-lite` **Info :** - Conversion d'encodage de caractères
  `chardet` **Info :** - Détection automatique d'encodage


# 🗃️ ORM et base de données (optionnel)
  Objectif : Alternative ORM pour relations complexes
  bash# TypeORM pour relations avancées (si besoin)
  `npm install @nestjs/typeorm typeorm`
  Packages installés :

  `@nestjs/typeorm, typeorm` **Info :** - ORM alternatif pour cas complexes


# 📤 Upload de fichiers
  Objectif : Gestion native des uploads multipart
  bash# Support upload fichiers Express
  `npm install @nestjs/platform-express multer`
  `npm install --save-dev @types/multer`
  Packages installés :

  `@nestjs/platform-express`**Info :** - Plateforme Express pour NestJS
  `multer + @types/multer`**Info :** - Middleware upload fichiers

# TreeView - File System Microservice

```
file-system/
├── 📄 .env                                    # Variables d'environnement
├── 📄 package.json                            # Dépendances npm
├── 📄 tsconfig.json                           # Configuration TypeScript
├── 📄 jest.config.js                          # Configuration Jest
├── 📄 docker-compose.yml                      # Services locaux (Redis, Garage)
├── 📄 Dockerfile                              # Image Docker
├── 📄 README.md                               # Documentation projet
├── 📄 TreeView.md                             # Ce fichier - Vue d'ensemble
│
└── 📁 src/                                    # Code source principal
    ├── 📄 main.ts                             # 🚀 Point d'entrée Bootstrap
    ├── 📄 app.module.ts                       # 🏗️ Module racine NestJS
    ├── 📄 app.controller.ts                   # 🎮 Controller principal (tests)
    ├── 📄 app.service.ts                      # 🔧 Service principal basique
    ├── 📄 app.controller.spec.ts              # ✅ Tests controller principal
    │
    ├── 📁 config/                             # ⚙️ Configuration centralisée
    │   ├── 📄 file-system.config.ts           # Configuration principale validée
    │   └── 📁 __tests__/                      # Tests configuration
    │       └── 📄 file-system.config.spec.ts  # Tests validation config
    │
    ├── 📁 types/                              # 📐 Types et interfaces TypeScript
    │   ├── 📄 file-system.types.ts            # Types complets du système
    │   └── 📁 __tests__/                      # Tests types
    │       └── 📄 file-system.types.spec.ts   # Tests type guards
    │
    ├── 📁 constants/                          # 🔧 Constantes et limitations
    │   ├── 📄 file-system.constants.ts        # Constantes techniques
    │   └── 📁 __tests__/                      # Tests constantes
    │       └── 📄 file-system.constants.spec.ts # Tests helpers constantes
    │
    ├── 📁 exceptions/                         # ⚠️ Exceptions métier
    │   └── 📄 file-system.exceptions.ts       # Exceptions spécialisées
    │
    ├── 📁 infrastructure/                     # 🏗️ Couche infrastructure
    │   ├── 📁 config/                         # Configuration infrastructure
    │   │   └── 📄 infrastructure.config.ts    # Config services externes
    │   │
    │   ├── 📁 garage/                         # 🗄️ Service storage Garage S3
    │   │   ├── 📄 garage-storage.service.ts   # Service principal Garage S3
    │   │   ├── 📄 garage-storage.interface.ts # Interface storage operations
    │   │   ├── 📄 garage.module.ts            # Module Garage avec config
    │   │   └── 📁 __tests__/                  # Tests Garage
    │   │       ├── 📄 garage-storage.service.spec.ts      # Tests unitaires
    │   │       └── 📄 garage-storage.integration.spec.ts  # Tests intégration
    │   │
    │   ├── 📁 cdn/                            # 🌐 Service CDN distribution
    │   │   ├── 📄 cdn.service.ts              # Service distribution CDN
    │   │   ├── 📄 cache-manager.service.ts    # Gestionnaire cache intelligent
    │   │   └── 📄 cdn.module.ts               # Module CDN
    │   │
    │   ├── 📁 processing/                     # 🔄 Traitement de fichiers
    │   │   ├── 📄 processing.module.ts        # Module traitement
    │   │   ├── 📄 image-processor.service.ts  # Traitement images (Sharp)
    │   │   ├── 📄 pdf-processor.service.ts    # Traitement PDF (Puppeteer)
    │   │   ├── 📄 document-processor.service.ts # Traitement documents
    │   │   └── 📁 __tests__/                  # Tests processing
    │   │       ├── 📄 image-processor.service.spec.ts     # Tests images
    │   │       ├── 📄 pdf-processor.service.spec.ts       # Tests PDF
    │   │       └── 📄 document-processor.service.spec.ts  # Tests documents
    │   │
    │   ├── 📁 security/                       # 🛡️ Sécurité et validation
    │   │   ├── 📄 security.module.ts          # Module sécurité
    │   │   ├── 📄 virus-scanner.service.ts    # Scanner antivirus (ClamAV)
    │   │   ├── 📄 file-validator.service.ts   # Validation format/contenu
    │   │   ├── 📄 ip-intelligence.service.ts  # Intelligence IP/géolocation
    │   │   ├── 📄 rate-limit.service.ts       # Service rate limiting
    │   │   └── 📁 __tests__/                  # Tests sécurité
    │   │       └── 📄 virus-scanner.service.spec.ts       # Tests antivirus
    │   │
    │   ├── 📁 queue/                          # 📋 Queue Bull/Redis
    │   │   ├── 📄 queue.module.ts             # Module queue avec config
    │   │   ├── 📄 file-processing.queue.ts    # Définition queue processing
    │   │   ├── 📄 file-processing.processor.ts # Worker traitement async
    │   │   ├── 📄 bull-board.service.ts       # Service monitoring queue
    │   │   └── 📁 __tests__/                  # Tests queue
    │   │       └── 📄 file-processing.processor.spec.ts   # Tests worker
    │   │
    │   ├── 📁 cache/                          # 🚀 Cache Redis
    │   │   ├── 📄 cache.module.ts             # Module cache global
    │   │   └── 📄 cache.service.ts            # Service cache spécialisé
    │   │
    │   ├── 📁 monitoring/                     # 📊 Métriques et monitoring
    │   │   ├── 📄 monitoring.module.ts        # Module monitoring
    │   │   ├── 📄 metrics.service.ts          # Service métriques Prometheus
    │   │   ├── 📄 audit.service.ts            # Service audit trail
    │   │   └── 📄 health-check.service.ts     # Service health checks
    │   │
    │   ├── 📁 persistence/                    # 💾 Persistence et repositories
    │   │   ├── 📄 persistence.module.ts       # Module persistence
    │   │   └── 📄 file-metadata.repository.impl.ts # Implémentation repository
    │   │
    │   └── 📁 prisma/                         # 🗃️ ORM Prisma
    │       ├── 📄 prisma.module.ts            # Module Prisma
    │       └── 📄 prisma.service.ts           # Service Prisma avec config
    │
    ├── 📁 domain/                             # 🎯 Couche domaine (business logic)
    │   ├── 📄 domain.module.ts                # Module domaine principal
    │   │
    │   ├── 📁 entities/                       # 🏛️ Entités métier
    │   │   ├── 📄 file.entity.ts              # Entité File principale
    │   │   └── 📁 __tests__/                  # Tests entités
    │   │       └── 📄 file.entity.spec.ts     # Tests entité File
    │   │
    │   ├── 📁 services/                       # ⚙️ Services domaine
    │   │   ├── 📄 file-security.service.ts    # Service sécurité métier
    │   │   ├── 📄 file-processing.service.ts  # Service traitement métier
    │   │   ├── 📄 file-metadata.service.ts    # Service métadonnées
    │   │   └── 📁 __tests__/                  # Tests services domaine
    │   │       ├── 📄 file-security.service.spec.ts       # Tests sécurité
    │   │       └── 📄 file-processing.service.spec.ts     # Tests processing
    │   │
    │   └── 📁 repositories/                   # 📚 Interfaces repositories
    │       └── 📄 file-metadata.repository.ts # Interface repository métadonnées
    │
    ├── 📁 application/                        # 🚀 Couche application
    │   ├── 📄 application.module.ts           # Module application
    │   └── 📁 use-cases/                      # 🎯 Cas d'usage métier
    │       ├── 📄 process-file-async.use-case.ts # Use case traitement async
    │       └── 📁 __tests__/                  # Tests use cases
    │           └── 📄 process-file-async.use-case.spec.ts # Tests async processing
    │
    ├── 📁 presentation/                       # 🌐 Couche présentation (API)
    │   ├── 📄 presentation.module.ts          # Module présentation
    │   │
    │   ├── 📁 controllers/                    # 🎮 Controllers REST
    │   │   ├── 📄 file-upload.controller.ts   # Controller upload fichiers
    │   │   └── 📄 test-files.controller.ts    # Controller tests développement
    │   │
    │   ├── 📁 middleware/                     # 🔒 Middleware HTTP
    │   │   ├── 📄 file-security.middleware.ts # Middleware sécurité requests
    │   │   └── 📁 __tests__/                  # Tests middleware
    │   │       └── 📄 file-security.middleware.spec.ts    # Tests sécurité middleware
    │   │
    │   ├── 📁 guards/                         # 🛡️ Guards NestJS
    │   │   ├── 📄 file-access.guard.ts        # Guard autorisation fichiers
    │   │   └── 📁 __tests__/                  # Tests guards
    │   │       └── 📄 file-access.guard.spec.ts           # Tests autorisation
    │   │
    │   ├── 📁 interceptors/                   # 📡 Interceptors
    │   │   ├── 📄 file-audit.interceptor.ts   # Interceptor audit trail
    │   │   └── 📁 __tests__/                  # Tests interceptors
    │   │       └── 📄 file-audit.interceptor.spec.ts      # Tests audit
    │   │
    │   └── 📁 decorators/                     # 🏷️ Decorators custom
    │       └── 📄 file-operation.decorator.ts # Decorator opérations fichiers
    │
    └── 📁 __tests__/                          # 🧪 Tests globaux
        └── 📄 test-setup.ts                   # Configuration tests globale
```

---

## 📄 Fichiers racine et configuration

### 🚀 main.ts
**Description** : Point d'entrée principal de l'application NestJS avec configuration complète
**Responsabilité** : Bootstrap application, configuration Swagger, CORS, Bull Board

```typescript
/**
 * Bootstrap de l'application File System
 * Configure : Validation globale, CORS, Swagger, Bull Board, Shutdown hooks
 */
async function bootstrap(): Promise<void>
```

**Fonctionnalités clés** :
- Configuration des pipes de validation globaux
- Setup Swagger documentation conditionnelle
- Configuration CORS avec origine dynamique
- Intégration Bull Board pour monitoring des queues
- Configuration des endpoints et logs de démarrage

---

### 🏗️ app.module.ts
**Description** : Module racine de l'application avec toutes les importations et configurations
**Responsabilité** : Orchestration des modules, configuration globale

```typescript
@Module({
  imports: [
    ConfigModule,     // Configuration globale avec validation
    CacheModule,      // Cache Redis global
    PrismaModule,     // ORM base de données
    GarageModule,     // Storage S3
    QueueModule,      // Queues Bull/Redis
    ProcessingModule, // Traitement fichiers
    SecurityModule,   // Sécurité et validation
    // ... autres modules
  ]
})
export class AppModule {}
```

**Configurations intégrées** :
- ConfigModule avec validation et cache
- CacheModule Redis avec configuration TTL
- Modules infrastructure, domain, application, presentation

---

### 🎮 app.controller.ts
**Description** : Controller principal pour les tests et endpoints de développement
**Responsabilité** : Tests queue Bull, endpoints de diagnostic

```typescript
@ApiTags('Tests')
@Controller()
export class AppController {
  
  /**
   * Test de traitement de document avec Bull Queue
   * @param body - Données de test avec texte
   * @returns Résultat job + statistiques queue
   */
  @Post('test-document')
  async handlePost(@Body() body: TestDocumentDto): Promise<TestResponse>
  
  /**
   * Ajouter plusieurs tâches de test à la queue
   * @returns Jobs créés avec métadonnées
   */
  @Post('test-document/bulk') 
  async addBulkJobs(): Promise<BulkJobsResponse>
  
  /**
   * Obtenir les statistiques de la queue de traitement
   * @returns Statistiques détaillées (waiting, active, completed, failed)
   */
  @Get('queue-stats')
  async getQueueStats(): Promise<QueueStatsResponse>
}
```

---

### 🔧 app.service.ts
**Description** : Service principal basique
**Responsabilité** : Service par défaut NestJS

```typescript
@Injectable()
export class AppService {
  /**
   * Message de test basique
   * @returns Message Hello World
   */
  getHello(): string
}
```

---

## ⚙️ Configuration et Types

### 🛠️ config/file-system.config.ts
**Description** : Configuration centralisée complète du système de fichiers
**Responsabilité** : Validation et chargement de toutes les configurations

```typescript
/**
 * Configuration principale du système de fichiers
 * Centralise : Garage S3, CDN, Processing, Security
 */
export interface FileSystemConfig {
  garage: GarageConfig;
  cdn: CDNConfig; 
  processing: ProcessingConfig;
  security: SecurityConfig;
}

/**
 * Configuration Garage S3 auto-hébergé
 */
export interface GarageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  buckets: {
    documents: string;
    backups: string;
    temp: string;
  };
  region: string;
  forcePathStyle: boolean;
}

/**
 * Configuration service CDN global
 */
export interface CDNConfig {
  baseUrl: string;
  cacheControl: string;
  invalidationToken: string;
  edgeLocations: string[];
  defaultTtl: number;
  maxTtl: number;
}

/**
 * Configuration traitement fichiers
 */
export interface ProcessingConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  virusScanTimeout: number;
  imageOptimizationQuality: number;
  thumbnailSize: number;
  pdfCompressionLevel: number;
  maxWorkers: number;
  chunkSize: number;
}

/**
 * Configuration sécurité multi-couches
 */
export interface SecurityConfig {
  presignedUrlExpiry: number;
  maxPresignedUrls: number;
  ipRestrictionEnabled: boolean;
  scanVirusEnabled: boolean;
  rateLimitUploadsPerMinute: number;
  abuseBlockDuration: number;
  deviceFingerprintingEnabled: boolean;
  securityTokenSecret: string;
}

/**
 * Factory de configuration avec validation
 * @returns Configuration complète et validée
 * @throws Error si variables requises manquantes
 */
export default registerAs('fileSystem', (): FileSystemConfig => { ... })

/**
 * Validation automatique variables environnement
 * @param config - Variables à valider
 * @returns Configuration validée
 * @throws Error si validation échoue
 */
function validateConfig(config: Record<string, unknown>): FileSystemConfigValidation

/**
 * Type guard pour vérifier configuration valide
 * @param config - Configuration à vérifier
 * @returns true si configuration valide
 */
export function isValidFileSystemConfig(config: any): config is FileSystemConfig

/**
 * Configuration adaptée par environnement
 * @param env - Environnement cible
 * @returns Configuration spécialisée
 */
export function getEnvironmentConfig(env: string): Partial<FileSystemConfig>
```

---

### 📐 types/file-system.types.ts
**Description** : Types et interfaces TypeScript complets du système
**Responsabilité** : Définition de tous les modèles de données

#### Enums principaux
```typescript
/**
 * Statut du scan antivirus
 * Cycle : PENDING → SCANNING → (CLEAN | INFECTED | ERROR)
 */
export enum VirusScanStatus {
  PENDING = 'pending',
  SCANNING = 'scanning', 
  CLEAN = 'clean',
  INFECTED = 'infected',
  ERROR = 'error'
}

/**
 * Statut du traitement fichier
 * Cycle : PENDING → PROCESSING → (COMPLETED | FAILED | SKIPPED)
 */
export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed', 
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Classification types documents
 */
export enum DocumentType {
  DOCUMENT = 'document',
  TEMPLATE = 'template',
  PROJECT_DOCUMENT = 'project_document',
  CONFIDENTIAL = 'confidential',
  TEMPORARY = 'temporary',
  ARCHIVE = 'archive'
}
```

#### Interfaces principales
```typescript
/**
 * Métadonnées complètes d'un fichier
 * Interface principale représentant un fichier avec propriétés complètes
 */
export interface FileMetadata {
  id: string;
  userId: string;
  projectId?: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  storageKey: string;
  cdnUrl?: string;
  checksumMd5: string;
  checksumSha256: string;
  virusScanStatus: VirusScanStatus;
  processingStatus: ProcessingStatus;
  documentType: DocumentType;
  versionCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Version fichier pour historique et traçabilité
 */
export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  storageKey: string;
  size: number;
  checksum: string;
  changeDescription?: string;
  changeType: VersionChangeType;
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}

/**
 * Job de traitement asynchrone
 */
export interface ProcessingJob {
  id: string;
  fileId: string;
  jobType: ProcessingJobType;
  priority: number;
  status: ProcessingJobStatus;
  progress: number;
  options: ProcessingOptions;
  result?: ProcessingResult;
  errorMessage?: string;
  executionTime?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

#### Type Guards et Utilitaires
```typescript
/**
 * Type guard pour FileMetadata valide
 * @param obj - Objet à vérifier
 * @returns true si FileMetadata valide
 */
export function isFileMetadata(obj: any): obj is FileMetadata

/**
 * Type guard pour ProcessingResult valide
 * @param obj - Objet à vérifier 
 * @returns true si ProcessingResult valide
 */
export function isProcessingResult(obj: any): obj is ProcessingResult

/**
 * Utility type pour propriétés partielles avec ID requis
 */
export type PartialWithId<T> = Partial<T> & { id: string }

/**
 * Utility type pour opérations création (sans ID/timestamps)
 */
export type CreateDto<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Utility type pour opérations mise à jour
 */
export type UpdateDto<T> = PartialWithId<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>
```

---

### 🔧 constants/file-system.constants.ts
**Description** : Constantes techniques et limitations du système
**Responsabilité** : Centralisation valeurs fixes et limites

#### Limites techniques
```typescript
/**
 * Limites de taille fichiers et opérations
 */
export const FILE_SIZE_LIMITS = {
  MIN_FILE_SIZE: 1,
  MAX_FILE_SIZE_DEFAULT: 100 * 1024 * 1024,
  MAX_FILE_SIZE_ABSOLUTE: 500 * 1024 * 1024,
  MULTIPART_THRESHOLD: 50 * 1024 * 1024,
  MULTIPART_PART_SIZE: 10 * 1024 * 1024,
  MAX_CHUNK_SIZE: 64 * 1024,
  THUMBNAIL_DEFAULT_SIZE: 200,
  THUMBNAIL_MAX_SIZE: 1024
} as const;

/**
 * Limites performance et timeouts
 */
export const PERFORMANCE_LIMITS = {
  UPLOAD_TIMEOUT_MS: 5 * 60 * 1000,
  DOWNLOAD_TIMEOUT_MS: 2 * 60 * 1000,
  VIRUS_SCAN_TIMEOUT_MS: 30 * 1000,
  IMAGE_PROCESSING_TIMEOUT_MS: 60 * 1000,
  PDF_PROCESSING_TIMEOUT_MS: 120 * 1000,
  MAX_RETRY_ATTEMPTS: 3,
  MAX_CONCURRENT_PROCESSING: 10
} as const;
```

#### Sécurité et validation
```typescript
/**
 * Types MIME supportés par catégorie
 */
export const SUPPORTED_MIME_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  DOCUMENTS: ['application/pdf', 'application/msword', 'text/plain'],
  TEXT: ['text/plain', 'text/markdown', 'text/csv'],
  CODE: ['application/json', 'application/xml', 'text/x-python']
} as const;

/**
 * Patterns validation noms fichiers
 */
export const FILENAME_PATTERNS = {
  ALLOWED_CHARS: /^[a-zA-Z0-9._\-\s()[\]{}]+$/,
  SAFE_FILENAME: /^[a-zA-Z0-9._-]+$/,
  DANGEROUS_CHARS: /[<>:"/\\|?*\x00-\x1f]/g,
  DANGEROUS_EXTENSIONS: /\.(exe|bat|cmd|com|scr|pif|vbs|js)$/i,
  PATH_TRAVERSAL: /\.\.(\/|\\)/
} as const;

/**
 * Limites sécurité et anti-abus
 */
export const SECURITY_LIMITS = {
  MAX_UPLOADS_PER_MINUTE: 10,
  MAX_FILES_PER_USER: 10000,
  PRESIGNED_URL_DEFAULT_EXPIRY: 3600,
  MAX_PRESIGNED_URLS_PER_USER: 50,
  ABUSE_BLOCK_DURATION_MS: 5 * 60 * 1000,
  MAX_FILENAME_LENGTH: 255
} as const;
```

#### Helper functions
```typescript
/**
 * Vérifier si extension autorisée
 * @param extension - Extension à vérifier
 * @returns true si autorisée
 */
export function isAllowedExtension(extension: string): boolean

/**
 * Vérifier si MIME type supporté
 * @param mimeType - Type MIME à vérifier
 * @returns true si supporté
 */
export function isSupportedMimeType(mimeType: string): boolean

/**
 * Obtenir catégorie d'un MIME type
 * @param mimeType - Type MIME
 * @returns Catégorie ou null
 */
export function getMimeTypeCategory(mimeType: string): string | null

/**
 * Valider nom de fichier
 * @param filename - Nom à valider
 * @returns true si valide
 */
export function isValidFilename(filename: string): boolean
```

---

## 📊 Architecture et patterns

### 🏛️ Architecture générale
- **Pattern** : Domain Driven Design (DDD)
- **Framework** : NestJS + TypeScript
- **Base de données** : PostgreSQL + Prisma ORM
- **Cache** : Redis
- **Queue** : Bull + Redis
- **Storage** : Garage S3 auto-hébergé
- **CDN** : Distribution globale
- **Tests** : Jest + Supertest

### 🔄 Flow principal
1. **Upload** → Validation sécurité → Storage Garage S3
2. **Processing** → Queue Bull → Traitement async (images, PDF, virus scan)
3. **Distribution** → CDN automatique → Cache global
4. **Access** → URLs pré-signées → Contrôle d'accès granulaire

### 🛡️ Sécurité multi-couches
- Validation format et taille fichiers
- Scan antivirus automatique (ClamAV)
- Rate limiting adaptatif
- Device fingerprinting
- URLs pré-signées avec restrictions IP/User-Agent
- Audit trail completVVv