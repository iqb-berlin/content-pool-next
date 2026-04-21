import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAcpFileProcessingJobs1762000000000
  implements MigrationInterface
{
  name = "CreateAcpFileProcessingJobs1762000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acp_file_processing_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acp_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        "status" character varying(32) NOT NULL DEFAULT 'pending',
        "phase" character varying(64) NOT NULL DEFAULT 'queued',
        "phase_label" character varying(160) NOT NULL DEFAULT 'Wartet',
        "message" text,
        "phase_current" integer NOT NULL DEFAULT 0,
        "phase_total" integer NOT NULL DEFAULT 0,
        "uploaded_file_count" integer NOT NULL DEFAULT 0,
        "uploaded_file_ids" jsonb NOT NULL DEFAULT '[]',
        "run_cleanup" boolean NOT NULL DEFAULT false,
        "sync_report" jsonb,
        "validation_summary" jsonb,
        "cleanup_report" jsonb,
        "response_state_cleanup" jsonb,
        "error" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "started_at" TIMESTAMP,
        "finished_at" TIMESTAMP,
        CONSTRAINT "PK_acp_file_processing_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_acp_file_processing_jobs_acp" FOREIGN KEY ("acp_id") REFERENCES "acp"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_acp_file_processing_jobs_acp_created_at"
      ON "acp_file_processing_jobs" ("acp_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_acp_file_processing_jobs_status"
      ON "acp_file_processing_jobs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_acp_file_processing_jobs_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_acp_file_processing_jobs_acp_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "acp_file_processing_jobs"`);
  }
}
