import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAcpItemPreferences1760640000000 implements MigrationInterface {
  name = 'CreateAcpItemPreferences1760640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "acp_item_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "view_id" character varying NOT NULL DEFAULT 'item-list',
        "user_id" uuid,
        "credential_username" character varying,
        "preferences" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acp_item_preferences_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      ADD CONSTRAINT "FK_acp_item_preferences_acp"
      FOREIGN KEY ("acp_id") REFERENCES "acp"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences"
      ADD CONSTRAINT "FK_acp_item_preferences_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_acp_item_preferences_lookup_user"
      ON "acp_item_preferences" ("acp_id", "view_id", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_acp_item_preferences_lookup_credential"
      ON "acp_item_preferences" ("acp_id", "view_id", "credential_username")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_acp_item_preferences_lookup_credential"');
    await queryRunner.query('DROP INDEX "public"."IDX_acp_item_preferences_lookup_user"');

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences" DROP CONSTRAINT "FK_acp_item_preferences_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "acp_item_preferences" DROP CONSTRAINT "FK_acp_item_preferences_acp"
    `);

    await queryRunner.query('DROP TABLE "acp_item_preferences"');
  }
}
