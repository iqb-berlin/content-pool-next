import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs/promises";
import { FilesService } from "./files.service";
import { UnitParserService } from "./unit-parser.service";
import { ValidationService } from "../validation/validation.service";
import {
  AcpFile,
  Acp,
  AcpAccessConfig,
  ItemResponseState,
} from "../database/entities";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from("file content")),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe("FilesService", () => {
  let service: FilesService;
  let repo: any;
  let acpRepo: any;
  let accessConfigRepo: any;
  let stateRepo: any;
  let unitParserService: any;
  let validationService: any;

  const mockFile = {
    id: "file-1",
    acpId: "acp-1",
    filePath: "/uploads/acp-1/test.json",
    originalName: "test.json",
    fileType: "application/json",
    fileSize: 1024,
    checksum: "abc123",
    validationResult: null,
    uploadedAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([mockFile]),
      findOne: jest.fn().mockResolvedValue(mockFile),
      create: jest
        .fn()
        .mockImplementation((dto) => ({ ...dto, id: "new-file" })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    acpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "acp-1",
        acpIndex: {
          units: [
            {
              id: "unit-1",
              dependencies: [{ id: "test.json", type: "UNIT_DEFINITION" }],
            },
            {
              id: "unit-2",
              dependencies: [{ id: "second.json", type: "UNIT_DEFINITION" }],
            },
          ],
          assessmentParts: [
            {
              bookletModules: [
                {
                  id: "seq-1",
                  units: [
                    { id: "unit-1", order: 1 },
                    { id: "unit-2", order: 2 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    };
    accessConfigRepo = {
      findOne: jest.fn().mockResolvedValue({ featureConfig: {} }),
    };
    stateRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    unitParserService = {
      parseUnitXml: jest.fn().mockImplementation((content: string) => ({
        unitId: content.match(/<Id>([^<]+)<\/Id>/)?.[1] || "",
        unitLabel: content.match(/<Label>([^<]+)<\/Label>/)?.[1] || "",
        description: content.match(/<Description>([^<]+)<\/Description>/)?.[1],
        definitionRef:
          content.match(/<DefinitionRef[^>]*>([^<]+)<\/DefinitionRef>/)?.[1] || "",
        playerRef:
          content.match(/<DefinitionRef[^>]*player="([^"]+)"/)?.[1] || "",
        codingSchemeRef:
          content.match(/<CodingSchemeRef>([^<]+)<\/CodingSchemeRef>/)?.[1],
        metadataRef: content.match(/<Reference>([^<]+)<\/Reference>/)?.[1],
      })),
      parseVomd: jest
        .fn()
        .mockImplementation((content: string) => {
          const data = JSON.parse(content);
          return {
            unitProfiles: data.profiles || [],
            items: data.items || [],
          };
        }),
      pruneMissingDependencies: jest.fn().mockResolvedValue({
        unitsUpdated: 0,
        dependenciesRemoved: 0,
        bookletsUpdated: 0,
        bookletDefinitionsRemoved: 0,
        indexUpdated: false,
      }),
      getItemListFromFiles: jest.fn().mockResolvedValue({
        columns: [],
        items: [],
        unitMetadata: {},
        codingSchemes: {},
      }),
    };
    validationService = {
      autoValidateUploadedFiles: jest.fn().mockResolvedValue({
        files: [mockFile],
        summary: {
          totalFiles: 1,
          validFiles: 1,
          invalidFiles: 0,
          semanticValid: true,
          semanticIssueCount: 0,
          timestamp: new Date().toISOString(),
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(AcpFile), useValue: repo },
        { provide: getRepositoryToken(Acp), useValue: acpRepo },
        {
          provide: getRepositoryToken(AcpAccessConfig),
          useValue: accessConfigRepo,
        },
        { provide: getRepositoryToken(ItemResponseState), useValue: stateRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("./uploads") },
        },
        { provide: UnitParserService, useValue: unitParserService },
        { provide: ValidationService, useValue: validationService },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe("findByAcp", () => {
    it("should return files for ACP", async () => {
      const result = await service.findByAcp("acp-1");
      expect(result).toHaveLength(1);
      expect(result[0].originalName).toBe("test.json");
    });
  });

  describe("findById", () => {
    it("should return file by id", async () => {
      const result = await service.findById("file-1");
      expect(result.originalName).toBe("test.json");
    });

    it("should throw NotFoundException", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById("bad")).rejects.toThrow(NotFoundException);
    });

    it("should throw when ACP-scoped lookup does not match ACP", async () => {
      repo.findOne.mockResolvedValue({ ...mockFile, acpId: "other-acp" });
      await expect(service.findByIdForAcp("acp-1", "file-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("upload", () => {
    it("should upload file and store metadata", async () => {
      const multerFile = {
        originalname: "data.json",
        mimetype: "application/json",
        size: 512,
        buffer: Buffer.from('{"test": true}'),
      } as Express.Multer.File;

      await service.upload("acp-1", multerFile);
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe("uploadMultiple", () => {
    const incoming = {
      originalname: "test.json",
      mimetype: "application/json",
      size: 128,
      buffer: Buffer.from('{"fresh": true}'),
    } as Express.Multer.File;

    it("should extract ZIP uploads before storing metadata", async () => {
      repo.find.mockResolvedValue([]);

      const JSZip = require("jszip");
      const zip = new JSZip();
      zip.file("nested/unit-1.xml", "<Unit />");
      zip.file("unit-1.vomd", '{"items":[]}');
      zip.file("__MACOSX/ignored.txt", "ignore");
      zip.file(".DS_Store", "ignore");
      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      const uploadSpy = jest
        .spyOn(service, "upload")
        .mockResolvedValueOnce({
          ...mockFile,
          id: "file-xml",
          originalName: "unit-1.xml",
          fileType: "application/xml",
          fileSize: 8,
        } as unknown as AcpFile)
        .mockResolvedValueOnce({
          ...mockFile,
          id: "file-vomd",
          originalName: "unit-1.vomd",
          fileType: "application/json",
          fileSize: 12,
        } as unknown as AcpFile);

      const result = await service.uploadMultiple("acp-1", [
        {
          originalname: "bundle.zip",
          mimetype: "application/zip",
          size: buffer.length,
          buffer,
        } as Express.Multer.File,
      ]);

      expect(uploadSpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenNthCalledWith(
        1,
        "acp-1",
        expect.objectContaining({
          originalname: "unit-1.xml",
          mimetype: "application/xml",
          size: 8,
          buffer: Buffer.from("<Unit />"),
        }),
      );
      expect(uploadSpy).toHaveBeenNthCalledWith(
        2,
        "acp-1",
        expect.objectContaining({
          originalname: "unit-1.vomd",
          mimetype: "application/json",
          size: 12,
          buffer: Buffer.from('{"items":[]}'),
        }),
      );
      expect(result.map((file) => file.originalName)).toEqual([
        "unit-1.xml",
        "unit-1.vomd",
      ]);
    });

    it("should reject invalid ZIP uploads", async () => {
      repo.find.mockResolvedValue([]);

      await expect(
        service.uploadMultiple("acp-1", [
          {
            originalname: "broken.zip",
            mimetype: "application/zip",
            size: 9,
            buffer: Buffer.from("not-a-zip"),
          } as Express.Multer.File,
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject conflicts by default", async () => {
      await expect(service.uploadMultiple("acp-1", [incoming])).rejects.toThrow(
        ConflictException,
      );
    });

    it("should overwrite existing files when strategy is overwrite", async () => {
      const deleteSpy = jest
        .spyOn(service, "deleteForAcp")
        .mockResolvedValue(undefined);
      const uploadSpy = jest.spyOn(service, "upload").mockResolvedValue({
        ...mockFile,
        id: "new-file",
        originalName: "test.json",
      } as unknown as AcpFile);

      const result = await service.uploadMultiple(
        "acp-1",
        [incoming],
        "overwrite",
      );

      expect(deleteSpy).toHaveBeenCalledWith("acp-1", "file-1");
      expect(uploadSpy).toHaveBeenCalledWith("acp-1", incoming);
      expect(result).toHaveLength(1);
    });

    it("should keep both files when strategy is keep-both", async () => {
      const deleteSpy = jest
        .spyOn(service, "deleteForAcp")
        .mockResolvedValue(undefined);
      const uploadSpy = jest.spyOn(service, "upload").mockResolvedValue({
        ...mockFile,
        id: "new-file",
        originalName: "test.json",
      } as unknown as AcpFile);

      const result = await service.uploadMultiple(
        "acp-1",
        [incoming],
        "keep-both",
      );

      expect(deleteSpy).not.toHaveBeenCalled();
      expect(uploadSpy).toHaveBeenCalledWith("acp-1", incoming);
      expect(result).toHaveLength(1);
    });

    it("should reject invalid conflict strategy", async () => {
      await expect(
        service.uploadMultiple("acp-1", [incoming], "invalid-strategy"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should require at least one file", async () => {
      await expect(service.uploadMultiple("acp-1", [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject files without filename", async () => {
      const invalidFile = {
        ...incoming,
        originalname: "   ",
      } as Express.Multer.File;

      await expect(
        service.uploadMultiple("acp-1", [invalidFile]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("download", () => {
    it("should return file buffer", async () => {
      const result = await service.download("file-1");
      expect(result.buffer).toBeDefined();
      expect(result.file.originalName).toBe("test.json");
    });

    it("should fail when file is missing on disk", async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error("missing"));
      await expect(service.download("file-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should download ACP-scoped file and fail on missing disk file", async () => {
      await expect(service.downloadForAcp("acp-1", "file-1")).resolves.toEqual(
        expect.objectContaining({
          file: expect.objectContaining({ id: "file-1" }),
        }),
      );

      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error("missing"));
      await expect(service.downloadForAcp("acp-1", "file-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("delete", () => {
    it("should delete file from disk and DB", async () => {
      repo.findOne.mockResolvedValue(mockFile);
      await service.delete("file-1");
      expect(repo.remove).toHaveBeenCalledWith(mockFile);
    });

    it("should ignore unlink errors during delete operations", async () => {
      (fs.unlink as jest.Mock).mockRejectedValueOnce(new Error("gone"));
      await expect(service.delete("file-1")).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockFile);
    });

    it("should delete by ACP and remove all files", async () => {
      await expect(
        service.deleteForAcp("acp-1", "file-1"),
      ).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockFile);

      repo.find.mockResolvedValue([
        { ...mockFile, id: "file-1", filePath: "/x/1" },
        { ...mockFile, id: "file-2", filePath: "/x/2" },
      ]);
      (fs.unlink as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("missing"));

      await expect(service.deleteAll("acp-1")).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith([
        expect.objectContaining({ id: "file-1" }),
        expect.objectContaining({ id: "file-2" }),
      ]);
    });

    it("should bulk delete ACP files for the provided IDs", async () => {
      repo.find.mockResolvedValue([
        { ...mockFile, id: "file-1", filePath: "/x/1" },
        { ...mockFile, id: "file-2", filePath: "/x/2" },
      ]);

      const result = await service.deleteManyForAcp("acp-1", [
        "file-1",
        "file-2",
        "file-1",
      ]);

      expect(result).toEqual(["file-1", "file-2"]);
      expect(repo.remove).toHaveBeenCalledWith([
        expect.objectContaining({ id: "file-1" }),
        expect.objectContaining({ id: "file-2" }),
      ]);
    });

    it("should reject empty and unknown IDs during bulk delete", async () => {
      await expect(service.deleteManyForAcp("acp-1", [])).rejects.toThrow(
        BadRequestException,
      );

      repo.find.mockResolvedValue([{ ...mockFile, id: "file-1" }]);

      await expect(
        service.deleteManyForAcp("acp-1", ["missing-file"]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("cleanupOrphanedResponseStates", () => {
    it("deletes response states that no longer match any file-backed item", async () => {
      stateRepo.find.mockResolvedValueOnce([
        { id: "state-1", unitId: "unit-1", itemId: "item-a" },
        { id: "state-2", unitId: "unit-1", itemId: "item-b" },
      ]);
      unitParserService.getItemListFromFiles.mockResolvedValueOnce({
        columns: [],
        items: [{ itemId: "item-a", unitId: "unit-1" }],
        unitMetadata: {},
        codingSchemes: {},
      });

      const result = await service.cleanupOrphanedResponseStates("acp-1");

      expect(stateRepo.delete).toHaveBeenCalledWith(["state-2"]);
      expect(result).toEqual({
        totalStates: 2,
        deletedStates: 1,
        keptStates: 1,
      });
    });

    it("returns zero cleanup when no response states exist", async () => {
      stateRepo.find.mockResolvedValueOnce([]);

      const result = await service.cleanupOrphanedResponseStates("acp-1");

      expect(unitParserService.getItemListFromFiles).not.toHaveBeenCalled();
      expect(stateRepo.delete).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalStates: 0,
        deletedStates: 0,
        keptStates: 0,
      });
    });
  });

  describe("cleanupReferencesAfterFileMutation", () => {
    it("runs dependency, response state, and validation cleanup", async () => {
      const result = await service.cleanupReferencesAfterFileMutation("acp-1");

      expect(unitParserService.pruneMissingDependencies).toHaveBeenCalledWith(
        "acp-1",
      );
      expect(validationService.autoValidateUploadedFiles).toHaveBeenCalledWith(
        "acp-1",
        expect.any(Array),
      );
      expect(result).toEqual(
        expect.objectContaining({
          cleanupReport: expect.objectContaining({
            unitsUpdated: 0,
            dependenciesRemoved: 0,
            bookletsUpdated: 0,
            bookletDefinitionsRemoved: 0,
            indexUpdated: false,
          }),
          responseStateCleanup: expect.objectContaining({
            totalStates: 0,
            deletedStates: 0,
            keptStates: 0,
          }),
          validationSummary: expect.objectContaining({
            totalFiles: 1,
          }),
        }),
      );
    });

    it("can skip validation step for bulk mutation flows", async () => {
      const result = await service.cleanupReferencesAfterFileMutation("acp-1", {
        skipValidation: true,
      });

      expect(unitParserService.pruneMissingDependencies).toHaveBeenCalledWith(
        "acp-1",
      );
      expect(
        validationService.autoValidateUploadedFiles,
      ).not.toHaveBeenCalled();
      expect(result.validationSummary).toBeUndefined();
    });
  });

  describe("updateValidationResult", () => {
    it("should update validation result", async () => {
      const result = {
        valid: true,
        issues: [],
        timestamp: new Date().toISOString(),
      };
      repo.findOne.mockResolvedValue({ ...mockFile });
      await service.updateValidationResult("file-1", result);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ validationResult: result }),
      );
    });

    it("returns validation results via generic and ACP-scoped APIs", async () => {
      repo.findOne.mockResolvedValue({
        ...mockFile,
        validationResult: { valid: true },
      });

      await expect(service.getValidationResult("file-1")).resolves.toEqual({
        valid: true,
      });
      await expect(
        service.getValidationResultForAcp("acp-1", "file-1"),
      ).resolves.toEqual({ valid: true });
    });
  });

  describe("getPreviewForAcp", () => {
    it("builds a structured preview for unit XML files", async () => {
      repo.findOne.mockResolvedValueOnce({
        ...mockFile,
        originalName: "unit-1.xml",
        filePath: "/uploads/acp-1/unit-1.xml",
        fileType: "application/xml",
      });
      (fs.readFile as jest.Mock).mockResolvedValueOnce(`<?xml version="1.0"?>
<Unit>
  <Id>unit-1</Id>
  <Label>Unit 1</Label>
  <DefinitionRef player="iqb-player-aspect@2.11">unit-1.voud</DefinitionRef>
  <CodingSchemeRef>unit-1.vocs</CodingSchemeRef>
  <Reference>unit-1.vomd</Reference>
</Unit>`);

      const preview = await service.getPreviewForAcp("acp-1", "file-1");

      expect(preview).toEqual(
        expect.objectContaining({
          mode: "structured",
          textFormat: "xml",
          structuredData: expect.objectContaining({
            type: "unit-xml",
            unitId: "unit-1",
          }),
        }),
      );
      expect(preview.textContent).toContain("<Unit>");
    });

    it("builds a structured preview for VOMD files", async () => {
      repo.findOne.mockResolvedValueOnce({
        ...mockFile,
        originalName: "unit-1.vomd",
        filePath: "/uploads/acp-1/unit-1.vomd",
        fileType: "application/json",
      });
      (fs.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          profiles: [
            {
              entries: [
                {
                  id: "difficulty",
                  label: [{ lang: "de", value: "Schwierigkeit" }],
                  valueAsText: [{ lang: "de", value: "mittel" }],
                },
              ],
            },
          ],
          items: [
            {
              id: "item-1",
              description: "Aufgabe 1",
              variableId: "VAR_1",
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
        }),
      );

      const preview = await service.getPreviewForAcp("acp-1", "file-1");

      expect(preview).toEqual(
        expect.objectContaining({
          mode: "structured",
          textFormat: "json",
          structuredData: expect.objectContaining({
            type: "vomd",
            itemCount: 1,
            unitProfiles: [
              expect.objectContaining({
                id: "difficulty",
                value: "mittel",
              }),
            ],
          }),
        }),
      );
    });

    it("returns all VOCS variables and codes without preview truncation", async () => {
      const variables = Array.from({ length: 25 }, (_, variableIndex) => ({
        id: `VAR_${variableIndex + 1}`,
        label: [{ lang: "de", value: `Variable ${variableIndex + 1}` }],
        codes: Array.from({ length: 15 }, (_, codeIndex) => ({
          id: codeIndex,
          score: codeIndex,
          label: [{ lang: "de", value: `Code ${codeIndex}` }],
        })),
      }));

      repo.findOne.mockResolvedValueOnce({
        ...mockFile,
        originalName: "unit-1.vocs",
        filePath: "/uploads/acp-1/unit-1.vocs",
        fileType: "application/json",
      });
      (fs.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ variableCodings: variables }),
      );

      const preview = await service.getPreviewForAcp("acp-1", "file-1");

      expect(preview).toEqual(
        expect.objectContaining({
          mode: "structured",
          structuredData: expect.objectContaining({
            type: "vocs",
            variableCount: 25,
            codeCount: 375,
          }),
        }),
      );

      const structured = preview.structuredData as any;
      expect(structured.variables).toHaveLength(25);
      expect(structured.variables[0].codes).toHaveLength(15);
      expect(structured.variables[24].id).toBe("VAR_25");
    });

    it("returns image previews without loading file contents", async () => {
      repo.findOne.mockResolvedValueOnce({
        ...mockFile,
        originalName: "diagram.png",
        filePath: "/uploads/acp-1/diagram.png",
        fileType: "image/png",
      });
      (fs.readFile as jest.Mock).mockClear();

      const preview = await service.getPreviewForAcp("acp-1", "file-1");

      expect(preview).toEqual(
        expect.objectContaining({
          mode: "image",
          truncated: false,
        }),
      );
      expect(fs.readFile).not.toHaveBeenCalled();
    });
  });

  describe("createUnitZip", () => {
    it("should create a ZIP for a single unit", async () => {
      repo.find.mockResolvedValue([
        { ...mockFile, id: "f1", originalName: "test.json" },
        { ...mockFile, id: "f2", originalName: "unit-1.xml" },
      ]);
      const result = await service.createUnitZip("acp-1", "unit-1");
      expect(result.fileName).toBe("acp-acp-1-unit-unit-1.zip");
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("should throw when unit has no files", async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.createUnitZip("acp-1", "unit-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("createSequenceZip", () => {
    it("should create a ZIP for all units in a sequence", async () => {
      repo.find.mockResolvedValue([
        { ...mockFile, id: "f1", originalName: "test.json" },
        { ...mockFile, id: "f2", originalName: "unit-1.xml" },
        { ...mockFile, id: "f3", originalName: "second.json" },
        { ...mockFile, id: "f4", originalName: "unit-2.xml" },
      ]);
      const result = await service.createSequenceZip("acp-1", "seq-1");
      expect(result.fileName).toBe("acp-acp-1-sequence-seq-1.zip");
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("should throw when sequence does not exist", async () => {
      await expect(
        service.createSequenceZip("acp-1", "unknown-seq"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw when sequence exists but no files are available", async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.createSequenceZip("acp-1", "seq-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("feature config and dependency checks", () => {
    it("returns normalized feature config", async () => {
      accessConfigRepo.findOne.mockResolvedValue({
        featureConfig: {
          itemListMetadataColumns: ["metaA"],
        },
      });

      await expect(service.getFeatureConfig("acp-1")).resolves.toEqual(
        expect.objectContaining({
          metadataColumns: {
            visible: ["metaA"],
            order: ["metaA"],
          },
        }),
      );
    });

    it("detects dependency files from ACP index", async () => {
      await expect(
        service.isUnitDependencyFile("acp-1", "unit-1.xml"),
      ).resolves.toBe(true);
      await expect(
        service.isUnitDependencyFile("acp-1", "test.json"),
      ).resolves.toBe(true);
      await expect(
        service.isUnitDependencyFile("acp-1", "missing.json"),
      ).resolves.toBe(false);
    });
  });
});
