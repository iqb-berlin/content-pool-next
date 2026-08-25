import { QueryRunner } from "typeorm";
import { AddCommentThreads1787600000000 } from "../migrations/1787600000000-AddCommentThreads";

describe("AddCommentThreads migration", () => {
  function captureQueries() {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query.replace(/\s+/g, " ").trim());
      }),
    } as unknown as QueryRunner;
    return { queries, queryRunner };
  }

  it("backfills display labels and timestamps without guessing stable ownership", async () => {
    const { queries, queryRunner } = captureQueries();

    await new AddCommentThreads1787600000000().up(queryRunner);

    expect(queries[0]).toContain(
      'ADD COLUMN IF NOT EXISTS "credential_id" uuid',
    );
    expect(queries[0]).toContain(
      'ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid',
    );
    expect(queries[1]).toContain('SET "updated_at" = "created_at"');
    expect(queries[3]).toContain(
      'SET "author_label" = COALESCE("author_label", "credential_username")',
    );
    expect(queries.join(" ")).not.toContain(
      'SET "credential_id" = credential."id"',
    );
    expect(queries.join(" ")).not.toContain(
      'c."credential_username" = credential."username"',
    );
    expect(
      queries.some((query) =>
        query.includes('CONSTRAINT "FK_comments_parent"'),
      ),
    ).toBe(true);
    expect(
      queries.some((query) => query.includes('"IDX_comments_item_target"')),
    ).toBe(true);
  });

  it("removes only the columns, indexes and constraints introduced here", async () => {
    const { queries, queryRunner } = captureQueries();

    await new AddCommentThreads1787600000000().down(queryRunner);

    expect(queries[0]).toContain('DROP INDEX IF EXISTS "IDX_comments_parent"');
    expect(queries[2]).toContain(
      'DROP CONSTRAINT IF EXISTS "FK_comments_parent"',
    );
    expect(queries[3]).toContain('DROP COLUMN IF EXISTS "deleted_at"');
    expect(queries[3]).not.toContain('DROP COLUMN IF EXISTS "comment_text"');
  });
});
