import { MigrationInterface, QueryRunner } from "typeorm";

export class AddItemResponseStateRowKey1783900000000 implements MigrationInterface {
  name = "AddItemResponseStateRowKey1783900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      ADD COLUMN IF NOT EXISTS "row_key" character varying
    `);
    await queryRunner.query(`
      UPDATE "item_response_states"
      SET "row_key" = "unit_id" || '::' || "item_id"
      WHERE "row_key" IS NULL OR "row_key" = ''
    `);
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      ALTER COLUMN "row_key" SET NOT NULL
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_unit_item_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_item_response_states_acp_row_key_unique"
      ON "item_response_states" ("acp_id", "row_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_row_key_unique"`,
    );
    // The previous schema can keep only one state per ACP/unit/item. Preserve
    // the most recently updated row deterministically so rollback can finish.
    await queryRunner.query(`
      WITH ranked_states AS (
        SELECT "id",
          ROW_NUMBER() OVER (
            PARTITION BY "acp_id", "unit_id", "item_id"
            ORDER BY "updated_at" DESC, "id" DESC
          ) AS row_number
        FROM "item_response_states"
      )
      DELETE FROM "item_response_states" state
      USING ranked_states ranked
      WHERE state."id" = ranked."id" AND ranked.row_number > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_item_response_states_acp_unit_item_unique"
      ON "item_response_states" ("acp_id", "unit_id", "item_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "item_response_states" DROP COLUMN IF EXISTS "row_key"
    `);
  }
}
