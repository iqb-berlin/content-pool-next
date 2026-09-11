import { MigrationInterface, QueryRunner } from "typeorm";

export class ReviewVisibilityGroups1789400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE acp_access_configs
      ADD COLUMN review_groups jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN review_config_version integer NOT NULL DEFAULT 1,
      ADD COLUMN review_revision bigint NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE comments ADD COLUMN group_id uuid`);
    await q.query(
      `CREATE INDEX "IDX_comments_group" ON comments(acp_id, group_id)`,
    );
    await this.installRevisionTrigger(q);
  }

  async installRevisionTrigger(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION bump_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE acp_access_configs SET review_revision = review_revision + 1
        WHERE acp_id = COALESCE(NEW.acp_id, OLD.acp_id);
        RETURN NULL;
      END $$`);
    await q.query(
      `DROP TRIGGER IF EXISTS comments_review_revision ON comments`,
    );
    await q.query(`CREATE TRIGGER comments_review_revision AFTER INSERT OR UPDATE OR DELETE
      ON comments FOR EACH ROW EXECUTE FUNCTION bump_review_revision()`);
  }
  async down(q: QueryRunner): Promise<void> {
    const used = await q.query(
      `SELECT 1 FROM comments WHERE group_id IS NOT NULL UNION ALL SELECT 1 FROM acp_access_configs WHERE jsonb_array_length(review_groups) > 0 LIMIT 1`,
    );
    if (used.length)
      throw new Error(
        "Review groups or group comments exist; rollback would lose visibility boundaries",
      );
    await q.query(`DROP TRIGGER comments_review_revision ON comments`);
    await q.query(`DROP FUNCTION bump_review_revision()`);
    await q.query(`ALTER TABLE comments DROP COLUMN group_id`);
    await q.query(`ALTER TABLE acp_access_configs DROP COLUMN review_groups,
      DROP COLUMN review_config_version, DROP COLUMN review_revision`);
  }
}
