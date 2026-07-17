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
    (fs.readFile as jest.Mock).mockReset();
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
      getRevision: jest.fn().mockResolvedValue("0:empty"),
      assignNumbers: jest.fn(
        async (_acpId: string, rows: any[]) =>
          new Map(rows.map((row, index) => [row.rowKey, index + 1])),
      ),
      assignProvisionalNumbers: jest.fn(
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
      if (path === "/tmp/u1.vocs") return "{}";
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

  it("keeps valid sibling items when synchronizing a partially invalid VOMD", async () => {
    const partiallyInvalidVomd = JSON.stringify({
      profiles: [],
      items: [
        { profiles: [] },
        {
          id: "i2",
          description: "Item 2",
          variableId: "V2",
          profiles: [],
        },
      ],
    });
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return partiallyInvalidVomd;
      return "";
    });

    const report = await service.syncIndexFromFiles("acp-1");

    expect(report.itemsAdded).toBe(1);
    expect(report.warnings).toEqual([
      expect.stringContaining("enthält ein Item ohne ID"),
    ]);
    const saved = acpRepo.save.mock.calls[0][0];
    expect(saved.acpIndex.assessmentParts[0].units[0].items).toEqual([
      expect.objectContaining({ id: "i2", name: "Item 2" }),
    ]);
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

  it("numbers prefixed items by the source Item-ID shown in the Explorer", async () => {
    const result = await service.getItemListFromFiles("acp-1");

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [
        expect.objectContaining({
          itemId: "i1",
          rowKey: "u1_i1",
          unitId: "u1",
        }),
      ],
    );
    expect(result.items[0].itemId).toBe("i1");
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
        "uuid-1": {
          empiricalDifficulty: 0.75,
          infit: 1.04,
          discrimination: 0.41,
          solutionRate: 0.68,
          itemTimeSeconds: 33,
          stimulusTimeSeconds: 12,
          bookletOccurrences: [
            { booklet: "B2", position: 8 },
            { booklet: "B1", position: 3 },
          ],
        },
      },
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        uuid: "uuid-1",
        rowKey: "uuid-1",
        empiricalDifficulty: 0.75,
        meanTaskDifficulty: 0.75,
        infit: 1.04,
        discrimination: 0.41,
        solutionRate: 0.68,
        itemTimeSeconds: 33,
        stimulusTimeSeconds: 12,
        bookletOccurrences: [
          { booklet: "B1", position: 3 },
          { booklet: "B2", position: 8 },
        ],
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
        meanTaskDifficulty: 0.375,
      }),
      expect.objectContaining({
        uuid: "u1_i1",
        rowKey: "u1_i1::2",
        subId: "2",
        subIdDisplay: "vollständig richtig",
        empiricalDifficulty: 0.75,
        meanTaskDifficulty: 0.375,
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
      [expect.objectContaining({ itemId: "i1", rowKey: "u1_i1" })],
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

  it("rejects recalculation for a Unit XML without an ID", async () => {
    const invalidUnitXml = xmlContent.replace("  <Id>u1</Id>\n", "");
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return invalidUnitXml;
      if (path === "/tmp/u1.vomd") return vomdContent;
      return "";
    });

    await expect(
      service.recalculatePublishedItemRowNumbers("acp-1"),
    ).rejects.toThrow("Invalid unit XML file: u1.xml");

    expect(
      itemExplorerStateService.runWithLockedCleanState,
    ).not.toHaveBeenCalled();
    expect(itemRowNumberingService.recalculateNumbers).not.toHaveBeenCalled();
  });

  it("rejects recalculation without replacing numbers when VOMD parsing fails", async () => {
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml") return xmlContent;
      if (path === "/tmp/u1.vomd") return "{ invalid json";
      return "";
    });

    await expect(
      service.recalculatePublishedItemRowNumbers("acp-1"),
    ).rejects.toThrow("Invalid item metadata file: u1.vomd");

    expect(
      itemExplorerStateService.runWithLockedCleanState,
    ).not.toHaveBeenCalled();
    expect(itemRowNumberingService.recalculateNumbers).not.toHaveBeenCalled();
  });

  it("preserves the specific error when a referenced VOMD is missing", async () => {
    fileRepo.find.mockResolvedValueOnce(
      files.filter((file) => file.originalName !== "u1.vomd"),
    );

    await expect(
      service.recalculatePublishedItemRowNumbers("acp-1"),
    ).rejects.toThrow("Referenced item metadata file is missing: u1.vomd");

    expect(
      itemExplorerStateService.runWithLockedCleanState,
    ).not.toHaveBeenCalled();
    expect(itemRowNumberingService.recalculateNumbers).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-array item list", { profiles: [], items: "broken" }],
    ["a null item list", { profiles: [], items: null }],
    ["a missing item list", { profiles: [] }],
    ["an item without an ID", { profiles: [], items: [{ profiles: [] }] }],
    [
      "a non-array profile entry list",
      {
        profiles: [],
        items: [{ id: "i1", profiles: [{ entries: "broken" }] }],
      },
    ],
  ])(
    "rejects recalculation without replacing numbers for %s",
    async (_description, invalidVomd) => {
      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path === "/tmp/u1.xml") return xmlContent;
        if (path === "/tmp/u1.vomd") return JSON.stringify(invalidVomd);
        return "";
      });

      await expect(
        service.recalculatePublishedItemRowNumbers("acp-1"),
      ).rejects.toThrow("Invalid item metadata file: u1.vomd");

      expect(
        itemExplorerStateService.runWithLockedCleanState,
      ).not.toHaveBeenCalled();
      expect(itemRowNumberingService.recalculateNumbers).not.toHaveBeenCalled();
    },
  );

  it("keeps draft-only row numbers provisional", async () => {
    const publishedNumbers = new Map<string, number>();
    itemRowNumberingService.assignNumbers.mockImplementation(
      async (_acpId: string, rows: any[]) => {
        for (const row of rows) {
          if (!publishedNumbers.has(row.rowKey)) {
            publishedNumbers.set(row.rowKey, publishedNumbers.size + 1);
          }
        }
        return new Map(publishedNumbers);
      },
    );
    itemRowNumberingService.assignProvisionalNumbers.mockImplementation(
      async (_acpId: string, rows: any[]) =>
        new Map(rows.map((row: any, index: number) => [row.rowKey, index + 2])),
    );

    const result = await service.getItemListFromFiles("acp-1", {
      itemPropertiesOverride: {
        "u1_i1::2": { itemUuid: "u1_i1", subId: "2" },
      },
      publishedItemPropertiesOverride: {
        "u1_i1::1": { itemUuid: "u1_i1", subId: "1" },
      },
    });

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [expect.objectContaining({ rowKey: "u1_i1::1" })],
    );
    expect(
      itemRowNumberingService.assignProvisionalNumbers,
    ).toHaveBeenCalledWith("acp-1", [
      expect.objectContaining({ rowKey: "u1_i1::2" }),
    ]);
    expect(itemRowNumberingService.assignNumbers).not.toHaveBeenCalledWith(
      "acp-1",
      [expect.objectContaining({ rowKey: "u1_i1::2" })],
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ rowKey: "u1_i1::2", rowNumber: 2 }),
    );
  });

  it("handles an empty item list without loading Explorer state", async () => {
    fileRepo.find.mockResolvedValueOnce([]);

    const result = await service.getItemListFromFiles("acp-1");

    expect(result.items).toEqual([]);
    expect(itemExplorerStateService.getStateForViewer).not.toHaveBeenCalled();
    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledWith(
      "acp-1",
      [],
    );
  });

  it("reuses parsed item lists without sharing mutable response objects", async () => {
    const first = await service.getItemListFromFiles("acp-1");
    const readsAfterFirstLoad = (fs.readFile as jest.Mock).mock.calls.length;
    first.items[0].description = "mutated response";

    const second = await service.getItemListFromFiles("acp-1");

    expect((fs.readFile as jest.Mock).mock.calls).toHaveLength(
      readsAfterFirstLoad,
    );
    expect(second.items[0].description).toBe("Item 1");
  });

  it("reuses fully numbered item lists without repeating database numbering", async () => {
    await service.getItemListFromFiles("acp-1", {
      activeStateSignature: "active:1",
    });
    await service.getItemListFromFiles("acp-1", {
      activeStateSignature: "active:1",
    });

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledTimes(1);
  });

  it("coalesces numbering for ten concurrent identical item-list requests", async () => {
    let releaseNumbering!: () => void;
    itemRowNumberingService.assignNumbers.mockImplementationOnce(
      async (_acpId: string, rows: any[]) => {
        await new Promise<void>((resolve) => {
          releaseNumbering = resolve;
        });
        return new Map(rows.map((row, index) => [row.rowKey, index + 1]));
      },
    );

    const requests = Array.from({ length: 10 }, () =>
      service.getItemListFromFiles("acp-1", {
        activeStateSignature: "active:1",
      }),
    );
    for (let attempt = 0; attempt < 10 && !releaseNumbering; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    releaseNumbering();
    const results = await Promise.all(requests);

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.items.length === 1)).toBe(true);
  });

  it("invalidates numbered item lists when the row-number revision changes", async () => {
    itemRowNumberingService.getRevision
      .mockResolvedValueOnce("revision-1")
      .mockResolvedValueOnce("revision-1")
      .mockResolvedValueOnce("revision-2")
      .mockResolvedValueOnce("revision-2");

    await service.getItemListFromFiles("acp-1", {
      activeStateSignature: "active:1",
    });
    await service.getItemListFromFiles("acp-1", {
      activeStateSignature: "active:1",
    });

    expect(itemRowNumberingService.assignNumbers).toHaveBeenCalledTimes(2);
  });

  it("does not cache partial item lists after a source read failure", async () => {
    const originalRead = (fs.readFile as jest.Mock).getMockImplementation()!;
    let xmlReadAttempts = 0;
    jest
      .spyOn((service as any).logger, "error")
      .mockImplementation(() => undefined);
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/tmp/u1.xml" && xmlReadAttempts++ === 0) {
        throw new Error("temporary read failure");
      }
      return originalRead(path);
    });

    const partial = await service.getItemListFromFiles("acp-1");
    const recovered = await service.getItemListFromFiles("acp-1");

    expect(partial.items).toEqual([]);
    expect(recovered.items).toHaveLength(1);
    expect(
      (fs.readFile as jest.Mock).mock.calls.filter(
        ([path]) => path === "/tmp/u1.xml",
      ),
    ).toHaveLength(2);
  });

  it("caches unit-view dependency resolution by source signature", async () => {
    const firstDiagnostics = jest.fn();
    const secondDiagnostics = jest.fn();

    const first = await service.getUnitViewFromFiles(
      "acp-1",
      "u1",
      firstDiagnostics,
    );
    const second = await service.getUnitViewFromFiles(
      "acp-1",
      "u1",
      secondDiagnostics,
    );

    expect(first).toEqual(second);
    expect(
      (fs.readFile as jest.Mock).mock.calls.filter(
        ([path]) => path === "/tmp/u1.xml",
      ),
    ).toHaveLength(1);
    expect(firstDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ cacheStatus: "miss" }),
    );
    expect(secondDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ cacheStatus: "hit" }),
    );
  });

  it("resolves the file catalog while the Explorer version is pending", async () => {
    let resolveStateSignature!: (value: string) => void;
    const stateSignature = new Promise<string>((resolve) => {
      resolveStateSignature = resolve;
    });

    const request = service.getUnitViewFromFiles(
      "acp-1",
      "u1",
      undefined,
      stateSignature,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(fileRepo.find).toHaveBeenCalled();
    resolveStateSignature("active:4");
    await expect(request).resolves.toEqual(
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("loads full file catalogs only when the database revision changes", async () => {
    fileRepo.query = jest
      .fn()
      .mockResolvedValueOnce([{ count: "5", hash: "revision-1" }])
      .mockResolvedValueOnce([{ count: "5", hash: "revision-1" }])
      .mockResolvedValueOnce([{ count: "5", hash: "revision-2" }]);

    await service.getUnitViewFromFiles("acp-1", "u1");
    await service.getUnitViewFromFiles("acp-1", "u1");
    await service.getUnitViewFromFiles("acp-1", "u1");

    expect(fileRepo.query).toHaveBeenCalledTimes(3);
    expect(fileRepo.find).toHaveBeenCalledTimes(2);
    expect(
      (fs.readFile as jest.Mock).mock.calls.filter(
        ([path]) => path === "/tmp/u1.xml",
      ),
    ).toHaveLength(2);
  });

  it("removes failed file-catalog loads so a retry can recover", async () => {
    fileRepo.query = jest
      .fn()
      .mockResolvedValue([{ count: "5", hash: "revision-1" }]);
    fileRepo.find
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce(files);

    await expect(service.getUnitViewFromFiles("acp-1", "u1")).rejects.toThrow(
      "catalog unavailable",
    );
    await expect(service.getUnitViewFromFiles("acp-1", "u1")).resolves.toEqual(
      expect.objectContaining({ id: "u1" }),
    );

    expect(fileRepo.find).toHaveBeenCalledTimes(2);
  });

  it("invalidates unit-view resolution when the Explorer state changes", async () => {
    await service.getUnitViewFromFiles("acp-1", "u1", undefined, "active:4");
    await service.getUnitViewFromFiles("acp-1", "u1", undefined, "active:4");
    await service.getUnitViewFromFiles("acp-1", "u1", undefined, "active:5");

    expect(
      (fs.readFile as jest.Mock).mock.calls.filter(
        ([path]) => path === "/tmp/u1.xml",
      ),
    ).toHaveLength(2);
  });

  it("does not let a rejected evicted unit-view entry delete its replacement", async () => {
    let rejectBuild!: (error: Error) => void;
    jest.spyOn(service as any, "buildUnitViewFromFiles").mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectBuild = reject;
        }),
    );

    const request = service.getUnitViewFromFiles("acp-1", "u1");
    const rejection = expect(request).rejects.toThrow("stale request failed");
    const cache = (service as any).unitViewCache as Map<string, unknown>;
    for (let attempt = 0; attempt < 10 && cache.size === 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(cache.size).toBe(1);

    const cacheKey = cache.keys().next().value as string;
    const replacement = {
      settled: false,
      promise: Promise.resolve({ value: null, parseMs: 0 }),
    };
    cache.set(cacheKey, replacement);
    rejectBuild(new Error("stale request failed"));

    await rejection;
    expect(cache.get(cacheKey)).toBe(replacement);
  });

  it("coalesces concurrent item-list parses and invalidates on file changes", async () => {
    const originalRead = (fs.readFile as jest.Mock).getMockImplementation()!;
    (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
      await Promise.resolve();
      return originalRead(path);
    });

    await Promise.all([
      service.getItemListFromFiles("acp-1"),
      service.getItemListFromFiles("acp-1"),
    ]);
    const xmlReads = (fs.readFile as jest.Mock).mock.calls.filter(
      ([path]) => path === "/tmp/u1.xml",
    );
    expect(xmlReads).toHaveLength(1);

    fileRepo.find.mockResolvedValue(
      files.map((file, index) =>
        index === 0 ? { ...file, checksum: "changed" } : file,
      ),
    );
    await service.getItemListFromFiles("acp-1");
    const invalidatedXmlReads = (fs.readFile as jest.Mock).mock.calls.filter(
      ([path]) => path === "/tmp/u1.xml",
    );
    expect(invalidatedXmlReads).toHaveLength(2);
  });

  it("bounds the parsed item-list cache to 100 entries", async () => {
    for (let index = 0; index < 101; index += 1) {
      await service.getItemListFromFiles("acp-1", {
        itemPropertiesOverride: {
          [`u1_i1::${index}`]: {
            itemUuid: "u1_i1",
            subId: String(index),
          },
        },
      });
    }

    expect((service as any).parsedItemListCache.size).toBe(100);
  });

  it("bounds the numbered item-list cache to 100 entries", async () => {
    for (let index = 0; index < 101; index += 1) {
      await service.getItemListFromFiles("acp-1", {
        activeStateSignature: `active:${index}`,
      });
    }

    expect((service as any).numberedItemListCache.size).toBe(100);
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
