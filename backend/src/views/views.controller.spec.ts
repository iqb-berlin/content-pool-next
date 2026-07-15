import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ViewsController } from "./views.controller";

describe("ViewsController", () => {
  let controller: ViewsController;
  let viewsService: any;
  let itemExplorerStateService: any;

  beforeEach(() => {
    viewsService = {
      getPublicSettings: jest
        .fn()
        .mockResolvedValue({ theme: { primary: "#000" } }),
      getPublicAcps: jest.fn().mockResolvedValue([{ id: "acp-1" }]),
      getAcpStartPage: jest.fn().mockResolvedValue({
        units: [{ id: "unit-1" }],
        sequences: [{ id: "seq-1" }],
        featureConfig: {
          allowIndexDownload: true,
          enableUnitView: true,
          enableItemList: true,
          enableSequenceNavigation: true,
          persistUserPreferences: true,
          enablePersonalItemData: true,
          enableItemCollections: true,
        },
      }),
      getAcpIndex: jest.fn().mockResolvedValue({ packageId: "pkg-1" }),
      getUnitViewData: jest.fn().mockResolvedValue({ unitId: "unit-1" }),
      getItemList: jest.fn().mockResolvedValue([{ itemId: "item-1" }]),
      getItemPreferences: jest
        .fn()
        .mockResolvedValue({ ui: { q: 1 }, tags: { item1: ["A"] } }),
      saveItemPreferences: jest
        .fn()
        .mockResolvedValue({ ui: { q: 2 }, tags: { item1: ["B"] } }),
      patchPersonalItemPreferenceRow: jest.fn().mockResolvedValue({
        rowData: { "uuid::1": { note: "mine" } },
      }),
      exportPersonalItemDataXlsx: jest
        .fn()
        .mockResolvedValue(Buffer.from("personal-xlsx")),
      exportAllPersonalItemDataCsv: jest
        .fn()
        .mockResolvedValue(Buffer.from("all-personal-csv")),
      getItemCollections: jest.fn().mockResolvedValue({
        activeCollectionId: "collection-1",
        collections: [],
      }),
      createItemCollection: jest.fn().mockResolvedValue({
        activeCollectionId: "collection-1",
        collections: [],
      }),
      updateItemCollection: jest.fn().mockResolvedValue({
        activeCollectionId: "collection-1",
        collections: [],
      }),
      activateItemCollection: jest.fn().mockResolvedValue({
        activeCollectionId: "collection-1",
        collections: [],
      }),
      deleteItemCollection: jest.fn().mockResolvedValue({
        activeCollectionId: null,
        collections: [],
      }),
      exportItemCollectionCsv: jest
        .fn()
        .mockResolvedValue(Buffer.from("collection-csv")),
      getTaskSequence: jest
        .fn()
        .mockResolvedValue({ id: "seq-1", units: [{ id: "unit-1" }] }),
    };

    itemExplorerStateService = {
      getStateForViewer: jest
        .fn()
        .mockResolvedValue({ status: "CLEAN", canEdit: false }),
    };

    controller = new ViewsController(viewsService, itemExplorerStateService);
  });

  it("returns public settings and ACP list", async () => {
    await expect(controller.getPublicSettings()).resolves.toEqual({
      theme: { primary: "#000" },
    });
    await expect(controller.getPublicAcps()).resolves.toEqual([
      { id: "acp-1" },
    ]);
  });

  it("returns ACP start page and ACP index", async () => {
    await expect(controller.getAcpStartPage("acp-1")).resolves.toEqual(
      expect.objectContaining({ units: [{ id: "unit-1" }] }),
    );
    await expect(controller.getAcpIndex("acp-1")).resolves.toEqual({
      packageId: "pkg-1",
    });
  });

  it("exports ACP index for managers and sets response headers", async () => {
    const res = { setHeader: jest.fn(), json: jest.fn() } as any;

    await controller.exportAcpIndex(
      "acp-1",
      { acpAccessLevel: "MANAGER" },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="acp-index-acp-1.json"',
    );
    expect(res.json).toHaveBeenCalledWith({ packageId: "pkg-1" });
  });

  it("blocks ACP index export when feature is disabled for non-managers", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { allowIndexDownload: false },
    });

    await expect(
      controller.exportAcpIndex(
        "acp-1",
        { acpAccessLevel: "PUBLIC" },
        {} as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("returns units and supports empty fallback", async () => {
    await expect(controller.getUnits("acp-1")).resolves.toEqual([
      { id: "unit-1" },
    ]);

    viewsService.getAcpStartPage.mockResolvedValueOnce({});
    await expect(controller.getUnits("acp-1")).resolves.toEqual([]);
  });

  it("blocks unit view when feature is disabled for non-managers", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableUnitView: false },
    });

    await expect(
      controller.getUnit("acp-1", "unit-1", { acpAccessLevel: "PUBLIC" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("uses default allow=true for unit view when flag is unset", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: {},
    });

    await expect(
      controller.getUnit("acp-1", "unit-1", { acpAccessLevel: "PUBLIC" }),
    ).resolves.toEqual({ unitId: "unit-1" });
  });

  it("returns unit view for managers regardless of feature config", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableUnitView: false },
    });

    await expect(
      controller.getUnit("acp-1", "unit-1", { acpAccessLevel: "MANAGER" }),
    ).resolves.toEqual({ unitId: "unit-1" });
  });

  it("uses default allow=true for item list when flag is unset", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({ featureConfig: {} });

    await expect(
      controller.getItems("acp-1", { acpAccessLevel: "PUBLIC" }),
    ).resolves.toEqual([{ itemId: "item-1" }]);
  });

  it("blocks item list when explicitly disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enableItemList: false },
    });

    await expect(
      controller.getItems("acp-1", { acpAccessLevel: "PUBLIC" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("returns item explorer state with edit flag derived from access level", async () => {
    await controller.getItemExplorerState("acp-1", {
      acpAccessLevel: "MANAGER",
    });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith(
      "acp-1",
      true,
    );

    await controller.getItemExplorerState("acp-1", {
      acpAccessLevel: "PUBLIC",
    });
    expect(itemExplorerStateService.getStateForViewer).toHaveBeenCalledWith(
      "acp-1",
      false,
    );
  });

  it("returns empty preferences when persistence is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { persistUserPreferences: false },
    });

    const result = await controller.getItemPreferences(
      "acp-1",
      { user: { sub: "u-1" } },
      "item-list",
    );

    expect(result).toEqual({ ui: {}, tags: {}, rowData: {} });
    expect(viewsService.getItemPreferences).not.toHaveBeenCalled();
  });

  it("loads and saves preferences when persistence is enabled", async () => {
    await expect(
      controller.getItemPreferences(
        "acp-1",
        { user: { sub: "u-1" } },
        "item-list",
      ),
    ).resolves.toEqual({ ui: { q: 1 }, tags: { item1: ["A"] } });

    await expect(
      controller.saveItemPreferences(
        "acp-1",
        { viewId: "item-list", ui: { filter: "x" }, tags: { item2: ["B"] } },
        { user: { sub: "u-1" } },
      ),
    ).resolves.toEqual({ ui: { q: 2 }, tags: { item1: ["B"] } });
  });

  it("rejects full-map personal Explorer saves", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        persistUserPreferences: false,
        enablePersonalItemData: true,
      },
    });

    await expect(
      controller.saveItemPreferences(
        "acp-1",
        { viewId: "item-explorer", rowData: { "uuid::1": { note: "mine" } } },
        { user: { sub: "u-1" } },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(viewsService.saveItemPreferences).not.toHaveBeenCalled();
  });

  it.each(["item-explorer", " item-explorer "])(
    "rejects generic %s saves even when row data is omitted",
    async (viewId) => {
      viewsService.getAcpStartPage.mockResolvedValue({
        featureConfig: {
          persistUserPreferences: true,
          enablePersonalItemData: true,
        },
      });

      await expect(
        controller.saveItemPreferences(
          "acp-1",
          { viewId, ui: { filter: "mine" } },
          { user: { sub: "u-1" } },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(viewsService.saveItemPreferences).not.toHaveBeenCalled();
    },
  );

  it("patches one personal Explorer row when the feature is enabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        persistUserPreferences: false,
        enablePersonalItemData: true,
      },
    });

    await controller.patchPersonalItemRow(
      "acp-1",
      {
        rowKey: "uuid::1",
        rowData: { note: "mine" },
        perspective: "read-only",
      },
      { user: { sub: "u-1" } },
    );

    expect(viewsService.patchPersonalItemPreferenceRow).toHaveBeenCalledWith(
      "acp-1",
      { sub: "u-1" },
      "uuid::1",
      { note: "mine" },
      "item-explorer",
      false,
    );
  });

  it("uses the manager draft when validating personal item rows", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enablePersonalItemData: true },
    });

    await controller.patchPersonalItemRow(
      "acp-1",
      {
        rowKey: "uuid::draft",
        rowData: { note: "mine" },
        perspective: "editor",
      },
      { user: { sub: "u-1" }, acpAccessLevel: "MANAGER" },
    );

    expect(viewsService.patchPersonalItemPreferenceRow).toHaveBeenCalledWith(
      "acp-1",
      { sub: "u-1" },
      "uuid::draft",
      { note: "mine" },
      "item-explorer",
      true,
    );
  });

  it("uses published state for a manager read-only preview", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enablePersonalItemData: true },
    });

    await controller.patchPersonalItemRow(
      "acp-1",
      {
        rowKey: "uuid::published",
        rowData: { note: "mine" },
        perspective: "read-only",
      },
      { user: { sub: "u-1" }, acpAccessLevel: "MANAGER" },
    );

    expect(viewsService.patchPersonalItemPreferenceRow).toHaveBeenCalledWith(
      "acp-1",
      { sub: "u-1" },
      "uuid::published",
      { note: "mine" },
      "item-explorer",
      false,
    );
  });

  it("does not allow credentials to select the editor state", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enablePersonalItemData: true },
    });

    await controller.patchPersonalItemRow(
      "acp-1",
      {
        rowKey: "uuid::published",
        rowData: { note: "mine" },
        perspective: "editor",
      },
      { user: { sub: "credential-1" }, acpAccessLevel: "CREDENTIAL" },
    );

    expect(viewsService.patchPersonalItemPreferenceRow).toHaveBeenCalledWith(
      "acp-1",
      { sub: "credential-1" },
      "uuid::published",
      { note: "mine" },
      "item-explorer",
      false,
    );
  });

  it("exports the caller's personal data using the requested Explorer order", async () => {
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportPersonalItemDataXlsx(
      "acp-1",
      {
        rowKeys: ["uuid-2::1", "uuid-1::1"],
        perspective: "editor",
      },
      { user: { sub: "u-1" }, acpAccessLevel: "MANAGER" },
      res,
    );

    expect(viewsService.exportPersonalItemDataXlsx).toHaveBeenCalledWith(
      "acp-1",
      { sub: "u-1" },
      ["uuid-2::1", "uuid-1::1"],
      true,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="personal-item-data-acp-1.xlsx"',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("personal-xlsx"));
  });

  it("blocks personal data exports when the feature is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        enableItemList: true,
        enablePersonalItemData: false,
      },
    });

    await expect(
      controller.exportPersonalItemDataXlsx(
        "acp-1",
        { rowKeys: [] },
        { user: { sub: "u-1" } },
        {} as any,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(viewsService.exportPersonalItemDataXlsx).not.toHaveBeenCalled();
  });

  it("blocks personal data exports when the item list is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        enableItemList: false,
        enablePersonalItemData: true,
      },
    });

    await expect(
      controller.exportPersonalItemDataXlsx(
        "acp-1",
        { rowKeys: ["uuid::1"] },
        { user: { sub: "u-1" }, acpAccessLevel: "READ_ONLY" },
        {} as any,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(viewsService.exportPersonalItemDataXlsx).not.toHaveBeenCalled();
  });

  it("allows managers to export when the public item list is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        enableItemList: false,
        enablePersonalItemData: true,
      },
    });
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportPersonalItemDataXlsx(
      "acp-1",
      { rowKeys: ["uuid::1"] },
      { user: { sub: "manager-1" }, acpAccessLevel: "MANAGER" },
      res,
    );

    expect(viewsService.exportPersonalItemDataXlsx).toHaveBeenCalledWith(
      "acp-1",
      { sub: "manager-1" },
      ["uuid::1"],
      false,
    );
  });

  it("exports all participants' data as CSV for ACP managers", async () => {
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportAllPersonalItemDataCsv(
      "acp-1",
      { perspective: "editor" },
      { acpAccessLevel: "MANAGER" },
      res,
    );

    expect(viewsService.exportAllPersonalItemDataCsv).toHaveBeenCalledWith(
      "acp-1",
      true,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/csv; charset=utf-8",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="all-participant-item-data-acp-1.csv"',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("all-personal-csv"));
  });

  it("routes personal collection reads, updates and exports to the caller identity", async () => {
    const request = {
      user: { sub: "user-1" },
      acpAccessLevel: "MANAGER",
    };
    await controller.getItemCollections("acp-1", "editor", request);
    await controller.updateItemCollection(
      "acp-1",
      "collection-1",
      { baseVersion: 2, rowKeys: ["uuid::1"], perspective: "editor" },
      request,
    );
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    await controller.exportItemCollectionCsv(
      "acp-1",
      "collection-1",
      "editor",
      request,
      res,
    );

    expect(viewsService.getItemCollections).toHaveBeenCalledWith(
      "acp-1",
      request.user,
      true,
    );
    expect(viewsService.updateItemCollection).toHaveBeenCalledWith(
      "acp-1",
      request.user,
      "collection-1",
      expect.objectContaining({ baseVersion: 2, rowKeys: ["uuid::1"] }),
      true,
    );
    expect(viewsService.exportItemCollectionCsv).toHaveBeenCalledWith(
      "acp-1",
      request.user,
      "collection-1",
      true,
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("collection-csv"));
  });

  it("blocks collection endpoints when the feature is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enableItemCollections: false },
    });

    await expect(
      controller.getItemCollections("acp-1", "read-only", {
        user: { sub: "user-1" },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(viewsService.getItemCollections).not.toHaveBeenCalled();
  });

  it("blocks collection endpoints when the public item list is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        enableItemList: false,
        enableItemCollections: true,
      },
    });

    await expect(
      controller.getItemCollections("acp-1", "read-only", {
        user: { sub: "user-1" },
        acpAccessLevel: "READ_ONLY",
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(viewsService.getItemCollections).not.toHaveBeenCalled();
  });

  it("allows managers to use collections when the public item list is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: {
        enableItemList: false,
        enableItemCollections: true,
      },
    });
    const request = {
      user: { sub: "manager-1" },
      acpAccessLevel: "MANAGER",
    };

    await controller.getItemCollections("acp-1", "editor", request);

    expect(viewsService.getItemCollections).toHaveBeenCalledWith(
      "acp-1",
      request.user,
      true,
    );
  });

  it.each(["READ_ONLY", "CREDENTIAL", "PUBLIC", undefined])(
    "blocks all-participant exports for access level %s",
    async (acpAccessLevel) => {
      await expect(
        controller.exportAllPersonalItemDataCsv(
          "acp-1",
          {},
          { acpAccessLevel },
          {} as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(viewsService.exportAllPersonalItemDataCsv).not.toHaveBeenCalled();
    },
  );

  it("blocks all-participant exports when personal data is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { enablePersonalItemData: false },
    });

    await expect(
      controller.exportAllPersonalItemDataCsv(
        "acp-1",
        {},
        { acpAccessLevel: "ADMIN" },
        {} as any,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(viewsService.exportAllPersonalItemDataCsv).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "rejects personal row patches when only general persistence is %s",
    async (persistUserPreferences) => {
      viewsService.getAcpStartPage.mockResolvedValue({
        featureConfig: {
          persistUserPreferences,
          enablePersonalItemData: false,
        },
      });

      await expect(
        controller.patchPersonalItemRow(
          "acp-1",
          { rowKey: "uuid::1", rowData: { note: "mine" } },
          { user: { sub: "u-1" } },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(
        viewsService.patchPersonalItemPreferenceRow,
      ).not.toHaveBeenCalled();
    },
  );

  it("returns empty preferences on save when persistence is disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValueOnce({
      featureConfig: { persistUserPreferences: false },
    });

    const result = await controller.saveItemPreferences(
      "acp-1",
      { viewId: "item-list", ui: { filter: "x" }, tags: { item2: ["B"] } },
      { user: { sub: "u-1" } },
    );

    expect(result).toEqual({ ui: {}, tags: {}, rowData: {} });
    expect(viewsService.saveItemPreferences).not.toHaveBeenCalled();
  });

  it("returns sequences and sequence details when navigation is enabled", async () => {
    await expect(
      controller.getSequences("acp-1", { acpAccessLevel: "PUBLIC" }),
    ).resolves.toEqual([{ id: "seq-1" }]);
    await expect(
      controller.getSequence("acp-1", "seq-1", { acpAccessLevel: "PUBLIC" }),
    ).resolves.toEqual({ id: "seq-1", units: [{ id: "unit-1" }] });
  });

  it("uses default allow=true for sequence navigation when flag is unset", async () => {
    viewsService.getAcpStartPage
      .mockResolvedValueOnce({
        sequences: [{ id: "seq-2" }],
        featureConfig: {},
      })
      .mockResolvedValueOnce({
        sequences: [{ id: "seq-2" }],
        featureConfig: {},
      });

    await expect(
      controller.getSequences("acp-1", { acpAccessLevel: "PUBLIC" }),
    ).resolves.toEqual([{ id: "seq-2" }]);
  });

  it("blocks sequence navigation when disabled", async () => {
    viewsService.getAcpStartPage.mockResolvedValue({
      featureConfig: { enableSequenceNavigation: false },
    });

    await expect(
      controller.getSequences("acp-1", { acpAccessLevel: "PUBLIC" }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getSequence("acp-1", "seq-1", { acpAccessLevel: "PUBLIC" }),
    ).rejects.toThrow(ForbiddenException);
  });
});
