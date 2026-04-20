import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeItemResponseStateUniqueIndex1761000000000 implements MigrationInterface {
  name = "ChangeItemResponseStateUniqueIndex1761000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_item_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_item_response_states_acp_unit_item_unique"
      ON "item_response_states" ("acp_id", "unit_id", "item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_unit_item_unique"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_item_response_states_acp_item_unique"
      ON "item_response_states" ("acp_id", "item_id")
    `);
  }
}
