import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAllowedAcpIdsToApplicationTokens1770002000000 implements MigrationInterface {
  name = "AddAllowedAcpIdsToApplicationTokens1770002000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("application_tokens");
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "application_tokens"
      ADD COLUMN IF NOT EXISTS "allowed_acp_ids" jsonb
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_tokens_allowed_acp_ids"
      ON "application_tokens" USING gin ("allowed_acp_ids")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."IDX_application_tokens_allowed_acp_ids"',
    );

    const hasTable = await queryRunner.hasTable("application_tokens");
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "application_tokens"
      DROP COLUMN IF EXISTS "allowed_acp_ids"
    `);
  }
}
