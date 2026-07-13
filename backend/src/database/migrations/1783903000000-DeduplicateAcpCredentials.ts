import { MigrationInterface, QueryRunner } from "typeorm";

export class DeduplicateAcpCredentials1783903000000 implements MigrationInterface {
  name = "DeduplicateAcpCredentials1783903000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("acp_credentials"))) return;
    const hasItemPreferences = await queryRunner.hasTable(
      "acp_item_preferences",
    );
    const canonicalOrder = hasItemPreferences
      ? `EXISTS (
              SELECT 1
              FROM "acp_item_preferences" preference
              WHERE preference."credential_id" = credential."id"
            ) DESC,
            credential."id" ASC`
      : `credential."id" ASC`;

    await queryRunner.query(`
      CREATE TEMPORARY TABLE "acp_credential_dedup_map_1783903000000" AS
      SELECT
        credential."id" AS "credential_id",
        FIRST_VALUE(credential."id") OVER (
          PARTITION BY credential."access_config_id", credential."username"
          ORDER BY ${canonicalOrder}
        ) AS "canonical_id"
      FROM "acp_credentials" credential
    `);

    if (hasItemPreferences) {
      await queryRunner.query(`
        DELETE FROM "acp_item_preferences" older
        USING "acp_item_preferences" newer,
              "acp_credential_dedup_map_1783903000000" older_map,
              "acp_credential_dedup_map_1783903000000" newer_map
        WHERE older."credential_id" = older_map."credential_id"
          AND newer."credential_id" = newer_map."credential_id"
          AND older_map."canonical_id" = newer_map."canonical_id"
          AND older."acp_id" = newer."acp_id"
          AND older."view_id" = newer."view_id"
          AND (older."updated_at", older."id") < (newer."updated_at", newer."id")
      `);
      await queryRunner.query(`
        UPDATE "acp_item_preferences" preference
        SET "credential_id" = dedup."canonical_id"
        FROM "acp_credential_dedup_map_1783903000000" dedup
        WHERE preference."credential_id" = dedup."credential_id"
          AND dedup."credential_id" <> dedup."canonical_id"
      `);
    }

    await queryRunner.query(`
      DELETE FROM "acp_credentials" credential
      USING "acp_credential_dedup_map_1783903000000" dedup
      WHERE credential."id" = dedup."credential_id"
        AND dedup."credential_id" <> dedup."canonical_id"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_acp_credentials_unique_username"
      ON "acp_credentials" ("access_config_id", "username")
    `);
    await queryRunner.query(
      'DROP TABLE "acp_credential_dedup_map_1783903000000"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_acp_credentials_unique_username"',
    );
  }
}
