import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import {
  Acp,
  AcpAccessConfig,
  AccessModel,
  AcpFile,
  AppSettings,
  AcpItemPreference,
} from "../database/entities";
import {
  findUnitInIndex,
  getAssessmentParts,
  getIndexUnits,
  toRuntimeAcpIndex,
} from "../acp/acp-index.utils";
import { normalizeFeatureConfig } from "../acp/feature-config.utils";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";
import { UnitParserService, VomdItemData } from "../files/unit-parser.service";
import {
  buildPatchPersonalItemPreferenceRowQuery,
  PreferenceIdentityColumn,
} from "./personal-item-preferences.query";
import { v4 as uuidv4 } from "uuid";

const MAX_PERSONAL_ITEM_ROWS = 10_000;
const MAX_EXPORT_ROW_KEY_LENGTH = 500;
const MAX_ITEM_COLLECTIONS = 100;

export interface ItemPreferencesPayload {
  [key: string]: unknown;
  ui: Record<string, unknown>;
  tags: Record<string, string[]>;
  rowData: Record<string, Record<string, unknown>>;
}

interface PreferenceIdentity {
  userId?: string;
  credentialId?: string;
  credentialUsername?: string;
}

interface StoredItemCollection {
  id: string;
  name: string;
  rowKeys: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCollectionSummary {
  rowCount: number;
  itemCount: number;
  unitCount: number;
  itemTimeSeconds: number;
  stimulusTimeSeconds: number;
  testTimeSeconds: number;
  missingItemTimeCount: number;
  missingStimulusTimeUnitCount: number;
  complete: boolean;
}

export interface ItemCollectionView extends StoredItemCollection {
  unavailableRowKeys: string[];
  summary: ItemCollectionSummary;
}

export interface ItemCollectionsPayload {
  activeCollectionId: string | null;
  collections: ItemCollectionView[];
}

@Injectable()
export class ViewsService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(AcpItemPreference)
    private readonly itemPreferenceRepository: Repository<AcpItemPreference>,
    private readonly itemExplorerStateService: ItemExplorerStateService,
    private readonly unitParserService: UnitParserService,
  ) {}

  /**
   * Get public-facing app settings (no auth required).
   */
  async getPublicSettings(): Promise<any> {
    const settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      return {
        theme: {},
        language: "de",
        logoUrl: null,
        landingPageHtml: null,
        imprintHtml: null,
        privacyHtml: null,
        accessibilityHtml: null,
      };
    }
    return {
      theme: settings.theme,
      language: settings.language,
      logoUrl: settings.logoUrl,
      landingPageHtml: settings.landingPageHtml,
      imprintHtml: settings.imprintHtml,
      privacyHtml: settings.privacyHtml,
      accessibilityHtml: settings.accessibilityHtml,
    };
  }

  /**
   * Get list of publicly accessible ACPs for the landing page.
   */
  async getPublicAcps(): Promise<any[]> {
    const publicConfigs = await this.accessConfigRepository.find({
      where: { accessModel: AccessModel.PUBLIC },
      relations: ["acp"],
    });
    const credentialConfigs = await this.accessConfigRepository.find({
      where: { accessModel: AccessModel.CREDENTIALS_LIST },
      relations: ["acp"],
    });
    const now = new Date();
    const activeCredentialConfigs = credentialConfigs.filter((cfg) => {
      const startsOk = !cfg.validFrom || cfg.validFrom <= now;
      const endsOk = !cfg.validUntil || cfg.validUntil >= now;
      return startsOk && endsOk;
    });

    console.log(
      "[DEBUG] getPublicAcps - PUBLIC configs:",
      publicConfigs.length,
    );
    console.log(
      "[DEBUG] getPublicAcps - CREDENTIALS_LIST configs:",
      credentialConfigs.length,
    );
    console.log(
      "[DEBUG] getPublicAcps - active CREDENTIALS_LIST configs:",
      activeCredentialConfigs.length,
    );
    for (const cfg of activeCredentialConfigs) {
      console.log("[DEBUG] Credential config:", {
        id: cfg.id,
        acpId: cfg.acpId,
        acpName: cfg.acp?.name,
        accessModel: cfg.accessModel,
        validFrom: cfg.validFrom,
        validUntil: cfg.validUntil,
      });
    }

    const results: any[] = [];
    const seenIds = new Set<string>();

    for (const config of publicConfigs) {
      if (config.acp) {
        results.push({
          id: config.acp.id,
          name: config.acp.name,
          description: config.acp.description,
          accessModel: "PUBLIC",
        });
        seenIds.add(config.acp.id);
      }
    }

    // Include credential-based ACPs (they are listed on landing page too)
    for (const config of activeCredentialConfigs) {
      if (seenIds.has(config.acpId)) continue;
      if (config.acp) {
        results.push({
          id: config.acp.id,
          name: config.acp.name,
          description: config.acp.description,
          accessModel: "CREDENTIALS_LIST",
          requiresLogin: true,
        });
        seenIds.add(config.acp.id);
      }
    }

    console.log("[DEBUG] getPublicAcps - final results:", results.length);
    return results;
  }

  /**
   * Get ACP start page data.
   */
  async getAcpStartPage(acpId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });

    const featureConfig = normalizeFeatureConfig(config?.featureConfig || {});
    const index = toRuntimeAcpIndex(acp.acpIndex);

    // Extract units from ACP-Index
    const units = getIndexUnits(index).map((u: any) => ({
      id: u.id,
      name: u.name,
      description: u.description,
    }));

    // Sequence model: one sequence equals one booklet module.
    const sequenceMap = new Map<string, any>();
    const parts = getAssessmentParts(index);
    for (const part of parts) {
      const modulesById = new Map<string, any>();
      for (const module of part.bookletModules || []) {
        if (!module?.id || typeof module.id !== "string") continue;
        modulesById.set(module.id, module);
        if (!sequenceMap.has(module.id)) {
          sequenceMap.set(module.id, {
            id: module.id,
            name: module.name || module.id,
          });
        }
      }

      for (const instrument of part.instruments || []) {
        for (const booklet of instrument.testcenterBooklet || []) {
          for (const moduleRef of booklet.modules || []) {
            const moduleId = this.getModuleReferenceId(moduleRef);
            if (!moduleId) continue;

            const existing = sequenceMap.get(moduleId) || {};
            const module = modulesById.get(moduleId);

            sequenceMap.set(moduleId, {
              id: moduleId,
              name: module?.name || existing.name || moduleId,
              instrumentName: existing.instrumentName || instrument.name,
              bookletDefinitionId:
                existing.bookletDefinitionId ||
                (typeof booklet.definitionId === "string"
                  ? booklet.definitionId
                  : undefined),
            });
          }
        }
      }
    }
    const sequences = Array.from(sequenceMap.values());

    return {
      id: acp.id,
      name: acp.name,
      description: acp.description,
      featureConfig,
      units,
      sequences,
    };
  }

  /**
   * Get full ACP-Index for read-only/public view routes.
   */
  async getAcpIndex(acpId: string): Promise<Record<string, unknown> | null> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;
    return toRuntimeAcpIndex(acp.acpIndex);
  }

  /**
   * Get unit view data including player reference.
   */
  async getUnitViewData(acpId: string, unitId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const unit = findUnitInIndex(index, unitId);
    if (!unit) return null;

    // Resolve file references
    const dependencies = unit.dependencies || [];
    const fileRefs: any[] = [];
    for (const dep of dependencies) {
      const file = await this.fileRepository.findOne({
        where: { acpId, originalName: dep.id },
      });
      if (file) {
        fileRefs.push({
          type: dep.type,
          originalName: file.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${file.id}/download`,
          fileId: file.id,
        });
      }
    }

    return {
      id: unit.id,
      name: unit.name,
      description: unit.description,
      lang: unit.lang,
      items: unit.items,
      dependencies: fileRefs,
      codingScheme: unit.codingScheme,
      richText: unit.richText,
    };
  }

  /**
   * Get all items across all units in an ACP.
   */
  async getItemList(acpId: string): Promise<any[]> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return [];

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const items: any[] = [];

    for (const unit of getIndexUnits(index)) {
      for (const item of unit.items || []) {
        const itemId =
          item.useUnitAliasAsPrefix !== false
            ? `${unit.id}_${item.id}`
            : item.id;

        items.push({
          itemId,
          unitId: unit.id,
          unitName: unit.name,
          name: item.name,
          sourceVariable: item.sourceVariable,
        });
      }
    }

    return items;
  }

  /**
   * Get task sequence (ordered list of units from a booklet module).
   */
  async getTaskSequence(acpId: string, sequenceId: string): Promise<any> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return null;

    const index = toRuntimeAcpIndex(acp.acpIndex);
    const parts = getAssessmentParts(index);

    // Find the module
    for (const part of parts) {
      for (const module of part.bookletModules || []) {
        if (module.id === sequenceId) {
          const unitIds = (module.units || [])
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((u: any) => u.id);

          const units = unitIds.map((uid: string) => {
            const unit = findUnitInIndex(index, uid);
            return unit
              ? { id: unit.id, name: unit.name }
              : { id: uid, name: uid };
          });

          return {
            id: module.id,
            name: module.name,
            units,
          };
        }
      }
    }

    return null;
  }

  async getItemPreferences(
    acpId: string,
    user: any,
    viewId?: string,
  ): Promise<ItemPreferencesPayload> {
    const normalizedViewId = this.normalizeViewId(viewId);
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity) {
      if (normalizedViewId === "item-explorer") {
        throw new UnauthorizedException(
          "Authentication is required for personal item data",
        );
      }
      return { ui: {}, tags: {}, rowData: {} };
    }
    if (
      normalizedViewId === "item-explorer" &&
      !identity.userId &&
      !identity.credentialId
    ) {
      throw new UnauthorizedException(
        "A stable identity is required for personal item data",
      );
    }

    const record = await this.findPreferenceRecord(
      acpId,
      normalizedViewId,
      identity,
    );
    return this.normalizeItemPreferences(record?.preferences);
  }

  async saveItemPreferences(
    acpId: string,
    user: any,
    preferences: Partial<ItemPreferencesPayload>,
    viewId?: string,
  ): Promise<ItemPreferencesPayload> {
    const normalized = this.normalizeItemPreferences(preferences);
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity) {
      return normalized;
    }

    const normalizedViewId = this.normalizeViewId(viewId);
    if (identity.userId || identity.credentialId) {
      await this.upsertItemPreferences(
        acpId,
        normalizedViewId,
        identity,
        normalized,
      );
      return normalized;
    }

    let record = await this.findPreferenceRecord(
      acpId,
      normalizedViewId,
      identity,
    );

    if (!record) {
      record = this.itemPreferenceRepository.create({
        acpId,
        viewId: normalizedViewId,
        userId: identity.userId || null,
        credentialId: identity.credentialId || null,
        credentialUsername: identity.credentialUsername || null,
      });
    }

    record.preferences = normalized;
    await this.itemPreferenceRepository.save(record);
    return normalized;
  }

  async patchPersonalItemPreferenceRow(
    acpId: string,
    user: any,
    rawRowKey: string,
    rawRowData: Record<string, unknown> | null,
    viewId = "item-explorer",
    canEditExplorerState = false,
  ): Promise<Pick<ItemPreferencesPayload, "rowData">> {
    const rowKey = String(rawRowKey || "").trim();
    if (!rowKey || rowKey.length > 500) {
      throw new BadRequestException("A valid item row key is required");
    }

    const normalizedRow = rawRowData
      ? this.normalizeRowData({ [rowKey]: rawRowData })[rowKey] || null
      : null;
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity || (!identity.userId && !identity.credentialId)) {
      throw new UnauthorizedException(
        "A stable identity is required for personal item data",
      );
    }

    if (normalizedRow) {
      await this.assertKnownPersonalItemRow(
        acpId,
        rowKey,
        canEditExplorerState,
      );
    }

    const normalizedViewId = this.normalizeViewId(viewId);
    const identityColumn: PreferenceIdentityColumn = identity.userId
      ? "user_id"
      : "credential_id";
    const initialPreferences: ItemPreferencesPayload = {
      ui: {},
      tags: {},
      rowData: normalizedRow ? { [rowKey]: normalizedRow } : {},
    };
    const rowDataJson = normalizedRow ? JSON.stringify(normalizedRow) : null;

    const rows = await this.itemPreferenceRepository.query(
      buildPatchPersonalItemPreferenceRowQuery(identityColumn),
      [
        acpId,
        normalizedViewId,
        identity.userId || null,
        identity.credentialId || null,
        identity.credentialUsername || null,
        JSON.stringify(initialPreferences),
        rowDataJson,
        rowKey,
        MAX_PERSONAL_ITEM_ROWS,
      ],
    );

    if (!rows[0]) {
      throw new BadRequestException(
        `Personal item data is limited to ${MAX_PERSONAL_ITEM_ROWS} rows`,
      );
    }

    return {
      rowData: normalizedRow ? { [rowKey]: normalizedRow } : {},
    };
  }

  async getItemCollections(
    acpId: string,
    user: any,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const { record } = await this.requireCollectionPreferenceRecord(
      acpId,
      user,
      false,
    );
    const state = this.normalizeCollectionState(record?.preferences);
    return this.resolveCollectionViews(
      acpId,
      state.collections,
      state.activeCollectionId,
      canEditExplorerState,
    );
  }

  async createItemCollection(
    acpId: string,
    user: any,
    rawName?: string,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const name = this.normalizeCollectionName(rawName || "Meine Kollektion");
    const now = new Date().toISOString();
    const collection: StoredItemCollection = {
      id: uuidv4(),
      name,
      rowKeys: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const state = await this.mutateCollectionState(
      acpId,
      user,
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
    return this.resolveCollectionViews(
      acpId,
      state.collections,
      state.activeCollectionId,
      canEditExplorerState,
    );
  }

  async updateItemCollection(
    acpId: string,
    user: any,
    collectionId: string,
    update: { name?: unknown; rowKeys?: unknown; baseVersion?: unknown },
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const normalizedName =
      update.name === undefined
        ? undefined
        : this.normalizeCollectionName(update.name);
    let normalizedRowKeys: string[] | undefined;
    let knownRowKeys: ReadonlySet<string> | undefined;
    if (update.rowKeys !== undefined) {
      normalizedRowKeys = this.normalizeCollectionRowKeys(update.rowKeys);
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
    const state = await this.mutateCollectionState(
      acpId,
      user,
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
    return this.resolveCollectionViews(
      acpId,
      state.collections,
      state.activeCollectionId,
      canEditExplorerState,
    );
  }

  async activateItemCollection(
    acpId: string,
    user: any,
    collectionId: string | null,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const state = await this.mutateCollectionState(
      acpId,
      user,
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
      },
    );
    return this.resolveCollectionViews(
      acpId,
      state.collections,
      state.activeCollectionId,
      canEditExplorerState,
    );
  }

  async deleteItemCollection(
    acpId: string,
    user: any,
    collectionId: string,
    canEditExplorerState = false,
  ): Promise<ItemCollectionsPayload> {
    const state = await this.mutateCollectionState(
      acpId,
      user,
      false,
      (lockedState) => {
        const nextCollections = lockedState.collections.filter(
          (collection) => collection.id !== collectionId,
        );
        if (nextCollections.length === lockedState.collections.length) {
          throw new NotFoundException("Item collection not found");
        }
        lockedState.collections = nextCollections;
        if (lockedState.activeCollectionId === collectionId) {
          lockedState.activeCollectionId = nextCollections[0]?.id || null;
        }
      },
    );
    return this.resolveCollectionViews(
      acpId,
      state.collections,
      state.activeCollectionId,
      canEditExplorerState,
    );
  }

  async exportItemCollectionCsv(
    acpId: string,
    user: any,
    collectionId: string,
    canEditExplorerState = false,
  ): Promise<Buffer> {
    const { record } = await this.requireCollectionPreferenceRecord(
      acpId,
      user,
      false,
    );
    if (!record) throw new NotFoundException("Item collection not found");
    const state = this.normalizeCollectionState(record.preferences);
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
    const personalRows = this.normalizeItemPreferences(
      record.preferences,
    ).rowData;
    const headers = [
      "Kollektion",
      "Reihenfolge",
      "Unit-ID",
      "Unit-Label",
      "Item-ID",
      "Item-UUID",
      "Sub-ID",
      "Zeilenschlüssel",
      "Empirische Itemschwierigkeit",
      "Infit",
      "Trennschärfe",
      "Lösungshäufigkeit",
      "Itemzeit (s)",
      "Stimuluszeit (s)",
      "Booklet",
      "Position im Booklet",
      "Kategorie",
      "Tags",
      "Notiz",
    ];
    const rows = collection.rowKeys.flatMap((rowKey, index) => {
      const item = itemsByRowKey.get(rowKey);
      if (!item) return [];
      const personal = personalRows[rowKey] || {};
      const occurrenceColumns = this.formatBookletOccurrenceColumns(item);
      return [
        [
          collection.name,
          index + 1,
          item.unitId,
          item.unitLabel,
          item.itemId,
          item.uuid,
          item.subId || "",
          item.rowKey,
          item.empiricalDifficulty ?? "",
          item.infit ?? "",
          item.discrimination ?? "",
          item.solutionRate ?? "",
          item.itemTimeSeconds ?? "",
          item.stimulusTimeSeconds ?? "",
          occurrenceColumns.booklets,
          occurrenceColumns.positions,
          typeof personal.category === "string" ? personal.category : "",
          Array.isArray(personal.tags) ? personal.tags.join(", ") : "",
          typeof personal.note === "string"
            ? personal.note.replace(/\n/g, "\\n")
            : "",
        ],
      ];
    });
    const lines = [headers, ...rows].map((row) =>
      row.map((value) => this.escapeCsvCell(value)).join(";"),
    );
    return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
  }

  async exportPersonalItemDataXlsx(
    acpId: string,
    user: any,
    rawRowKeys: string[],
    canEditExplorerState = false,
  ): Promise<Buffer> {
    const rowKeys = this.normalizeExportRowKeys(rawRowKeys);
    const [preferences, explorerState, accessConfig] = await Promise.all([
      this.getItemPreferences(acpId, user, "item-explorer"),
      this.itemExplorerStateService.getStateForViewer(
        acpId,
        canEditExplorerState,
      ),
      this.accessConfigRepository.findOne({ where: { acpId } }),
    ]);
    const itemList = await this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
      publishedItemPropertiesOverride:
        explorerState.publishedState.itemProperties,
    });
    const itemsByRowKey = new Map(
      itemList.items.map((item) => [item.rowKey, item] as const),
    );
    const items = rowKeys
      .map((rowKey) => itemsByRowKey.get(rowKey))
      .filter((item): item is VomdItemData => Boolean(item));
    const meanDifficultyByUnit = this.calculateMeanDifficultyByUnit(
      itemList.items,
    );
    const personalTagColors = this.getPersonalTagColors(
      accessConfig?.featureConfig,
    );

    const rows = items.map((item, index) => {
      const personalRow = preferences.rowData[item.rowKey] || {};
      const tags = Array.isArray(personalRow.tags)
        ? personalRow.tags.map((tag) => String(tag))
        : [];
      const occurrenceColumns = this.formatBookletOccurrenceColumns(item);

      return {
        sequenceNumber: index + 1,
        unitId: item.unitId,
        unitLabel: item.unitLabel,
        itemId: item.itemId,
        itemUuid: item.uuid,
        subId: item.subId || null,
        rowKey: item.rowKey,
        markers: this.formatPersonalMarkers(tags, personalTagColors),
        note: typeof personalRow.note === "string" ? personalRow.note : null,
        competenceLevel:
          typeof personalRow.category === "string"
            ? personalRow.category
            : null,
        empiricalDifficulty:
          item.empiricalDifficulty === undefined
            ? null
            : item.empiricalDifficulty,
        infit: item.infit ?? null,
        discrimination: item.discrimination ?? null,
        solutionRate: item.solutionRate ?? null,
        itemTimeSeconds: item.itemTimeSeconds ?? null,
        stimulusTimeSeconds: item.stimulusTimeSeconds ?? null,
        booklets: occurrenceColumns.booklets || null,
        bookletPositions: occurrenceColumns.positions || null,
        meanTaskDifficulty: meanDifficultyByUnit.get(item.unitId) ?? null,
      };
    });

    return this.buildPersonalItemDataXlsx(rows);
  }

  async exportAllPersonalItemDataCsv(
    acpId: string,
    canEditExplorerState = false,
  ): Promise<Buffer> {
    const [preferenceRecords, explorerState] = await Promise.all([
      this.itemPreferenceRepository.find({
        where: { acpId, viewId: "item-explorer" },
        relations: { user: true, credential: true },
      }),
      this.itemExplorerStateService.getStateForViewer(
        acpId,
        canEditExplorerState,
      ),
    ]);
    const itemList = await this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
      publishedItemPropertiesOverride:
        explorerState.publishedState.itemProperties,
    });
    const itemsByRowKey = new Map(
      itemList.items.map((item) => [item.rowKey, item] as const),
    );
    const itemOrder = new Map(
      itemList.items.map((item, index) => [item.rowKey, index] as const),
    );
    const meanDifficultyByUnit = this.calculateMeanDifficultyByUnit(
      itemList.items,
    );

    const rows = preferenceRecords.flatMap((record) => {
      const participant = this.getPreferenceParticipantIdentifier(record);
      if (!participant) return [];

      const preferences = this.normalizeItemPreferences(record.preferences);
      return Object.entries(preferences.rowData).map(
        ([rowKey, personalRow]) => {
          const item = itemsByRowKey.get(rowKey);
          const tags = Array.isArray(personalRow.tags)
            ? personalRow.tags.map((tag) => String(tag)).join(", ")
            : "";
          const occurrenceColumns = item
            ? this.formatBookletOccurrenceColumns(item)
            : { booklets: "", positions: "" };

          return {
            participant,
            unitId: item?.unitId || "",
            unitLabel: item?.unitLabel || "",
            itemId: item?.itemId || "",
            subId: item?.subId || "",
            rowKey,
            category:
              typeof personalRow.category === "string"
                ? personalRow.category
                : "",
            tags,
            note:
              typeof personalRow.note === "string"
                ? personalRow.note.replace(/\n/g, "\\n")
                : "",
            empiricalDifficulty: item?.empiricalDifficulty ?? "",
            infit: item?.infit ?? "",
            discrimination: item?.discrimination ?? "",
            solutionRate: item?.solutionRate ?? "",
            itemTimeSeconds: item?.itemTimeSeconds ?? "",
            stimulusTimeSeconds: item?.stimulusTimeSeconds ?? "",
            booklets: occurrenceColumns.booklets,
            bookletPositions: occurrenceColumns.positions,
            meanTaskDifficulty: item
              ? (meanDifficultyByUnit.get(item.unitId) ?? "")
              : "",
            itemOrder: itemOrder.get(rowKey) ?? Number.MAX_SAFE_INTEGER,
          };
        },
      );
    });

    rows.sort(
      (left, right) =>
        left.participant.localeCompare(right.participant, "de") ||
        left.itemOrder - right.itemOrder ||
        left.rowKey.localeCompare(right.rowKey, "de"),
    );

    return this.buildAllPersonalItemDataCsv(rows);
  }

  private async requireCollectionPreferenceRecord(
    acpId: string,
    user: any,
    createIfMissing: boolean,
  ): Promise<{
    identity: PreferenceIdentity;
    record: AcpItemPreference | null;
  }> {
    const identity = this.requireCollectionIdentity(user);
    let record = await this.findPreferenceRecord(
      acpId,
      "item-explorer",
      identity,
    );
    if (!record && createIfMissing) {
      record = this.itemPreferenceRepository.create({
        acpId,
        viewId: "item-explorer",
        userId: identity.userId || null,
        credentialId: identity.credentialId || null,
        credentialUsername: identity.credentialUsername || null,
        preferences: { ui: {}, tags: {}, rowData: {} },
      });
    }
    return { identity, record };
  }

  private getRawPreferences(raw: unknown): Record<string, unknown> {
    return this.isRecord(raw) ? { ...raw } : {};
  }

  private normalizeCollectionState(rawPreferences: unknown): {
    collections: StoredItemCollection[];
    activeCollectionId: string | null;
  } {
    const preferences = this.getRawPreferences(rawPreferences);
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
              rowKeys: this.normalizeCollectionRowKeys(
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
    return {
      collections,
      activeCollectionId: collections.some(
        (collection) => collection.id === requestedActiveId,
      )
        ? requestedActiveId
        : collections[0]?.id || null,
    };
  }

  private normalizeCollectionName(value: unknown): string {
    const name = this.normalizePlainText(value, 100);
    if (!name) throw new BadRequestException("Collection name is required");
    return name;
  }

  private normalizeCollectionRowKeys(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > MAX_PERSONAL_ITEM_ROWS) {
      throw new BadRequestException(
        `At most ${MAX_PERSONAL_ITEM_ROWS} item rows can be stored in a collection`,
      );
    }
    const seen = new Set<string>();
    const rowKeys: string[] = [];
    for (const rawRowKey of value) {
      if (typeof rawRowKey !== "string") {
        throw new BadRequestException("Collection row keys must be strings");
      }
      const rowKey = rawRowKey.trim();
      if (!rowKey || rowKey.length > MAX_EXPORT_ROW_KEY_LENGTH) {
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

  private requireCollectionIdentity(user: any): PreferenceIdentity {
    const identity = this.resolvePreferenceIdentity(user);
    if (!identity || (!identity.userId && !identity.credentialId)) {
      throw new UnauthorizedException(
        "A stable identity is required for item collections",
      );
    }
    return identity;
  }

  private async mutateCollectionState(
    acpId: string,
    user: any,
    createIfMissing: boolean,
    mutate: (state: {
      collections: StoredItemCollection[];
      activeCollectionId: string | null;
    }) => void,
  ): Promise<{
    collections: StoredItemCollection[];
    activeCollectionId: string | null;
  }> {
    const identity = this.requireCollectionIdentity(user);
    return this.itemPreferenceRepository.manager.transaction(
      async (manager) => {
        if (createIfMissing) {
          await this.insertCollectionPreferenceIfMissing(
            manager,
            acpId,
            identity,
          );
        }
        const repository = manager.getRepository(AcpItemPreference);
        const record = await repository.findOne({
          where: {
            acpId,
            viewId: "item-explorer",
            ...(identity.userId
              ? { userId: identity.userId }
              : { credentialId: identity.credentialId }),
          },
          lock: { mode: "pessimistic_write" },
        });
        if (!record) throw new NotFoundException("Item collection not found");

        const preferences = this.getRawPreferences(record.preferences);
        const state = this.normalizeCollectionState(preferences);
        mutate(state);
        record.preferences = {
          ...preferences,
          collections: state.collections,
          activeCollectionId: state.activeCollectionId,
        };
        if (identity.credentialUsername) {
          record.credentialUsername = identity.credentialUsername;
        }
        await repository.save(record);
        return state;
      },
    );
  }

  private async insertCollectionPreferenceIfMissing(
    manager: EntityManager,
    acpId: string,
    identity: PreferenceIdentity,
  ): Promise<void> {
    const identityColumn = identity.userId ? "user_id" : "credential_id";
    const identityPredicate = identity.userId
      ? '"user_id" IS NOT NULL'
      : '"credential_id" IS NOT NULL';
    await manager.query(
      `
        INSERT INTO "acp_item_preferences" (
          "id", "acp_id", "view_id", "user_id", "credential_id",
          "credential_username", "preferences", "created_at", "updated_at"
        )
        VALUES (
          uuid_generate_v4(), $1, 'item-explorer', $2, $3, $4,
          '{"ui":{},"tags":{},"rowData":{}}'::jsonb, now(), now()
        )
        ON CONFLICT ("acp_id", "view_id", "${identityColumn}")
          WHERE ${identityPredicate}
        DO NOTHING
      `,
      [
        acpId,
        identity.userId || null,
        identity.credentialId || null,
        identity.credentialUsername || null,
      ],
    );
  }

  private async resolveCollectionViews(
    acpId: string,
    collections: StoredItemCollection[],
    activeCollectionId: string | null,
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
      activeCollectionId,
      collections: collections.map((collection) => {
        const unavailableRowKeys = collection.rowKeys.filter(
          (rowKey) => !itemsByRowKey.has(rowKey),
        );
        const items = collection.rowKeys
          .map((rowKey) => itemsByRowKey.get(rowKey))
          .filter((item): item is VomdItemData => Boolean(item));
        return {
          ...collection,
          unavailableRowKeys,
          summary: this.calculateItemCollectionSummary(
            items,
            collection.rowKeys.length,
          ),
        };
      }),
    };
  }

  private calculateItemCollectionSummary(
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

  private formatBookletOccurrenceColumns(item: VomdItemData): {
    booklets: string;
    positions: string;
  } {
    const occurrences = item.bookletOccurrences || [];
    return {
      booklets: occurrences.map((occurrence) => occurrence.booklet).join(" | "),
      positions: occurrences
        .map((occurrence) => String(occurrence.position))
        .join(" | "),
    };
  }

  private async upsertItemPreferences(
    acpId: string,
    viewId: string,
    identity: PreferenceIdentity,
    preferences: ItemPreferencesPayload,
  ): Promise<void> {
    const identityColumn = identity.userId ? "user_id" : "credential_id";
    const identityPredicate = identity.userId
      ? '"user_id" IS NOT NULL'
      : '"credential_id" IS NOT NULL';

    await this.itemPreferenceRepository.query(
      `
        INSERT INTO "acp_item_preferences" (
          "id", "acp_id", "view_id", "user_id", "credential_id",
          "credential_username", "preferences", "created_at", "updated_at"
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6::jsonb, now(), now()
        )
        ON CONFLICT ("acp_id", "view_id", "${identityColumn}")
          WHERE ${identityPredicate}
        DO UPDATE SET
          "preferences" = EXCLUDED."preferences",
          "credential_username" = CASE
            WHEN EXCLUDED."credential_id" IS NOT NULL
              THEN EXCLUDED."credential_username"
            ELSE "acp_item_preferences"."credential_username"
          END,
          "updated_at" = now()
      `,
      [
        acpId,
        viewId,
        identity.userId || null,
        identity.credentialId || null,
        identity.credentialUsername || null,
        JSON.stringify(preferences),
      ],
    );
  }

  private async assertKnownPersonalItemRow(
    acpId: string,
    rowKey: string,
    canEditExplorerState: boolean,
  ): Promise<void> {
    const explorerState = await this.itemExplorerStateService.getStateForViewer(
      acpId,
      canEditExplorerState,
    );
    const validRowKeys = await this.unitParserService.getItemRowKeysFromFiles(
      acpId,
      {
        itemPropertiesOverride: explorerState.activeState.itemProperties,
        publishedItemPropertiesOverride:
          explorerState.publishedState.itemProperties,
      },
    );
    if (!validRowKeys.has(rowKey)) {
      throw new BadRequestException(
        "Personal item data can only be saved for an existing item row",
      );
    }
  }

  private getModuleReferenceId(moduleRef: unknown): string | null {
    if (typeof moduleRef === "string" && moduleRef.trim().length > 0) {
      return moduleRef.trim();
    }
    if (moduleRef && typeof moduleRef === "object") {
      const ref = moduleRef as { moduleId?: unknown; id?: unknown };
      if (typeof ref.moduleId === "string" && ref.moduleId.trim().length > 0) {
        return ref.moduleId.trim();
      }
      if (typeof ref.id === "string" && ref.id.trim().length > 0) {
        return ref.id.trim();
      }
    }
    return null;
  }

  private normalizeViewId(viewId?: string): string {
    const normalized = (viewId || "").trim();
    return normalized.length > 0 ? normalized.slice(0, 120) : "item-list";
  }

  private normalizeExportRowKeys(rawRowKeys: unknown): string[] {
    if (
      !Array.isArray(rawRowKeys) ||
      rawRowKeys.length > MAX_PERSONAL_ITEM_ROWS
    ) {
      throw new BadRequestException(
        `At most ${MAX_PERSONAL_ITEM_ROWS} item rows can be exported`,
      );
    }

    const rowKeys: string[] = [];
    const seen = new Set<string>();
    for (const rawRowKey of rawRowKeys) {
      if (typeof rawRowKey !== "string") {
        throw new BadRequestException("Export row keys must be strings");
      }
      const rowKey = rawRowKey.trim();
      if (!rowKey || rowKey.length > MAX_EXPORT_ROW_KEY_LENGTH) {
        throw new BadRequestException("A valid export row key is required");
      }
      if (!seen.has(rowKey)) {
        seen.add(rowKey);
        rowKeys.push(rowKey);
      }
    }
    return rowKeys;
  }

  private calculateMeanDifficultyByUnit(
    items: VomdItemData[],
  ): Map<string, number> {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const item of items) {
      if (
        item.empiricalDifficulty === undefined ||
        !Number.isFinite(item.empiricalDifficulty)
      ) {
        continue;
      }
      const total = totals.get(item.unitId) || { sum: 0, count: 0 };
      total.sum += item.empiricalDifficulty;
      total.count += 1;
      totals.set(item.unitId, total);
    }

    return new Map(
      Array.from(totals.entries()).map(([unitId, total]) => [
        unitId,
        total.sum / total.count,
      ]),
    );
  }

  private getPersonalTagColors(rawFeatureConfig: unknown): Map<string, string> {
    const featureConfig = normalizeFeatureConfig(
      this.isRecord(rawFeatureConfig) ? rawFeatureConfig : {},
    ) as Record<string, unknown>;
    const tags = Array.isArray(featureConfig.personalItemTags)
      ? featureConfig.personalItemTags
      : [];
    const colors = new Map<string, string>();

    for (const rawTag of tags) {
      if (!this.isRecord(rawTag)) continue;
      const label = this.normalizePlainText(rawTag.label, 100);
      const color = this.normalizePlainText(rawTag.color, 100);
      if (label && color) colors.set(label, color);
    }
    return colors;
  }

  private formatPersonalMarkers(
    tags: string[],
    tagColors: Map<string, string>,
  ): string | null {
    if (!tags.length) return null;
    return tags
      .map((tag) => {
        const color = tagColors.get(tag);
        return color ? `${tag} (${color})` : tag;
      })
      .join("; ");
  }

  private async buildPersonalItemDataXlsx(
    rows: Array<Record<string, string | number | null>>,
  ): Promise<Buffer> {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "IQB ContentPool";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Persönliche Itemdaten");
    sheet.columns = [
      { header: "Laufende Nummer", key: "sequenceNumber", width: 18 },
      { header: "Unit-ID", key: "unitId", width: 22 },
      { header: "Unit-Label", key: "unitLabel", width: 30 },
      { header: "Item-ID", key: "itemId", width: 22 },
      { header: "Item-UUID", key: "itemUuid", width: 38 },
      { header: "Sub-ID", key: "subId", width: 18 },
      { header: "Zeilenschlüssel", key: "rowKey", width: 45 },
      { header: "Markierung/Farbe", key: "markers", width: 32 },
      { header: "Notiz", key: "note", width: 50 },
      { header: "Kompetenzstufe", key: "competenceLevel", width: 22 },
      {
        header: "Empirische Itemschwierigkeit",
        key: "empiricalDifficulty",
        width: 30,
      },
      { header: "Infit", key: "infit", width: 16 },
      { header: "Trennschärfe", key: "discrimination", width: 18 },
      { header: "Lösungshäufigkeit", key: "solutionRate", width: 22 },
      { header: "Itemzeit (s)", key: "itemTimeSeconds", width: 18 },
      { header: "Stimuluszeit (s)", key: "stimulusTimeSeconds", width: 20 },
      { header: "Booklet", key: "booklets", width: 30 },
      {
        header: "Position im Booklet",
        key: "bookletPositions",
        width: 25,
      },
      {
        header: "Mittlere Aufgabenschwierigkeit",
        key: "meanTaskDifficulty",
        width: 32,
      },
    ];
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "S1" };

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A5276" },
    };

    rows.forEach((row) => sheet.addRow(row));
    sheet.getColumn("note").alignment = { vertical: "top", wrapText: true };
    sheet.getColumn("markers").alignment = {
      vertical: "top",
      wrapText: true,
    };
    sheet.getColumn("empiricalDifficulty").numFmt = "0.############";
    sheet.getColumn("meanTaskDifficulty").numFmt = "0.############";
    for (const key of [
      "infit",
      "discrimination",
      "solutionRate",
      "itemTimeSeconds",
      "stimulusTimeSeconds",
    ]) {
      sheet.getColumn(key).numFmt = "0.############";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildAllPersonalItemDataCsv(
    rows: Array<{
      participant: string;
      unitId: string;
      unitLabel: string;
      itemId: string;
      subId: string;
      rowKey: string;
      category: string;
      tags: string;
      note: string;
      empiricalDifficulty: number | string;
      infit: number | string;
      discrimination: number | string;
      solutionRate: number | string;
      itemTimeSeconds: number | string;
      stimulusTimeSeconds: number | string;
      booklets: string;
      bookletPositions: string;
      meanTaskDifficulty: number | string;
    }>,
  ): Buffer {
    const headers = [
      "Teilnehmerkennung",
      "Unit-ID",
      "Unit-Label",
      "Item-ID",
      "Sub-ID",
      "Zeilenschlüssel",
      "Kategorie",
      "Tags",
      "Notiz",
      "Empirische Itemschwierigkeit",
      "Infit",
      "Trennschärfe",
      "Lösungshäufigkeit",
      "Itemzeit (s)",
      "Stimuluszeit (s)",
      "Booklet",
      "Position im Booklet",
      "Mittlere Aufgabenschwierigkeit",
    ];
    const lines = [
      headers,
      ...rows.map((row) => [
        row.participant,
        row.unitId,
        row.unitLabel,
        row.itemId,
        row.subId,
        row.rowKey,
        row.category,
        row.tags,
        row.note,
        row.empiricalDifficulty,
        row.infit,
        row.discrimination,
        row.solutionRate,
        row.itemTimeSeconds,
        row.stimulusTimeSeconds,
        row.booklets,
        row.bookletPositions,
        row.meanTaskDifficulty,
      ]),
    ].map((row) => row.map((value) => this.escapeCsvCell(value)).join(";"));

    return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
  }

  private escapeCsvCell(value: string | number): string {
    let normalized = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@]/.test(normalized)) {
      normalized = `'${normalized}`;
    }
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  private getPreferenceParticipantIdentifier(
    record: AcpItemPreference,
  ): string | null {
    const identifiers = [
      record.credential?.username,
      record.credentialUsername,
      record.user?.username,
      record.credentialId,
      record.userId,
    ];
    for (const identifier of identifiers) {
      if (typeof identifier === "string" && identifier.trim()) {
        return identifier.trim();
      }
    }
    return null;
  }

  private resolvePreferenceIdentity(user: any): PreferenceIdentity | null {
    if (!user || typeof user !== "object") {
      return null;
    }

    if (user.type === "credential" && typeof user.username === "string") {
      const credentialUsername = user.username.trim();
      const credentialId = typeof user.sub === "string" ? user.sub.trim() : "";
      if (credentialId.length > 0) {
        return { credentialId, credentialUsername };
      }
      if (credentialUsername.length > 0) {
        return { credentialUsername };
      }
    }

    if (typeof user.sub === "string" && user.sub.trim().length > 0) {
      return { userId: user.sub.trim() };
    }

    return null;
  }

  private async findPreferenceRecord(
    acpId: string,
    viewId: string,
    identity: PreferenceIdentity,
  ): Promise<AcpItemPreference | null> {
    if (identity.userId) {
      return this.itemPreferenceRepository.findOne({
        where: {
          acpId,
          viewId,
          userId: identity.userId,
        },
      });
    }

    if (identity.credentialId) {
      return this.itemPreferenceRepository.findOne({
        where: {
          acpId,
          viewId,
          credentialId: identity.credentialId,
        },
      });
    }

    if (identity.credentialUsername) {
      return this.itemPreferenceRepository.findOne({
        where: {
          acpId,
          viewId,
          credentialUsername: identity.credentialUsername,
        },
      });
    }

    return null;
  }

  private normalizeItemPreferences(raw: unknown): ItemPreferencesPayload {
    const payload = this.isRecord(raw) ? raw : {};
    const ui = this.isRecord(payload.ui) ? payload.ui : {};
    return {
      ui,
      tags: this.normalizeTags(payload.tags),
      rowData: this.normalizeRowData(payload.rowData),
    };
  }

  private normalizeRowData(
    rawRowData: unknown,
  ): Record<string, Record<string, unknown>> {
    if (!this.isRecord(rawRowData)) {
      return {};
    }

    const normalized: Record<string, Record<string, unknown>> = {};
    for (const [rawRowKey, value] of Object.entries(rawRowData)) {
      const rowKey = rawRowKey.trim();
      if (!rowKey || !this.isRecord(value)) continue;

      const category = this.normalizePlainText(value.category, 200);
      const note = this.normalizePlainText(value.note, 10_000, true);
      const tags = Array.isArray(value.tags)
        ? Array.from(
            new Set(
              value.tags
                .map((tag) => this.normalizePlainText(tag, 100))
                .filter((tag): tag is string => Boolean(tag)),
            ),
          ).slice(0, 50)
        : [];

      const row: Record<string, unknown> = {};
      if (category) row.category = category;
      if (tags.length) row.tags = tags;
      if (note) row.note = note;
      if (Object.keys(row).length) normalized[rowKey] = row;
    }
    return normalized;
  }

  private normalizePlainText(
    value: unknown,
    maxLength: number,
    multiline = false,
  ): string | null {
    if (typeof value !== "string") return null;
    const normalized = value
      .replace(/\r\n?/g, "\n")
      .replace(multiline ? /[\t\f\v]+/g : /\s+/g, " ")
      .trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isRecord(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};

    for (const [itemKey, values] of Object.entries(rawTags)) {
      const normalizedItemKey = String(itemKey || "").trim();
      if (!normalizedItemKey) {
        continue;
      }

      if (!Array.isArray(values)) {
        continue;
      }

      const normalizedValues = Array.from(
        new Set(
          values
            .map((value) => String(value || "").trim())
            .filter((value) => value.length > 0),
        ),
      );

      if (normalizedValues.length) {
        tags[normalizedItemKey] = normalizedValues;
      }
    }

    return tags;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
