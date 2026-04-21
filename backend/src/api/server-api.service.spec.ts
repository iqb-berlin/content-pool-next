import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ServerApiService } from "./server-api.service";
import { Acp, AcpFile } from "../database/entities";
import { FilesService } from "../files/files.service";
import { SnapshotsService } from "../snapshots/snapshots.service";

describe("ServerApiService", () => {
  let service: ServerApiService;
  let acpRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let fileRepository: { find: jest.Mock; findOne: jest.Mock };
  let filesService: {
    deleteForAcp: jest.Mock;
    upload: jest.Mock;
    uploadMultiple: jest.Mock;
    downloadForAcp: jest.Mock;
    cleanupReferencesAfterFileMutation: jest.Mock;
  };
  let snapshotsService: { create: jest.Mock };

  beforeEach(async () => {
    acpRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({ ...value })),
    };

    fileRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    filesService = {
      deleteForAcp: jest.fn(),
      upload: jest.fn(),
      uploadMultiple: jest.fn(),
      downloadForAcp: jest.fn(),
      cleanupReferencesAfterFileMutation: jest.fn().mockResolvedValue({
        cleanupReport: {
          unitsUpdated: 0,
          dependenciesRemoved: 0,
          bookletsUpdated: 0,
          bookletDefinitionsRemoved: 0,
          indexUpdated: false,
        },
        responseStateCleanup: {
          totalStates: 0,
          deletedStates: 0,
          keptStates: 0,
        },
      }),
    };

    snapshotsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServerApiService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        { provide: FilesService, useValue: filesService },
        { provide: SnapshotsService, useValue: snapshotsService },
      ],
    }).compile();

    service = module.get<ServerApiService>(ServerApiService);
  });

  it("rejects import when package exists and conflictStrategy=reject", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    await expect(
      service.receiveAcp(
        {
          packageId: "pkg-1",
          name: "Demo",
          acpIndex: { version: "0.5.0" },
        },
        "reject",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("merges existing ACP index when conflictStrategy=merge", async () => {
    const existing = {
      id: "acp-1",
      packageId: "pkg-1",
      name: "Old",
      description: "Old Desc",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {
        header: { a: 1 },
        nested: { x: 1 },
      },
    } as any;

    acpRepository.findOne.mockResolvedValue(existing);
    acpRepository.save.mockImplementation(async (value) => ({
      ...value,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    }));

    const result = await service.receiveAcp(
      {
        packageId: "pkg-1",
        name: "New Name",
        description: "New Desc",
        acpIndex: {
          nested: { y: 2 },
          extra: true,
        },
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
      "merge",
    );

    expect(result.operation).toBe("updated");
    expect(result.conflictStrategy).toBe("merge");
    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Name",
        description: "New Desc",
        acpIndex: {
          header: { a: 1 },
          nested: { x: 1, y: 2 },
          extra: true,
        },
      }),
    );
  });

  it("throws conflict on index update when expectedUpdatedAt mismatches", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    await expect(
      service.updateAcpIndex(
        "acp-1",
        { version: "0.5.0" },
        "overwrite",
        "2026-01-02T00:00:00.000Z",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects file upload when duplicate filename exists and conflictStrategy=reject", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "unit.xml",
      },
    ]);
    filesService.uploadMultiple.mockRejectedValueOnce(
      new ConflictException("conflict"),
    );

    await expect(
      service.uploadFiles(
        "acp-1",
        [
          {
            originalname: "unit.xml",
            buffer: Buffer.from("x"),
            size: 1,
            mimetype: "text/xml",
          } as Express.Multer.File,
        ],
        "reject",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("replaces existing coding schemes and creates a snapshot with changelog", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "UNIT-1.VOCS",
      },
    ]);

    filesService.upload.mockResolvedValue({
      id: "file-2",
      acpId: "acp-1",
      originalName: "UNIT-1.VOCS",
      fileType: "application/json",
      fileSize: 10,
      checksum: "abc",
      uploadedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    snapshotsService.create.mockResolvedValue({
      id: "snap-7",
      versionNumber: 7,
      changelog: "Kodierschema aktualisiert",
      createdAt: new Date("2026-01-02T01:00:00.000Z"),
    });

    const result = await service.replaceCodingSchemeFiles(
      "acp-1",
      [
        {
          originalname: "unit-1.vocs",
          buffer: Buffer.from("{}"),
          size: 2,
          mimetype: "application/json",
        } as Express.Multer.File,
      ],
      {
        changelog: "Kodierschema aktualisiert",
        sourceClientId: "coding-box",
      },
    );

    expect(filesService.deleteForAcp).toHaveBeenCalledWith("acp-1", "file-1");
    expect(filesService.upload).toHaveBeenCalledWith(
      "acp-1",
      expect.objectContaining({ originalname: "UNIT-1.VOCS" }),
    );
    expect(
      filesService.cleanupReferencesAfterFileMutation,
    ).toHaveBeenCalledWith("acp-1", { skipValidation: true });
    expect(snapshotsService.create).toHaveBeenCalledWith(
      "acp-1",
      "Kodierschema aktualisiert",
    );
    expect(result.snapshot.versionNumber).toBe(7);
    expect(result.replacedFiles).toHaveLength(1);
  });

  it("fails replacement if coding scheme does not exist in ACP", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([]);

    await expect(
      service.replaceCodingSchemeFiles("acp-1", [
        {
          originalname: "unit-1.vocs",
          buffer: Buffer.from("{}"),
          size: 2,
          mimetype: "application/json",
        } as Express.Multer.File,
      ]),
    ).rejects.toThrow(NotFoundException);
  });

  it("fails replacement when a non-vocs file is provided", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([]);

    await expect(
      service.replaceCodingSchemeFiles("acp-1", [
        {
          originalname: "unit-1.xml",
          buffer: Buffer.from("<xml/>"),
          size: 6,
          mimetype: "text/xml",
        } as Express.Multer.File,
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it("lists ACPs with version fallback and ISO timestamps", async () => {
    acpRepository.find.mockResolvedValue([
      {
        id: "acp-2",
        packageId: "pkg-2",
        name: "Second",
        acpIndex: {},
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        id: "acp-1",
        packageId: "pkg-1",
        name: "First",
        acpIndex: { version: "1.2.3" },
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    await expect(service.listAcps()).resolves.toEqual([
      {
        id: "acp-2",
        packageId: "pkg-2",
        name: "Second",
        version: "0.0.0",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "acp-1",
        packageId: "pkg-1",
        name: "First",
        version: "1.2.3",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("returns transfer payload and index payload for existing ACPs", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      name: "Demo",
      description: "desc",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: { version: "0.5.0" },
    });
    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "unit.xml",
        fileType: "text/xml",
        fileSize: 21,
        checksum: "abc",
        uploadedAt: new Date("2026-01-01T01:00:00.000Z"),
      },
    ]);

    const transfer = await service.getAcpTransferData("acp-1");
    expect(transfer).toEqual({
      id: "acp-1",
      packageId: "pkg-1",
      name: "Demo",
      description: "desc",
      updatedAt: "2026-01-01T00:00:00.000Z",
      acpIndex: { version: "0.5.0" },
      files: [
        {
          id: "file-1",
          originalName: "unit.xml",
          fileType: "text/xml",
          fileSize: 21,
          checksum: "abc",
          uploadedAt: "2026-01-01T01:00:00.000Z",
          downloadUrl: "/api/server/acp/acp-1/files/file-1/download",
        },
      ],
    });

    const index = await service.getAcpIndex("acp-1");
    expect(index).toEqual({
      acpId: "acp-1",
      packageId: "pkg-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      acpIndex: { version: "0.5.0" },
    });
  });

  it("returns empty index object if ACP index is missing", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: undefined,
    });

    await expect(service.getAcpIndex("acp-1")).resolves.toEqual({
      acpId: "acp-1",
      packageId: "pkg-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      acpIndex: {},
    });
  });

  it("rejects invalid index update payload and invalid strategy values", async () => {
    await expect(
      service.updateAcpIndex("acp-1", [] as any, "overwrite"),
    ).rejects.toThrow(BadRequestException);

    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    await expect(
      service.updateAcpIndex("acp-1", { version: "0.5.0" }, "invalid-strategy"),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.updateAcpIndex(
        "acp-1",
        { version: "0.5.0" },
        "overwrite",
        "not-a-date",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("lists and reads transfer files and throws when file is missing", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "unit.xml",
        fileType: "text/xml",
        fileSize: 12,
        checksum: "x",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    fileRepository.findOne
      .mockResolvedValueOnce({
        id: "file-1",
        acpId: "acp-1",
        originalName: "unit.xml",
        fileType: "text/xml",
        fileSize: 12,
        checksum: "x",
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .mockResolvedValueOnce(null);

    await expect(service.listFiles("acp-1")).resolves.toHaveLength(1);
    await expect(service.getFile("acp-1", "file-1")).resolves.toEqual(
      expect.objectContaining({
        id: "file-1",
        downloadUrl: "/api/server/acp/acp-1/files/file-1/download",
      }),
    );
    await expect(service.getFile("acp-1", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws when file operations are requested for a missing ACP", async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(service.listFiles("missing-acp")).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.downloadFile("missing-acp", "file-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("downloads files through FilesService when ACP exists", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    filesService.downloadForAcp.mockResolvedValue({
      buffer: Buffer.from("x"),
      file: { id: "f1" },
    });

    await expect(service.downloadFile("acp-1", "f1")).resolves.toEqual({
      buffer: Buffer.from("x"),
      file: { id: "f1" },
    });
    expect(filesService.downloadForAcp).toHaveBeenCalledWith("acp-1", "f1");
  });

  it("rejects upload requests without files or with invalid conflictStrategy", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });

    await expect(service.uploadFiles("acp-1", [])).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.uploadFiles(
        "acp-1",
        [{ originalname: "f.xml" } as any],
        "invalid",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("supports keep-both and overwrite upload conflict strategies", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([
      {
        id: "file-old",
        acpId: "acp-1",
        originalName: "unit.xml",
      },
    ]);
    filesService.uploadMultiple
      .mockResolvedValueOnce([
        {
          id: "file-new-1",
          acpId: "acp-1",
          originalName: "unit.xml",
          fileType: "text/xml",
          fileSize: 10,
          checksum: "a",
          uploadedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ] as AcpFile[])
      .mockResolvedValueOnce([
        {
          id: "file-new-2",
          acpId: "acp-1",
          originalName: "unit.xml",
          fileType: "text/xml",
          fileSize: 11,
          checksum: "b",
          uploadedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ] as AcpFile[]);

    const keepBoth = await service.uploadFiles(
      "acp-1",
      [{ originalname: "bundle.zip" } as any],
      "keep-both",
    );
    expect(keepBoth[0]).toEqual(
      expect.objectContaining({
        id: "file-new-1",
        fileSize: 10,
      }),
    );
    expect(filesService.uploadMultiple).toHaveBeenNthCalledWith(
      1,
      "acp-1",
      [{ originalname: "bundle.zip" }],
      "keep-both",
    );
    expect(
      filesService.cleanupReferencesAfterFileMutation,
    ).not.toHaveBeenCalled();

    const overwrite = await service.uploadFiles(
      "acp-1",
      [{ originalname: "bundle.zip" } as any],
      "overwrite",
    );
    expect(overwrite[0]).toEqual(expect.objectContaining({ id: "file-new-2" }));
    expect(filesService.uploadMultiple).toHaveBeenNthCalledWith(
      2,
      "acp-1",
      [{ originalname: "bundle.zip" }],
      "overwrite",
    );
    expect(
      filesService.cleanupReferencesAfterFileMutation,
    ).toHaveBeenCalledWith("acp-1", { skipValidation: true });
  });

  it("validates replacement file list details before processing", async () => {
    await expect(service.replaceCodingSchemeFiles("acp-1", [])).rejects.toThrow(
      BadRequestException,
    );

    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "UNIT-1.VOCS",
      },
    ]);

    await expect(
      service.replaceCodingSchemeFiles("acp-1", [
        { originalname: "   " } as any,
      ]),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.replaceCodingSchemeFiles("acp-1", [
        { originalname: "unit-1.vocs" } as any,
        { originalname: "UNIT-1.VOCS" } as any,
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it("generates default coding scheme changelog with source client suffix", async () => {
    acpRepository.findOne.mockResolvedValue({
      id: "acp-1",
      packageId: "pkg-1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: {},
    });
    fileRepository.find.mockResolvedValue([
      {
        id: "file-1",
        acpId: "acp-1",
        originalName: "UNIT-1.VOCS",
      },
    ]);
    filesService.upload.mockResolvedValue({
      id: "file-2",
      acpId: "acp-1",
      originalName: "UNIT-1.VOCS",
      fileType: "application/json",
      fileSize: 10,
      checksum: "abc",
      uploadedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    snapshotsService.create.mockResolvedValue({
      id: "snap-7",
      versionNumber: 7,
      changelog: "generated",
      createdAt: new Date("2026-01-02T01:00:00.000Z"),
    });

    await service.replaceCodingSchemeFiles(
      "acp-1",
      [{ originalname: "unit-1.vocs" } as any],
      { sourceClientId: "sync-agent" },
    );

    expect(snapshotsService.create).toHaveBeenCalledWith(
      "acp-1",
      "Kodierschema ersetzt via sync-agent: UNIT-1.VOCS",
    );
    expect(
      filesService.cleanupReferencesAfterFileMutation,
    ).toHaveBeenCalledWith("acp-1", { skipValidation: true });
  });

  it("validates receiveAcp payload shape and conflictStrategy", async () => {
    await expect(
      service.receiveAcp({ packageId: "", name: "x", acpIndex: {} } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.receiveAcp({
        packageId: "pkg-1",
        name: " ",
        acpIndex: {},
      } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.receiveAcp({
        packageId: "pkg-1",
        name: "x",
        acpIndex: [] as any,
      } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.receiveAcp(
        { packageId: "pkg-1", name: "x", acpIndex: {} },
        "invalid",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates a new ACP when package id is not known", async () => {
    acpRepository.findOne.mockResolvedValue(null);
    acpRepository.save.mockResolvedValue({
      id: "acp-created",
      packageId: "pkg-1",
      name: "New ACP",
      description: "",
      acpIndex: { version: "0.5.0" },
      settings: {},
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await service.receiveAcp(
      { packageId: "pkg-1", name: "New ACP", acpIndex: { version: "0.5.0" } },
      "overwrite",
    );

    expect(acpRepository.create).toHaveBeenCalledWith({
      packageId: "pkg-1",
      name: "New ACP",
      description: "",
      acpIndex: { version: "0.5.0" },
      settings: {},
    });
    expect(result.operation).toBe("created");
    expect(result.conflictStrategy).toBe("overwrite");
  });

  it("overwrites existing ACP index when conflictStrategy=overwrite", async () => {
    const existing = {
      id: "acp-1",
      packageId: "pkg-1",
      name: "Old",
      description: "Old",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      acpIndex: { previous: true },
    } as any;
    acpRepository.findOne.mockResolvedValue(existing);
    acpRepository.save.mockImplementation(async (value) => ({
      ...value,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    }));

    const result = await service.receiveAcp(
      {
        packageId: "pkg-1",
        name: "Updated",
        description: "Updated Desc",
        acpIndex: { replaced: true },
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
      "overwrite",
    );

    expect(result.operation).toBe("updated");
    expect(result.conflictStrategy).toBe("overwrite");
    expect(acpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated",
        description: "Updated Desc",
        acpIndex: { replaced: true },
      }),
    );
  });
});
