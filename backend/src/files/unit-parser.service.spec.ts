import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as fs from "fs/promises";
import { UnitParserService } from "./unit-parser.service";
import { Acp, AcpAccessConfig, AcpFile } from "../database/entities";
import { ItemRowNumberingService } from "./item-row-numbering.service";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));

describe("UnitParserService", () => {
  let service: UnitParserService;
  let fileRepo: any;
  let acpRepo: any;
  let accessConfigRepo: any;
  let itemRowNumberingService: any;
  let itemExplorerStateService: any;

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Unit>
  <Id>u1</Id>
  <Label>Unit 1</Label>
  <Description>Beschreibung U1</Description>
  <DefinitionRef player="iqb-player-aspect@2.11">u1.voud</DefinitionRef>
  <CodingSchemeRef>u1.vocs</CodingSchemeRef>
  <Reference>u1.vomd</Reference>
</Unit>`;

  const vomdContent = JSON.stringify({
    profiles: [],
    items: [
      {
        id: "i1",
        description: "Item 1",
        variableId: "V1",
        useUnitAliasAsPrefix: true,
        profiles: [
          {
            entries: [
              {
                id: "format",
                label: [{ lang: "de", value: "Format" }],
                valueAsText: [{ lang: "de", value: "MC" }],
              },
            ],
          },
        ],
      },
    ],
  });

  const files: Partial<AcpFile>[] = [
    {
      id: "f-xml",
      acpId: "acp-1",
      originalName: "u1.xml",
      filePath: "/tmp/u1.xml",
    },
    {
      id: "f-voud",
      acpId: "acp-1",
      originalName: "u1.voud",
      filePath: "/tmp/u1.voud",
    },
    {
      id: "f-vocs",
      acpId: "acp-1",
      originalName: "u1.vocs",
      filePath: "/tmp/u1.vocs",
    },
    {
      id: "f-vomd",
      acpId: "acp-1",
      originalName: "u1.vomd",
      filePath: "/tmp/u1.vomd",
    },
    {
      id: "f-player",
      acpId: "acp-1",
      originalName: "iqb-player-aspect-2.11.6.html",
      filePath: "/tmp/player.html",
    },
  ];

  beforeEach(async () => {
    const lockedFileQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(files),
    };
    fileRepo = {
      find: jest.fn().mockResolvedValue(files),
      createQueryBuilder: jest.fn(() => lockedFileQueryBuilder),
    };

    acpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "acp-1",
        acpIndex: {
          packageId: "pkg-1",
          version: "0.5.0",
          assessmentParts: [],
        },
      }),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    accessConfigRepo = {
      findOne: jest.fn().mockResolvedValue({
        acpId: "acp-1",
        featureConfig: {},
      }),
    };
    itemRowNumberingService = {
      hasAssignedNumbers: jest.fn().mockResolvedValue(true),
      assignNumbers: jest.fn(
        async (_acpId: string, rows: any[]) =>
          new Map(rows.map((row, index) => [row.rowKey, index + 1])),
      ),
      recalculateNumbers: jest.fn(
        async (
          _acpId: string,
          rows: any[],
          manager: any,
          validateBeforeReplace?: (lockedManager: any) => Promise<void>,
        ) => {
          await validateBeforeReplace?.(manager);
          return new Map(rows.map((row, index) => [row.rowKey, index + 1]));
        },
      ),
    };
    itemExplorerStateService = {
      getStateForViewer: jest.fn().mockResolvedValue({
        publishedState: { itemProperties: {} },
      }),
      getCleanPublishedState: jest.fn().mockResolvedValue({
        status: "CLEAN",
        publishedVersion: 7,
        publishedState: { itemProperties: {} },
      }),
      runWithLockedCleanState: jest.fn(
        async (_acpId: string, operation: (state: any, manager: any) => any) =>
          operation(
            {
              status: "CLEAN",
              publishedVersion: 7,
              publishedState: { itemProperties: {} },
            },
            {
              id: "transaction-manager",
              getRepository: jest.fn(() => fileRepo),
            },
          ),
      ),
    };

    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return vomdContent;
      return "";
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitParserService,
        { provide: getRepositoryToken(AcpFile), useValue: fileRepo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        {
          provide: getRepositoryToken(AcpAccessConfig),
          useValue: accessConfigRepo,
        },
        { provide: ItemRowNumberingService, useValue: itemRowNumberingService },
        {
          provide: ItemExplorerStateService,
          useValue: itemExplorerStateService,
        },
      ],
    }).compile();

    service = module.get<UnitParserService>(UnitParserService);
  });

  it("syncs units and items from uploaded files into ACP index", async () => {
    const report = await service.syncIndexFromFiles("acp-1");

    expect(report.unitsAdded).toBe(1);
    expect(report.itemsAdded).toBe(1);
    expect(report.warnings).toEqual([]);
    expect(acpRepo.save).toHaveBeenCalledTimes(1);

    const saved = acpRepo.save.mock.calls[0][0];
    const units = saved.acpIndex.assessmentParts[0].units;
    expect(units).toHaveLength(1);
    expect(units[0].id).toBe("u1");
    expect(units[0].dependencies).toEqual(
      expect.arrayContaining([
        { id: "u1.voud", type: "UNIT_DEFINITION" },
        { id: "u1.vocs", type: "CODING_SCHEME" },
        { id: "u1.vomd", type: "METADATA" },
        { id: "iqb-player-aspect-2.11.6.html", type: "PLAYER" },
      ]),
    );
    expect(units[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "i1",
          name: "Item 1",
          sourceVariable: "V1",
        }),
      ]),
    );
  });

  it("preserves existing manual unit fields when syncing", async () => {
    acpRepo.findOne.mockResolvedValueOnce({
      id: "acp-1",
      acpIndex: {
        packageId: "pkg-1",
        version: "0.5.0",
        assessmentParts: [
          {
            id: "part-1",
            units: [
              {
                id: "u1",
                name: "Manueller Name",
                items: [],
                dependencies: [],
              },
            ],
          },
        ],
      },
    });

    await service.syncIndexFromFiles("acp-1");
    const saved = acpRepo.save.mock.calls[0][0];
    const unit = saved.acpIndex.assessmentParts[0].units[0];
    expect(unit.name).toBe("Manueller Name");
    expect(unit.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "i1" })]),
    );
  });

  it("prunes dependencies that reference deleted files", async () => {
    fileRepo.find.mockResolvedValueOnce([
      {
        id: "f-voud",
        acpId: "acp-1",
        originalName: "u1.voud",
        filePath: "/tmp/u1.voud",
      },
      {
        id: "f-player",
        acpId: "acp-1",
        originalName: "iqb-player-aspect-2.11.6.html",
        filePath: "/tmp/player.html",
      },
    ]);

    acpRepo.findOne.mockResolvedValueOnce({
      id: "acp-1",
      acpIndex: {
        packageId: "pkg-1",
        version: "0.5.0",
        assessmentParts: [
          {
            id: "part-1",
            units: [
              {
                id: "u1",
                name: "Unit 1",
                dependencies: [
                  { id: "u1.voud", type: "UNIT_DEFINITION" },
                  { id: "u1.vocs", type: "CODING_SCHEME" },
                  { id: "u1.vomd", type: "METADATA" },
                  { id: "iqb-player-aspect-2.11.6.html", type: "PLAYER" },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = await service.pruneMissingDependencies("acp-1");

    expect(result.dependenciesRemoved).toBe(2);
    expect(result.unitsUpdated).toBe(1);
    expect(result.indexUpdated).toBe(true);
    expect(acpRepo.save).toHaveBeenCalledTimes(1);

    const saved = acpRepo.save.mock.calls[0][0];
    expect(saved.acpIndex.assessmentParts[0].units[0].dependencies).toEqual([
      { id: "u1.voud", type: "UNIT_DEFINITION" },
      { id: "iqb-player-aspect-2.11.6.html", type: "PLAYER" },
    ]);
  });

  it("removes stale booklet definitionId references when file is deleted", async () => {
    fileRepo.find.mockResolvedValueOnce([
      {
        id: "f-voud",
        acpId: "acp-1",
        originalName: "u1.voud",
        filePath: "/tmp/u1.voud",
      },
    ]);

    acpRepo.findOne.mockResolvedValueOnce({
      id: "acp-1",
      acpIndex: {
        packageId: "pkg-1",
        version: "0.5.0",
        assessmentParts: [
          {
            id: "part-1",
            units: [],
            instruments: [
              {
                id: "instrument-1",
                testcenterBooklet: [
                  {
                    id: "booklet-1",
                    definitionId: "booklet-1.xml",
                    modules: ["module-1"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = await service.pruneMissingDependencies("acp-1");

    expect(result.bookletsUpdated).toBe(1);
    expect(result.bookletDefinitionsRemoved).toBe(1);
    expect(result.indexUpdated).toBe(true);
    expect(acpRepo.save).toHaveBeenCalledTimes(1);

    const saved = acpRepo.save.mock.calls[0][0];
    expect(
      saved.acpIndex.assessmentParts[0].instruments[0].testcenterBooklet[0],
    ).toEqual({
      id: "booklet-1",
      modules: ["module-1"],
    });
  });

  it("prunes stale dependencies during sync even when no unit XML exists", async () => {
    fileRepo.find.mockResolvedValueOnce([
      {
        id: "f-player",
        acpId: "acp-1",
        originalName: "iqb-player-aspect-2.11.6.html",
        filePath: "/tmp/player.html",
      },
    ]);

    acpRepo.findOne.mockResolvedValueOnce({
      id: "acp-1",
      acpIndex: {
        packageId: "pkg-1",
        version: "0.5.0",
        assessmentParts: [
          {
            id: "part-1",
            units: [
              {
                id: "stale-unit",
                name: "Stale Unit",
                dependencies: [
                  { id: "stale-unit.voud", type: "UNIT_DEFINITION" },
                  { id: "stale-unit.vocs", type: "CODING_SCHEME" },
                ],
                items: [],
              },
            ],
          },
        ],
      },
    });

    const report = await service.syncIndexFromFiles("acp-1");

    expect(report.unitsUpdated).toBe(0);
    expect(acpRepo.save).toHaveBeenCalledTimes(1);
    const saved = acpRepo.save.mock.calls[0][0];
    expect(saved.acpIndex.assessmentParts[0].units[0].dependencies).toEqual([]);
  });

  it("uses sourceVariable as fallback when variableId is missing in VOMD items", async () => {
    const vomdWithSourceVariable = JSON.stringify({
      profiles: [],
      items: [
        {
          id: "i2",
          description: "Item 2",
          sourceVariable: "SRC_VAR_2",
          profiles: [],
        },
      ],
    });

    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return vomdWithSourceVariable;
      if (path === "/tmp/u1.vocs") return "{}";
      return "";
    });

    const result = await service.getItemListFromFiles("acp-1");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        itemId: "i2",
        variableId: "SRC_VAR_2",
        sourceVariable: "SRC_VAR_2",
      }),
    );
  });

  it("numbers prefixed items by their resolved Item-ID", async () => {
    const result = await service.getItemListFromFiles("acp-1");

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [
        expect.objectContaining({
          itemId: "u1_i1",
          rowKey: "u1_i1",
          unitId: "u1",
        }),
      ],
    );
    expect(result.items[0]).not.toHaveProperty("numberingItemId");
  });

  it("keeps an unprefixed Item-ID as the numbering sort key", async () => {
    const unprefixedVomdContent = JSON.stringify({
      profiles: [],
      items: [
        {
          id: "i1",
          description: "Item 1",
          variableId: "V1",
          useUnitAliasAsPrefix: false,
          profiles: [],
        },
      ],
    });
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return unprefixedVomdContent;
      return "";
    });

    await service.getItemListFromFiles("acp-1");

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [expect.objectContaining({ itemId: "i1", rowKey: "u1_i1" })],
    );
  });

  it("merges item properties across legacy, resolved and UUID aliases", async () => {
    const vomdWithUuid = JSON.stringify({
      profiles: [],
      items: [
        {
          id: "i1",
          uuid: "uuid-1",
          description: "Item 1",
          variableId: "V1",
          useUnitAliasAsPrefix: true,
          profiles: [],
        },
      ],
    });

    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return vomdWithUuid;
      return "";
    });

    const result = await service.getItemListFromFiles("acp-1", {
      itemPropertiesOverride: {
        i1: { tags: ["legacy"], empiricalDifficulty: 0.25 },
        u1_i1: { tags: ["resolved"] },
        "uuid-1": { empiricalDifficulty: 0.75 },
      },
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        uuid: "uuid-1",
        rowKey: "uuid-1",
        empiricalDifficulty: 0.75,
        tags: ["resolved"],
      }),
    ]);
  });

  it("expands one VOMD item into labeled partial-credit rows", async () => {
    accessConfigRepo.findOne.mockResolvedValueOnce({
      acpId: "acp-1",
      featureConfig: {
        itemSubIdLabel: "Kategorie",
        itemSubIdLabels: {
          "1": "teilweise richtig",
          "2": "vollständig richtig",
        },
      },
    });

    const result = await service.getItemListFromFiles("acp-1", {
      itemPropertiesOverride: {
        "u1_i1::1": {
          itemUuid: "u1_i1",
          subId: "1",
          empiricalDifficulty: 0,
        },
        "u1_i1::2": {
          itemUuid: "u1_i1",
          subId: "2",
          empiricalDifficulty: 0.75,
        },
      },
    });

    expect(result.subIdLabel).toBe("Kategorie");
    expect(result.items).toEqual([
      expect.objectContaining({
        uuid: "u1_i1",
        rowKey: "u1_i1::1",
        subId: "1",
        subIdDisplay: "teilweise richtig",
        empiricalDifficulty: 0,
      }),
      expect.objectContaining({
        uuid: "u1_i1",
        rowKey: "u1_i1::2",
        subId: "2",
        subIdDisplay: "vollständig richtig",
        empiricalDifficulty: 0.75,
      }),
    ]);
  });

  it("parses published rows before taking the short recalculation lock", async () => {
    const result = await service.recalculatePublishedItemRowNumbers("acp-1");

    expect(
      itemExplorerStateService.getCleanPublishedState,
    ).toHaveBeenCalledWith("acp-1");
    expect(
      itemExplorerStateService.runWithLockedCleanState,
    ).toHaveBeenCalledWith("acp-1", expect.any(Function), 7);
    expect((fs.readFile as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      itemExplorerStateService.runWithLockedCleanState.mock
        .invocationCallOrder[0],
    );
    expect(itemRowNumberingService.recalculateNumbers).toHaveBeenCalledWith(
      "acp-1",
      [expect.objectContaining({ itemId: "u1_i1", rowKey: "u1_i1" })],
      expect.objectContaining({ id: "transaction-manager" }),
      expect.any(Function),
    );
    expect(result).toEqual({ renumberedCount: 1 });
  });

  it("rejects recalculation when the source file snapshot changed", async () => {
    const changedFiles = [
      ...files,
      {
        id: "f-new",
        acpId: "acp-1",
        originalName: "u2.xml",
        filePath: "/tmp/u2.xml",
      },
    ];
    fileRepo.createQueryBuilder().getMany.mockResolvedValueOnce(changedFiles);

    await expect(
      service.recalculatePublishedItemRowNumbers("acp-1"),
    ).rejects.toThrow(ConflictException);
  });

  it("initializes numbering from published rows before adding draft-only rows", async () => {
    const assignedNumbers = new Map<string, number>();
    itemRowNumberingService.hasAssignedNumbers.mockResolvedValueOnce(false);
    itemExplorerStateService.getStateForViewer.mockResolvedValueOnce({
      publishedState: {
        itemProperties: {
          "u1_i1::1": { itemUuid: "u1_i1", subId: "1" },
        },
      },
    });
    itemRowNumberingService.assignNumbers.mockImplementation(
      async (_acpId: string, rows: any[]) => {
        for (const row of rows) {
          if (!assignedNumbers.has(row.rowKey)) {
            assignedNumbers.set(row.rowKey, assignedNumbers.size + 1);
          }
        }
        return new Map(assignedNumbers);
      },
    );

    const result = await service.getItemListFromFiles("acp-1", {
      itemPropertiesOverride: {
        "u1_i1::2": { itemUuid: "u1_i1", subId: "2" },
      },
    });

    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith(
      "acp-1",
      false,
    );
    expect(itemRowNumberingService.assignNumbers).toHaveBeenNthCalledWith(
      1,
      "acp-1",
      [expect.objectContaining({ rowKey: "u1_i1::1" })],
    );
    expect(itemRowNumberingService.assignNumbers).toHaveBeenNthCalledWith(
      2,
      "acp-1",
      [expect.objectContaining({ rowKey: "u1_i1::2" })],
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ rowKey: "u1_i1::2", rowNumber: 2 }),
    );
  });

  it("does not recursively initialize numbering for an empty item list", async () => {
    fileRepo.find.mockResolvedValueOnce([]);
    itemRowNumberingService.hasAssignedNumbers.mockResolvedValueOnce(false);

    const result = await service.getItemListFromFiles("acp-1");

    expect(result.items).toEqual([]);
    expect(itemExplorerStateService.getStateForViewer).not.toHaveBeenCalled();
    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [],
    );
  });

  it("caches valid row keys and invalidates them when source files change", async () => {
    const getItemList = jest
      .spyOn(service, "getItemListFromFiles")
      .mockResolvedValue({
        columns: [],
        items: [{ rowKey: "uuid-1::1" } as any],
        subIdLabel: "Sub-ID",
        subIdLabels: {},
        unitMetadata: {},
        codingSchemes: {},
      });
    const options = {
      itemPropertiesOverride: {
        "uuid-1::1": { subId: "1" },
      },
    };

    await expect(
      service.getItemRowKeysFromFiles("acp-1", options),
    ).resolves.toEqual(new Set(["uuid-1::1"]));
    await service.getItemRowKeysFromFiles("acp-1", options);
    expect(getItemList).toHaveBeenCalledTimes(1);

    fileRepo.find.mockResolvedValue(
      files.map((file, index) =>
        index === 0 ? { ...file, checksum: "changed" } : file,
      ),
    );
    await service.getItemRowKeysFromFiles("acp-1", options);
    expect(getItemList).toHaveBeenCalledTimes(2);
  });
});
