import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AdminService } from "./admin.service";
import { AppSettings } from "../database/entities";
import { DEFAULT_ACP_INDEX_VERSION } from "../acp/acp-index.utils";

describe("AdminService", () => {
  let service: AdminService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
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
    });
    expect(repo.save).toHaveBeenCalled();
    expect(result.language).toBe("de");
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
});
