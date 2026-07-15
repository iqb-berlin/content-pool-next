import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeItemResponseStatesWithAcp1784200000000
  implements MigrationInterface
{
  name = "CascadeItemResponseStatesWithAcp1784200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "item_response_states" state
      WHERE NOT EXISTS (
        SELECT 1 FROM "acp" WHERE "acp"."id"::text = state."acp_id"
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      ALTER COLUMN "acp_id" TYPE uuid USING "acp_id"::uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      ADD CONSTRAINT "FK_item_response_states_acp"
      FOREIGN KEY ("acp_id") REFERENCES "acp"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      DROP CONSTRAINT IF EXISTS "FK_item_response_states_acp"
    `);
    await queryRunner.query(`
      ALTER TABLE "item_response_states"
      ALTER COLUMN "acp_id" TYPE character varying USING "acp_id"::text
    `);
  }
}
