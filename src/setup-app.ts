import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { RedisIoAdapter } from './messaging/redis-io.adapter';
import { StorageService } from './storage/storage.service';
import { applySecurityHeaders, serveWebApp } from './web-app';

/** Configuration HTTP partagée entre main.ts et les tests e2e. */
export async function setupApp(app: INestApplication): Promise<AppConfig> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  applySecurityHeaders(app, config);
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
  // Front servi sur le même domaine (déploiement à service unique) : cookies et WebSocket
  // restent « first-party », y compris sur Safari / iOS.
  serveWebApp(app, config);
  // Temps réel : Socket.IO partagé entre instances via Redis ; sans Redis, en mémoire (une instance).
  if (config.redisUrl) {
    const io = new RedisIoAdapter(app, config.redisUrl);
    await io.connect();
    express.useWebSocketAdapter(io);
  } else {
    express.useWebSocketAdapter(new IoAdapter(app));
  }
  express.enableShutdownHooks();
  return config;
}
