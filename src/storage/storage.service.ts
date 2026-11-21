import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { newId } from '../database/base.entity';
import type { ImageKind } from './image-validation';

/** Stockage des images : disque local en développement, compatible S3 (servi via CDN) en production. */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3?: S3Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { driver, s3 } = config.storage;
    if (driver === 's3') {
      this.s3 = new S3Client({
        region: s3.region,
        endpoint: s3.endpoint,
        forcePathStyle: !!s3.endpoint,
        credentials:
          s3.accessKeyId && s3.secretAccessKey
            ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
            : undefined,
      });
    }
  }

  get localRoot(): string {
    return resolve(this.config.storage.uploadDir);
  }

  async putImage(folder: 'covers' | 'avatars', buffer: Buffer, kind: ImageKind): Promise<string> {
    const key = `${folder}/${newId()}.${kind.ext}`;
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.storage.s3.bucket,
          Key: key,
          Body: buffer,
          ContentType: kind.mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      const base =
        this.config.storage.s3.publicUrl ??
        `${this.config.storage.s3.endpoint}/${this.config.storage.s3.bucket}`;
      return `${base.replace(/\/$/, '')}/${key}`;
    }
    const path = join(this.localRoot, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
    // Adresse relative : le front est servi sur le même domaine que l'API (proxy en dev,
    // service unique ou nginx en production) ; elle survit à un changement de domaine.
    return `/uploads/${key}`;
  }

  /** Supprime une image précédemment stockée (au mieux : une erreur n'interrompt pas l'action). */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const match = /(covers|avatars)\/[0-9a-f-]+\.(jpg|png|webp)$/.exec(url);
    if (!match) return;
    const key = match[0];
    try {
      if (this.s3) {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.config.storage.s3.bucket, Key: key }),
        );
      } else {
        await unlink(join(this.localRoot, key));
      }
    } catch (err) {
      this.logger.warn(`Suppression impossible de ${key}: ${(err as Error).message}`);
    }
  }
}
