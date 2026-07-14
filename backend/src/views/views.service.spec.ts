import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { ViewsService } from "./views.service";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";
import { UnitParserService } from "../files/unit-parser.service";
import {
  Acp,
  AcpAccessConfig,
  AcpFile,
  AppSettings,
  AcpItemPreference,
} from "../database/entities";

describe("ViewsService", () => {
  let service: ViewsService;
  let acpRepository: { findOne: jest.Mock };
  let accessConfigRepository: { findOne: jest.Mock; find: jest.Mock };
  let fileRepository: { find: jest.Mock; findOne: jest.Mock };
  let settingsRepository: { findOne: jest.Mock };
  let itemPreferenceRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
  };
  let itemExplorerStateService: { getStateForViewer: jest.Mock };
  let unitParserService: {
    getItemRowKeysFromFiles: jest.Mock;
    getItemListFromFiles: jest.Mock;
  };

  beforeEach(async () => {
    acpRepository = { findOne: jest.fn() };
    accessConfigRepository = { findOne: jest.fn(), find: jest.fn() };
    fileRepository = { find: jest.fn(), findOne: jest.fn() };
    settingsRepository = { findOne: jest.fn() };
    itemPreferenceRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
      query: jest.fn(),
    };
    itemExplorerStateService = {
      getStateForViewer: jest.fn().mockResolvedValue({
        activeState: { itemProperties: {} },
      }),
    };
    unitParserService = {
      getItemRowKeysFromFiles: jest
        .fn()
        .mockResolvedValue(new Set(["uuid-1::1", "uuid-2::1"])),
      getItemListFromFiles: jest.fn().mockResolvedValue({ items: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewsService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        {
          provide: getRepositoryToken(AcpAccessConfig),
          useValue: accessConfigRepository,
        },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        {
          provide: getRepositoryToken(AppSettings),
          useValue: settingsRepository,
        },
        {
          provide: getRepositoryToken(AcpItemPreference),
          useValue: itemPreferenceRepository,
        },
        {
          provide: ItemExplorerStateService,
          useValue: itemExplorerStateService,
        },
        { provide: UnitParserService, useValue: unitParserService },
      ],
    }).compile();

    service = module.get<ViewsService>(ViewsService);
  });

  it("uses bookletModule IDs as sequence IDs on ACP start page", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      name: "ACP",
      description: "Demo",
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: "unit-1", name: "Unit 1" }],
            bookletModules: [
              {
                id: "mod-1",
                name: [{ lang: "de", value: "Modul 1" }],
                units: [{ id: "unit-1", order: 1 }],
              },
            ],
            instruments: [
              {
                id: "inst-1",
                name: "Instrument 1",
                testcenterBooklet: [
                  {
                    definitionId: "booklet-1.xml",
                    modules: [{ moduleId: "mod-1" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage("acp-1");
    expect(start.sequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mod-1",
          bookletDefinitionId: "booklet-1.xml",
          instrumentName: "Instrument 1",
        }),
      ]),
    );
  });

  it("supports different module reference formats and deduplicates sequence IDs", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      name: "ACP",
      description: "Demo",
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: "unit-1", name: "Unit 1" }],
            bookletModules: [
              {
                id: "mod-1",
                name: "Module 1",
                units: [{ id: "unit-1", order: 1 }],
              },
              {
                id: "mod-2",
                name: "Module 2",
                units: [{ id: "unit-1", order: 1 }],
              },
            ],
            instruments: [
              {
                id: "inst-1",
                name: "Instrument 1",
                testcenterBooklet: [
                  {
                    definitionId: "booklet-1.xml",
                    modules: [{ moduleId: "mod-1" }, { id: "mod-2" }, "mod-1"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage("acp-1");
    const sequenceIds = (start.sequences || []).map(
      (s: { id: string }) => s.id,
    );

    expect(sequenceIds.filter((id: string) => id === "mod-1")).toHaveLength(1);
    expect(sequenceIds).toEqual(expect.arrayContaining(["mod-1", "mod-2"]));
  });

  it("exposes canonical metadataColumns when legacy key is stored", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      name: "ACP",
      description: "Demo",
      acpIndex: {
        assessmentParts: [],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        itemListMetadataColumns: ["metaA", "metaB"],
      },
    });

    const start = await service.getAcpStartPage("acp-1");
    expect(start.featureConfig).toMatchObject({
      metadataColumns: {
        visible: ["metaA", "metaB"],
        order: ["metaA", "metaB"],
      },
    });
    expect(start.featureConfig.itemListMetadataColumns).toBeUndefined();
  });

  it("returns empty item preferences when no authenticated identity is available", async () => {
    const prefs = await service.getItemPreferences("acp-1", null, "item-list");
    expect(prefs).toEqual({ ui: {}, tags: {}, rowData: {} });
    expect(itemPreferenceRepository.findOne).not.toHaveBeenCalled();
  });

  it("loads normalized item preferences for authenticated users", async () => {
    itemPreferenceRepository.findOne.mockResolvedValue({
      preferences: {
        ui: {
          filterText: "abc",
          sortDir: "asc",
        },
        tags: {
          item1: ["alpha", "alpha", " beta "],
          item2: [],
        },
      },
    });

    const prefs = await service.getItemPreferences(
      "acp-1",
      { sub: "user-1", type: "user" },
      "item-list",
    );
    expect(prefs).toEqual({
      ui: {
        filterText: "abc",
        sortDir: "asc",
      },
      tags: {
        item1: ["alpha", "beta"],
      },
      rowData: {},
    });
  });

  it("requires a stable identity for personal item preferences", async () => {
    await expect(
      service.getItemPreferences("acp-1", null, "item-explorer"),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.patchPersonalItemPreferenceRow(
        "acp-1",
        { type: "credential", username: "legacy-reader" },
        "uuid::1",
        { note: "not saved" },
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(itemPreferenceRepository.query).not.toHaveBeenCalled();
  });

  it("exports only the current user's personal data in requested list order", async () => {
    itemPreferenceRepository.findOne.mockResolvedValue({
      preferences: {
        rowData: {
          "uuid-1::1": {
            category: "II",
            tags: ["Prüfen"],
            note: "Eigene Notiz",
          },
        },
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        personalItemTags: [{ label: "Prüfen", color: "#ff0000" }],
      },
    });
    itemExplorerStateService.getStateForViewer.mockResolvedValue({
      activeState: { itemProperties: { "uuid-1::1": { draft: true } } },
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          itemId: "item-1",
          uuid: "uuid-1",
          rowKey: "uuid-1::1",
          unitId: "unit-1",
          unitLabel: "Aufgabe 1",
          description: "",
          variableId: "var-1",
          metadata: {},
          empiricalDifficulty: 0.25,
        },
        {
          itemId: "item-2",
          uuid: "uuid-2",
          rowKey: "uuid-2::1",
          unitId: "unit-1",
          unitLabel: "Aufgabe 1",
          description: "",
          variableId: "var-2",
          metadata: {},
          empiricalDifficulty: 0.75,
        },
      ],
    });

    const buffer = await service.exportPersonalItemDataXlsx(
      "acp-1",
      { sub: "user-1", type: "user" },
      ["uuid-2::1", "removed-row", "uuid-1::1"],
      true,
    );

    expect(itemPreferenceRepository.findOne).toHaveBeenCalledWith({
      where: {
        acpId: "acp-1",
        viewId: "item-explorer",
        userId: "user-1",
      },
    });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith(
      "acp-1",
      true,
    );
    expect(unitParserService.getItemListFromFiles).toHaveBeenCalledWith(
      "acp-1",
      { itemPropertiesOverride: { "uuid-1::1": { draft: true } } },
    );

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Persönliche Itemdaten");
    expect(sheet).toBeDefined();
    expect(sheet!.getRow(1).values).toEqual([
      undefined,
      "Laufende Nummer",
      "Unit-ID",
      "Unit-Label",
      "Item-ID",
      "Item-UUID",
      "Markierung/Farbe",
      "Notiz",
      "Kompetenzstufe",
      "Empirische Itemschwierigkeit",
      "Mittlere Aufgabenschwierigkeit",
    ]);
    expect(sheet!.getCell("A2").value).toBe(1);
    expect(sheet!.getCell("E2").value).toBe("uuid-2");
    expect(sheet!.getCell("F2").value).toBeNull();
    expect(sheet!.getCell("J2").value).toBe(0.5);
    expect(sheet!.getCell("A3").value).toBe(2);
    expect(sheet!.getCell("E3").value).toBe("uuid-1");
    expect(sheet!.getCell("F3").value).toBe("Prüfen (#ff0000)");
    expect(sheet!.getCell("G3").value).toBe("Eigene Notiz");
    expect(sheet!.getCell("H3").value).toBe("II");
  });

  it("requires an explicit filtered and sorted row order for exports", async () => {
    await expect(
      service.exportPersonalItemDataXlsx(
        "acp-1",
        { sub: "user-1", type: "user" },
        undefined as unknown as string[],
      ),
    ).rejects.toThrow(BadRequestException);
    expect(unitParserService.getItemListFromFiles).not.toHaveBeenCalled();
  });

  it("limits personal data exports to 10,000 requested rows", async () => {
    const rowKeys = Array.from(
      { length: 10_001 },
      (_, index) => `uuid-${index}`,
    );

    await expect(
      service.exportPersonalItemDataXlsx(
        "acp-1",
        { sub: "user-1", type: "user" },
        rowKeys,
      ),
    ).rejects.toThrow("At most 10000 item rows can be exported");
    expect(unitParserService.getItemListFromFiles).not.toHaveBeenCalled();
  });

  it("does not fall back to an orphaned username for stable credentials", async () => {
    itemPreferenceRepository.findOne.mockImplementation(async ({ where }) =>
      where.credentialId
        ? null
        : {
            credentialUsername: "reader-a",
            preferences: { rowData: { "uuid::1": { note: "old secret" } } },
          },
    );

    await expect(
      service.getItemPreferences(
        "acp-1",
        { type: "credential", sub: "credential-new", username: "reader-a" },
        "item-explorer",
      ),
    ).resolves.toEqual({ ui: {}, tags: {}, rowData: {} });
    expect(itemPreferenceRepository.findOne).toHaveBeenCalledTimes(1);
    expect(itemPreferenceRepository.findOne).toHaveBeenCalledWith({
      where: {
        acpId: "acp-1",
        viewId: "item-explorer",
        credentialId: "credential-new",
      },
    });
  });

  it("saves preferences scoped by stable credential id", async () => {
    const saved = await service.saveItemPreferences(
      "acp-1",
      { type: "credential", sub: "credential-1", username: "reader-a" },
      {
        ui: {
          filterText: "xyz",
        },
        tags: {
          item1: ["tag1", "tag1", "tag2"],
        },
      },
      "item-explorer",
    );

    expect(saved).toEqual({
      ui: {
        filterText: "xyz",
      },
      tags: {
        item1: ["tag1", "tag2"],
      },
      rowData: {},
    });
    expect(itemPreferenceRepository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ON CONFLICT ("acp_id", "view_id", "credential_id")',
      ),
      [
        "acp-1",
        "item-explorer",
        null,
        "credential-1",
        "reader-a",
        JSON.stringify(saved),
      ],
    );
    expect(itemPreferenceRepository.findOne).not.toHaveBeenCalled();
    expect(itemPreferenceRepository.save).not.toHaveBeenCalled();
  });

  it("returns default public settings when app settings are missing", async () => {
    settingsRepository.findOne.mockResolvedValue(null);

    await expect(service.getPublicSettings()).resolves.toEqual({
      theme: {},
      language: "de",
      logoUrl: null,
      landingPageHtml: null,
      imprintHtml: null,
      privacyHtml: null,
      accessibilityHtml: null,
    });
  });

  it("returns configured public settings", async () => {
    settingsRepository.findOne.mockResolvedValue({
      theme: { primary: "#fff" },
      language: "en",
      logoUrl: "/logo.svg",
      landingPageHtml: "<p>Landing</p>",
      imprintHtml: "<p>Imprint</p>",
      privacyHtml: "<p>Privacy</p>",
      accessibilityHtml: "<p>A11y</p>",
    });

    await expect(service.getPublicSettings()).resolves.toEqual({
      theme: { primary: "#fff" },
      language: "en",
      logoUrl: "/logo.svg",
      landingPageHtml: "<p>Landing</p>",
      imprintHtml: "<p>Imprint</p>",
      privacyHtml: "<p>Privacy</p>",
      accessibilityHtml: "<p>A11y</p>",
    });
  });

  it("aggregates public ACPs and active credential ACPs without duplicates", async () => {
    accessConfigRepository.find
      .mockResolvedValueOnce([
        {
          acpId: "acp-public",
          accessModel: "PUBLIC",
          acp: { id: "acp-public", name: "Public", description: "Public Desc" },
        },
      ])
      .mockResolvedValueOnce([
        {
          acpId: "acp-public",
          accessModel: "CREDENTIALS_LIST",
          validFrom: null,
          validUntil: null,
          acp: { id: "acp-public", name: "Public", description: "Public Desc" },
        },
        {
          acpId: "acp-credential",
          accessModel: "CREDENTIALS_LIST",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validUntil: new Date("2026-12-31T23:59:59.000Z"),
          acp: {
            id: "acp-credential",
            name: "Credential",
            description: "Credential Desc",
          },
        },
        {
          acpId: "acp-inactive",
          accessModel: "CREDENTIALS_LIST",
          validFrom: new Date("2027-01-01T00:00:00.000Z"),
          validUntil: new Date("2027-12-31T23:59:59.000Z"),
          acp: {
            id: "acp-inactive",
            name: "Inactive",
            description: "Inactive Desc",
          },
        },
      ]);

    const result = await service.getPublicAcps();

    expect(result).toEqual([
      {
        id: "acp-public",
        name: "Public",
        description: "Public Desc",
        accessModel: "PUBLIC",
      },
      {
        id: "acp-credential",
        name: "Credential",
        description: "Credential Desc",
        accessModel: "CREDENTIALS_LIST",
        requiresLogin: true,
      },
    ]);
  });

  it("returns null for unknown ACPs in start page/index/unit/sequence lookups", async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(service.getAcpStartPage("missing")).resolves.toBeNull();
    await expect(service.getAcpIndex("missing")).resolves.toBeNull();
    await expect(
      service.getUnitViewData("missing", "unit-1"),
    ).resolves.toBeNull();
    await expect(
      service.getTaskSequence("missing", "seq-1"),
    ).resolves.toBeNull();
  });

  it("loads unit view data with resolved dependencies", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      acpIndex: {
        assessmentParts: [
          {
            units: [
              {
                id: "unit-1",
                name: "Unit 1",
                description: "Desc",
                lang: "de",
                items: [{ id: "item-1" }],
                dependencies: [
                  { id: "player.html", type: "PLAYER" },
                  { id: "missing.html", type: "PLAYER" },
                ],
                codingScheme: {},
                richText: "<p>x</p>",
              },
            ],
          },
        ],
      },
    });
    fileRepository.findOne
      .mockResolvedValueOnce({
        id: "file-1",
        originalName: "player.html",
      })
      .mockResolvedValueOnce(null);

    await expect(service.getUnitViewData("acp-1", "unit-1")).resolves.toEqual({
      id: "unit-1",
      name: "Unit 1",
      description: "Desc",
      lang: "de",
      items: [{ id: "item-1" }],
      dependencies: [
        {
          type: "PLAYER",
          originalName: "player.html",
          downloadUrl: "/api/acp/acp-1/files/file-1/download",
          fileId: "file-1",
        },
      ],
      codingScheme: {},
      richText: "<p>x</p>",
    });
  });

  it("returns null for unknown units and computes item list prefixes", async () => {
    acpRepository.findOne
      .mockResolvedValueOnce({
        id: "acp-1",
        acpIndex: {
          assessmentParts: [{ units: [{ id: "unit-1", items: [] }] }],
        },
      })
      .mockResolvedValueOnce({
        id: "acp-1",
        acpIndex: {
          assessmentParts: [
            {
              units: [
                {
                  id: "unit-1",
                  name: "Unit 1",
                  items: [
                    { id: "item-1", name: "Item 1" },
                    { id: "item-2", useUnitAliasAsPrefix: false },
                  ],
                },
              ],
            },
          ],
        },
      });

    await expect(
      service.getUnitViewData("acp-1", "missing-unit"),
    ).resolves.toBeNull();
    await expect(service.getItemList("acp-1")).resolves.toEqual([
      {
        itemId: "unit-1_item-1",
        unitId: "unit-1",
        unitName: "Unit 1",
        name: "Item 1",
        sourceVariable: undefined,
      },
      {
        itemId: "item-2",
        unitId: "unit-1",
        unitName: "Unit 1",
        name: undefined,
        sourceVariable: undefined,
      },
    ]);
  });

  it("returns empty item list when ACP does not exist", async () => {
    acpRepository.findOne.mockResolvedValue(null);
    await expect(service.getItemList("missing")).resolves.toEqual([]);
  });

  it("returns sorted sequence units and falls back to raw ids when units are missing", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: "unit-1", name: "Unit 1" }],
            bookletModules: [
              {
                id: "seq-1",
                name: "Sequence",
                units: [
                  { id: "missing-unit", order: 2 },
                  { id: "unit-1", order: 1 },
                ],
              },
            ],
          },
        ],
      },
    });

    await expect(service.getTaskSequence("acp-1", "seq-1")).resolves.toEqual({
      id: "seq-1",
      name: "Sequence",
      units: [
        { id: "unit-1", name: "Unit 1" },
        { id: "missing-unit", name: "missing-unit" },
      ],
    });
    await expect(
      service.getTaskSequence("acp-1", "unknown"),
    ).resolves.toBeNull();
  });

  it("returns normalized preferences immediately when identity is missing on save", async () => {
    await expect(
      service.saveItemPreferences("acp-1", null, {
        ui: { filterText: "abc" },
        tags: { item1: ["x", " x ", ""] },
      }),
    ).resolves.toEqual({
      ui: { filterText: "abc" },
      tags: { item1: ["x"] },
      rowData: {},
    });
    expect(itemPreferenceRepository.save).not.toHaveBeenCalled();
  });

  it("upserts preference records atomically for authenticated users", async () => {
    const saved = await service.saveItemPreferences(
      "acp-1",
      { sub: "user-1", type: "oidc" },
      {
        ui: { sortBy: "name" },
        tags: { itemA: ["A", "A", " B "] },
      },
      "item-list",
    );

    expect(itemPreferenceRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("acp_id", "view_id", "user_id")'),
      ["acp-1", "item-list", "user-1", null, null, JSON.stringify(saved)],
    );
    expect(itemPreferenceRepository.findOne).not.toHaveBeenCalled();
    expect(itemPreferenceRepository.create).not.toHaveBeenCalled();
    expect(itemPreferenceRepository.save).not.toHaveBeenCalled();
  });

  it("persists personal working data by stable row key", async () => {
    const saved = await service.saveItemPreferences(
      "acp-1",
      { sub: "user-1", type: "oidc" },
      {
        rowData: {
          "uuid-1::1": {
            category: " A ",
            tags: ["Prüfen", " Prüfen ", ""],
            note: "Notiz\r\nzweite Zeile",
            formatted: "<strong>ignored</strong>",
          },
          "  ": { category: "ignored" },
        },
      },
      "item-explorer",
    );

    expect(saved.rowData).toEqual({
      "uuid-1::1": {
        category: "A",
        tags: ["Prüfen"],
        note: "Notiz\nzweite Zeile",
      },
    });
  });

  it("patches one personal row atomically without replacing other rows", async () => {
    itemPreferenceRepository.query.mockResolvedValue([{ updated: 1 }]);

    const result = await service.patchPersonalItemPreferenceRow(
      "acp-1",
      { sub: "user-1", type: "oidc" },
      "uuid-2::1",
      { category: " II ", formatted: "ignored" },
    );

    expect(result.rowData).toEqual({
      "uuid-2::1": { category: "II" },
    });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith(
      "acp-1",
      false,
    );
    expect(unitParserService.getItemRowKeysFromFiles).toHaveBeenCalledWith(
      "acp-1",
      { itemPropertiesOverride: {} },
    );
    expect(itemPreferenceRepository.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /\("acp_item_preferences"\."preferences"->'rowData'\) - \$8::text[\s\S]*jsonb_build_object\(\$8::text, \$7::jsonb\)[\s\S]*\? \$8::text[\s\S]*RETURNING 1 AS "updated"/,
      ),
      expect.arrayContaining([
        "acp-1",
        "item-explorer",
        "user-1",
        null,
        null,
        expect.any(String),
        JSON.stringify({ category: "II" }),
        "uuid-2::1",
        10_000,
      ]),
    );
  });

  it("rejects personal data for a row that does not exist in the ACP", async () => {
    unitParserService.getItemRowKeysFromFiles.mockResolvedValue(
      new Set(["uuid-1::1"]),
    );

    await expect(
      service.patchPersonalItemPreferenceRow(
        "acp-1",
        { sub: "user-1", type: "oidc" },
        "invented-row",
        { note: "unbounded" },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(itemPreferenceRepository.query).not.toHaveBeenCalled();
  });

  it("allows deleting a stale row without resolving the current item list", async () => {
    itemPreferenceRepository.query.mockResolvedValue([{ updated: 1 }]);

    await expect(
      service.patchPersonalItemPreferenceRow(
        "acp-1",
        { sub: "user-1", type: "oidc" },
        "removed-row",
        null,
      ),
    ).resolves.toEqual({ rowData: {} });
    expect(itemExplorerStateService.getStateForViewer).not.toHaveBeenCalled();
    expect(unitParserService.getItemRowKeysFromFiles).not.toHaveBeenCalled();
  });

  it("rejects adding a new row after the personal row limit is reached", async () => {
    itemPreferenceRepository.query.mockResolvedValue([]);

    await expect(
      service.patchPersonalItemPreferenceRow(
        "acp-1",
        { sub: "user-1", type: "oidc" },
        "uuid-1::1",
        { note: "one too many" },
      ),
    ).rejects.toThrow("Personal item data is limited to 10000 rows");
  });
});
