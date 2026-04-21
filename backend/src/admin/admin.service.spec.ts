import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { AdminService } from "./admin.service";
import { AppSettings } from "../database/entities";
import { DEFAULT_ACP_INDEX_VERSION } from "../acp/acp-index.utils";
import {
  GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
  getGeoGebraBundleCurrentDir,
} from "./geogebra-bundle.util";

describe("AdminService", () => {
  let service: AdminService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let tempStoragePath: string;

  beforeEach(async () => {
    tempStoragePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "content-pool-geogebra-"),
    );
    process.env.FILE_STORAGE_PATH = tempStoragePath;

    repo = {
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((dto) => ({ id: "settings-1", ...dto })),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(AppSettings), useValue: repo },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(async () => {
    await fs.rm(tempStoragePath, { recursive: true, force: true });
    delete process.env.FILE_STORAGE_PATH;
  });

  it("creates default settings when none exist", async () => {
    repo.findOne.mockResolvedValueOnce(null);

    const result = await service.getSettings();

    expect(repo.create).toHaveBeenCalledWith({
      theme: {},
      language: "de",
      defaultAcpIndex: {
        version: DEFAULT_ACP_INDEX_VERSION,
        assessmentParts: [],
      },
      geoGebraBundle: null,
    });
    expect(repo.save).toHaveBeenCalled();
    expect(result.language).toBe("de");
  });

  it("normalizes legacy GeoGebra metadata to the API-backed path on read", async () => {
    repo.findOne.mockResolvedValue({
      id: "settings-1",
      theme: {},
      language: "de",
      defaultAcpIndex: {},
      geoGebraBundle: {
        sourceFileName: "GeoGebra.itcr.zip",
        deployScriptUrl: "/assets/GeoGebra/GeoGebra/deployggb.js",
        publicBasePath: "/assets/GeoGebra/",
        checksum: "abc",
        entryCount: 2,
        uploadedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    } as AppSettings);

    const result = await service.getSettings();

    expect(result.geoGebraBundle).toEqual(
      expect.objectContaining({
        deployScriptUrl: GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
        publicBasePath: "/api/shared-assets",
      }),
    );
  });

  it("updates theme and default ACP index settings", async () => {
    const existing = {
      id: "settings-1",
      theme: {},
      language: "de",
      logoUrl: undefined,
      landingPageHtml: undefined,
      imprintHtml: undefined,
      privacyHtml: undefined,
      accessibilityHtml: undefined,
      defaultAcpIndex: {},
      geoGebraBundle: null,
      updatedAt: new Date(),
    } as AppSettings;

    repo.findOne.mockResolvedValue(existing);

    const updated = await service.updateSettings({
      language: "en",
      logoUrl: "https://example.org/logo.svg",
      theme: { "--color-primary": "#123456" },
      defaultAcpIndex: { quality: "standard" },
      landingPageHtml: "<p>Landing</p>",
      imprintHtml: "<p>Imprint</p>",
      privacyHtml: "<p>Privacy</p>",
      accessibilityHtml: "<p>Accessibility</p>",
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
        logoUrl: "https://example.org/logo.svg",
        theme: { "--color-primary": "#123456" },
        defaultAcpIndex: { quality: "standard" },
      }),
    );

    expect(updated.language).toBe("en");
    expect(updated.defaultAcpIndex).toEqual({ quality: "standard" });
  });

  it("extracts and activates a GeoGebra bundle from a ZIP upload", async () => {
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file("GeoGebra.itcr/GeoGebra/deployggb.js", "console.log('ggb');");
    zip.file(
      "GeoGebra.itcr/GeoGebra/HTML5/5.0/web/web.nocache.js",
      "console.log('web');",
    );
    zip.file("GeoGebra.itcr/README.txt", "metadata");
    zip.file("__MACOSX/GeoGebra.itcr/._GeoGebra", "");

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const existing = {
      id: "settings-1",
      theme: {},
      language: "de",
      defaultAcpIndex: {},
      geoGebraBundle: null,
      updatedAt: new Date(),
    } as AppSettings;
    repo.findOne.mockResolvedValue(existing);

    const result = await service.uploadGeoGebraBundle({
      originalname: "GeoGebra.itcr.zip",
      buffer,
    } as Express.Multer.File);

    await expect(
      fs.readFile(
        path.join(getGeoGebraBundleCurrentDir(), "GeoGebra", "deployggb.js"),
        "utf-8",
      ),
    ).resolves.toContain("ggb");
    await expect(
      fs.readFile(
        path.join(
          getGeoGebraBundleCurrentDir(),
          "GeoGebra",
          "HTML5",
          "5.0",
          "web",
          "web.nocache.js",
        ),
        "utf-8",
      ),
    ).resolves.toContain("web");

    expect(result.geoGebraBundle).toEqual(
      expect.objectContaining({
        sourceFileName: "GeoGebra.itcr.zip",
        deployScriptUrl: GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
        publicBasePath: "/api/shared-assets",
        entryCount: 2,
      }),
    );
  });

  it("rejects ZIP uploads without deployggb.js", async () => {
    const JSZip = require("jszip");
    const zip = new JSZip();
    zip.file("GeoGebra.itcr/GeoGebra/HTML5/5.0/web/web.nocache.js", "web");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(
      service.uploadGeoGebraBundle({
        originalname: "GeoGebra.itcr.zip",
        buffer,
      } as Express.Multer.File),
    ).rejects.toThrow("must contain GeoGebra/deployggb.js");
  });

  it("removes the installed GeoGebra bundle and clears metadata", async () => {
    const currentDir = getGeoGebraBundleCurrentDir();
    await fs.mkdir(path.join(currentDir, "GeoGebra"), { recursive: true });
    await fs.writeFile(
      path.join(currentDir, "GeoGebra", "deployggb.js"),
      "console.log('ggb');",
    );

    const existing = {
      id: "settings-1",
      theme: {},
      language: "de",
      defaultAcpIndex: {},
      geoGebraBundle: {
        sourceFileName: "GeoGebra.itcr.zip",
        deployScriptUrl: GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
        publicBasePath: "/api/shared-assets",
        checksum: "abc",
        entryCount: 2,
        uploadedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    } as AppSettings;
    repo.findOne.mockResolvedValue(existing);

    const result = await service.deleteGeoGebraBundle();

    await expect(fs.access(currentDir)).rejects.toThrow();
    expect(result.geoGebraBundle).toBeNull();
  });
});
