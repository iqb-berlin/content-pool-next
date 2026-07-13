import { DataSource, QueryRunner } from "typeorm";
import { prepareSchemaForSynchronization } from "./database-compatibility";

describe("prepareSchemaForSynchronization", () => {
  function createDataSource(hasItemResponseStates: boolean) {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      hasTable: jest.fn().mockResolvedValue(hasItemResponseStates),
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    return { dataSource, queryRunner };
  }

  it("does nothing for a fresh database before synchronize creates tables", async () => {
    const { dataSource, queryRunner } = createDataSource(false);

    await prepareSchemaForSynchronization(dataSource);

    expect(queryRunner.query).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("backfills the stable row key before synchronize enforces it", async () => {
    const { dataSource, queryRunner } = createDataSource(true);

    await prepareSchemaForSynchronization(dataSource);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([statement]) => statement as string,
    );
    expect(
      statements.some((statement) =>
        statement.includes('ADD COLUMN IF NOT EXISTS "row_key"'),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (statement) =>
          statement.includes('SET "row_key" = "unit_id"') &&
          !statement.includes('ALTER COLUMN "row_key" SET NOT NULL'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('ALTER COLUMN "row_key" SET NOT NULL'),
      ),
    ).toBe(true);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it("reconciles existing item explorer state before synchronization", async () => {
    const { dataSource, queryRunner } = createDataSource(false);
    (queryRunner.hasTable as jest.Mock).mockImplementation(
      async (table: string) =>
        table === "acp" || table === "acp_item_explorer_state",
    );

    await prepareSchemaForSynchronization(dataSource);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "acp_item_explorer_state" state'),
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
