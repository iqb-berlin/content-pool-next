import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArchiveFieldsToFileProcessingJobs1763100000000 implements MigrationInterface {
  name = "AddArchiveFieldsToFileProcessingJobs1763100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      ADD COLUMN IF NOT EXISTS "job_type" character varying(32) NOT NULL DEFAULT 'upload-process'
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      ADD COLUMN IF NOT EXISTS "archive_file_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      ADD COLUMN IF NOT EXISTS "archive_file_path" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      DROP COLUMN IF EXISTS "archive_file_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      DROP COLUMN IF EXISTS "archive_file_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "acp_file_processing_jobs"
      DROP COLUMN IF EXISTS "job_type"
    `);
  }
}
