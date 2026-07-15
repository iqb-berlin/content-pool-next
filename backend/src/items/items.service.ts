import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Acp, AcpAccessConfig, AccessModel } from "../database/entities";
import { UnitParserService, VomdItemData } from "../files/unit-parser.service";
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
  uuid?: string;
  rowKey?: string;
  rowNumber?: number;
  subId?: string;
  subIdDisplay?: string;
  unitId: string;
  unitName: string;
  name: string;
  sourceVariable?: string;
  metadata?: Record<string, any>;
  empiricalDifficulty?: number;
  infit?: number;
  discrimination?: number;
  solutionRate?: number;
  itemTimeSeconds?: number;
  stimulusTimeSeconds?: number;
  bookletOccurrences?: Array<{ booklet: string; position: number }>;
  tags?: string[];
}

type ImportedScalarProperty =
  | "empiricalDifficulty"
  | "infit"
  | "discrimination"
  | "solutionRate"
  | "itemTimeSeconds"
  | "stimulusTimeSeconds";

const IMPORTED_SCALAR_COLUMNS: Array<{
  header: string;
  property: ImportedScalarProperty;
  nonNegative?: boolean;
}> = [
  { header: "est", property: "empiricalDifficulty" },
  { header: "infit", property: "infit" },
  { header: "discrimination", property: "discrimination" },
  { header: "solution_rate", property: "solutionRate" },
  { header: "item_time_s", property: "itemTimeSeconds", nonNegative: true },
  {
    header: "stimulus_time_s",
    property: "stimulusTimeSeconds",
    nonNegative: true,
  },
];

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
    const parsedItemList =
      await this.unitParserService.getItemListFromFiles(acpId);
    const fileRowsByItem = new Map<string, VomdItemData[]>();
    for (const fileRow of parsedItemList?.items || []) {
      const key = `${fileRow.unitId}\u0000${fileRow.itemId}`;
      const rows = fileRowsByItem.get(key) || [];
      rows.push(fileRow);
      fileRowsByItem.set(key, rows);
    }

    for (const unit of units) {
      for (const item of unit.items || []) {
        const itemId =
          item.useUnitAliasAsPrefix !== false
            ? `${unit.id}_${item.id}`
            : item.id;
        const fileRows =
          fileRowsByItem.get(`${unit.id}\u0000${item.id}`) ||
          fileRowsByItem.get(`${unit.id}\u0000${itemId}`) ||
          [];

        if (fileRows.length) {
          for (const fileRow of fileRows) {
            items.push({
              itemId,
              uuid: fileRow.uuid,
              rowKey: fileRow.rowKey,
              rowNumber: fileRow.rowNumber,
              subId: fileRow.subId,
              subIdDisplay: fileRow.subIdDisplay,
              unitId: unit.id,
              unitName: unit.name,
              name: item.name || fileRow.description || item.id,
              sourceVariable: fileRow.sourceVariable || item.sourceVariable,
              metadata: {
                ...(item.metadata || {}),
                ...(fileRow.metadata || {}),
              },
              empiricalDifficulty: fileRow.empiricalDifficulty,
              infit: fileRow.infit,
              discrimination: fileRow.discrimination,
              solutionRate: fileRow.solutionRate,
              itemTimeSeconds: fileRow.itemTimeSeconds,
              stimulusTimeSeconds: fileRow.stimulusTimeSeconds,
              bookletOccurrences: fileRow.bookletOccurrences,
              tags: fileRow.tags || [],
            });
          }
          continue;
        }

        const props = acp.itemProperties?.[itemId] || {};

        items.push({
          itemId,
          unitId: unit.id,
          unitName: unit.name,
          name: item.name || item.id,
          sourceVariable: item.sourceVariable,
          metadata: item.metadata,
          empiricalDifficulty: props.empiricalDifficulty,
          ...(this.toFiniteNumber(props.infit) !== undefined
            ? { infit: this.toFiniteNumber(props.infit) }
            : {}),
          ...(this.toFiniteNumber(props.discrimination) !== undefined
            ? { discrimination: this.toFiniteNumber(props.discrimination) }
            : {}),
          ...(this.toFiniteNumber(props.solutionRate) !== undefined
            ? { solutionRate: this.toFiniteNumber(props.solutionRate) }
            : {}),
          ...(this.toFiniteNumber(props.itemTimeSeconds) !== undefined
            ? { itemTimeSeconds: this.toFiniteNumber(props.itemTimeSeconds) }
            : {}),
          ...(this.toFiniteNumber(props.stimulusTimeSeconds) !== undefined
            ? {
                stimulusTimeSeconds: this.toFiniteNumber(
                  props.stimulusTimeSeconds,
                ),
              }
            : {}),
          ...(this.normalizeBookletOccurrences(props.bookletOccurrences).length
            ? {
                bookletOccurrences: this.normalizeBookletOccurrences(
                  props.bookletOccurrences,
                ),
              }
            : {}),
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
    return this.uploadItemParameters(acpId, fileBuffer, {
      ...options,
      requireEmpiricalDifficulty: true,
    });
  }

  /**
   * Upload empirical values and additional item parameters from a wide CSV.
   * Rows that share an item/Sub-ID are grouped so booklet occurrences remain
   * a 1:n property of one stable Explorer row.
   */
  async uploadItemParameters(
    acpId: string,
    fileBuffer: Buffer,
    options: {
      persist?: boolean;
      itemPropertiesOverride?: Record<string, Record<string, unknown>>;
      requireEmpiricalDifficulty?: boolean;
    } = {},
  ) {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) throw new NotFoundException("ACP not found");

    const result = await this.unitParserService.getItemListFromFiles(acpId);
    const items = result.items || [];

    const content = fileBuffer.toString("utf-8");
    const lines = content.split(/\r?\n/);
    if (lines.length < 2) {
      return {
        updated: 0,
        failed: [],
        successes: [],
        nextItemProperties: this.cloneItemProperties(
          options.itemPropertiesOverride || acp.itemProperties || {},
        ),
      };
    }

    const headers = this.parseCsvLine(lines[0]).map((header, index) =>
      header
        .replace(index === 0 ? /^\uFEFF/ : /$^/, "")
        .trim()
        .toLowerCase(),
    );
    const itemIdx = headers.indexOf("item");
    const estIdx = headers.indexOf("est");
    const canonicalSubIdIdx = headers.indexOf("sub_id");
    const subIdIdx =
      canonicalSubIdIdx >= 0
        ? canonicalSubIdIdx
        : options.requireEmpiricalDifficulty &&
            headers.length > 2 &&
            ![itemIdx, estIdx].includes(1)
          ? 1
          : -1;
    const bookletIdx = headers.indexOf("booklet");
    const positionIdx = headers.indexOf("position");
    const hasBookletColumn = bookletIdx >= 0;
    const hasPositionColumn = positionIdx >= 0;

    if (itemIdx === -1 || (options.requireEmpiricalDifficulty && estIdx < 0)) {
      throw new BadRequestException(
        options.requireEmpiricalDifficulty
          ? 'CSV must contain "item" and "est" columns'
          : 'CSV must contain an "item" column',
      );
    }
    if (hasBookletColumn !== hasPositionColumn) {
      throw new BadRequestException(
        'CSV columns "booklet" and "position" must be provided together',
      );
    }

    const scalarColumns = IMPORTED_SCALAR_COLUMNS.map((definition) => ({
      ...definition,
      index: headers.indexOf(definition.header),
    })).filter((definition) => definition.index >= 0);

    const props = this.cloneItemProperties(
      options.itemPropertiesOverride || acp.itemProperties || {},
    );
    if (!scalarColumns.length && bookletIdx < 0) {
      return {
        updated: 0,
        failed: [],
        successes: [],
        nextItemProperties: props,
      };
    }

    const failed: Array<{ csvRow: string; reason: string }> = [];
    const successes: Array<Record<string, unknown>> = [];
    const matchedItemModes = new Map<
      string,
      { mode: "standard" | "partial"; rowIndex: number }
    >();
    const groups = new Map<
      string,
      {
        match: (typeof items)[number];
        subId: string;
        rowIndexes: number[];
        scalars: Map<ImportedScalarProperty, Set<number>>;
        occurrences: Map<string, { booklet: string; position: number }>;
        emptyOccurrenceRows: number[];
      }
    >();

    let isUpdated = false;

    // Normalization helper handles variable separators
    const normalize = (str: string) =>
      (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = this.parseCsvLine(line);
      const itemValRaw = row[itemIdx]?.trim() || "";
      const subId = subIdIdx >= 0 ? normalizeItemSubId(row[subIdIdx]) : "";
      if (!itemValRaw) {
        failed.push({ csvRow: `Zeile ${i + 1}`, reason: "Item fehlt" });
        continue;
      }
      if (options.requireEmpiricalDifficulty) {
        const empiricalValue = Number(
          (row[estIdx] || "").trim().replace(",", "."),
        );
        if (!Number.isFinite(empiricalValue)) continue;
      }

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

        let group = groups.get(rowKey);
        if (!group) {
          group = {
            match,
            subId,
            rowIndexes: [],
            scalars: new Map(),
            occurrences: new Map(),
            emptyOccurrenceRows: [],
          };
          groups.set(rowKey, group);
        }
        if (bookletIdx < 0 && group.rowIndexes.length > 0) {
          throw new BadRequestException(
            `Konflikt: Die Zeile für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} kommt mehrfach in der CSV vor.`,
          );
        }

        let invalidReason = "";
        const rowScalars = new Map<ImportedScalarProperty, number>();
        for (const definition of scalarColumns) {
          const rawValue = row[definition.index]?.trim() || "";
          if (!rawValue) continue;
          const value = Number(rawValue.replace(",", "."));
          if (!Number.isFinite(value)) {
            invalidReason = `Ungültiger Zahlenwert in ${definition.header}`;
            break;
          }
          if (definition.nonNegative && value < 0) {
            invalidReason = `${definition.header} darf nicht negativ sein`;
            break;
          }
          rowScalars.set(definition.property, value);
        }
        if (invalidReason) {
          failed.push({ csvRow: itemValRaw, reason: invalidReason });
          if (!group.rowIndexes.length) groups.delete(rowKey);
          continue;
        }

        let occurrence:
          | { key: string; value: { booklet: string; position: number } }
          | undefined;
        let emptyOccurrence = false;
        if (bookletIdx >= 0) {
          const booklet = row[bookletIdx]?.trim() || "";
          const rawPosition = row[positionIdx]?.trim() || "";
          if (!booklet && !rawPosition) {
            if (group.emptyOccurrenceRows.length > 0) {
              throw new BadRequestException(
                `Konflikt: Die leere Booklet-Zuordnung für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} kommt mehrfach vor.`,
              );
            }
            emptyOccurrence = true;
          } else if (!booklet || !rawPosition) {
            failed.push({
              csvRow: itemValRaw,
              reason: "Booklet und Position müssen gemeinsam gesetzt sein",
            });
            if (!group.rowIndexes.length) groups.delete(rowKey);
            continue;
          } else {
            const position = Number(rawPosition);
            if (!Number.isInteger(position) || position <= 0) {
              failed.push({
                csvRow: itemValRaw,
                reason: "Position muss eine positive Ganzzahl sein",
              });
              if (!group.rowIndexes.length) groups.delete(rowKey);
              continue;
            }
            const occurrenceKey = `${booklet}\u0000${position}`;
            if (group.occurrences.has(occurrenceKey)) {
              throw new BadRequestException(
                `Konflikt: Booklet "${booklet}" und Position ${position} kommen für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} mehrfach vor.`,
              );
            }
            occurrence = {
              key: occurrenceKey,
              value: { booklet, position },
            };
          }
        }
        const previousMode = matchedItemModes.get(match.uuid);
        if (previousMode && previousMode.mode !== mode) {
          throw new BadRequestException(
            `Konflikt: Das Item "${match.itemId}" wird in derselben CSV sowohl mit als auch ohne Sub-ID verwendet (Zeile ${previousMode.rowIndex + 1} und Zeile ${i + 1}). Bitte verwenden Sie pro Item nur eine Darstellungsform.`,
          );
        }
        matchedItemModes.set(match.uuid, { mode, rowIndex: i });
        rowScalars.forEach((value, property) => {
          const values = group.scalars.get(property) || new Set<number>();
          values.add(value);
          group.scalars.set(property, values);
        });
        if (occurrence) {
          group.occurrences.set(occurrence.key, occurrence.value);
        }
        if (emptyOccurrence) group.emptyOccurrenceRows.push(i);
        group.rowIndexes.push(i);
      } else {
        failed.push({
          csvRow: itemValRaw,
          reason: "Kein passendes Item gefunden",
        });
      }
    }

    for (const group of groups.values()) {
      for (const [property, values] of group.scalars.entries()) {
        if (values.size > 1) {
          throw new BadRequestException(
            `Konflikt: Für Item "${group.match.itemId}"${group.subId ? ` und Sub-ID "${group.subId}"` : ""} wurden unterschiedliche Werte für ${property} geliefert.`,
          );
        }
      }
    }

    const hasStimulusColumn = scalarColumns.some(
      (definition) => definition.property === "stimulusTimeSeconds",
    );
    const hasItemTimeColumn = scalarColumns.some(
      (definition) => definition.property === "itemTimeSeconds",
    );
    const stimulusTimesByUnit = new Map<string, Set<number>>();
    const itemTimesByUuid = new Map<string, Set<number>>();
    for (const group of groups.values()) {
      const values = group.scalars.get("stimulusTimeSeconds");
      if (hasStimulusColumn) {
        const unitValues =
          stimulusTimesByUnit.get(group.match.unitId) || new Set<number>();
        if (values?.size) unitValues.add(Array.from(values)[0]);
        stimulusTimesByUnit.set(group.match.unitId, unitValues);
      }

      const itemTimeValues = group.scalars.get("itemTimeSeconds");
      if (hasItemTimeColumn) {
        const valuesForItem =
          itemTimesByUuid.get(group.match.uuid) || new Set<number>();
        if (itemTimeValues?.size) {
          valuesForItem.add(Array.from(itemTimeValues)[0]);
        }
        itemTimesByUuid.set(group.match.uuid, valuesForItem);
      }
    }
    for (const [unitId, values] of stimulusTimesByUnit.entries()) {
      if (values.size > 1) {
        throw new BadRequestException(
          `Konflikt: Für Unit "${unitId}" wurden unterschiedliche Stimuluszeiten geliefert.`,
        );
      }
    }
    for (const [itemUuid, values] of itemTimesByUuid.entries()) {
      if (values.size > 1) {
        throw new BadRequestException(
          `Konflikt: Für Item "${itemUuid}" wurden unterschiedliche Itemzeiten geliefert.`,
        );
      }
    }

    for (const [rowKey, group] of groups.entries()) {
      const partialRowKeys = this.getPartialCreditRowKeys(
        props,
        group.match.uuid,
      );
      const affectedRowKeys =
        !group.subId && partialRowKeys.length ? partialRowKeys : [rowKey];
      const importedProperties = scalarColumns.map(
        (definition) => definition.property,
      );
      const bookletOccurrences =
        bookletIdx >= 0
          ? Array.from(group.occurrences.values()).sort(
              (left, right) =>
                left.booklet.localeCompare(right.booklet, "de", {
                  numeric: true,
                }) || left.position - right.position,
            )
          : undefined;

      if (group.subId || affectedRowKeys.length > 1) {
        const base = props[group.match.uuid];
        if (base) {
          for (const property of importedProperties) delete base[property];
          if (bookletIdx >= 0) delete base.bookletOccurrences;
        }
      }

      for (const affectedRowKey of affectedRowKeys) {
        const nextProperties: Record<string, unknown> = {
          ...(props[affectedRowKey] || {}),
          ...(group.subId
            ? { itemUuid: group.match.uuid, subId: group.subId }
            : {}),
        };
        for (const definition of scalarColumns) {
          const values = group.scalars.get(definition.property);
          if (values?.size) {
            nextProperties[definition.property] = Array.from(values)[0];
          } else {
            delete nextProperties[definition.property];
          }
        }
        if (bookletOccurrences) {
          nextProperties.bookletOccurrences = bookletOccurrences;
        }
        props[affectedRowKey] = nextProperties;
      }

      successes.push({
        itemId: group.match.itemId,
        unitId: group.match.unitId,
        ...(affectedRowKeys.length === 1 ? { rowKey: affectedRowKeys[0] } : {}),
        affectedRowKeys,
        subId: group.subId || undefined,
        ...(!options.requireEmpiricalDifficulty
          ? {
              fields: [
                ...scalarColumns.map((definition) => definition.header),
                ...(bookletIdx >= 0 ? ["booklet", "position"] : []),
              ],
            }
          : {}),
        ...(group.scalars.get("empiricalDifficulty")?.size
          ? {
              value: Array.from(
                group.scalars.get("empiricalDifficulty") as Set<number>,
              )[0],
            }
          : {}),
        ...(!options.requireEmpiricalDifficulty && bookletIdx >= 0
          ? { bookletOccurrences }
          : {}),
      });
      isUpdated = true;
    }

    if (hasItemTimeColumn) {
      for (const [itemUuid, values] of itemTimesByUuid.entries()) {
        this.setCanonicalItemProperty(
          props,
          itemUuid,
          "itemTimeSeconds",
          this.parseImportedTimeValue(values),
        );
      }
    }
    if (hasStimulusColumn) {
      const itemUuidsByUnit = new Map<string, Set<string>>();
      for (const item of items) {
        const itemUuids = itemUuidsByUnit.get(item.unitId) || new Set<string>();
        itemUuids.add(item.uuid);
        itemUuidsByUnit.set(item.unitId, itemUuids);
      }
      for (const [unitId, values] of stimulusTimesByUnit.entries()) {
        const stimulusTime = this.parseImportedTimeValue(values);
        for (const itemUuid of itemUuidsByUnit.get(unitId) || []) {
          this.setCanonicalItemProperty(
            props,
            itemUuid,
            "stimulusTimeSeconds",
            stimulusTime,
          );
        }
      }
    }

    if (isUpdated && options.persist !== false) {
      acp.itemProperties = props;
      await this.acpRepository.save(acp);
    }

    return {
      updated: groups.size,
      failed,
      successes,
      nextItemProperties: props,
    };
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const numberValue = Number(value);
    return value === undefined ||
      value === null ||
      !Number.isFinite(numberValue)
      ? undefined
      : numberValue;
  }

  private normalizeBookletOccurrences(
    value: unknown,
  ): Array<{ booklet: string; position: number }> {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        const booklet =
          entry && typeof entry === "object" && "booklet" in entry
            ? String((entry as { booklet?: unknown }).booklet || "").trim()
            : "";
        const position =
          entry && typeof entry === "object" && "position" in entry
            ? Number((entry as { position?: unknown }).position)
            : Number.NaN;
        return { booklet, position };
      })
      .filter(
        (entry) =>
          entry.booklet.length > 0 &&
          Number.isInteger(entry.position) &&
          entry.position > 0,
      )
      .sort(
        (left, right) =>
          left.booklet.localeCompare(right.booklet, "de", { numeric: true }) ||
          left.position - right.position,
      );
  }

  private parseImportedTimeValue(values: Set<number>): number | undefined {
    return Array.from(values)[0];
  }

  private setCanonicalItemProperty(
    itemProperties: Record<string, Record<string, unknown>>,
    itemUuid: string,
    property: "itemTimeSeconds" | "stimulusTimeSeconds",
    value: number | undefined,
  ): void {
    const baseProperties = { ...(itemProperties[itemUuid] || {}) };
    if (value === undefined) delete baseProperties[property];
    else baseProperties[property] = value;
    if (Object.keys(baseProperties).length || itemProperties[itemUuid]) {
      itemProperties[itemUuid] = baseProperties;
    }
    for (const rowKey of this.getPartialCreditRowKeys(
      itemProperties,
      itemUuid,
    )) {
      if (itemProperties[rowKey]?.[property] !== undefined) {
        const rowProperties = { ...itemProperties[rowKey] };
        delete rowProperties[property];
        itemProperties[rowKey] = rowProperties;
      }
    }
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
