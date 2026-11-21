import { MigrationInterface, QueryRunner } from 'typeorm';

/** Un schéma PostgreSQL par domaine + extensions requises. */
export class CreateSchemas1764000000000 implements MigrationInterface {
  name = 'CreateSchemas1764000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    for (const schema of ['identity', 'writing', 'sharing', 'social', 'library']) {
      await q.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const schema of ['library', 'social', 'sharing', 'writing', 'identity']) {
      await q.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await q.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
