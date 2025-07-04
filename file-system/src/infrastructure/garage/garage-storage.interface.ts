// src/infrastructure/garage/garage-storage.interface.ts

import {
  ObjectMetadata,
  UploadResult,
  DownloadResult,
  ObjectInfo,
  ObjectList,
  MultipartUpload,
  PartUploadResult,
  CompletedPart,
  CopyResult,
  PresignedUrlOptions,
  PresignedUrl, // ✅ CHANGÉ : PresignedUrlResult → PresignedUrl
  BucketInfo,
} from '../../types/file-system.types';

/**
 * Interface définissant le contrat du service de stockage Garage S3
 *
 * Cette interface abstraie les opérations de stockage pour permettre :
 * - Tests avec mocks facilités
 * - Changement d'implémentation (AWS S3, MinIO, etc.)
 * - Décuplage entre la logique métier et l'infrastructure
 *
 * Conforme aux spécifications 03-06 File System - Module A: Storage Core
 *
 * @interface IGarageStorageService
 */
export interface IGarageStorageService {
  // ================================
  // OPÉRATIONS CRUD DE BASE
  // ================================

  /**
   * Upload un objet vers le stockage
   * @param key Clé unique de l'objet
   * @param buffer Données binaires
   * @param metadata Métadonnées associées
   */
  uploadObject(
    key: string,
    buffer: Buffer,
    metadata: ObjectMetadata,
  ): Promise<UploadResult>;

  /**
   * Télécharge un objet depuis le stockage
   * @param key Clé de l'objet à télécharger
   */
  downloadObject(key: string): Promise<DownloadResult>;

  /**
   * Supprime un objet du stockage
   * @param key Clé de l'objet à supprimer
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Récupère les métadonnées d'un objet
   * @param key Clé de l'objet
   */
  getObjectInfo(key: string): Promise<ObjectInfo>;

  /**
   * Liste les objets avec un préfixe donné
   * @param prefix Préfixe pour filtrer
   * @param limit Nombre maximum d'objets
   */
  listObjects(prefix: string, limit?: number): Promise<ObjectList>;

  // ================================
  // MULTIPART UPLOAD (GROS FICHIERS)
  // ================================

  /**
   * Initialise un upload multipart
   * @param key Clé de l'objet final
   * @param metadata Métadonnées de l'objet
   */
  initializeMultipartUpload(
    key: string,
    metadata: ObjectMetadata,
  ): Promise<MultipartUpload>;

  /**
   * Upload une partie d'un fichier multipart
   * @param uploadId ID de la session multipart
   * @param partNumber Numéro de la partie
   * @param buffer Données de la partie
   */
  uploadPart(
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<PartUploadResult>;

  /**
   * Finalise un upload multipart
   * @param uploadId ID de la session
   * @param parts Liste des parties uploadées
   */
  completeMultipartUpload(
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<UploadResult>;

  /**
   * Annule un upload multipart
   * @param uploadId ID de la session à annuler
   */
  abortMultipartUpload(uploadId: string): Promise<void>;

  // ================================
  // OPÉRATIONS AVANCÉES
  // ================================

  /**
   * Copie un objet vers une nouvelle clé
   * @param sourceKey Clé source
   * @param destinationKey Clé destination
   */
  copyObject(sourceKey: string, destinationKey: string): Promise<CopyResult>;

  /**
   * Génère une URL pré-signée pour accès temporaire
   * @param options Configuration de l'URL
   */
  generatePresignedUrl(options: PresignedUrlOptions): Promise<PresignedUrl>; // ✅ CORRIGÉ

  // ================================
  // SANTÉ ET GESTION
  // ================================

  /**
   * Vérifie la connectivité au service de stockage
   */
  checkConnection(): Promise<boolean>;

  /**
   * Récupère les informations du bucket
   */
  getBucketInfo(): Promise<BucketInfo>;
}

/**
 * Token d'injection pour le service de stockage
 * Utilisé pour l'injection de dépendance dans NestJS
 */
export const GARAGE_STORAGE_SERVICE = Symbol('GARAGE_STORAGE_SERVICE');
