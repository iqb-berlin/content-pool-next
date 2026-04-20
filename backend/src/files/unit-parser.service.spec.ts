import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as fs from "fs/promises";
import { UnitParserService } from "./unit-parser.service";
import { Acp, AcpFile } from "../database/entities";

jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));

describe("UnitParserService", () => {
  let service: UnitParserService;
  let fileRepo: any;
  let acpRepo: any;

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
    fileRepo = {
      find: jest.fn().mockResolvedValue(files),
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
});
