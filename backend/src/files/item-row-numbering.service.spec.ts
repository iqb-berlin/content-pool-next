import { NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { Acp, AcpItemRowNumber } from "../database/entities";
import {
  ItemRowNumberingService,
  NumberableItemRow,
} from "./item-row-numbering.service";

describe("ItemRowNumberingService", () => {
  let service: ItemRowNumberingService;
  let persisted: AcpItemRowNumber[];
  let acpExists: boolean;
  let repository: any;
  let transactionManager: any;
  let rootTransaction: jest.Mock;

  const row = (
    rowKey: string,
    unitId: string,
    itemId: string,
    subId?: string,
  ): NumberableItemRow => ({ rowKey, unitId, itemId, subId });
  const hash = (rowKey: string) =>
    crypto.createHash("sha256").update(rowKey, "utf8").digest("hex");

  beforeEach(() => {
    persisted = [];
    acpExists = true;
    repository = {
      find: jest.fn(async ({ where }: any) => {
        const requestedHashes = where.rowKeyHash?.value;
        const hashSet = Array.isArray(requestedHashes)
          ? new Set(requestedHashes)
          : null;
        return persisted.filter(
          (entry) =>
            entry.acpId === where.acpId &&
            (!hashSet || hashSet.has(entry.rowKeyHash)),
        );
      }),
      maximum: jest.fn(async (_column: string, { acpId }: any) =>
        persisted
          .filter((entry) => entry.acpId === acpId)
          .reduce<
            number | null
          >((maximum, entry) => (maximum === null ? entry.rowNumber : Math.max(maximum, entry.rowNumber)), null),
      ),
      create: jest.fn((entry: Partial<AcpItemRowNumber>) => ({
        id: `id-${entry.rowKey}`,
        ...entry,
      })),
      save: jest.fn(async (entries: AcpItemRowNumber[]) => {
        persisted.push(...entries);
        return entries;
      }),
      delete: jest.fn(async ({ acpId }: { acpId: string }) => {
        persisted = persisted.filter((entry) => entry.acpId !== acpId);
        return { affected: 1 };
      }),
    };
    const acpQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => (acpExists ? { id: "acp-1" } : null)),
    };
    transactionManager = {
      getRepository: jest.fn((entity) =>
        entity === Acp
          ? { createQueryBuilder: jest.fn(() => acpQueryBuilder) }
          : repository,
      ),
    };
    repository.manager = transactionManager;
    rootTransaction = jest.fn(async (work) => work(transactionManager));
    const rootRepository = {
      find: repository.find,
      maximum: repository.maximum,
      manager: {
        transaction: rootTransaction,
      },
    };
    service = new ItemRowNumberingService(rootRepository as any);
  });

  it("initially numbers rows by natural alphanumeric Item-ID and Sub-ID", async () => {
    const numbers = await service.assignNumbers("acp-1", [
      row("uuid-10", "UNIT_1", "ITEM_10"),
      row("uuid-2::2", "UNIT_1", "ITEM_2", "2"),
      row("uuid-2::1", "UNIT_1", "ITEM_2", "1"),
      row("uuid-1", "UNIT_1", "ITEM_1"),
    ]);

    expect(Array.from(numbers.entries())).toEqual([
      ["uuid-1", 1],
      ["uuid-2::1", 2],
      ["uuid-2::2", 3],
      ["uuid-10", 4],
    ]);
  });

  it("sorts globally by Item-ID before using Unit-ID as a tie-breaker", async () => {
    const numbers = await service.assignNumbers("acp-1", [
      row("unit-1-item-10", "UNIT_1", "ITEM_10"),
      row("unit-2-item-2", "UNIT_2", "ITEM_2"),
      row("unit-1-item-2", "UNIT_1", "ITEM_2"),
    ]);

    expect(Array.from(numbers.entries())).toEqual([
      ["unit-1-item-2", 1],
      ["unit-2-item-2", 2],
      ["unit-1-item-10", 3],
    ]);
  });

  it("returns existing assignments without taking the ACP write lock", async () => {
    persisted = [
      {
        id: "1",
        acpId: "acp-1",
        rowKey: "current",
        rowKeyHash: hash("current"),
        rowNumber: 4,
      } as AcpItemRowNumber,
    ];

    const numbers = await service.assignNumbers("acp-1", [
      row("current", "UNIT_1", "UNIT_1_ITEM_1"),
    ]);

    expect(numbers.get("current")).toBe(4);
    expect(rootTransaction).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("stores long row keys with a fixed-size hash identity", async () => {
    const longRowKey = `123e4567-e89b-12d3-a456-426614174000::${encodeURIComponent(
      "😀".repeat(39),
    )}`;

    expect(longRowKey.length).toBeGreaterThan(500);

    await service.assignNumbers("acp-1", [
      row(longRowKey, "UNIT_1", "ITEM_1", "😀".repeat(39)),
    ]);

    expect(persisted[0]).toEqual(
      expect.objectContaining({
        rowKey: longRowKey,
        rowKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("keeps deleted row numbers free and appends new rows above the previous maximum", async () => {
    persisted = [
      {
        id: "1",
        acpId: "acp-1",
        rowKey: "current",
        rowKeyHash: hash("current"),
        rowNumber: 1,
      } as AcpItemRowNumber,
      {
        id: "2",
        acpId: "acp-1",
        rowKey: "deleted",
        rowKeyHash: hash("deleted"),
        rowNumber: 2,
      } as AcpItemRowNumber,
      {
        id: "3",
        acpId: "acp-1",
        rowKey: "current-2",
        rowKeyHash: hash("current-2"),
        rowNumber: 4,
      } as AcpItemRowNumber,
    ];

    const numbers = await service.assignNumbers("acp-1", [
      row("current", "UNIT_1", "ITEM_1"),
      row("new", "UNIT_1", "ITEM_2"),
      row("current-2", "UNIT_1", "ITEM_3"),
    ]);

    expect(numbers.get("current")).toBe(1);
    expect(numbers.has("deleted")).toBe(false);
    expect(numbers.get("new")).toBe(5);
    expect(repository.maximum).toHaveBeenCalledWith("rowNumber", {
      acpId: "acp-1",
    });
  });

  it("assigns draft-only rows provisionally without persisting them", async () => {
    persisted = [
      {
        id: "1",
        acpId: "acp-1",
        rowKey: "current",
        rowKeyHash: hash("current"),
        rowNumber: 1,
      } as AcpItemRowNumber,
      {
        id: "2",
        acpId: "acp-1",
        rowKey: "deleted",
        rowKeyHash: hash("deleted"),
        rowNumber: 4,
      } as AcpItemRowNumber,
    ];

    const numbers = await service.assignProvisionalNumbers("acp-1", [
      row("current", "UNIT_1", "ITEM_1"),
      row("draft", "UNIT_1", "ITEM_2"),
    ]);

    expect(numbers.get("current")).toBe(1);
    expect(numbers.get("draft")).toBe(5);
    expect(repository.save).not.toHaveBeenCalled();
    expect(persisted.map((entry) => entry.rowKey)).toEqual([
      "current",
      "deleted",
    ]);
  });

  it("recalculates only current rows and closes previous gaps", async () => {
    persisted = [
      {
        id: "1",
        acpId: "acp-1",
        rowKey: "deleted",
        rowNumber: 2,
      } as AcpItemRowNumber,
      {
        id: "2",
        acpId: "acp-1",
        rowKey: "item-10",
        rowNumber: 8,
      } as AcpItemRowNumber,
    ];

    const numbers = await service.recalculateNumbers("acp-1", [
      row("item-10", "UNIT_1", "ITEM_10"),
      row("item-2", "UNIT_1", "ITEM_2"),
    ]);

    expect(Array.from(numbers.entries())).toEqual([
      ["item-2", 1],
      ["item-10", 2],
    ]);
    expect(persisted.map((entry) => entry.rowKey)).toEqual([
      "item-2",
      "item-10",
    ]);
  });

  it("reuses a caller transaction for atomic recalculation", async () => {
    await service.recalculateNumbers(
      "acp-1",
      [row("item-1", "UNIT_1", "ITEM_1")],
      transactionManager,
    );

    expect(rootTransaction).not.toHaveBeenCalled();
    expect(repository.delete).toHaveBeenCalledWith({ acpId: "acp-1" });
    expect(persisted[0]).toEqual(
      expect.objectContaining({ rowKey: "item-1", rowNumber: 1 }),
    );
  });

  it("validates the source snapshot after locking and before replacing rows", async () => {
    const validateBeforeReplace = jest.fn(async (manager) => {
      expect(manager).toBe(transactionManager);
    });

    await service.recalculateNumbers(
      "acp-1",
      [row("item-1", "UNIT_1", "ITEM_1")],
      transactionManager,
      validateBeforeReplace,
    );

    expect(validateBeforeReplace).toHaveBeenCalledTimes(1);
    expect(validateBeforeReplace.mock.invocationCallOrder[0]).toBeLessThan(
      repository.delete.mock.invocationCallOrder[0],
    );
  });

  it("fails without mutating numbering when the ACP does not exist", async () => {
    acpExists = false;

    await expect(
      service.assignNumbers("missing", [row("item", "UNIT_1", "ITEM_1")]),
    ).rejects.toThrow(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
