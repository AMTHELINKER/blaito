export interface AppConfig {
  env: string;
  port: number;
  webOrigin: string;
  apiPublicUrl: string;
  databaseUrl: string;
  /** Facultatif : sans Redis, e-mails envoyés directement et temps réel en mémoire (une seule instance). */
  redisUrl?: string;
  /** Dossier du front construit, servi par l'API sur le même domaine (déploiement à service unique). */
  webDir?: string;
  jwtAccessSecret: string;
  jwtAccessTtl: string;
  refreshTtlDays: number;
  mail: { host?: string; port: number; user?: string; pass?: string; from: string };
  storage: {
    driver: 'local' | 's3';
    uploadDir: string;
    s3: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      publicUrl?: string;
    };
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const required = (key: string, devDefault: string): string => {
    const v = env[key];
    if (v) return v;
    if (isProd) throw new Error(`Variable d'environnement manquante : ${key}`);
    return devDefault;
  };
  const jwtAccessSecret = required('JWT_ACCESS_SECRET', 'dev-only-access-secret');
  if (isProd && jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET doit faire au moins 32 caractères en production');
  }
  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 3000),
    // RENDER_EXTERNAL_URL est fourni par Render : utile quand front et API partagent le service.
    webOrigin: env.WEB_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173',
    apiPublicUrl:
      env.API_PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${env.PORT ?? 3000}`,
    databaseUrl: required('DATABASE_URL', 'postgres://laito:laito@localhost:5433/laito'),
    redisUrl: env.REDIS_URL || undefined,
    webDir: env.WEB_DIR || undefined,
    jwtAccessSecret,
    jwtAccessTtl: env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: Number(env.REFRESH_TTL_DAYS ?? 30),
    mail: {
      host: env.SMTP_HOST || undefined,
      port: Number(env.SMTP_PORT ?? 1025),
      user: env.SMTP_USER || undefined,
      pass: env.SMTP_PASS || undefined,
      from: env.MAIL_FROM ?? 'Laito <no-reply@laito.app>',
    },
    storage: {
      driver: env.STORAGE_DRIVER === 's3' ? 's3' : 'local',
      uploadDir: env.UPLOAD_DIR ?? 'uploads',
      s3: {
        endpoint: env.S3_ENDPOINT || undefined,
        region: env.S3_REGION ?? 'auto',
        bucket: env.S3_BUCKET ?? 'laito',
        accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
        publicUrl: env.S3_PUBLIC_URL || undefined,
      },
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
