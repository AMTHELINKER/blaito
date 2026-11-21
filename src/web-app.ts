import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AppConfig } from './config/configuration';

const API_PATHS = /^\/(api|socket\.io|uploads)(\/|$)/;

/** Empreintes SHA-256 des scripts en ligne de index.html (autorisés un par un par la CSP). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.push(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  return hashes;
}

/**
 * Sécurité HTTP. Quand l'API sert aussi le front (WEB_DIR), la politique de contenu
 * (CSP) est adaptée à la PWA : tout vient du même domaine, sauf les images (stockage S3/CDN).
 */
export function applySecurityHeaders(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  const webDir = config.webDir && resolve(config.webDir);
  const index = webDir && join(webDir, 'index.html');
  if (!index || !existsSync(index)) {
    express.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    return;
  }
  const scriptHashes = inlineScriptHashes(readFileSync(index, 'utf8'));
  express.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...scriptHashes],
          // Attributs style des composants React (aucune feuille externe).
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'wss:', 'ws:'],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
}

/** Sert la PWA construite et renvoie index.html pour ses routes (React Router). */
export function serveWebApp(app: INestApplication, config: AppConfig): boolean {
  const webDir = config.webDir && resolve(config.webDir);
  if (!webDir || !existsSync(join(webDir, 'index.html'))) return false;
  const express = app as NestExpressApplication;
  express.useStaticAssets(webDir, {
    index: false,
    setHeaders: (res, path) => {
      if (/[\\/]assets[\\/]/.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // index.html, service worker, manifeste : toujours revalidés.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
  const indexHtml = join(webDir, 'index.html');
  express.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || API_PATHS.test(req.path)) return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  return true;
}
