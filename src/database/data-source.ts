import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration';
import { typeOrmOptions } from './typeorm.options';

try {
  // Charge le fichier .env pour la CLI TypeORM (Node ≥ 20.12).
  process.loadEnvFile?.();
} catch {
  /* pas de fichier .env : variables du système */
}

export default new DataSource(typeOrmOptions(loadConfig().databaseUrl));
