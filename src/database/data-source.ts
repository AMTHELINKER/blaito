// Charge .env (ou le fichier indiqué par ENV_FILE) pour la CLI TypeORM.
import '../load-env';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration';
import { typeOrmOptions } from './typeorm.options';

export default new DataSource(typeOrmOptions(loadConfig().databaseUrl));
