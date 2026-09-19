import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommentThreads1787600000000 implements MigrationInterface {
  name = "AddCommentThreads1787600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD COLUMN IF NOT EXISTS "credential_id" uuid,
        ADD COLUMN IF NOT EXISTS "author_label" character varying,
        ADD COLUMN IF NOT EXISTS "unit_id" character varying,
        ADD COLUMN IF NOT EXISTS "item_id" character varying,
        ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid,
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE "comments"
         SET "updated_at" = "created_at"
       WHERE "updated_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "comments"
        ALTER COLUMN "updated_at" SET DEFAULT now(),
        ALTER COLUMN "updated_at" SET NOT NULL
    `);

    // A legacy username is neither immutable nor unique over time. Keep old
    // credential comments readable, but do not infer stable ownership from it.
    await queryRunner.query(`
      UPDATE "comments"
         SET "author_label" = COALESCE("author_label", "credential_username")
       WHERE "author_label" IS NULL
         AND "credential_username" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "comments" c
         SET "author_label" = COALESCE(c."author_label", u."display_name", u."username")
        FROM "users" u
       WHERE c."user_id" = u."id"
         AND c."author_label" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "comments"
         SET "author_label" = COALESCE("author_label", "credential_username", 'Unbekannt')
       WHERE "author_label" IS NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "comments"
          ADD CONSTRAINT "FK_comments_parent"
          FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_item_target"
      ON "comments" ("acp_id", "unit_id", "item_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_parent"
      ON "comments" ("parent_comment_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_comments_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_comments_item_target"`);
    await queryRunner.query(
      `ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "FK_comments_parent"`,
    );
    await queryRunner.query(`
      ALTER TABLE "comments"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "version",
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "parent_comment_id",
        DROP COLUMN IF EXISTS "item_id",
        DROP COLUMN IF EXISTS "unit_id",
        DROP COLUMN IF EXISTS "author_label",
        DROP COLUMN IF EXISTS "credential_id"
    `);
  }
}
