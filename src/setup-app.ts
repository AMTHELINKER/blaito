import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { StorageService } from './storage/storage.service';

/** Configuration HTTP partagée entre main.ts et les tests e2e. */
export function setupApp(app: INestApplication): AppConfig {
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
  express.enableShutdownHooks();
  return config;
}
