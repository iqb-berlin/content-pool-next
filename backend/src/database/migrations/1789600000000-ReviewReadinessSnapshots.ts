import { MigrationInterface, QueryRunner } from "typeorm";
export class ReviewReadinessSnapshots1789600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE review_readiness_snapshots (
      acp_id uuid PRIMARY KEY REFERENCES acp(id) ON DELETE CASCADE,
      fingerprint varchar NOT NULL,
      result jsonb NOT NULL
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE review_readiness_snapshots`);
  }
}
