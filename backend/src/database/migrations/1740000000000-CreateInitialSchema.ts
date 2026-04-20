import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInitialSchema1740000000000 implements MigrationInterface {
  name = "CreateInitialSchema1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acp_user_roles_role_enum') THEN
          CREATE TYPE "acp_user_roles_role_enum" AS ENUM ('ACP_MANAGER', 'READ_ONLY');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acp_access_configs_access_model_enum') THEN
          CREATE TYPE "acp_access_configs_access_model_enum" AS ENUM ('PRIVATE', 'PUBLIC', 'REGISTERED', 'CREDENTIALS_LIST');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comments_target_type_enum') THEN
          CREATE TYPE "comments_target_type_enum" AS ENUM ('UNIT', 'ITEM', 'TASK_SEQUENCE');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "username" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        "display_name" character varying,
        "is_app_admin" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "package_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "acp_index" jsonb NOT NULL DEFAULT '{}',
        "item_properties" jsonb NOT NULL DEFAULT '{}',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acp_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_acp_package_id" UNIQUE ("package_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "theme" jsonb NOT NULL DEFAULT '{}',
        "language" character varying NOT NULL DEFAULT 'de',
        "logo_url" character varying,
        "landing_page_html" text,
        "imprint_html" text,
        "privacy_html" text,
        "accessibility_html" text,
        "default_acp_index" jsonb NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_user_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "acp_id" uuid NOT NULL,
        "role" "acp_user_roles_role_enum" NOT NULL,
        CONSTRAINT "PK_acp_user_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_acp_user_roles_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "file_path" character varying NOT NULL,
        "original_name" character varying NOT NULL,
        "file_type" character varying,
        "file_size" bigint NOT NULL,
        "checksum" character varying,
        "validation_result" jsonb,
        "uploaded_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acp_files_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_files_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "version_number" integer NOT NULL,
        "acp_index_snapshot" jsonb NOT NULL,
        "changelog" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acp_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_snapshots_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_snapshot_files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshot_id" uuid NOT NULL,
        "file_path" character varying NOT NULL,
        "original_name" character varying NOT NULL,
        "checksum" character varying,
        "file_size" bigint NOT NULL,
        CONSTRAINT "PK_acp_snapshot_files_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_snapshot_files_snapshot" FOREIGN KEY ("snapshot_id") REFERENCES "acp_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_access_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "access_model" "acp_access_configs_access_model_enum" NOT NULL,
        "allow_registered" boolean NOT NULL DEFAULT false,
        "feature_config" jsonb NOT NULL DEFAULT '{}',
        "valid_from" TIMESTAMPTZ,
        "valid_until" TIMESTAMPTZ,
        CONSTRAINT "PK_acp_access_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_access_configs_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_credentials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "access_config_id" uuid NOT NULL,
        "username" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        CONSTRAINT "PK_acp_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_credentials_access_config" FOREIGN KEY ("access_config_id") REFERENCES "acp_access_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "user_id" uuid,
        "credential_username" character varying,
        "target_type" "comments_target_type_enum" NOT NULL,
        "target_id" character varying NOT NULL,
        "comment_text" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comments_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_comments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_response_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" character varying NOT NULL,
        "item_id" character varying NOT NULL,
        "unit_id" character varying NOT NULL,
        "response_data" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_item_response_states_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_item_response_states_acp_item_unique"
      ON "item_response_states" ("acp_id", "item_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_item_response_states_acp_unit"
      ON "item_response_states" ("acp_id", "unit_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_unit"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_item_response_states_acp_item_unique"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "item_response_states"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_access_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_snapshot_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp_user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acp"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "comments_target_type_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "acp_access_configs_access_model_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "acp_user_roles_role_enum"`);
  }
}
