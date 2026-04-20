import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPrivateAccessModel1741000000000
  implements MigrationInterface
{
  name = "AddPrivateAccessModel1741000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "acp_access_configs_access_model_enum"
      ADD VALUE IF NOT EXISTS 'PRIVATE'
    `);

    await queryRunner.query(`
      INSERT INTO "acp_access_configs" ("acp_id", "access_model", "allow_registered", "feature_config")
      SELECT "id", 'PRIVATE', false, '{}'::jsonb
      FROM "acp" a
      WHERE NOT EXISTS (
        SELECT 1
        FROM "acp_access_configs" cfg
        WHERE cfg."acp_id" = a."id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "acp_access_configs" cfg
      WHERE cfg."access_model" = 'PRIVATE'
        AND COALESCE(cfg."allow_registered", false) = false
        AND COALESCE(cfg."feature_config", '{}'::jsonb) = '{}'::jsonb
        AND cfg."valid_from" IS NULL
        AND cfg."valid_until" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "acp_credentials" cred
          WHERE cred."access_config_id" = cfg."id"
        )
    `);
  }
}
