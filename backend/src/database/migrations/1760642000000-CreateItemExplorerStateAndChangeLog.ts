import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateItemExplorerStateAndChangeLog1760642000000 implements MigrationInterface {
  name = "CreateItemExplorerStateAndChangeLog1760642000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasStateTable = await queryRunner.hasTable("acp_item_explorer_state");
    if (!hasStateTable) {
      await queryRunner.query(`
        CREATE TABLE "acp_item_explorer_state" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "acp_id" uuid NOT NULL,
          "published_state" jsonb NOT NULL DEFAULT '{}',
          "draft_state" jsonb NOT NULL DEFAULT '{}',
          "status" character varying NOT NULL DEFAULT 'CLEAN',
          "version" integer NOT NULL DEFAULT 1,
          "published_version" integer NOT NULL DEFAULT 1,
          "updated_by_user_id" uuid,
          "updated_by_username" character varying,
          "updated_by_role" character varying,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_acp_item_explorer_state_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_acp_item_explorer_state_acp_id" UNIQUE ("acp_id")
        )
      `);

      await queryRunner.query(`
        ALTER TABLE "acp_item_explorer_state"
        ADD CONSTRAINT "FK_acp_item_explorer_state_acp"
        FOREIGN KEY ("acp_id") REFERENCES "acp"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
      `);

      await queryRunner.query(`
        ALTER TABLE "acp_item_explorer_state"
        ADD CONSTRAINT "FK_acp_item_explorer_state_updated_by_user"
        FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_acp_item_explorer_state_status"
        ON "acp_item_explorer_state" ("status")
      `);
    }

    const hasLogTable = await queryRunner.hasTable(
      "acp_item_explorer_change_log",
    );
    if (!hasLogTable) {
      await queryRunner.query(`
        CREATE TABLE "acp_item_explorer_change_log" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "acp_id" uuid NOT NULL,
          "change_type" character varying NOT NULL,
          "before_state" jsonb NOT NULL DEFAULT '{}',
          "after_state" jsonb NOT NULL DEFAULT '{}',
          "diff" jsonb NOT NULL DEFAULT '{}',
          "draft_version" integer,
          "published_version" integer,
          "actor_user_id" uuid,
          "actor_username" character varying,
          "actor_role" character varying,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_acp_item_explorer_change_log_id" PRIMARY KEY ("id")
        )
      `);

      await queryRunner.query(`
        ALTER TABLE "acp_item_explorer_change_log"
        ADD CONSTRAINT "FK_acp_item_explorer_change_log_acp"
        FOREIGN KEY ("acp_id") REFERENCES "acp"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
      `);

      await queryRunner.query(`
        ALTER TABLE "acp_item_explorer_change_log"
        ADD CONSTRAINT "FK_acp_item_explorer_change_log_actor_user"
        FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_acp_item_explorer_change_log_acp_created"
        ON "acp_item_explorer_change_log" ("acp_id", "created_at")
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_acp_item_explorer_change_log_change_type"
        ON "acp_item_explorer_change_log" ("change_type")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLogTable = await queryRunner.hasTable(
      "acp_item_explorer_change_log",
    );
    if (hasLogTable) {
      await queryRunner.query(
        'DROP INDEX "public"."IDX_acp_item_explorer_change_log_change_type"',
      );
      await queryRunner.query(
        'DROP INDEX "public"."IDX_acp_item_explorer_change_log_acp_created"',
      );
      await queryRunner.query(
        'ALTER TABLE "acp_item_explorer_change_log" DROP CONSTRAINT "FK_acp_item_explorer_change_log_actor_user"',
      );
      await queryRunner.query(
        'ALTER TABLE "acp_item_explorer_change_log" DROP CONSTRAINT "FK_acp_item_explorer_change_log_acp"',
      );
      await queryRunner.query('DROP TABLE "acp_item_explorer_change_log"');
    }

    const hasStateTable = await queryRunner.hasTable("acp_item_explorer_state");
    if (hasStateTable) {
      await queryRunner.query(
        'DROP INDEX "public"."IDX_acp_item_explorer_state_status"',
      );
      await queryRunner.query(
        'ALTER TABLE "acp_item_explorer_state" DROP CONSTRAINT "FK_acp_item_explorer_state_updated_by_user"',
      );
      await queryRunner.query(
        'ALTER TABLE "acp_item_explorer_state" DROP CONSTRAINT "FK_acp_item_explorer_state_acp"',
      );
      await queryRunner.query('DROP TABLE "acp_item_explorer_state"');
    }
  }
}
