import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function typeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // Jamais de synchronize : chaque changement de schéma passe par une migration relue.
    synchronize: false,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'each',
  };
}
