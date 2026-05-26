import { MigrationInterface, QueryRunner } from "typeorm";

export class UseTimestamptzForApplicationTokenTimestamps1770001000000 implements MigrationInterface {
  name = "UseTimestamptzForApplicationTokenTimestamps1770001000000";

  private readonly columns = [
    "expires_at",
    "last_used_at",
    "revoked_at",
    "created_at",
    "updated_at",
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("application_tokens");
    if (!hasTable) {
      return;
    }

    for (const column of this.columns) {
      const [metadata] = await queryRunner.query(
        `
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'application_tokens'
            AND column_name = $1
        `,
        [column],
      );

      if (metadata?.data_type !== "timestamp without time zone") {
        continue;
      }

      await queryRunner.query(`
        ALTER TABLE "application_tokens"
        ALTER COLUMN "${column}" TYPE TIMESTAMPTZ
        USING "${column}" AT TIME ZONE 'UTC'
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Keep token timestamps timezone-aware once migrated.
  }
}
