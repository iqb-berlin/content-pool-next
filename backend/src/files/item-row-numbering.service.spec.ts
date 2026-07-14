import { NotFoundException } from "@nestjs/common";
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

  const row = (
    rowKey: string,
    unitId: string,
    itemId: string,
    subId?: string,
  ): NumberableItemRow => ({ rowKey, unitId, itemId, subId });

  beforeEach(() => {
    persisted = [];
    acpExists = true;
    repository = {
      find: jest.fn(async ({ where }: any) =>
        persisted
          .filter((entry) => entry.acpId === where.acpId)
          .sort((left, right) => left.rowNumber - right.rowNumber),
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
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === Acp
          ? { createQueryBuilder: jest.fn(() => acpQueryBuilder) }
          : repository,
      ),
    };
    const rootRepository = {
      manager: {
        transaction: jest.fn(async (work) => work(manager)),
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

  it("sorts by Item-ID before using the Unit-ID as a tie-breaker", async () => {
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

  it("keeps deleted row numbers free and appends new rows above the previous maximum", async () => {
    persisted = [
      {
        id: "1",
        acpId: "acp-1",
        rowKey: "current",
        rowNumber: 1,
      } as AcpItemRowNumber,
      {
        id: "2",
        acpId: "acp-1",
        rowKey: "deleted",
        rowNumber: 2,
      } as AcpItemRowNumber,
      {
        id: "3",
        acpId: "acp-1",
        rowKey: "current-2",
        rowNumber: 4,
      } as AcpItemRowNumber,
    ];

    const numbers = await service.assignNumbers("acp-1", [
      row("current", "UNIT_1", "ITEM_1"),
      row("new", "UNIT_1", "ITEM_2"),
      row("current-2", "UNIT_1", "ITEM_3"),
    ]);

    expect(numbers.get("current")).toBe(1);
    expect(numbers.has("deleted")).toBe(true);
    expect(numbers.get("new")).toBe(5);
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

  it("fails without mutating numbering when the ACP does not exist", async () => {
    acpExists = false;

    await expect(
      service.assignNumbers("missing", [row("item", "UNIT_1", "ITEM_1")]),
    ).rejects.toThrow(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
