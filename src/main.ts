import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env : variables du système */
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = setupApp(app);

  const doc = new DocumentBuilder()
    .setTitle('Laito API')
    .setDescription("API REST de Laito — écriture et partage de livres")
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('laito_rt')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.port);
  Logger.log(`API prête sur ${config.apiPublicUrl}/api/v1 — docs : /api/docs`, 'Bootstrap');
}

void bootstrap();
