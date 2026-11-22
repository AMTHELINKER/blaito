import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modération : signalements, journal des actions, colonnes hidden_at (livres, chapitres).
 * Générée par typeorm migration:generate, relue ; type énuméré partagé créé une seule fois.
 */

export class Moderation1795381050616 implements MigrationInterface {
  name = 'Moderation1795381050616';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "moderation"."report_target_type" AS ENUM('book', 'chapter', 'user', 'message')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation"."report_reason" AS ENUM('spam', 'harassment', 'inappropriate', 'copyright', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation"."report_status" AS ENUM('open', 'resolved', 'dismissed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "moderation"."reports" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "reporter_id" uuid NOT NULL, "target_type" "moderation"."report_target_type" NOT NULL, "target_id" uuid NOT NULL, "reason" "moderation"."report_reason" NOT NULL, "details" text, "status" "moderation"."report_status" NOT NULL DEFAULT 'open', "resolved_by" uuid, "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reports_open_per_reporter" ON "moderation"."reports" ("reporter_id", "target_type", "target_id") WHERE "status" = 'open'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_target" ON "moderation"."reports" ("target_type", "target_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_status_created" ON "moderation"."reports" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation"."moderation_action_type" AS ENUM('hide_content', 'unhide_content', 'suspend_user', 'reinstate_user', 'dismiss_report', 'change_role')`,
    );
    await queryRunner.query(
      `CREATE TABLE "moderation"."moderation_actions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "moderator_id" uuid NOT NULL, "action" "moderation"."moderation_action_type" NOT NULL, "target_type" "moderation"."report_target_type" NOT NULL, "target_id" uuid NOT NULL, "reason" text, "report_id" uuid, CONSTRAINT "PK_d259906fb4d2a5ef718f1f66e35" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_moderation_actions_target" ON "moderation"."moderation_actions" ("target_type", "target_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_moderation_actions_created" ON "moderation"."moderation_actions" ("created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "writing"."books" ADD "hidden_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "writing"."chapters" ADD "hidden_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "writing"."chapters" DROP COLUMN "hidden_at"`);
    await queryRunner.query(`ALTER TABLE "writing"."books" DROP COLUMN "hidden_at"`);
    await queryRunner.query(`DROP INDEX "moderation"."idx_moderation_actions_created"`);
    await queryRunner.query(`DROP INDEX "moderation"."idx_moderation_actions_target"`);
    await queryRunner.query(`DROP TABLE "moderation"."moderation_actions"`);
    await queryRunner.query(`DROP TYPE "moderation"."moderation_action_type"`);
    await queryRunner.query(`DROP INDEX "moderation"."idx_reports_status_created"`);
    await queryRunner.query(`DROP INDEX "moderation"."idx_reports_target"`);
    await queryRunner.query(`DROP INDEX "moderation"."uq_reports_open_per_reporter"`);
    await queryRunner.query(`DROP TABLE "moderation"."reports"`);
    await queryRunner.query(`DROP TYPE "moderation"."report_status"`);
    await queryRunner.query(`DROP TYPE "moderation"."report_reason"`);
    await queryRunner.query(`DROP TYPE "moderation"."report_target_type"`);
  }
}
