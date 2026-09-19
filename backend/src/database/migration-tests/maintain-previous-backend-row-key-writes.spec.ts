import { QueryRunner } from "typeorm";
import { MaintainPreviousBackendRowKeyWrites1784300000000 } from "../migrations/1784300000000-MaintainPreviousBackendRowKeyWrites";

describe("MaintainPreviousBackendRowKeyWrites migration", () => {
  it("fills row_key for writes from the previous backend", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query.replace(/\s+/g, " ").trim());
      }),
    } as unknown as QueryRunner;

    await new MaintainPreviousBackendRowKeyWrites1784300000000().up(
      queryRunner,
    );

    expect(queries[0]).toContain(
      'NEW."row_key" := NEW."unit_id" || \'::\' || NEW."item_id"',
    );
    expect(queries[2]).toContain("BEFORE INSERT OR UPDATE");
    expect(queries[2]).toContain(
      'EXECUTE FUNCTION "set_item_response_state_row_key"()',
    );
  });

  it("removes the compatibility trigger and function on explicit revert", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query.replace(/\s+/g, " ").trim());
      }),
    } as unknown as QueryRunner;

    await new MaintainPreviousBackendRowKeyWrites1784300000000().down(
      queryRunner,
    );

    expect(queries[0]).toContain("DROP TRIGGER IF EXISTS");
    expect(queries[1]).toContain("DROP FUNCTION IF EXISTS");
  });
});
