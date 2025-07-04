// src/app.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { FILE_PROCESSING_QUEUE_NAME } from './infrastructure/queue/file-processing.queue';

class TestDocumentDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}

@ApiTags('Tests')
@Controller()
export class AppController {
  constructor(
    @InjectQueue(FILE_PROCESSING_QUEUE_NAME)
    private readonly fileProcessingQueue: Queue,
  ) {}

  @Post('test-document')
  @ApiOperation({ summary: 'Test de traitement de document avec Bull Queue' })
  @ApiBody({
    description: 'JSON avec le texte à traiter',
    type: TestDocumentDto,
    examples: {
      example1: {
        summary: 'Exemple simple',
        value: {
          text: 'Bonjour, ceci est un test !',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Texte traité avec succès' })
  @ApiResponse({ status: 400, description: 'Champ text manquant' })
  async handlePost(@Body() body: TestDocumentDto) {
    try {
      const job = await this.fileProcessingQueue.add('process-text', {
        text: body.text,
        timestamp: new Date().toISOString(),
        type: 'test-document',
        source: 'app-controller',
      });

      const [waiting, active, completed, failed] = await Promise.all([
        this.fileProcessingQueue.getWaiting().then((jobs) => jobs.length),
        this.fileProcessingQueue.getActive().then((jobs) => jobs.length),
        this.fileProcessingQueue.getCompleted().then((jobs) => jobs.length),
        this.fileProcessingQueue.getFailed().then((jobs) => jobs.length),
      ]);

      return {
        message: 'Texte reçu avec succès',
        texte: body.text,
        timestamp: new Date().toISOString(),
        job: {
          id: job.id,
          name: job.name,
          queue: this.fileProcessingQueue.name,
        },
        queueStats: {
          waiting,
          active,
          completed,
          failed,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        `Erreur lors de l'ajout à la queue: ${error.message}`,
      );
    }
  }

  /**
   * Endpoint pour ajouter plusieurs tâches de test
   */
  @Post('test-document/bulk')
  @ApiOperation({ summary: 'Ajouter plusieurs tâches de test à la queue' })
  @ApiResponse({ status: 200, description: 'Tâches ajoutées avec succès' })
  async addBulkJobs() {
    const jobs: Array<{ id: string | number; index: number; name: string }> =
      [];

    for (let i = 1; i <= 5; i++) {
      const job = await this.fileProcessingQueue.add('process-text', {
        text: `Document de test automatique numéro ${i}`,
        timestamp: new Date().toISOString(),
        type: 'bulk-test',
        index: i,
        source: 'bulk-generator',
      });

      jobs.push({
        id: job.id,
        index: i,
        name: job.name,
      });
    }

    return {
      message: `${jobs.length} tâches de test ajoutées à la queue`,
      jobs: jobs,
      timestamp: new Date().toISOString(),
      queue: this.fileProcessingQueue.name,
    };
  }

  /**
   * Endpoint pour obtenir les statistiques de la queue
   */
  @Get('queue-stats')
  @ApiOperation({ summary: 'Statistiques de la queue de traitement' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées' })
  async getQueueStats() {
    const [waiting, active, completed, failed, paused] = await Promise.all([
      this.fileProcessingQueue.getWaiting().then((jobs) => jobs.length),
      this.fileProcessingQueue.getActive().then((jobs) => jobs.length),
      this.fileProcessingQueue.getCompleted().then((jobs) => jobs.length),
      this.fileProcessingQueue.getFailed().then((jobs) => jobs.length),
      this.fileProcessingQueue.isPaused(),
    ]);

    return {
      queue: this.fileProcessingQueue.name,
      stats: {
        waiting,
        active,
        completed,
        failed,
        paused,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
