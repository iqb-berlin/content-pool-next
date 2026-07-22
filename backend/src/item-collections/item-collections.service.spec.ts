import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ItemCollectionsService } from "./item-collections.service";

describe("ItemCollectionsService", () => {
  let service: ItemCollectionsService;
  let store: any;
  let itemExplorerStateService: any;
  let unitParserService: any;
  const owner = { kind: "user" as const, userId: "user-1" };

  beforeEach(() => {
    store = {
      readPreferences: jest.fn().mockResolvedValue(null),
      mutate: jest.fn(),
    };
    itemExplorerStateService = {
      getStateForViewer: jest.fn().mockResolvedValue({
        activeState: { itemProperties: {} },
        publishedState: { itemProperties: {} },
      }),
    };
    unitParserService = {
      getItemListFromFiles: jest.fn().mockResolvedValue({ items: [] }),
      getItemRowKeysFromFiles: jest
        .fn()
        .mockResolvedValue(new Set(["uuid-1::1", "uuid-2::1"])),
    };
    service = new ItemCollectionsService(
      store,
      itemExplorerStateService,
      unitParserService,
    );
  });

  it("resolves summaries without double-counting partial-credit rows", async () => {
    store.readPreferences.mockResolvedValue({
      activeCollectionId: "collection-1",
      collections: [
        {
          id: "collection-1",
          name: "Auswahl A",
          rowKeys: ["uuid-1::1", "uuid-1::2", "uuid-2", "removed"],
          version: 3,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-02T10:00:00.000Z",
        },
      ],
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          rowKey: "uuid-1::1",
          uuid: "uuid-1",
          unitId: "unit-1",
          itemTimeSeconds: 10,
          stimulusTimeSeconds: 5,
        },
        {
          rowKey: "uuid-1::2",
          uuid: "uuid-1",
          unitId: "unit-1",
          itemTimeSeconds: 10,
          stimulusTimeSeconds: 5,
        },
        {
          rowKey: "uuid-2",
          uuid: "uuid-2",
          unitId: "unit-1",
          stimulusTimeSeconds: 5,
        },
      ],
    });

    const result = await service.getItemCollections("acp-1", owner, true);

    expect(result.collections[0].unavailableRowKeys).toEqual(["removed"]);
    expect(result.collections[0].summary).toEqual({
      rowCount: 4,
      itemCount: 2,
      unitCount: 1,
      itemTimeSeconds: 10,
      stimulusTimeSeconds: 5,
      testTimeSeconds: 15,
      missingItemTimeCount: 1,
      missingStimulusTimeUnitCount: 0,
      complete: false,
    });
    expect(result.collectionViewMode).toBe("all");
  });

  it("defaults missing or invalid collection view modes to all", async () => {
    const basePreferences = {
      activeCollectionId: "collection-1",
      collections: [
        {
          id: "collection-1",
          name: "Auswahl A",
          rowKeys: [],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
    };
    store.readPreferences.mockResolvedValue(basePreferences);
    await expect(service.getItemCollections("acp-1", owner)).resolves.toEqual(
      expect.objectContaining({ collectionViewMode: "all" }),
    );

    store.readPreferences.mockResolvedValue({
      ...basePreferences,
      collectionViewMode: "invalid",
    });
    await expect(service.getItemCollections("acp-1", owner)).resolves.toEqual(
      expect.objectContaining({ collectionViewMode: "all" }),
    );
  });

  it("falls back to all when the stored active collection no longer exists", async () => {
    store.readPreferences.mockResolvedValue({
      activeCollectionId: "deleted-collection",
      collectionViewMode: "active",
      collections: [
        {
          id: "collection-1",
          name: "Auswahl A",
          rowKeys: [],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
    });

    await expect(service.getItemCollections("acp-1", owner)).resolves.toEqual(
      expect.objectContaining({
        activeCollectionId: "collection-1",
        collectionViewMode: "all",
      }),
    );
  });

  it("persists active view mode and resets it when no active list remains", async () => {
    const preferences: Record<string, unknown> = {
      activeCollectionId: "collection-1",
      collectionViewMode: "all",
      collections: [
        {
          id: "collection-1",
          name: "Auswahl A",
          rowKeys: [],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
    };
    store.mutate.mockImplementation(async (...args: any[]) => {
      const state = args[3](preferences);
      preferences.collections = state.collections;
      preferences.activeCollectionId = state.activeCollectionId;
      preferences.collectionViewMode = state.collectionViewMode;
      return state;
    });

    const activated = await service.activateItemCollection(
      "acp-1",
      owner,
      "collection-1",
      false,
      "active",
    );
    expect(activated.collectionViewMode).toBe("active");

    const deleted = await service.deleteItemCollection(
      "acp-1",
      owner,
      "collection-1",
    );
    expect(deleted).toEqual(
      expect.objectContaining({
        activeCollectionId: null,
        collectionViewMode: "all",
      }),
    );
  });

  it("checks the base version inside the store mutation", async () => {
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Alt",
          rowKeys: ["uuid-1::1"],
          version: 2,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) =>
      args[3](preferences),
    );

    await expect(
      service.updateItemCollection("acp-1", owner, "collection-1", {
        baseVersion: 1,
        name: "Neu",
      }),
    ).rejects.toThrow(ConflictException);

    const result = await service.updateItemCollection(
      "acp-1",
      owner,
      "collection-1",
      { baseVersion: 2, name: "Neu" },
    );
    expect(result.collections[0]).toEqual(
      expect.objectContaining({ name: "Neu", version: 3 }),
    );
  });

  it("allows stale stored rows but rejects newly added unknown rows", async () => {
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Alt",
          rowKeys: ["removed-row"],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) =>
      args[3](preferences),
    );

    await expect(
      service.updateItemCollection("acp-1", owner, "collection-1", {
        baseVersion: 1,
        rowKeys: ["removed-row", "invented-row"],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("adds deduplicated rows in order and returns a compact mutation result", async () => {
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Auswahl",
          rowKeys: ["uuid-1::1"],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) => {
      const state = args[3](preferences);
      preferences.collections = state.collections;
      return state;
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        { rowKey: "uuid-1::1", uuid: "uuid-1", unitId: "unit-1" },
        { rowKey: "uuid-2::1", uuid: "uuid-2", unitId: "unit-2" },
      ],
    });

    const result = await service.mutateItemCollectionRows(
      "acp-1",
      owner,
      "collection-1",
      { baseVersion: 1, addRowKeys: ["uuid-2::1", "uuid-2::1"] },
    );

    expect(preferences.collections[0].rowKeys).toEqual([
      "uuid-1::1",
      "uuid-2::1",
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        collectionId: "collection-1",
        version: 2,
        summary: expect.objectContaining({ rowCount: 2 }),
      }),
    );
    expect(result).not.toHaveProperty("rowKeys");
    expect(result).not.toHaveProperty("collections");
  });

  it("removes unavailable rows, clears collections, and preserves remaining order", async () => {
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Auswahl",
          rowKeys: ["known-a", "removed-row", "known-b"],
          version: 4,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) => {
      const state = args[3](preferences);
      preferences.collections = state.collections;
      return state;
    });

    const removed = await service.mutateItemCollectionRows(
      "acp-1",
      owner,
      "collection-1",
      { baseVersion: 4, removeRowKeys: ["removed-row"] },
    );
    expect(preferences.collections[0].rowKeys).toEqual(["known-a", "known-b"]);
    expect(removed.version).toBe(5);

    const cleared = await service.mutateItemCollectionRows(
      "acp-1",
      owner,
      "collection-1",
      { baseVersion: 5, clear: true },
    );
    expect(preferences.collections[0].rowKeys).toEqual([]);
    expect(cleared.version).toBe(6);
  });

  it("keeps version and timestamp unchanged for no-op row mutations", async () => {
    const updatedAt = "2026-07-01T10:00:00.000Z";
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Auswahl",
          rowKeys: ["uuid-1::1"],
          version: 2,
          createdAt: updatedAt,
          updatedAt,
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) =>
      args[3](preferences),
    );

    const result = await service.mutateItemCollectionRows(
      "acp-1",
      owner,
      "collection-1",
      { baseVersion: 2, addRowKeys: ["uuid-1::1"] },
    );

    expect(result.version).toBe(2);
    expect(result.updatedAt).toBe(updatedAt);
  });

  it("rejects invalid row mutations, unknown additions, limits, and conflicts", async () => {
    const rowKeys = Array.from(
      { length: 10_000 },
      (_, index) => `row-${index}`,
    );
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "Auswahl",
          rowKeys,
          version: 3,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) =>
      args[3](preferences),
    );
    unitParserService.getItemRowKeysFromFiles.mockResolvedValue(
      new Set([...rowKeys, "extra-row"]),
    );

    await expect(
      service.mutateItemCollectionRows("acp-1", owner, "collection-1", {
        baseVersion: 3,
        addRowKeys: [],
        removeRowKeys: [],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.mutateItemCollectionRows("acp-1", owner, "collection-1", {
        baseVersion: 3,
        clear: false,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.mutateItemCollectionRows("acp-1", owner, "collection-1", {
        baseVersion: 3,
        addRowKeys: ["unknown-row"],
      }),
    ).rejects.toThrow("Collections can only add existing item rows");
    await expect(
      service.mutateItemCollectionRows("acp-1", owner, "collection-1", {
        baseVersion: 3,
        addRowKeys: ["extra-row"],
      }),
    ).rejects.toThrow("At most 10000 item rows");
    await expect(
      service.mutateItemCollectionRows("acp-1", owner, "collection-1", {
        baseVersion: 2,
        removeRowKeys: ["row-1"],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("limits collection creation and delegates create-if-missing to the store", async () => {
    const timestamp = "2026-07-01T10:00:00.000Z";
    const preferences = {
      collections: Array.from({ length: 100 }, (_, index) => ({
        id: `collection-${index + 1}`,
        name: `Kollektion ${index + 1}`,
        rowKeys: [],
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) => {
      expect(args[2]).toBe(true);
      return args[3](preferences);
    });

    await expect(
      service.createItemCollection("acp-1", owner, "Eine zu viel"),
    ).rejects.toThrow("At most 100 item collections can be stored");
  });

  it("activates and deletes only collections belonging to the locked owner state", async () => {
    const preferences = {
      collections: [
        {
          id: "collection-1",
          name: "A",
          rowKeys: [],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      activeCollectionId: "collection-1",
    };
    store.mutate.mockImplementation(async (...args: any[]) =>
      args[3](preferences),
    );

    await expect(
      service.activateItemCollection("acp-1", owner, "missing"),
    ).rejects.toThrow(NotFoundException);
    const result = await service.deleteItemCollection(
      "acp-1",
      owner,
      "collection-1",
    );
    expect(result.collections).toEqual([]);
    expect(result.activeCollectionId).toBeNull();
  });

  it("exports collection rows together with personal row metadata", async () => {
    store.readPreferences.mockResolvedValue({
      collections: [
        {
          id: "collection-1",
          name: "Auswahl A",
          rowKeys: ["uuid-1::A", "removed-row"],
          version: 1,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      rowData: {
        "uuid-1::A": {
          category: " II ",
          tags: [" Prüfen ", "Prüfen", ""],
          note: "Erste Zeile\r\nZweite Zeile",
          ignored: "not exported",
        },
      },
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        {
          itemId: "item-1",
          uuid: "uuid-1",
          rowKey: "uuid-1::A",
          subId: "A",
          unitId: "unit-1",
          unitLabel: "Aufgabe 1",
          itemTimeSeconds: 20,
          stimulusTimeSeconds: 12,
          bookletOccurrences: [{ booklet: "B1", position: 3 }],
        },
      ],
    });

    const csv = (
      await service.exportItemCollectionCsv(
        "acp-1",
        owner,
        "collection-1",
        true,
      )
    ).toString("utf8");

    expect(csv).toContain('"Auswahl A";"1";"unit-1";"Aufgabe 1"');
    expect(csv).toContain('"II";"Prüfen";"Erste Zeile\\nZweite Zeile"');
    expect(csv).not.toContain("not exported");
    expect(csv).not.toContain("removed-row");
  });
});
