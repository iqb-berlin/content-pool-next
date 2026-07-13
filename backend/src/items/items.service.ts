import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Acp, AcpAccessConfig, AccessModel } from "../database/entities";
import { UnitParserService } from "../files/unit-parser.service";
import { getIndexUnits } from "../acp/acp-index.utils";
import { normalizeFeatureConfig } from "../acp/feature-config.utils";
import {
  buildItemRowKey,
  normalizeItemSubId,
  parseItemRowKeyParts,
} from "./item-row-key.util";

const SHOW_ONLY_ITEMS_WITH_EMPIRICAL_DIFFICULTY_KEY =
  "showOnlyItemsWithEmpiricalDifficulty";

export interface ItemData {
  itemId: string;
  unitId: string;
  unitName: string;
  name: string;
  sourceVariable?: string;
  metadata?: Record<string, any>;
  empiricalDifficulty?: number;
  tags?: string[];
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    private readonly unitParserService: UnitParserService,
  ) {}

  /**
   * Extract all items from ACP-Index.
   */
  async getItems(acpId: string): Promise<ItemData[]> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) return [];

    const index = acp.acpIndex as any;
    const units = getIndexUnits(index);
    const items: ItemData[] = [];

    for (const unit of units) {
      for (const item of unit.items || []) {
        const itemId =
          item.useUnitAliasAsPrefix !== false
            ? `${unit.id}_${item.id}`
            : item.id;

        const props = acp.itemProperties?.[itemId] || {};

        items.push({
          itemId,
          unitId: unit.id,
          unitName: unit.name,
          name: item.name || item.id,
          sourceVariable: item.sourceVariable,
          metadata: item.metadata,
          empiricalDifficulty: props.empiricalDifficulty,
          tags: Array.isArray(props.tags) ? props.tags : [],
        });
      }
    }

    return items;
  }

  /**
   * Get a single item by ID.
   */
  async getItem(acpId: string, itemId: string): Promise<ItemData | null> {
    const items = await this.getItems(acpId);
    return items.find((i) => i.itemId === itemId) || null;
  }

  /**
   * Get items filtered and sorted.
   */
  async getFilteredItems(
    acpId: string,
    filter?: string,
    sortBy?: string,
    sortDir?: "asc" | "desc",
  ): Promise<ItemData[]> {
    let items = await this.getItems(acpId);

    if (filter) {
      const term = filter.toLowerCase();
      items = items.filter(
        (i) =>
          i.itemId.toLowerCase().includes(term) ||
          i.name.toLowerCase().includes(term) ||
          i.unitId.toLowerCase().includes(term),
      );
    }

    if (sortBy) {
      items.sort((a: any, b: any) => {
        const aVal = (a[sortBy] || "").toString().toLowerCase();
        const bVal = (b[sortBy] || "").toString().toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  /**
   * Upload empirical item difficulties from a CSV buffer.
   */
  async uploadEmpiricalDifficulties(
    acpId: string,
    fileBuffer: Buffer,
    options: {
      persist?: boolean;
      itemPropertiesOverride?: Record<string, Record<string, unknown>>;
    } = {},
  ) {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) throw new NotFoundException("ACP not found");

    const result = await this.unitParserService.getItemListFromFiles(acpId);
    const items = result.items || [];

    const content = fileBuffer.toString("utf-8");
    const lines = content.split(/\r?\n/);
    if (lines.length < 2) return { updated: 0, failed: [] };

    const headers = this.parseCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase(),
    );
    const itemIdx = headers.indexOf("item");
    const estIdx = headers.indexOf("est");
    const subIdIdx =
      headers.length > 2 && ![itemIdx, estIdx].includes(1) ? 1 : -1;

    if (itemIdx === -1 || estIdx === -1) {
      throw new BadRequestException(
        'CSV must contain "item" and "est" columns',
      );
    }

    const failed = [];
    const successes = [];
    const matchedRowKeys = new Map<string, number>(); // stable row key -> row index
    const matchedItemModes = new Map<
      string,
      { mode: "standard" | "partial"; rowIndex: number }
    >();
    let updatedCount = 0;

    // Copy existing prop configurations
    const props = this.cloneItemProperties(
      options.itemPropertiesOverride || acp.itemProperties || {},
    );
    let isUpdated = false;

    // Normalization helper handles variable separators
    const normalize = (str: string) =>
      (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = this.parseCsvLine(line);
      const itemValRaw = row[itemIdx]?.trim() || "";
      const estValRaw = row[estIdx]?.trim() || "";
      const subId = subIdIdx >= 0 ? normalizeItemSubId(row[subIdIdx]) : "";

      const estValNum = parseFloat(estValRaw.replace(",", "."));

      if (!itemValRaw || isNaN(estValNum)) continue;

      const normalizedCsvItem = normalize(itemValRaw);

      const match = items.find((existingItem) => {
        const combinedName1 =
          normalize(existingItem.unitId) + normalize(existingItem.itemId);
        const combinedName2 =
          normalize(existingItem.unitLabel) + normalize(existingItem.itemId);
        const normalizedId = normalize(existingItem.itemId);
        return (
          normalizedId === normalizedCsvItem ||
          combinedName1 === normalizedCsvItem ||
          combinedName2 === normalizedCsvItem
        );
      });

      if (match) {
        const rowKey = buildItemRowKey(match.uuid, subId);
        const mode = subId ? "partial" : "standard";
        const previousMode = matchedItemModes.get(match.uuid);
        if (previousMode && previousMode.mode !== mode) {
          throw new BadRequestException(
            `Konflikt: Das Item "${match.itemId}" wird in derselben CSV sowohl mit als auch ohne Sub-ID verwendet (Zeile ${previousMode.rowIndex + 1} und Zeile ${i + 1}). Bitte verwenden Sie pro Item nur eine Darstellungsform.`,
          );
        }
        matchedItemModes.set(match.uuid, { mode, rowIndex: i });

        if (matchedRowKeys.has(rowKey)) {
          throw new BadRequestException(
            `Konflikt: Die Zeile für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} kommt mehrfach in der CSV vor (Zeile ${matchedRowKeys.get(rowKey)! + 1} und Zeile ${i + 1}). Bitte bereinigen Sie die Datei.`,
          );
        }
        matchedRowKeys.set(rowKey, i);

        const partialRowKeys = this.getPartialCreditRowKeys(props, match.uuid);
        let affectedRowKeys = [rowKey];
        if (mode === "standard" && partialRowKeys.length) {
          affectedRowKeys = partialRowKeys;
          if (props[match.uuid]?.empiricalDifficulty !== undefined) {
            delete props[match.uuid].empiricalDifficulty;
          }
          for (const partialRowKey of partialRowKeys) {
            props[partialRowKey] = {
              ...props[partialRowKey],
              empiricalDifficulty: estValNum,
            };
          }
        } else {
          if (
            mode === "partial" &&
            props[match.uuid]?.empiricalDifficulty !== undefined
          ) {
            delete props[match.uuid].empiricalDifficulty;
          }
          props[rowKey] = {
            ...props[rowKey],
            ...(subId ? { itemUuid: match.uuid, subId } : {}),
            empiricalDifficulty: estValNum,
          };
        }
        successes.push({
          itemId: match.itemId,
          unitId: match.unitId,
          ...(affectedRowKeys.length === 1
            ? { rowKey: affectedRowKeys[0] }
            : {}),
          affectedRowKeys,
          subId: subId || undefined,
          value: estValNum,
        });
        updatedCount++;
        isUpdated = true;
      } else {
        failed.push({
          csvRow: itemValRaw,
          reason: "Kein passendes Item gefunden",
        });
      }
    }

    if (isUpdated && options.persist !== false) {
      acp.itemProperties = props;
      await this.acpRepository.save(acp);
    }

    return {
      updated: updatedCount,
      failed,
      successes,
      nextItemProperties: props,
    };
  }

  private getPartialCreditRowKeys(
    itemProperties: Record<string, Record<string, unknown>>,
    itemUuid: string,
  ): string[] {
    return Object.keys(itemProperties).filter(
      (rowKey) => parseItemRowKeyParts(rowKey)?.itemUuid === itemUuid,
    );
  }

  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ";" && !quoted) {
        cells.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    cells.push(current);
    return cells;
  }

  /**
   * Clears all empirical item difficulties from the database
   */
  async clearEmpiricalDifficulties(
    acpId: string,
    options: {
      persist?: boolean;
      itemPropertiesOverride?: Record<string, Record<string, unknown>>;
    } = {},
  ) {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) throw new NotFoundException("ACP not found");

    const props = this.cloneItemProperties(
      options.itemPropertiesOverride || acp.itemProperties || {},
    );
    let isUpdated = false;

    for (const key of Object.keys(props)) {
      if (props[key].empiricalDifficulty !== undefined) {
        delete props[key].empiricalDifficulty;
        isUpdated = true;
      }
    }

    if (isUpdated && options.persist !== false) {
      acp.itemProperties = props;
      await this.acpRepository.save(acp);
    }

    return { success: true, nextItemProperties: props };
  }

  async getItemTags(acpId: string): Promise<Record<string, string[]>> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) throw new NotFoundException("ACP not found");
    return this.extractTags(acp.itemProperties || {});
  }

  async canUseItemTags(acpId: string): Promise<boolean> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    const featureConfig = (config?.featureConfig || {}) as Record<
      string,
      unknown
    >;
    return Boolean(featureConfig.enableItemListTags);
  }

  async ensureShowOnlyItemsWithEmpiricalDifficulty(
    acpId: string,
  ): Promise<boolean> {
    let config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });

    if (!config) {
      config = this.accessConfigRepository.create({
        acpId,
        accessModel: AccessModel.PRIVATE,
        allowRegistered: false,
        featureConfig: normalizeFeatureConfig({
          [SHOW_ONLY_ITEMS_WITH_EMPIRICAL_DIFFICULTY_KEY]: true,
        }),
      });
      await this.accessConfigRepository.save(config);
      return true;
    }

    const normalizedFeatureConfig = normalizeFeatureConfig(
      config.featureConfig || {},
    ) as Record<string, unknown>;
    const currentValue =
      normalizedFeatureConfig[SHOW_ONLY_ITEMS_WITH_EMPIRICAL_DIFFICULTY_KEY];

    if (currentValue === false) {
      if (
        JSON.stringify(config.featureConfig || {}) !==
        JSON.stringify(normalizedFeatureConfig)
      ) {
        config.featureConfig = normalizedFeatureConfig;
        await this.accessConfigRepository.save(config);
      }
      return false;
    }

    if (currentValue === true) {
      if (
        JSON.stringify(config.featureConfig || {}) !==
        JSON.stringify(normalizedFeatureConfig)
      ) {
        config.featureConfig = normalizedFeatureConfig;
        await this.accessConfigRepository.save(config);
      }
      return true;
    }

    normalizedFeatureConfig[SHOW_ONLY_ITEMS_WITH_EMPIRICAL_DIFFICULTY_KEY] =
      true;
    config.featureConfig = normalizedFeatureConfig;
    await this.accessConfigRepository.save(config);
    return true;
  }

  private extractTags(
    itemProperties: Record<string, Record<string, any>>,
  ): Record<string, string[]> {
    const tags: Record<string, string[]> = {};
    for (const [itemId, props] of Object.entries(itemProperties || {})) {
      if (!Array.isArray(props?.tags)) continue;
      const normalized = this.normalizeTagArray(props.tags);
      if (normalized.length || parseItemRowKeyParts(itemId) !== null) {
        tags[itemId] = normalized;
      }
    }
    return tags;
  }

  private normalizeTagArray(values: unknown[]): string[] {
    const clean = values
      .map((v) => String(v || "").trim())
      .filter((v) => v.length > 0);
    return Array.from(new Set(clean));
  }

  private cloneItemProperties(
    source: Record<string, Record<string, unknown>>,
  ): Record<string, Record<string, unknown>> {
    return JSON.parse(JSON.stringify(source || {}));
  }
}
