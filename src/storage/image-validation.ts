import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { COVER_MAX_BYTES } from '../shared';

export type ImageKind = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/** Détecte le type réel d'une image par ses octets magiques (on ne fait pas confiance au nom ni au Content-Type). */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export function assertValidImage(file: Express.Multer.File | undefined): ImageKind {
  if (!file) throw new BadRequestException('Aucun fichier reçu');
  if (file.size > COVER_MAX_BYTES) throw new PayloadTooLargeException('Image de 5 Mo maximum');
  const kind = sniffImage(file.buffer);
  if (!kind) throw new BadRequestException('Formats acceptés : JPG, PNG, WebP');
  return kind;
}
