import { MigrationInterface, QueryRunner } from 'typeorm';

/** Schéma du domaine messagerie. */
export class CreateMessagingSchema1795260794587 implements MigrationInterface {
  name = 'CreateMessagingSchema1795260794587';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS "messaging"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS "messaging" CASCADE`);
  }
}
