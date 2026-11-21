import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tables de la messagerie (générée par typeorm migration:generate, relue). */

export class Messaging1795260799389 implements MigrationInterface {
  name = 'Messaging1795260799389';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "messaging"."member_role" AS ENUM('owner', 'admin', 'member')`,
    );
    await queryRunner.query(
      `CREATE TABLE "messaging"."conversation_members" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "conversation_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "messaging"."member_role" NOT NULL DEFAULT 'member', "last_read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5fa9076068b6f2a26fb793d2439" PRIMARY KEY ("conversation_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversation_members_user" ON "messaging"."conversation_members" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "messaging"."conversation_type" AS ENUM('direct', 'group')`,
    );
    await queryRunner.query(
      `CREATE TABLE "messaging"."conversations" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "type" "messaging"."conversation_type" NOT NULL, "title" character varying(80), "created_by" uuid NOT NULL, "direct_key" character varying(80), "last_message_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_conversations_direct_key" ON "messaging"."conversations" ("direct_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversations_last_message" ON "messaging"."conversations" ("last_message_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "messaging"."messages" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "conversation_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "body" text NOT NULL, "client_id" character varying(64), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_sender" ON "messaging"."messages" ("sender_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conversation" ON "messaging"."messages" ("conversation_id", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "messaging"."conversation_members" ADD CONSTRAINT "FK_36340a1704b039608e34244511f" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messaging"."messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messaging"."messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messaging"."conversation_members" DROP CONSTRAINT "FK_36340a1704b039608e34244511f"`,
    );
    await queryRunner.query(`DROP INDEX "messaging"."idx_messages_conversation"`);
    await queryRunner.query(`DROP INDEX "messaging"."idx_messages_sender"`);
    await queryRunner.query(`DROP TABLE "messaging"."messages"`);
    await queryRunner.query(`DROP INDEX "messaging"."idx_conversations_last_message"`);
    await queryRunner.query(`DROP INDEX "messaging"."uq_conversations_direct_key"`);
    await queryRunner.query(`DROP TABLE "messaging"."conversations"`);
    await queryRunner.query(`DROP TYPE "messaging"."conversation_type"`);
    await queryRunner.query(`DROP INDEX "messaging"."idx_conversation_members_user"`);
    await queryRunner.query(`DROP TABLE "messaging"."conversation_members"`);
    await queryRunner.query(`DROP TYPE "messaging"."member_role"`);
  }
}
