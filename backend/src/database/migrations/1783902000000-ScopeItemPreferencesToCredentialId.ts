import { MigrationInterface, QueryRunner } from "typeorm";

export class ScopeItemPreferencesToCredentialId1783902000000 implements MigrationInterface {
  name = "ScopeItemPreferencesToCredentialId1783902000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("acp_item_preferences"))) return;

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      ADD COLUMN IF NOT EXISTS "credential_id" uuid
    `);

    await queryRunner.query(`
      DELETE FROM "acp_item_preferences" older
      USING "acp_item_preferences" newer
      WHERE older."user_id" IS NOT NULL
        AND older."acp_id" = newer."acp_id"
        AND older."view_id" = newer."view_id"
        AND older."user_id" = newer."user_id"
        AND (older."updated_at", older."id") < (newer."updated_at", newer."id")
    `);
    await queryRunner.query(`
      UPDATE "acp_item_preferences" preference
      SET "credential_id" = credential."id"
      FROM "acp_credentials" credential
      INNER JOIN "acp_access_configs" access_config
        ON access_config."id" = credential."access_config_id"
      WHERE preference."credential_id" IS NULL
        AND preference."user_id" IS NULL
        AND preference."acp_id" = access_config."acp_id"
        AND preference."credential_username" = credential."username"
    `);

    await queryRunner.query(`
      DELETE FROM "acp_item_preferences"
      WHERE "user_id" IS NULL
        AND "credential_id" IS NULL
        AND "credential_username" IS NOT NULL
    `);

    await queryRunner.query(`
      DELETE FROM "acp_item_preferences" older
      USING "acp_item_preferences" newer
      WHERE older."credential_id" IS NOT NULL
        AND older."acp_id" = newer."acp_id"
        AND older."view_id" = newer."view_id"
        AND older."credential_id" = newer."credential_id"
        AND (older."updated_at", older."id") < (newer."updated_at", newer."id")
    `);

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      DROP CONSTRAINT IF EXISTS "FK_acp_item_preferences_credential"
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      ADD CONSTRAINT "FK_acp_item_preferences_credential"
      FOREIGN KEY ("credential_id") REFERENCES "acp_credentials"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_acp_item_preferences_unique_user"
      ON "acp_item_preferences" ("acp_id", "view_id", "user_id")
      WHERE "user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_acp_item_preferences_unique_credential"
      ON "acp_item_preferences" ("acp_id", "view_id", "credential_id")
      WHERE "credential_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("acp_item_preferences"))) return;

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_acp_item_preferences_unique_credential"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_acp_item_preferences_unique_user"',
    );
    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      DROP CONSTRAINT IF EXISTS "FK_acp_item_preferences_credential"
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences" DROP COLUMN IF EXISTS "credential_id"
    `);
  }
}
