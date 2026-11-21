import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Schéma initial (généré par `typeorm migration:generate`, relu).
 * Corrections manuelles : types énumérés partagés créés une seule fois,
 * index GIN de recherche plein texte.
 */

export class InitialSchema1795224716083 implements MigrationInterface {
    name = 'InitialSchema1795224716083'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "writing"."tags" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "name" citext NOT NULL, CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_tags_name" ON "writing"."tags" ("name") `);
        await queryRunner.query(`CREATE TABLE "writing"."book_tags" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "book_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_671237e5d51f5f5c958337cd6a1" PRIMARY KEY ("book_id", "tag_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_book_tags_tag" ON "writing"."book_tags" ("tag_id") `);
        await queryRunner.query(`CREATE TYPE "writing"."writing_status" AS ENUM('draft', 'in_progress', 'finished', 'published')`);
        await queryRunner.query(`CREATE TYPE "writing"."visibility" AS ENUM('private', 'friends', 'link', 'public')`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["laito","writing","books","GENERATED_COLUMN","search","setweight(to_tsvector('simple', coalesce(\"title\", '')), 'A') || setweight(to_tsvector('simple', coalesce(\"summary\", '')), 'B')"]);
        await queryRunner.query(`CREATE TABLE "writing"."books" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "author_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "slug" character varying(100) NOT NULL, "summary" text, "cover_url" text, "genre" character varying(40), "status" "writing"."writing_status" NOT NULL DEFAULT 'draft', "visibility" "writing"."visibility" NOT NULL DEFAULT 'private', "published_at" TIMESTAMP WITH TIME ZONE, "word_count" integer NOT NULL DEFAULT '0', "search" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("summary", '')), 'B')) STORED NOT NULL, CONSTRAINT "PK_f3f2f25a099d24e12545b70b022" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_books_author" ON "writing"."books" ("author_id") `);
        await queryRunner.query(`CREATE INDEX "idx_books_slug" ON "writing"."books" ("slug") `);
        // Recherche plein texte (index GIN, ajouté à la main : non géré par TypeORM).
        await queryRunner.query(`CREATE INDEX "idx_books_search" ON "writing"."books" USING GIN ("search")`);
        await queryRunner.query(`CREATE INDEX "idx_books_public_recent" ON "writing"."books" ("visibility", "published_at") `);
        await queryRunner.query(`CREATE TABLE "writing"."chapter_contents" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "chapter_id" uuid NOT NULL, "content" text NOT NULL DEFAULT '', "content_text" text NOT NULL DEFAULT '', "version" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_aa5c0847007dd14384893728340" PRIMARY KEY ("chapter_id"))`);
        await queryRunner.query(`CREATE TABLE "writing"."chapters" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "book_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "position" integer NOT NULL, "status" "writing"."writing_status" NOT NULL DEFAULT 'draft', "visibility" "writing"."visibility" NOT NULL DEFAULT 'private', "word_count" integer NOT NULL DEFAULT '0', "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a2bbdbb4bdc786fe0cb0fcfc4a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_chapters_book_position" ON "writing"."chapters" ("book_id", "position") `);
        await queryRunner.query(`CREATE TABLE "writing"."chapter_versions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "chapter_id" uuid NOT NULL, "content" text NOT NULL, "version" integer NOT NULL, CONSTRAINT "PK_59bebbe36f227c5b4fdb1a34745" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_chapter_versions_chapter" ON "writing"."chapter_versions" ("chapter_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "sharing"."resource_type" AS ENUM('book', 'chapter')`);
        await queryRunner.query(`CREATE TABLE "sharing"."share_links" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "resource_type" "sharing"."resource_type" NOT NULL, "resource_id" uuid NOT NULL, "token" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_70320b79ecd8acab96419fcdd6d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_share_links_token" ON "sharing"."share_links" ("token") `);
        await queryRunner.query(`CREATE INDEX "idx_share_links_resource" ON "sharing"."share_links" ("resource_type", "resource_id") `);
        await queryRunner.query(`CREATE TYPE "social"."friendship_status" AS ENUM('pending', 'accepted', 'blocked')`);
        await queryRunner.query(`CREATE TABLE "social"."friendships" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "requester_id" uuid NOT NULL, "addressee_id" uuid NOT NULL, "status" "social"."friendship_status" NOT NULL DEFAULT 'pending', CONSTRAINT "PK_08af97d0be72942681757f07bc8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_friendships_addressee" ON "social"."friendships" ("addressee_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_friendships_pair" ON "social"."friendships" ("requester_id", "addressee_id") `);
        await queryRunner.query(`CREATE TYPE "sharing"."grant_permission" AS ENUM('read', 'comment')`);
        await queryRunner.query(`CREATE TABLE "sharing"."access_grants" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "resource_type" "sharing"."resource_type" NOT NULL, "resource_id" uuid NOT NULL, "grantee_user_id" uuid NOT NULL, "permission" "sharing"."grant_permission" NOT NULL DEFAULT 'read', CONSTRAINT "PK_451012952c6aa19c9f6e4ddcc19" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_access_grants_grantee" ON "sharing"."access_grants" ("grantee_user_id", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_access_grants" ON "sharing"."access_grants" ("resource_type", "resource_id", "grantee_user_id") `);
        await queryRunner.query(`CREATE TABLE "library"."bookmarks" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "book_id" uuid NOT NULL, CONSTRAINT "PK_9d8d5b15c0ce655408b3ac5c9f8" PRIMARY KEY ("user_id", "book_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_bookmarks_user_recent" ON "library"."bookmarks" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "library"."reading_progress" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "book_id" uuid NOT NULL, "chapter_id" uuid NOT NULL, "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_0cb1e683135fcfe8114687df343" PRIMARY KEY ("user_id", "book_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_reading_progress_book_recent" ON "library"."reading_progress" ("book_id", "updated_at") `);
        await queryRunner.query(`CREATE INDEX "idx_reading_progress_user_recent" ON "library"."reading_progress" ("user_id", "updated_at") `);
        await queryRunner.query(`CREATE TABLE "identity"."profiles" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "username" citext NOT NULL, "display_name" character varying(80) NOT NULL, "avatar_url" text, "bio" text, "links" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_9e432b7df0d182f8d292902d1a2" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_profiles_username" ON "identity"."profiles" ("username") `);
        await queryRunner.query(`CREATE TABLE "identity"."user_settings" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "locale" character varying(8) NOT NULL DEFAULT 'fr', "theme" character varying(16) NOT NULL DEFAULT 'parchment', "notifications_enabled" boolean NOT NULL DEFAULT true, "onboarding_completed" boolean NOT NULL DEFAULT false, "reading_preferences" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_4ed056b9344e6f7d8d46ec4b302" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`CREATE TYPE "identity"."user_role" AS ENUM('user', 'moderator', 'admin')`);
        await queryRunner.query(`CREATE TYPE "identity"."user_status" AS ENUM('active', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "identity"."users" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "email" citext NOT NULL, "password_hash" text NOT NULL, "email_verified_at" TIMESTAMP WITH TIME ZONE, "role" "identity"."user_role" NOT NULL DEFAULT 'user', "status" "identity"."user_status" NOT NULL DEFAULT 'active', CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "identity"."users" ("email") `);
        await queryRunner.query(`CREATE TYPE "identity"."user_token_type" AS ENUM('email_verification', 'password_reset')`);
        await queryRunner.query(`CREATE TABLE "identity"."user_tokens" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" "identity"."user_token_type" NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_63764db9d9aaa4af33e07b2f4bf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_tokens_hash" ON "identity"."user_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE TABLE "identity"."sessions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL, "user_id" uuid NOT NULL, "refresh_token_hash" character(64) NOT NULL, "user_agent" text, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sessions_user" ON "identity"."sessions" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "writing"."book_tags" ADD CONSTRAINT "FK_4d06db2d11048c09ca05de823d6" FOREIGN KEY ("book_id") REFERENCES "writing"."books"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "writing"."book_tags" ADD CONSTRAINT "FK_fb495c7e106e0c1c6332797d684" FOREIGN KEY ("tag_id") REFERENCES "writing"."tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "writing"."chapter_contents" ADD CONSTRAINT "FK_aa5c0847007dd14384893728340" FOREIGN KEY ("chapter_id") REFERENCES "writing"."chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "writing"."chapters" ADD CONSTRAINT "FK_23af8ea9e68fef63d07b189e8d1" FOREIGN KEY ("book_id") REFERENCES "writing"."books"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "writing"."chapter_versions" ADD CONSTRAINT "FK_b0c37709e345ac411720254bc9e" FOREIGN KEY ("chapter_id") REFERENCES "writing"."chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."user_settings" ADD CONSTRAINT "FK_4ed056b9344e6f7d8d46ec4b302" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."user_tokens" ADD CONSTRAINT "FK_9e144a67be49e5bba91195ef5de" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_tokens" DROP CONSTRAINT "FK_9e144a67be49e5bba91195ef5de"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_settings" DROP CONSTRAINT "FK_4ed056b9344e6f7d8d46ec4b302"`);
        await queryRunner.query(`ALTER TABLE "identity"."profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`);
        await queryRunner.query(`ALTER TABLE "writing"."chapter_versions" DROP CONSTRAINT "FK_b0c37709e345ac411720254bc9e"`);
        await queryRunner.query(`ALTER TABLE "writing"."chapters" DROP CONSTRAINT "FK_23af8ea9e68fef63d07b189e8d1"`);
        await queryRunner.query(`ALTER TABLE "writing"."chapter_contents" DROP CONSTRAINT "FK_aa5c0847007dd14384893728340"`);
        await queryRunner.query(`ALTER TABLE "writing"."book_tags" DROP CONSTRAINT "FK_fb495c7e106e0c1c6332797d684"`);
        await queryRunner.query(`ALTER TABLE "writing"."book_tags" DROP CONSTRAINT "FK_4d06db2d11048c09ca05de823d6"`);
        await queryRunner.query(`DROP INDEX "identity"."idx_sessions_user"`);
        await queryRunner.query(`DROP TABLE "identity"."sessions"`);
        await queryRunner.query(`DROP INDEX "identity"."uq_user_tokens_hash"`);
        await queryRunner.query(`DROP TABLE "identity"."user_tokens"`);
        await queryRunner.query(`DROP TYPE "identity"."user_token_type"`);
        await queryRunner.query(`DROP INDEX "identity"."uq_users_email"`);
        await queryRunner.query(`DROP TABLE "identity"."users"`);
        await queryRunner.query(`DROP TYPE "identity"."user_status"`);
        await queryRunner.query(`DROP TYPE "identity"."user_role"`);
        await queryRunner.query(`DROP TABLE "identity"."user_settings"`);
        await queryRunner.query(`DROP INDEX "identity"."uq_profiles_username"`);
        await queryRunner.query(`DROP TABLE "identity"."profiles"`);
        await queryRunner.query(`DROP INDEX "library"."idx_reading_progress_user_recent"`);
        await queryRunner.query(`DROP INDEX "library"."idx_reading_progress_book_recent"`);
        await queryRunner.query(`DROP TABLE "library"."reading_progress"`);
        await queryRunner.query(`DROP INDEX "library"."idx_bookmarks_user_recent"`);
        await queryRunner.query(`DROP TABLE "library"."bookmarks"`);
        await queryRunner.query(`DROP INDEX "sharing"."uq_access_grants"`);
        await queryRunner.query(`DROP INDEX "sharing"."idx_access_grants_grantee"`);
        await queryRunner.query(`DROP TABLE "sharing"."access_grants"`);
        await queryRunner.query(`DROP TYPE "sharing"."grant_permission"`);
        await queryRunner.query(`DROP INDEX "social"."uq_friendships_pair"`);
        await queryRunner.query(`DROP INDEX "social"."idx_friendships_addressee"`);
        await queryRunner.query(`DROP TABLE "social"."friendships"`);
        await queryRunner.query(`DROP TYPE "social"."friendship_status"`);
        await queryRunner.query(`DROP INDEX "sharing"."idx_share_links_resource"`);
        await queryRunner.query(`DROP INDEX "sharing"."uq_share_links_token"`);
        await queryRunner.query(`DROP TABLE "sharing"."share_links"`);
        await queryRunner.query(`DROP TYPE "sharing"."resource_type"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_chapter_versions_chapter"`);
        await queryRunner.query(`DROP TABLE "writing"."chapter_versions"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_chapters_book_position"`);
        await queryRunner.query(`DROP TABLE "writing"."chapters"`);
        await queryRunner.query(`DROP TABLE "writing"."chapter_contents"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_books_public_recent"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_books_search"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_books_slug"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_books_author"`);
        await queryRunner.query(`DROP TABLE "writing"."books"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","search","laito","writing","books"]);
        await queryRunner.query(`DROP TYPE "writing"."visibility"`);
        await queryRunner.query(`DROP TYPE "writing"."writing_status"`);
        await queryRunner.query(`DROP INDEX "writing"."idx_book_tags_tag"`);
        await queryRunner.query(`DROP TABLE "writing"."book_tags"`);
        await queryRunner.query(`DROP INDEX "writing"."uq_tags_name"`);
        await queryRunner.query(`DROP TABLE "writing"."tags"`);
    }

}
