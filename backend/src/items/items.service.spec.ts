import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ItemsService } from "./items.service";
import { AccessModel } from "../database/entities";

describe("ItemsService", () => {
  let service: ItemsService;
  let acpRepository: { findOne: jest.Mock; save: jest.Mock };
  let accessConfigRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let unitParserService: { getItemListFromFiles: jest.Mock };

  beforeEach(() => {
    acpRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (value) => value),
    };

    accessConfigRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };

    unitParserService = {
      getItemListFromFiles: jest.fn(),
    };

    service = new ItemsService(
      acpRepository as any,
      accessConfigRepository as any,
      unitParserService as any,
    );
  });

  it("returns an empty item list when ACP does not exist", async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(service.getItems("acp-1")).resolves.toEqual([]);
  });

  it("extracts items and applies prefixes, fallback names and item properties", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      acpIndex: {
        assessmentParts: [
          {
            units: [
              {
                id: "unit-1",
                name: "Unit One",
                items: [
                  {
                    id: "item-1",
                    name: "Item One",
                    sourceVariable: "v1",
                    metadata: { scale: "A" },
                  },
                ],
              },
              {
                id: "unit-2",
                name: "Unit Two",
                items: [
                  {
                    id: "item-2",
                    useUnitAliasAsPrefix: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      itemProperties: {
        "unit-1_item-1": { empiricalDifficulty: 0.5, tags: ["alpha", "beta"] },
        "item-2": { tags: "not-array" },
      },
    });

    const items = await service.getItems("acp-1");

    expect(items).toEqual([
      {
        itemId: "unit-1_item-1",
        unitId: "unit-1",
        unitName: "Unit One",
        name: "Item One",
        sourceVariable: "v1",
        metadata: { scale: "A" },
        empiricalDifficulty: 0.5,
        tags: ["alpha", "beta"],
      },
      {
        itemId: "item-2",
        unitId: "unit-2",
        unitName: "Unit Two",
        name: "item-2",
        sourceVariable: undefined,
        metadata: undefined,
        empiricalDifficulty: undefined,
        tags: [],
      },
    ]);
  });

  it("returns item details by id and null for unknown items", async () => {
    jest
      .spyOn(service, "getItems")
      .mockResolvedValue([
        { itemId: "item-1" } as any,
        { itemId: "item-2" } as any,
      ]);

    await expect(service.getItem("acp-1", "item-2")).resolves.toEqual({
      itemId: "item-2",
    });
    await expect(service.getItem("acp-1", "missing")).resolves.toBeNull();
  });

  it("filters and sorts items", async () => {
    jest
      .spyOn(service, "getItems")
      .mockResolvedValue([
        { itemId: "b-2", name: "Beta", unitId: "u-2" } as any,
        { itemId: "a-1", name: "Alpha", unitId: "u-1" } as any,
        { itemId: "x-1", name: "Other", unitId: "math" } as any,
      ]);

    const filtered = await service.getFilteredItems(
      "acp-1",
      "u-",
      "itemId",
      "desc",
    );
    expect(filtered.map((i) => i.itemId)).toEqual(["b-2", "a-1"]);

    const sortedAsc = await service.getFilteredItems(
      "acp-1",
      undefined,
      "name",
      "asc",
    );
    expect(sortedAsc.map((i) => i.name)).toEqual(["Alpha", "Beta", "Other"]);
  });

  it("rejects empirical difficulty upload for missing ACP", async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(
      service.uploadEmpiricalDifficulties(
        "acp-1",
        Buffer.from("item;est\na;1"),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns no updates when CSV has no data rows", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {},
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({ items: [] });

    const result = await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from("item;est"),
    );

    expect(result).toEqual({ updated: 0, failed: [] });
  });

  it("validates required CSV headers", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {},
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({ items: [] });

    await expect(
      service.uploadEmpiricalDifficulties(
        "acp-1",
        Buffer.from("wrong;headers\na;1"),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("updates matched empirical difficulties and collects unmatched rows", async () => {
    const acp = {
      id: "acp-1",
      itemProperties: {
        existing: { unchanged: true },
      },
    };
    acpRepository.findOne.mockResolvedValue(acp);

    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "Unit Label",
        },
      ],
    });

    const csv = [
      "item;est",
      "UnitLabelI1;0,75",
      "unknown-item;0.2",
      "invalid;not-a-number",
      "",
    ].join("\n");

    const result = await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from(csv),
    );

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([
      { csvRow: "unknown-item", reason: "Kein passendes Item gefunden" },
    ]);
    expect(result.successes).toEqual([
      {
        itemId: "I-1",
        unitId: "U-1",
        rowKey: "uuid-1",
        affectedRowKeys: ["uuid-1"],
        subId: undefined,
        value: 0.75,
      },
    ]);
    expect(result.nextItemProperties).toEqual({
      existing: { unchanged: true },
      "uuid-1": { empiricalDifficulty: 0.75 },
    });

    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemProperties: {
          existing: { unchanged: true },
          "uuid-1": { empiricalDifficulty: 0.75 },
        },
      }),
    );
  });

  it("throws a bad request when one item appears multiple times in CSV", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {},
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    const csv = ["item;est", "I1;0.2", "I1;0.3"].join("\n");

    await expect(
      service.uploadEmpiricalDifficulties("acp-1", Buffer.from(csv)),
    ).rejects.toThrow(BadRequestException);
  });

  it("imports multiple partial-credit rows for the same item by second-column Sub-ID", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {},
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    const csv = ["item;category;est", "I1;1;0.2", 'I1;"2";0.8'].join("\n");
    const result = await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from(csv),
    );

    expect(result.updated).toBe(2);
    expect(result.nextItemProperties).toEqual({
      "uuid-1::1": {
        itemUuid: "uuid-1",
        subId: "1",
        empiricalDifficulty: 0.2,
      },
      "uuid-1::2": {
        itemUuid: "uuid-1",
        subId: "2",
        empiricalDifficulty: 0.8,
      },
    });
    expect(result.successes).toEqual([
      expect.objectContaining({
        rowKey: "uuid-1::1",
        affectedRowKeys: ["uuid-1::1"],
        subId: "1",
        value: 0.2,
      }),
      expect.objectContaining({
        rowKey: "uuid-1::2",
        affectedRowKeys: ["uuid-1::2"],
        subId: "2",
        value: 0.8,
      }),
    ]);
  });

  it("applies a standard difficulty to existing partial-credit rows without discarding their properties", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {
        "uuid-1": { tags: ["base"], empiricalDifficulty: 0.1 },
        "uuid-1::1": {
          itemUuid: "uuid-1",
          subId: "1",
          empiricalDifficulty: 0.2,
          tags: ["partial"],
          excluded: true,
        },
        "uuid-1::2": {
          itemUuid: "uuid-1",
          subId: "2",
          empiricalDifficulty: 0.8,
          previewTargetId: "score-2",
        },
        unrelated: { unchanged: true },
      },
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    const result = await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from("item;est\nI1;0.5"),
    );

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { tags: ["base"] },
      "uuid-1::1": {
        itemUuid: "uuid-1",
        subId: "1",
        empiricalDifficulty: 0.5,
        tags: ["partial"],
        excluded: true,
      },
      "uuid-1::2": {
        itemUuid: "uuid-1",
        subId: "2",
        empiricalDifficulty: 0.5,
        previewTargetId: "score-2",
      },
      unrelated: { unchanged: true },
    });
    expect(result.successes).toEqual([
      {
        itemId: "I-1",
        unitId: "U-1",
        affectedRowKeys: ["uuid-1::1", "uuid-1::2"],
        subId: undefined,
        value: 0.5,
      },
    ]);
  });

  it("removes a hidden standard difficulty when importing partial-credit rows", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {
        "uuid-1": { tags: ["base"], empiricalDifficulty: 0.5 },
      },
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    const result = await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from("item;level;est\nI1;1;0.2\nI1;2;0.8"),
    );

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { tags: ["base"] },
      "uuid-1::1": {
        itemUuid: "uuid-1",
        subId: "1",
        empiricalDifficulty: 0.2,
      },
      "uuid-1::2": {
        itemUuid: "uuid-1",
        subId: "2",
        empiricalDifficulty: 0.8,
      },
    });
  });

  it("rejects mixing standard and partial-credit rows for one item", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {},
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    await expect(
      service.uploadEmpiricalDifficulties(
        "acp-1",
        Buffer.from("item;level;est\nI1;;0.5\nI1;1;0.2"),
      ),
    ).rejects.toThrow(/sowohl mit als auch ohne Sub-ID/);

    expect(acpRepository.save).not.toHaveBeenCalled();
  });

  it("supports dry-run upload mode without persistence", async () => {
    const acp = { id: "acp-1", itemProperties: {} };
    acpRepository.findOne.mockResolvedValue(acp);
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          uuid: "uuid-1",
          itemId: "I-1",
          unitId: "U-1",
          unitLabel: "U1",
        },
      ],
    });

    await service.uploadEmpiricalDifficulties(
      "acp-1",
      Buffer.from("item;est\nI1;0.2"),
      { persist: false },
    );

    expect(acpRepository.save).not.toHaveBeenCalled();
  });

  it("enables the empirical difficulty filter when it is not configured yet", async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      acpId: "acp-1",
      accessModel: AccessModel.PUBLIC,
      allowRegistered: false,
      featureConfig: {
        enableItemList: true,
      },
    });

    await expect(
      service.ensureShowOnlyItemsWithEmpiricalDifficulty("acp-1"),
    ).resolves.toBe(true);

    expect(accessConfigRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          enableItemList: true,
          showOnlyItemsWithEmpiricalDifficulty: true,
        }),
      }),
    );
  });

  it("preserves an explicit opt-out for the empirical difficulty filter", async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      acpId: "acp-1",
      accessModel: AccessModel.PUBLIC,
      allowRegistered: false,
      featureConfig: {
        showOnlyItemsWithEmpiricalDifficulty: false,
      },
    });

    await expect(
      service.ensureShowOnlyItemsWithEmpiricalDifficulty("acp-1"),
    ).resolves.toBe(false);

    expect(accessConfigRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          showOnlyItemsWithEmpiricalDifficulty: false,
          enablePlayerFocusHighlight: false,
        }),
      }),
    );
  });

  it("creates a default private access config when enabling the empirical difficulty filter", async () => {
    accessConfigRepository.findOne.mockResolvedValue(null);

    await expect(
      service.ensureShowOnlyItemsWithEmpiricalDifficulty("acp-1"),
    ).resolves.toBe(true);

    expect(accessConfigRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        acpId: "acp-1",
        accessModel: AccessModel.PRIVATE,
        allowRegistered: false,
        featureConfig: expect.objectContaining({
          showOnlyItemsWithEmpiricalDifficulty: true,
        }),
      }),
    );
    expect(accessConfigRepository.save).toHaveBeenCalled();
  });

  it("rejects clearing empirical difficulties for missing ACP", async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(service.clearEmpiricalDifficulties("acp-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("clears empirical difficulties and persists when changed", async () => {
    const acp = {
      id: "acp-1",
      itemProperties: {
        itemA: { empiricalDifficulty: 0.4, tags: ["x"] },
        itemB: { tags: ["y"] },
      },
    };
    acpRepository.findOne.mockResolvedValue(acp);

    const result = await service.clearEmpiricalDifficulties("acp-1");

    expect(result).toEqual({
      success: true,
      nextItemProperties: {
        itemA: { tags: ["x"] },
        itemB: { tags: ["y"] },
      },
    });
    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemProperties: {
          itemA: { tags: ["x"] },
          itemB: { tags: ["y"] },
        },
      }),
    );
  });

  it("supports dry-run clear mode without persistence", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      itemProperties: {
        itemA: { empiricalDifficulty: 0.4 },
      },
    });

    await service.clearEmpiricalDifficulties("acp-1", { persist: false });

    expect(acpRepository.save).not.toHaveBeenCalled();
  });

  it("returns normalized item tag map and throws when ACP is missing", async () => {
    acpRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.getItemTags("acp-1")).rejects.toThrow(
      NotFoundException,
    );

    acpRepository.findOne.mockResolvedValueOnce({
      id: "acp-1",
      itemProperties: {
        itemA: { tags: ["tag-a", " tag-a ", "tag-b", ""] },
        itemB: { tags: [] },
        itemC: { tags: "invalid" },
      },
    });

    await expect(service.getItemTags("acp-1")).resolves.toEqual({
      itemA: ["tag-a", "tag-b"],
    });
  });

  it("checks tag feature switch in ACP access config", async () => {
    accessConfigRepository.findOne.mockResolvedValueOnce({
      featureConfig: { enableItemListTags: true },
    });
    await expect(service.canUseItemTags("acp-1")).resolves.toBe(true);

    accessConfigRepository.findOne.mockResolvedValueOnce({
      featureConfig: { enableItemListTags: 0 },
    });
    await expect(service.canUseItemTags("acp-1")).resolves.toBe(false);

    accessConfigRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.canUseItemTags("acp-1")).resolves.toBe(false);
  });

  it("saves normalized tags and replaces previous tag state", async () => {
    acpRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.saveItemTags("acp-1", {})).rejects.toThrow(
      NotFoundException,
    );

    const acp = {
      id: "acp-1",
      itemProperties: {
        itemA: { tags: ["old"], empiricalDifficulty: 0.4 },
        itemB: { tags: ["to-remove"] },
      },
    };
    acpRepository.findOne.mockResolvedValueOnce(acp);

    const saved = await service.saveItemTags("acp-1", {
      itemA: ["new", "new", "  keep  "],
      itemB: [],
      "   ": ["invalid-key"],
      itemC: ["fresh"],
    });

    expect(saved).toEqual({
      itemA: ["new", "keep"],
      itemC: ["fresh"],
    });

    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemProperties: {
          itemA: { empiricalDifficulty: 0.4, tags: ["new", "keep"] },
          itemB: {},
          itemC: { tags: ["fresh"] },
        },
      }),
    );
  });
});
