import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Acp, AcpAccessConfig } from "../database/entities";
import { UnitParserService } from "../files/unit-parser.service";
import { getIndexUnits } from "../acp/acp-index.utils";

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

    const headers = lines[0]
      .split(";")
      .map((h) => h.replace(/^"|"$/g, "").trim());
    const itemIdx = headers.indexOf("item");
    const estIdx = headers.indexOf("est");

    if (itemIdx === -1 || estIdx === -1) {
      throw new BadRequestException(
        'CSV must contain "item" and "est" columns',
      );
    }

    const failed = [];
    const successes = [];
    const matchedUuids = new Map<string, number>(); // uuid -> row index
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

      const row = line.split(";");
      const itemValRaw = row[itemIdx]?.replace(/^"|"$/g, "") || "";
      const estValRaw = row[estIdx]?.replace(/^"|"$/g, "") || "";

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
        if (matchedUuids.has(match.uuid)) {
          throw new BadRequestException(
            `Konflikt: Das Item "${match.itemId}" (Aufgabe: ${match.unitId}) kommt mehrfach in der CSV vor (Zeile ${matchedUuids.get(match.uuid)! + 1} und Zeile ${i + 1}). Bitte bereinigen Sie die Datei.`,
          );
        }
        matchedUuids.set(match.uuid, i);

        props[match.uuid] = {
          ...props[match.uuid],
          empiricalDifficulty: estValNum,
        };
        successes.push({
          itemId: match.itemId,
          unitId: match.unitId,
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

  async saveItemTags(
    acpId: string,
    tags: Record<string, string[]>,
  ): Promise<Record<string, string[]>> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) throw new NotFoundException("ACP not found");

    const normalizedTags = this.normalizeTags(tags || {});
    const itemProperties = { ...(acp.itemProperties || {}) };

    // Replace current tag state completely to keep client and server in sync.
    for (const itemId of Object.keys(itemProperties)) {
      if (itemProperties[itemId] && "tags" in itemProperties[itemId]) {
        delete itemProperties[itemId].tags;
      }
    }

    for (const [itemId, tagList] of Object.entries(normalizedTags)) {
      if (!tagList.length) continue;
      itemProperties[itemId] = {
        ...(itemProperties[itemId] || {}),
        tags: tagList,
      };
    }

    acp.itemProperties = itemProperties;
    await this.acpRepository.save(acp);
    return normalizedTags;
  }

  private extractTags(
    itemProperties: Record<string, Record<string, any>>,
  ): Record<string, string[]> {
    const tags: Record<string, string[]> = {};
    for (const [itemId, props] of Object.entries(itemProperties || {})) {
      if (!Array.isArray(props?.tags)) continue;
      const normalized = this.normalizeTagArray(props.tags);
      if (normalized.length) {
        tags[itemId] = normalized;
      }
    }
    return tags;
  }

  private normalizeTags(
    tags: Record<string, string[]>,
  ): Record<string, string[]> {
    const normalized: Record<string, string[]> = {};
    for (const [itemId, values] of Object.entries(tags || {})) {
      if (!itemId || !itemId.trim()) continue;
      const clean = this.normalizeTagArray(values);
      if (clean.length) {
        normalized[itemId] = clean;
      }
    }
    return normalized;
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
