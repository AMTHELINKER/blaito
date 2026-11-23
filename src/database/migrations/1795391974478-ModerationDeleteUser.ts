import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journal de modération : nouvelle action « delete_user » (suppression d'un compte par un admin).
 * Écrite à la main : TypeORM ne détecte pas l'ajout d'une valeur à un type énuméré.
 */
export class ModerationDeleteUser1795391974478 implements MigrationInterface {
  name = 'ModerationDeleteUser1795391974478';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "moderation"."moderation_action_type" ADD VALUE IF NOT EXISTS 'delete_user'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // PostgreSQL ne sait pas retirer une valeur : on recrée le type sans elle.
    // Les entrées de journal « delete_user » sont supprimées (seule perte possible au retour arrière).
    await q.query(`DELETE FROM "moderation"."moderation_actions" WHERE "action" = 'delete_user'`);
    await q.query(
      `ALTER TYPE "moderation"."moderation_action_type" RENAME TO "moderation_action_type_old"`,
    );
    await q.query(
      `CREATE TYPE "moderation"."moderation_action_type" AS ENUM('hide_content', 'unhide_content', 'suspend_user', 'reinstate_user', 'dismiss_report', 'change_role')`,
    );
    await q.query(
      `ALTER TABLE "moderation"."moderation_actions" ALTER COLUMN "action" TYPE "moderation"."moderation_action_type" USING "action"::text::"moderation"."moderation_action_type"`,
    );
    await q.query(`DROP TYPE "moderation"."moderation_action_type_old"`);
  }
}
