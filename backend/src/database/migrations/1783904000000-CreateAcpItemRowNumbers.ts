import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAcpItemRowNumbers1783904000000 implements MigrationInterface {
  name = "CreateAcpItemRowNumbers1783904000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_item_row_numbers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "row_key" character varying(500) NOT NULL,
        "row_number" integer NOT NULL,
        CONSTRAINT "PK_acp_item_row_numbers" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_acp_item_row_numbers_positive" CHECK ("row_number" > 0),
        CONSTRAINT "FK_acp_item_row_numbers_acp"
          FOREIGN KEY ("acp_id") REFERENCES "acp"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_acp_item_row_numbers_acp_row_key_unique"
      ON "acp_item_row_numbers" ("acp_id", "row_key")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_acp_item_row_numbers_acp_number_unique"
      ON "acp_item_row_numbers" ("acp_id", "row_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_item_row_numbers"`);
  }
}
