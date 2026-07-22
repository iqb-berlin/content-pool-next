import { MigrationInterface, QueryRunner } from "typeorm";

export class MaintainPreviousBackendRowKeyWrites1784300000000 implements MigrationInterface {
  name = "MaintainPreviousBackendRowKeyWrites1784300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "set_item_response_state_row_key"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."row_key" IS NULL OR NEW."row_key" = '' THEN
          NEW."row_key" := NEW."unit_id" || '::' || NEW."item_id";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TR_item_response_states_legacy_row_key"
      ON "item_response_states"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_item_response_states_legacy_row_key"
      BEFORE INSERT OR UPDATE ON "item_response_states"
      FOR EACH ROW EXECUTE FUNCTION "set_item_response_state_row_key"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TR_item_response_states_legacy_row_key"
      ON "item_response_states"
    `);
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS "set_item_response_state_row_key"()',
    );
  }
}
