import { MigrationInterface, QueryRunner } from 'typeorm';

/** Schéma du domaine modération. */
export class CreateModerationSchema1795381045476 implements MigrationInterface {
  name = 'CreateModerationSchema1795381045476';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS "moderation"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS "moderation" CASCADE`);
  }
}
