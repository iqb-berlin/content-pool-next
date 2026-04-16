import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServerApiAuditLogs1760641000000 implements MigrationInterface {
  name = 'CreateServerApiAuditLogs1760641000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "server_api_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "client_id" character varying NOT NULL,
        "action" character varying NOT NULL,
        "method" character varying NOT NULL,
        "path" text NOT NULL,
        "acp_id" character varying,
        "resource_id" character varying,
        "success" boolean NOT NULL DEFAULT true,
        "status_code" integer,
        "details" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_server_api_audit_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_server_api_audit_logs_created_at"
      ON "server_api_audit_logs" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_server_api_audit_logs_client_id"
      ON "server_api_audit_logs" ("client_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_server_api_audit_logs_action"
      ON "server_api_audit_logs" ("action")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_server_api_audit_logs_action"');
    await queryRunner.query('DROP INDEX "public"."IDX_server_api_audit_logs_client_id"');
    await queryRunner.query('DROP INDEX "public"."IDX_server_api_audit_logs_created_at"');
    await queryRunner.query('DROP TABLE "server_api_audit_logs"');
  }
}
