import { MigrationInterface, QueryRunner } from "typeorm";

export class CommentVotes1789500000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE comment_votes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id uuid NOT NULL CONSTRAINT "FK_comment_votes_comment" REFERENCES comments(id) ON DELETE CASCADE,
      user_id uuid, credential_id uuid, value varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_comment_votes_identity" CHECK ((user_id IS NOT NULL) <> (credential_id IS NOT NULL)),
      CONSTRAINT "CHK_comment_votes_value" CHECK (value IN ('UP', 'DOWN'))
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_comment_votes_user" ON comment_votes(comment_id, user_id) WHERE user_id IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_comment_votes_credential" ON comment_votes(comment_id, credential_id) WHERE credential_id IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX "IDX_comment_votes_comment" ON comment_votes(comment_id)`,
    );
    await this.installTriggers(q);
  }
  async installTriggers(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION bump_vote_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE acp_access_configs SET review_revision = review_revision + 1
        WHERE acp_id = (SELECT acp_id FROM comments WHERE id = COALESCE(NEW.comment_id, OLD.comment_id));
        RETURN NULL;
      END $$`);
    await q.query(
      `DROP TRIGGER IF EXISTS votes_review_revision ON comment_votes`,
    );
    await q.query(`CREATE TRIGGER votes_review_revision AFTER INSERT OR UPDATE OR DELETE ON comment_votes
      FOR EACH ROW EXECUTE FUNCTION bump_vote_review_revision()`);
    await q.query(`CREATE OR REPLACE FUNCTION delete_removed_comment_votes() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.deleted_at IS NOT NULL THEN DELETE FROM comment_votes WHERE comment_id = NEW.id; END IF;
        RETURN NULL;
      END $$`);
    await q.query(`DROP TRIGGER IF EXISTS comments_delete_votes ON comments`);
    await q.query(`CREATE TRIGGER comments_delete_votes AFTER UPDATE OF deleted_at ON comments
      FOR EACH ROW EXECUTE FUNCTION delete_removed_comment_votes()`);
  }
  async down(q: QueryRunner): Promise<void> {
    if ((await q.query(`SELECT 1 FROM comment_votes LIMIT 1`)).length)
      throw new Error("Votes exist; rollback would lose review data");
    await q.query(`DROP TRIGGER comments_delete_votes ON comments`);
    await q.query(`DROP FUNCTION delete_removed_comment_votes()`);
    await q.query(`DROP TABLE comment_votes`);
    await q.query(`DROP FUNCTION bump_vote_review_revision()`);
  }
}
