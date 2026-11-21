/**
 * Vérifie le stockage d'images configuré (S3_* ou disque local) :
 * envoi d'une image de test, lecture via son adresse publique, puis suppression.
 *
 *   pnpm storage:check
 *
 * Les variables sont lues dans l'environnement ou dans le fichier .env.
 */
import '../src/load-env';
import 'reflect-metadata';
import { loadConfig } from '../src/config/configuration';
import { sniffImage } from '../src/storage/image-validation';
import { StorageService } from '../src/storage/storage.service';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  const config = loadConfig();
  const { driver, s3 } = config.storage;
  console.log(
    `Pilote : ${driver}${driver === 's3' ? ` — ${s3.endpoint ?? 'AWS'} / ${s3.bucket}` : ''}`,
  );
  if (driver === 's3') {
    const missing = (
      ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey', 'publicUrl'] as const
    ).filter((k) => !s3[k]);
    if (missing.length) throw new Error(`Variables S3 manquantes : ${missing.join(', ')}`);
  }

  const storage = new StorageService(config);
  const url = await storage.putImage('covers', PNG_1PX, sniffImage(PNG_1PX)!);
  console.log(`1. Envoi : OK → ${url}`);

  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    const body = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !body.equals(PNG_1PX)) {
      throw new Error(
        `Lecture publique impossible (HTTP ${res.status}). Le bucket est-il public ? S3_PUBLIC_URL est-il juste ?`,
      );
    }
    console.log(`2. Lecture publique : OK (${res.headers.get('content-type')})`);
  } else {
    console.log('2. Lecture publique : adresse relative (servie par l’API), non testée ici');
  }

  await storage.remove(url);
  console.log('3. Suppression : OK');
  console.log('\n✅ Stockage prêt.');
}

main().catch((err: Error) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
