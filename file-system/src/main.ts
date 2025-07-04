// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Configuration globale de l'API
  app.setGlobalPrefix('api/v1');

  // Validation globale
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Configuration Swagger (Documentation API)
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('File System API')
      .setDescription('API de gestion des fichiers pour Coders V1')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('📚 Swagger documentation enabled at /api/docs');
  }

  // Bull Board pour monitoring des queues (optionnel)
  if (process.env.BULL_BOARD_ENABLED === 'true') {
    try {
      const { createBullBoard } = await import('@bull-board/api');
      const { BullAdapter } = await import('@bull-board/api/bullAdapter');
      const { ExpressAdapter } = await import('@bull-board/express');
      const { getQueueToken } = await import('@nestjs/bull');

      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');

      // Récupérer la queue en utilisant le token
      const queueToken = getQueueToken('file-processing');
      const fileProcessingQueue = app.get(queueToken);

      createBullBoard({
        queues: [new BullAdapter(fileProcessingQueue)],
        serverAdapter,
      });

      app.use('/admin/queues', serverAdapter.getRouter());
      logger.log('📊 Bull Board enabled at /admin/queues');
    } catch (error) {
      logger.warn('Bull Board not available, skipping...', error.message);
    }
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  // Démarrage du serveur
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Afficher les endpoints disponibles
  logger.log('📍 Available endpoints:');
  logger.log(`   - API: http://localhost:${port}/api/v1`);

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true'
  ) {
    logger.log(`   - Docs: http://localhost:${port}/api/docs`);
  }

  if (process.env.BULL_BOARD_ENABLED === 'true') {
    logger.log(`   - Queue Monitor: http://localhost:${port}/admin/queues`);
  }
}

bootstrap();
