import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { UnitParserService, VomdItemData } from "../files/unit-parser.service";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";
import { StablePreferenceIdentity } from "../item-preferences/preference-identity";
import { normalizeItemPreferences } from "../item-preferences/item-preference-normalizer";
import {
  getItemExportCell,
  ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS,
  ITEM_EXPORT_PARAMETER_COLUMNS,
  projectItemExportRow,
} from "../item-explorer/item-export-projection";
import {
  ItemCollectionState,
  ItemCollectionSummary,
  ItemCollectionViewMode,
  ItemCollectionsPayload,
  StoredItemCollection,
} from "./item-collection.models";
import { ItemCollectionStore } from "./item-collection.store";

const MAX_COLLECTION_ROWS = 10_000;
const MAX_ROW_KEY_LENGTH = 500;
const MAX_ITEM_COLLECTIONS = 100;

@Injectable()
export class ItemCollectionsService {
  constructor(
    private readonly store: ItemCollectionStore,
    private readonly itemExplorerStateService: ItemExplorerStateService,
    private readonly unitParserService: UnitParserService,
  ) {}

  async getItemCollections(
    acpId: string,
    identity: StablePreferenceIdentity,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const preferences = await this.store.readPreferences(acpId, identity);
    const state = this.normalizeState(preferences);
    return this.resolveViews(acpId, state, canEditExplorerState);
  }

  async createItemCollection(
    acpId: string,
    identity: StablePreferenceIdentity,
    rawName?: string,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const name = this.normalizeName(rawName || "Meine Auswahlliste");
    const now = new Date().toISOString();
    const collection: StoredItemCollection = {
      id: uuidv4(),
      name,
      rowKeys: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const state = await this.mutateState(
      acpId,
      identity,
      true,
      (lockedState) => {
        if (lockedState.collections.length >= MAX_ITEM_COLLECTIONS) {
          throw new BadRequestException(
            `At most ${MAX_ITEM_COLLECTIONS} item collections can be stored`,
          );
        }
        lockedState.collections.push(collection);
        lockedState.activeCollectionId = collection.id;
      },
    );
    return this.resolveViews(acpId, state, canEditExplorerState);
  }

  async updateItemCollection(
    acpId: string,
    identity: StablePreferenceIdentity,
    collectionId: string,
    update: { name?: unknown; rowKeys?: unknown; baseVersion?: unknown },
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const normalizedName =
      update.name === undefined ? undefined : this.normalizeName(update.name);
    let normalizedRowKeys: string[] | undefined;
    let knownRowKeys: ReadonlySet<string> | undefined;
    if (update.rowKeys !== undefined) {
      normalizedRowKeys = this.normalizeRowKeys(update.rowKeys);
      const explorerState =
        await this.itemExplorerStateService.getStateForViewer(
          acpId,
          canEditExplorerState,
        );
      knownRowKeys = await this.unitParserService.getItemRowKeysFromFiles(
        acpId,
        {
          itemPropertiesOverride: explorerState.activeState.itemProperties,
          publishedItemPropertiesOverride:
            explorerState.publishedState.itemProperties,
        },
      );
    }

    const baseVersion = Number(update.baseVersion);
    const state = await this.mutateState(
      acpId,
      identity,
      false,
      (lockedState) => {
        const collection = lockedState.collections.find(
          (candidate) => candidate.id === collectionId,
        );
        if (!collection) {
          throw new NotFoundException("Item collection not found");
        }
        if (
          !Number.isInteger(baseVersion) ||
          baseVersion !== collection.version
        ) {
          throw new ConflictException(
            "The item collection changed concurrently",
          );
        }
        if (normalizedName !== undefined) collection.name = normalizedName;
        if (normalizedRowKeys !== undefined && knownRowKeys) {
          const previouslyStored = new Set(collection.rowKeys);
          const invalidRowKey = normalizedRowKeys.find(
            (rowKey) =>
              !knownRowKeys!.has(rowKey) && !previouslyStored.has(rowKey),
          );
          if (invalidRowKey) {
            throw new BadRequestException(
              "Collections can only add existing item rows",
            );
          }
          collection.rowKeys = normalizedRowKeys;
        }
        collection.version += 1;
        collection.updatedAt = new Date().toISOString();
      },
    );
    return this.resolveViews(acpId, state, canEditExplorerState);
  }

  async activateItemCollection(
    acpId: string,
    identity: StablePreferenceIdentity,
    collectionId: string | null,
    canEditExplorerState = false,
    collectionViewMode?: ItemCollectionViewMode,
  ): Promise<ItemCollectionsPayload> {
    const state = await this.mutateState(
      acpId,
      identity,
      false,
      (lockedState) => {
        if (
          collectionId &&
          !lockedState.collections.some(
            (collection) => collection.id === collectionId,
          )
        ) {
          throw new NotFoundException("Item collection not found");
        }
        lockedState.activeCollectionId = collectionId;
        if (collectionViewMode) {
          lockedState.collectionViewMode = collectionId
            ? collectionViewMode
            : "all";
        } else if (!collectionId) {
          lockedState.collectionViewMode = "all";
        }
      },
    );
    return this.resolveViews(acpId, state, canEditExplorerState);
  }

  async deleteItemCollection(
    acpId: string,
    identity: StablePreferenceIdentity,
    collectionId: string,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const state = await this.mutateState(
      acpId,
      identity,
      false,
      (lockedState) => {
        const collections = lockedState.collections.filter(
          (collection) => collection.id !== collectionId,
        );
        if (collections.length === lockedState.collections.length) {
          throw new NotFoundException("Item collection not found");
        }
        lockedState.collections = collections;
        if (lockedState.activeCollectionId === collectionId) {
          lockedState.activeCollectionId = collections[0]?.id || null;
        }
        if (!lockedState.activeCollectionId) {
          lockedState.collectionViewMode = "all";
        }
      },
    );
    return this.resolveViews(acpId, state, canEditExplorerState);
  }

  async exportItemCollectionCsv(
    acpId: string,
    identity: StablePreferenceIdentity,
    collectionId: string,
    canEditExplorerState = false,
  ): Promise<Buffer> {
    const preferences = await this.store.readPreferences(acpId, identity);
    const state = this.normalizeState(preferences);
    const collection = state.collections.find(
      (candidate) => candidate.id === collectionId,
    );
    if (!collection) throw new NotFoundException("Item collection not found");

    const explorerState = await this.itemExplorerStateService.getStateForViewer(
      acpId,
      canEditExplorerState,
    );
    const itemList = await this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
      publishedItemPropertiesOverride:
        explorerState.publishedState.itemProperties,
    });
    const itemsByRowKey = new Map(
      itemList.items.map((item) => [item.rowKey, item] as const),
    );
    const personalRows = normalizeItemPreferences(preferences).rowData;
    const headers = [
      "Kollektion",
      "Reihenfolge",
      ...ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS.map((column) => column.header),
      ...ITEM_EXPORT_PARAMETER_COLUMNS.map((column) => column.header),
      "Kategorie",
      "Tags",
      "Notiz",
    ];
    const rows = collection.rowKeys.flatMap((rowKey, index) => {
      const item = itemsByRowKey.get(rowKey);
      if (!item) return [];
      const projection = projectItemExportRow({
        rowKey,
        item,
        personalRow: personalRows[rowKey],
      });
      return [
        [
          collection.name,
          index + 1,
          ...ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS.map((column) =>
            getItemExportCell(projection, column),
          ),
          ...ITEM_EXPORT_PARAMETER_COLUMNS.map((column) =>
            getItemExportCell(projection, column),
          ),
          projection.category || "",
          projection.tags.join(", "),
          projection.note?.replace(/\n/g, "\\n") || "",
        ],
      ];
    });
    const lines = [headers, ...rows].map((row) =>
      row.map((value) => this.escapeCsvCell(value)).join(";"),
    );
    return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
  }

  private mutateState(
    acpId: string,
    identity: StablePreferenceIdentity,
    createIfMissing: boolean,
    mutation: (state: ItemCollectionState) => void,
  ): Promise<ItemCollectionState> {
    return this.store.mutate(
      acpId,
      identity,
      createIfMissing,
      (preferences) => {
        const state = this.normalizeState(preferences);
        mutation(state);
        return state;
      },
    );
  }

  private normalizeState(rawPreferences: unknown): ItemCollectionState {
    const preferences = this.isRecord(rawPreferences) ? rawPreferences : {};
    const seen = new Set<string>();
    const collections = Array.isArray(preferences.collections)
      ? preferences.collections
          .map((rawCollection): StoredItemCollection | null => {
            if (!this.isRecord(rawCollection)) return null;
            const id = String(rawCollection.id || "").trim();
            const name = String(rawCollection.name || "").trim();
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            const createdAt = this.normalizeIsoDate(rawCollection.createdAt);
            return {
              id,
              name: name.slice(0, 100),
              rowKeys: this.normalizeRowKeys(
                Array.isArray(rawCollection.rowKeys)
                  ? rawCollection.rowKeys
                  : [],
              ),
              version: Math.max(1, Number(rawCollection.version) || 1),
              createdAt,
              updatedAt: this.normalizeIsoDate(
                rawCollection.updatedAt,
                createdAt,
              ),
            };
          })
          .filter(
            (collection): collection is StoredItemCollection =>
              collection !== null,
          )
      : [];
    const requestedActiveId = String(
      preferences.activeCollectionId || "",
    ).trim();
    const hasRequestedActiveCollection = collections.some(
      (collection) => collection.id === requestedActiveId,
    );
    const activeCollectionId = hasRequestedActiveCollection
      ? requestedActiveId
      : collections[0]?.id || null;
    const requestedViewMode: ItemCollectionViewMode =
      preferences.collectionViewMode === "active" ? "active" : "all";
    return {
      collections,
      activeCollectionId,
      collectionViewMode:
        hasRequestedActiveCollection && activeCollectionId
          ? requestedViewMode
          : "all",
    };
  }

  private normalizeName(value: unknown): string {
    const name = this.normalizePlainText(value, 100);
    if (!name) throw new BadRequestException("Collection name is required");
    return name;
  }

  private normalizeRowKeys(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > MAX_COLLECTION_ROWS) {
      throw new BadRequestException(
        `At most ${MAX_COLLECTION_ROWS} item rows can be stored in a collection`,
      );
    }
    const seen = new Set<string>();
    const rowKeys: string[] = [];
    for (const rawRowKey of value) {
      if (typeof rawRowKey !== "string") {
        throw new BadRequestException("Collection row keys must be strings");
      }
      const rowKey = rawRowKey.trim();
      if (!rowKey || rowKey.length > MAX_ROW_KEY_LENGTH) {
        throw new BadRequestException("A valid collection row key is required");
      }
      if (!seen.has(rowKey)) {
        seen.add(rowKey);
        rowKeys.push(rowKey);
      }
    }
    return rowKeys;
  }

  private normalizeIsoDate(value: unknown, fallback?: string): string {
    const parsed = typeof value === "string" ? new Date(value) : null;
    return parsed && Number.isFinite(parsed.getTime())
      ? parsed.toISOString()
      : fallback || new Date().toISOString();
  }

  private async resolveViews(
    acpId: string,
    state: ItemCollectionState,
    canEditExplorerState: boolean,
  ): Promise<ItemCollectionsPayload> {
    const explorerState = await this.itemExplorerStateService.getStateForViewer(
      acpId,
      canEditExplorerState,
    );
    const itemList = await this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
      publishedItemPropertiesOverride:
        explorerState.publishedState.itemProperties,
    });
    const itemsByRowKey = new Map(
      itemList.items.map((item) => [item.rowKey, item] as const),
    );
    return {
      activeCollectionId: state.activeCollectionId,
      collectionViewMode: state.collectionViewMode,
      collections: state.collections.map((collection) => {
        const unavailableRowKeys = collection.rowKeys.filter(
          (rowKey) => !itemsByRowKey.has(rowKey),
        );
        const items = collection.rowKeys
          .map((rowKey) => itemsByRowKey.get(rowKey))
          .filter((item): item is VomdItemData => Boolean(item));
        return {
          ...collection,
          unavailableRowKeys,
          summary: this.calculateSummary(items, collection.rowKeys.length),
        };
      }),
    };
  }

  private calculateSummary(
    items: VomdItemData[],
    selectedRowCount = items.length,
  ): ItemCollectionSummary {
    const uniqueItems = new Map<string, VomdItemData[]>();
    const uniqueUnits = new Map<string, VomdItemData[]>();
    for (const item of items) {
      const itemRows = uniqueItems.get(item.uuid) || [];
      itemRows.push(item);
      uniqueItems.set(item.uuid, itemRows);
      const unitRows = uniqueUnits.get(item.unitId) || [];
      unitRows.push(item);
      uniqueUnits.set(item.unitId, unitRows);
    }

    let itemTimeSeconds = 0;
    let stimulusTimeSeconds = 0;
    let missingItemTimeCount = 0;
    let missingStimulusTimeUnitCount = 0;
    for (const rows of uniqueItems.values()) {
      const time = rows
        .map((row) => row.itemTimeSeconds)
        .find((value): value is number => Number.isFinite(value));
      if (time === undefined) missingItemTimeCount += 1;
      else itemTimeSeconds += time;
    }
    for (const rows of uniqueUnits.values()) {
      const time = rows
        .map((row) => row.stimulusTimeSeconds)
        .find((value): value is number => Number.isFinite(value));
      if (time === undefined) missingStimulusTimeUnitCount += 1;
      else stimulusTimeSeconds += time;
    }
    return {
      rowCount: selectedRowCount,
      itemCount: uniqueItems.size,
      unitCount: uniqueUnits.size,
      itemTimeSeconds,
      stimulusTimeSeconds,
      testTimeSeconds: itemTimeSeconds + stimulusTimeSeconds,
      missingItemTimeCount,
      missingStimulusTimeUnitCount,
      complete:
        missingItemTimeCount === 0 && missingStimulusTimeUnitCount === 0,
    };
  }

  private normalizePlainText(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private escapeCsvCell(value: string | number): string {
    let normalized = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@]/.test(normalized)) {
      normalized = `'${normalized}`;
    }
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
