import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Repository } from "typeorm";
import {
  Acp,
  AcpAccessConfig,
  AcpItemExplorerChangeLog,
  AcpItemExplorerState,
  ItemExplorerDraftStatus,
} from "../database/entities";
import { normalizeFeatureConfig } from "../acp/feature-config.utils";

export interface ExplorerActor {
  userId?: string;
  username?: string;
  role?: string;
}

export interface ExplorerMetadataColumns {
  visible: string[];
  order: string[];
}

export interface ExplorerSharedStatePayload {
  ui: Record<string, unknown>;
  tags: Record<string, string[]>;
  metadataColumns: ExplorerMetadataColumns;
  itemOrder: string[];
  itemProperties: Record<string, Record<string, unknown>>;
}

export interface ExplorerStateEnvelope {
  status: ItemExplorerDraftStatus;
  version: number;
  publishedVersion: number;
  canEdit: boolean;
  canPublish: boolean;
  updatedAt: Date;
  updatedByUsername?: string | null;
  updatedByRole?: string | null;
  activeState: ExplorerSharedStatePayload;
  publishedState: ExplorerSharedStatePayload;
  draftState: ExplorerSharedStatePayload;
}

export interface ExplorerDraftPatch {
  ui?: Record<string, unknown>;
  tags?: Record<string, string[]>;
  metadataColumns?: Partial<ExplorerMetadataColumns>;
  itemOrder?: string[];
  itemProperties?: Record<string, Record<string, unknown>>;
  itemPropertiesPatch?: Record<string, Record<string, unknown> | null>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ItemExplorerStateService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    @InjectRepository(AcpItemExplorerState)
    private readonly stateRepository: Repository<AcpItemExplorerState>,
    @InjectRepository(AcpItemExplorerChangeLog)
    private readonly changeLogRepository: Repository<AcpItemExplorerChangeLog>,
  ) {}

  async getStateForViewer(
    acpId: string,
    canEdit: boolean,
  ): Promise<ExplorerStateEnvelope> {
    const record = await this.ensureStateRecord(acpId);
    return this.toEnvelope(record, canEdit);
  }

  async patchDraft(
    acpId: string,
    patch: ExplorerDraftPatch,
    options: {
      actor?: ExplorerActor;
      changeType?: string;
      baseVersion?: number;
    } = {},
  ): Promise<ExplorerStateEnvelope> {
    return this.withLockedState(
      acpId,
      async ({ stateRepository, changeLogRepository }, record) => {
        this.assertVersion(record, options.baseVersion);

        const before = this.normalizeStatePayload(record.draftState);
        const after = this.mergeDraftPatch(before, patch);
        const published = this.normalizeStatePayload(record.publishedState);

        record.draftState = after as unknown as Record<string, unknown>;
        record.status = this.statesEqual(after, published) ? "CLEAN" : "DIRTY";
        record.version += 1;
        this.applyActor(record, options.actor);
        const saved = await stateRepository.save(record);

        await this.logChange(
          {
            acpId,
            changeType: options.changeType || "PATCH_DRAFT",
            before,
            after,
            draftVersion: saved.version,
            publishedVersion: saved.publishedVersion,
            actor: options.actor,
          },
          changeLogRepository,
        );

        return this.toEnvelope(saved, true);
      },
    );
  }

  async saveDraft(
    acpId: string,
    options: { actor?: ExplorerActor; baseVersion?: number } = {},
  ): Promise<ExplorerStateEnvelope> {
    return this.withLockedState(
      acpId,
      async (
        {
          stateRepository,
          acpRepository,
          accessConfigRepository,
          changeLogRepository,
        },
        record,
      ) => {
        this.assertVersion(record, options.baseVersion);

        const beforePublished = this.normalizeStatePayload(
          record.publishedState,
        );
        const nextPublished = this.normalizeStatePayload(record.draftState);

        await this.applyPublishedStateToDomain(acpId, nextPublished, {
          acpRepository,
          accessConfigRepository,
        });

        record.publishedState = nextPublished as unknown as Record<
          string,
          unknown
        >;
        record.draftState = nextPublished as unknown as Record<string, unknown>;
        record.status = "CLEAN";
        record.version += 1;
        record.publishedVersion += 1;
        this.applyActor(record, options.actor);
        const saved = await stateRepository.save(record);

        await this.logChange(
          {
            acpId,
            changeType: "SAVE_DRAFT",
            before: beforePublished,
            after: nextPublished,
            draftVersion: saved.version,
            publishedVersion: saved.publishedVersion,
            actor: options.actor,
          },
          changeLogRepository,
        );

        return this.toEnvelope(saved, true);
      },
    );
  }

  async publishItemPropertiesImmediately(
    acpId: string,
    itemProperties: Record<string, Record<string, unknown>>,
    options: {
      actor?: ExplorerActor;
      changeType: string;
      baseVersion: number;
    },
  ): Promise<ExplorerStateEnvelope> {
    return this.withLockedState(
      acpId,
      async (
        {
          stateRepository,
          acpRepository,
          accessConfigRepository,
          changeLogRepository,
        },
        record,
      ) => {
        if (record.status === "DIRTY") {
          throw new ConflictException(
            "Direct item-property changes are not allowed while an Item Explorer draft is pending.",
          );
        }
        this.assertVersion(record, options.baseVersion);

        const before = this.normalizeStatePayload(record.publishedState);
        const nextPublished: ExplorerSharedStatePayload = {
          ...before,
          itemProperties: this.normalizeItemProperties(itemProperties),
        };

        await this.applyPublishedStateToDomain(acpId, nextPublished, {
          acpRepository,
          accessConfigRepository,
        });

        record.publishedState = nextPublished as unknown as Record<
          string,
          unknown
        >;
        record.draftState = nextPublished as unknown as Record<string, unknown>;
        record.status = "CLEAN";
        record.version += 1;
        record.publishedVersion += 1;
        this.applyActor(record, options.actor);
        const saved = await stateRepository.save(record);

        await this.logChange(
          {
            acpId,
            changeType: options.changeType,
            before,
            after: nextPublished,
            draftVersion: saved.version,
            publishedVersion: saved.publishedVersion,
            actor: options.actor,
          },
          changeLogRepository,
        );

        return this.toEnvelope(saved, true);
      },
    );
  }

  async discardDraft(
    acpId: string,
    options: { actor?: ExplorerActor; baseVersion?: number } = {},
  ): Promise<ExplorerStateEnvelope> {
    return this.withLockedState(
      acpId,
      async ({ stateRepository, changeLogRepository }, record) => {
        this.assertVersion(record, options.baseVersion);

        const before = this.normalizeStatePayload(record.draftState);
        const published = this.normalizeStatePayload(record.publishedState);

        record.draftState = published as unknown as Record<string, unknown>;
        record.status = "CLEAN";
        record.version += 1;
        this.applyActor(record, options.actor);
        const saved = await stateRepository.save(record);

        await this.logChange(
          {
            acpId,
            changeType: "DISCARD_DRAFT",
            before,
            after: published,
            draftVersion: saved.version,
            publishedVersion: saved.publishedVersion,
            actor: options.actor,
          },
          changeLogRepository,
        );

        return this.toEnvelope(saved, true);
      },
    );
  }

  async listChanges(
    acpId: string,
    limit = 100,
  ): Promise<AcpItemExplorerChangeLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    return this.changeLogRepository.find({
      where: { acpId },
      order: { createdAt: "DESC" },
      take: safeLimit,
    });
  }

  resolveActor(user: any, acpId: string): ExplorerActor {
    const username =
      typeof user?.username === "string"
        ? user.username
        : typeof user?.displayName === "string"
          ? user.displayName
          : undefined;

    let role = "READ_ONLY";
    if (user?.isAppAdmin) {
      role = "APP_ADMIN";
    } else if (Array.isArray(user?.acpRoles)) {
      const acpRole = user.acpRoles.find(
        (entry: any) => entry?.acpId === acpId,
      );
      if (acpRole?.role === "ACP_MANAGER") {
        role = "ACP_MANAGER";
      }
    } else if (user?.type === "credential") {
      role = "CREDENTIAL";
    }

    const sub = typeof user?.sub === "string" ? user.sub : undefined;
    return {
      userId: sub,
      username,
      role,
    };
  }

  private async withLockedState<T>(
    acpId: string,
    operation: (
      repositories: {
        stateRepository: Repository<AcpItemExplorerState>;
        acpRepository: Repository<Acp>;
        accessConfigRepository: Repository<AcpAccessConfig>;
        changeLogRepository: Repository<AcpItemExplorerChangeLog>;
      },
      record: AcpItemExplorerState,
    ) => Promise<T>,
  ): Promise<T> {
    await this.ensureStateRecord(acpId);

    return this.stateRepository.manager.transaction(async (manager) => {
      const repositories = {
        stateRepository: manager.getRepository(AcpItemExplorerState),
        acpRepository: manager.getRepository(Acp),
        accessConfigRepository: manager.getRepository(AcpAccessConfig),
        changeLogRepository: manager.getRepository(AcpItemExplorerChangeLog),
      };
      const record = await repositories.stateRepository.findOne({
        where: { acpId },
        lock: { mode: "pessimistic_write" },
      });
      if (!record) {
        throw new NotFoundException("Item Explorer state not found");
      }

      return operation(repositories, record);
    });
  }

  private async ensureStateRecord(
    acpId: string,
  ): Promise<AcpItemExplorerState> {
    let record = await this.stateRepository.findOne({ where: { acpId } });
    if (record) {
      return record;
    }

    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException("ACP not found");
    }

    const accessConfig = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    const defaultState = this.buildDefaultState(acp, accessConfig || undefined);

    record = this.stateRepository.create({
      acpId,
      publishedState: defaultState as unknown as Record<string, unknown>,
      draftState: defaultState as unknown as Record<string, unknown>,
      status: "CLEAN",
      version: 1,
      publishedVersion: 1,
    } as DeepPartial<AcpItemExplorerState>);

    return this.stateRepository.save(record);
  }

  private buildDefaultState(
    acp: Acp,
    accessConfig?: AcpAccessConfig,
  ): ExplorerSharedStatePayload {
    const normalizedFeatureConfig = normalizeFeatureConfig(
      accessConfig?.featureConfig || {},
    );
    const rawMetadataColumns = (normalizedFeatureConfig.metadataColumns ||
      {}) as Record<string, unknown>;

    const visible = this.asStringArray(rawMetadataColumns.visible);
    const order = this.asStringArray(rawMetadataColumns.order);
    const metadataColumns: ExplorerMetadataColumns = {
      visible: visible.length ? visible : order,
      order: order.length ? order : visible,
    };

    const itemProperties = this.normalizeItemProperties(acp.itemProperties);
    const tags: Record<string, string[]> = {};
    for (const [itemKey, value] of Object.entries(itemProperties)) {
      const rawTags = Array.isArray(value.tags) ? value.tags : [];
      const normalizedTags = this.normalizeTagArray(rawTags);
      if (normalizedTags.length) {
        tags[itemKey] = normalizedTags;
      }
    }

    return {
      ui: {},
      tags,
      metadataColumns,
      itemOrder: [],
      itemProperties,
    };
  }

  private async applyPublishedStateToDomain(
    acpId: string,
    state: ExplorerSharedStatePayload,
    repositories: {
      acpRepository: Repository<Acp>;
      accessConfigRepository: Repository<AcpAccessConfig>;
    } = {
      acpRepository: this.acpRepository,
      accessConfigRepository: this.accessConfigRepository,
    },
  ): Promise<void> {
    const acp = await repositories.acpRepository.findOne({
      where: { id: acpId },
    });
    if (!acp) {
      throw new NotFoundException("ACP not found");
    }

    acp.itemProperties = this.normalizeItemProperties(state.itemProperties);
    await repositories.acpRepository.save(acp);

    const config = await repositories.accessConfigRepository.findOne({
      where: { acpId },
    });
    if (!config) {
      return;
    }

    const normalizedFeatureConfig = normalizeFeatureConfig(
      config.featureConfig || {},
    );
    const visible = this.asStringArray(state.metadataColumns?.visible);
    const order = this.asStringArray(state.metadataColumns?.order);

    if (visible.length || order.length) {
      normalizedFeatureConfig.metadataColumns = {
        visible: visible.length ? visible : order,
        order: order.length ? order : visible,
      };
    } else {
      delete normalizedFeatureConfig.metadataColumns;
    }

    config.featureConfig = normalizedFeatureConfig;
    await repositories.accessConfigRepository.save(config);
  }

  private toEnvelope(
    record: AcpItemExplorerState,
    canEdit: boolean,
  ): ExplorerStateEnvelope {
    const publishedState = this.normalizeStatePayload(record.publishedState);
    const draftState = this.normalizeStatePayload(record.draftState);

    return {
      status: record.status,
      version: record.version,
      publishedVersion: record.publishedVersion,
      canEdit,
      canPublish: canEdit,
      updatedAt: record.updatedAt,
      updatedByUsername: record.updatedByUsername,
      updatedByRole: record.updatedByRole,
      activeState: canEdit ? draftState : publishedState,
      publishedState,
      draftState,
    };
  }

  private normalizeStatePayload(raw: unknown): ExplorerSharedStatePayload {
    const payload = this.asRecord(raw);
    const metadataColumnsRaw = this.asRecord(payload.metadataColumns);

    const visible = this.asStringArray(metadataColumnsRaw.visible);
    const order = this.asStringArray(metadataColumnsRaw.order);

    return {
      ui: this.asRecord(payload.ui),
      tags: this.normalizeTags(payload.tags),
      metadataColumns: {
        visible: visible.length ? visible : order,
        order: order.length ? order : visible,
      },
      itemOrder: this.asStringArray(payload.itemOrder),
      itemProperties: this.normalizeItemProperties(payload.itemProperties),
    };
  }

  private mergeDraftPatch(
    current: ExplorerSharedStatePayload,
    patch: ExplorerDraftPatch,
  ): ExplorerSharedStatePayload {
    const merged: ExplorerSharedStatePayload = {
      ui: { ...current.ui },
      tags: this.normalizeTags(current.tags),
      metadataColumns: {
        visible: [...current.metadataColumns.visible],
        order: [...current.metadataColumns.order],
      },
      itemOrder: [...current.itemOrder],
      itemProperties: this.normalizeItemProperties(current.itemProperties),
    };

    if (patch.ui && this.isRecord(patch.ui)) {
      merged.ui = {
        ...merged.ui,
        ...this.asRecord(patch.ui),
      };
    }

    if (patch.tags !== undefined) {
      merged.tags = this.normalizeTags(patch.tags);
    }

    if (patch.metadataColumns) {
      const visible = this.asStringArray(patch.metadataColumns.visible);
      const order = this.asStringArray(patch.metadataColumns.order);
      merged.metadataColumns = {
        visible: visible.length ? visible : order,
        order: order.length ? order : visible,
      };
    }

    if (patch.itemOrder !== undefined) {
      merged.itemOrder = this.asStringArray(patch.itemOrder);
    }

    if (patch.itemProperties !== undefined) {
      merged.itemProperties = this.normalizeItemProperties(
        patch.itemProperties,
      );
    }

    if (patch.itemPropertiesPatch && this.isRecord(patch.itemPropertiesPatch)) {
      for (const [itemKey, value] of Object.entries(
        patch.itemPropertiesPatch,
      )) {
        const normalizedKey = itemKey.trim();
        if (!normalizedKey) continue;

        if (value === null) {
          delete merged.itemProperties[normalizedKey];
          continue;
        }

        const currentItemProps = this.asRecord(
          merged.itemProperties[normalizedKey],
        );
        const nextItemProps = {
          ...currentItemProps,
          ...this.asRecord(value),
        };

        if (Object.keys(nextItemProps).length === 0) {
          delete merged.itemProperties[normalizedKey];
        } else {
          merged.itemProperties[normalizedKey] = nextItemProps;
        }
      }
      merged.itemProperties = this.normalizeItemProperties(
        merged.itemProperties,
      );
    }

    return merged;
  }

  private async logChange(
    params: {
      acpId: string;
      changeType: string;
      before: ExplorerSharedStatePayload;
      after: ExplorerSharedStatePayload;
      draftVersion?: number | null;
      publishedVersion?: number | null;
      actor?: ExplorerActor;
    },
    repository = this.changeLogRepository,
  ): Promise<void> {
    const diff = this.buildTopLevelDiff(params.before, params.after);
    const actorUserId = this.isUuid(params.actor?.userId)
      ? params.actor?.userId
      : null;

    const entry = repository.create({
      acpId: params.acpId,
      changeType: params.changeType,
      beforeState: params.before as unknown as Record<string, unknown>,
      afterState: params.after as unknown as Record<string, unknown>,
      diff,
      draftVersion: params.draftVersion ?? null,
      publishedVersion: params.publishedVersion ?? null,
      actorUserId,
      actorUsername: params.actor?.username || null,
      actorRole: params.actor?.role || null,
    } as DeepPartial<AcpItemExplorerChangeLog>);

    await repository.save(entry);
  }

  private buildTopLevelDiff(
    before: ExplorerSharedStatePayload,
    after: ExplorerSharedStatePayload,
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    const keys: Array<keyof ExplorerSharedStatePayload> = [
      "ui",
      "tags",
      "metadataColumns",
      "itemOrder",
      "itemProperties",
    ];

    for (const key of keys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = {
          before: before[key],
          after: after[key],
        };
      }
    }

    return diff;
  }

  private assertVersion(
    record: AcpItemExplorerState,
    baseVersion?: number,
  ): void {
    if (
      typeof baseVersion === "number" &&
      Number.isInteger(baseVersion) &&
      baseVersion !== record.version
    ) {
      throw new ConflictException({
        message: "Item Explorer draft version conflict",
        expectedVersion: baseVersion,
        currentVersion: record.version,
      });
    }
  }

  private applyActor(
    record: AcpItemExplorerState,
    actor?: ExplorerActor,
  ): void {
    record.updatedByUserId = this.isUuid(actor?.userId)
      ? actor?.userId || null
      : null;
    record.updatedByUsername = actor?.username || null;
    record.updatedByRole = actor?.role || null;
  }

  private statesEqual(
    a: ExplorerSharedStatePayload,
    b: ExplorerSharedStatePayload,
  ): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isRecord(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};
    for (const [itemKey, value] of Object.entries(rawTags)) {
      const normalizedItemKey = String(itemKey || "").trim();
      if (!normalizedItemKey || !Array.isArray(value)) {
        continue;
      }
      const normalizedValues = this.normalizeTagArray(value);
      if (normalizedValues.length) {
        tags[normalizedItemKey] = normalizedValues;
      }
    }

    return tags;
  }

  private normalizeTagArray(values: unknown[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private normalizeItemProperties(
    raw: unknown,
  ): Record<string, Record<string, unknown>> {
    if (!this.isRecord(raw)) {
      return {};
    }

    const normalized: Record<string, Record<string, unknown>> = {};
    for (const [itemKey, value] of Object.entries(raw)) {
      const normalizedKey = String(itemKey || "").trim();
      if (!normalizedKey || !this.isRecord(value)) {
        continue;
      }

      const itemValue = this.asRecord(value);
      const nextItemValue: Record<string, unknown> = { ...itemValue };

      if (Array.isArray(itemValue.tags)) {
        const tags = this.normalizeTagArray(itemValue.tags);
        if (tags.length) {
          nextItemValue.tags = tags;
        } else {
          delete nextItemValue.tags;
        }
      }

      const empiricalDifficultyRaw = itemValue.empiricalDifficulty;
      if (
        empiricalDifficultyRaw !== undefined &&
        empiricalDifficultyRaw !== null
      ) {
        const parsed = Number(empiricalDifficultyRaw);
        if (Number.isFinite(parsed)) {
          nextItemValue.empiricalDifficulty = parsed;
        } else {
          delete nextItemValue.empiricalDifficulty;
        }
      }

      const previewTargetIdRaw = itemValue.previewTargetId;
      if (typeof previewTargetIdRaw === "string") {
        const normalizedPreviewTargetId = previewTargetIdRaw.trim();
        if (normalizedPreviewTargetId.length > 0) {
          nextItemValue.previewTargetId = normalizedPreviewTargetId;
        } else {
          delete nextItemValue.previewTargetId;
        }
      } else {
        delete nextItemValue.previewTargetId;
      }

      if (typeof itemValue.excluded === "boolean") {
        if (itemValue.excluded) {
          nextItemValue.excluded = true;
        } else {
          delete nextItemValue.excluded;
        }
      } else {
        delete nextItemValue.excluded;
      }

      if (Object.keys(nextItemValue).length > 0) {
        normalized[normalizedKey] = nextItemValue;
      }
    }

    return normalized;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length > 0),
      ),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private isUuid(value?: string): boolean {
    return typeof value === "string" && UUID_REGEX.test(value);
  }
}
