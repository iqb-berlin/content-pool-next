import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateApplicationTokens1770000000000 implements MigrationInterface {
  name = "CreateApplicationTokens1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("application_tokens");
    if (hasTable) {
      await this.createIndexes(queryRunner);
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "application_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(160) NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "token_prefix" character varying(32) NOT NULL,
        "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "active" boolean NOT NULL DEFAULT true,
        "expires_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        "created_by_user_id" uuid,
        "revoked_by_user_id" uuid,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_application_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_application_tokens_name" UNIQUE ("name"),
        CONSTRAINT "UQ_application_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_application_tokens_created_by_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_application_tokens_revoked_by_user" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await this.createIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("application_tokens");
    if (!hasTable) {
      return;
    }

    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_application_tokens_created_by_user_id"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_application_tokens_expires_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_application_tokens_active"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "application_tokens"');
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_tokens_active"
      ON "application_tokens" ("active")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_tokens_expires_at"
      ON "application_tokens" ("expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_tokens_created_by_user_id"
      ON "application_tokens" ("created_by_user_id")
    `);
  }
}
