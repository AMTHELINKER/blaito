import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { RedisIoAdapter } from './messaging/redis-io.adapter';
import { StorageService } from './storage/storage.service';

/** Configuration HTTP partagée entre main.ts et les tests e2e. */
export async function setupApp(app: INestApplication): Promise<AppConfig> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  express.use(cookieParser());
  express.enableCors({ origin: config.webOrigin.split(','), credentials: true });
  express.setGlobalPrefix('api/v1');
  express.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  if (config.storage.driver === 'local') {
    express.useStaticAssets(app.get(StorageService).localRoot, {
      prefix: '/uploads/',
      maxAge: '365d',
      immutable: true,
    });
  }
  // Temps réel (messagerie) : Socket.IO partagé entre instances via Redis.
  const io = new RedisIoAdapter(app, config.redisUrl);
  await io.connect();
  express.useWebSocketAdapter(io);
  express.enableShutdownHooks();
  return config;
}
