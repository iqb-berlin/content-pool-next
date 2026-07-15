import { BadRequestException, Injectable } from "@nestjs/common";
import { VomdItemData } from "../files/unit-parser.service";
import {
  buildItemRowKey,
  normalizeItemSubId,
  parseItemRowKeyParts,
} from "./item-row-key.util";

export type ImportAction = "keep" | "set" | "clear";
export type ImportScope = "row" | "item" | "unit";

type ImportedScalarProperty =
  | "empiricalDifficulty"
  | "infit"
  | "discrimination"
  | "solutionRate"
  | "itemTimeSeconds"
  | "stimulusTimeSeconds";

type ImportedProperty =
  | ImportedScalarProperty
  | "bookletOccurrences"
  | "itemUuid"
  | "subId";

interface ImportMutationBase {
  scope: ImportScope;
  property: ImportedProperty;
}

export type ImportMutation =
  | (ImportMutationBase & { action: "keep" })
  | (ImportMutationBase & { action: "clear"; targetKeys: string[] })
  | (ImportMutationBase & {
      action: "set";
      targetKeys: string[];
      value: unknown;
    });

export interface ItemParameterImportPlan {
  mutations: ImportMutation[];
  updated: number;
  failed: Array<{ csvRow: string; reason: string }>;
  successes: Array<Record<string, unknown>>;
}

export interface ItemParameterImportRequest {
  fileBuffer: Buffer;
  items: VomdItemData[];
  itemProperties: Record<string, Record<string, unknown>>;
  requireEmpiricalDifficulty?: boolean;
}

export interface ItemParameterImportResult {
  updated: number;
  failed: Array<{ csvRow: string; reason: string }>;
  successes: Array<Record<string, unknown>>;
  nextItemProperties: Record<string, Record<string, unknown>>;
}

const IMPORTED_SCALAR_COLUMNS: Array<{
  header: string;
  property: ImportedScalarProperty;
  scope: ImportScope;
  nonNegative?: boolean;
}> = [
  { header: "est", property: "empiricalDifficulty", scope: "row" },
  { header: "infit", property: "infit", scope: "row" },
  { header: "discrimination", property: "discrimination", scope: "row" },
  { header: "solution_rate", property: "solutionRate", scope: "row" },
  {
    header: "item_time_s",
    property: "itemTimeSeconds",
    scope: "item",
    nonNegative: true,
  },
  {
    header: "stimulus_time_s",
    property: "stimulusTimeSeconds",
    scope: "unit",
    nonNegative: true,
  },
];

interface ImportGroup {
  match: VomdItemData;
  subId: string;
  rowIndexes: number[];
  scalars: Map<ImportedScalarProperty, Set<number>>;
  occurrences: Map<string, { booklet: string; position: number }>;
  emptyOccurrenceRows: number[];
}

@Injectable()
export class ItemParameterImportPipeline {
  execute(request: ItemParameterImportRequest): ItemParameterImportResult {
    const plan = this.buildPlan(request);
    return {
      updated: plan.updated,
      failed: plan.failed,
      successes: plan.successes,
      nextItemProperties: this.applyPlan(request.itemProperties, plan),
    };
  }

  buildPlan(request: ItemParameterImportRequest): ItemParameterImportPlan {
    const { fileBuffer, items } = request;
    const requireEmpiricalDifficulty =
      request.requireEmpiricalDifficulty === true;
    const lines = fileBuffer.toString("utf-8").split(/\r?\n/);
    const headers = this.parseCsvLine(lines[0] || "").map((header, index) =>
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
        : requireEmpiricalDifficulty &&
            headers.length > 2 &&
            ![itemIdx, estIdx].includes(1)
          ? 1
          : -1;
    const bookletIdx = headers.indexOf("booklet");
    const positionIdx = headers.indexOf("position");
    const hasBookletColumn = bookletIdx >= 0;
    const hasPositionColumn = positionIdx >= 0;

    if (itemIdx === -1 || (requireEmpiricalDifficulty && estIdx < 0)) {
      throw new BadRequestException(
        requireEmpiricalDifficulty
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

    if (!scalarColumns.length && bookletIdx < 0) {
      throw new BadRequestException(
        'CSV must contain at least one supported item parameter column: "est", "infit", "discrimination", "solution_rate", "item_time_s", "stimulus_time_s", or the pair "booklet" and "position"',
      );
    }

    const failed: Array<{ csvRow: string; reason: string }> = [];
    const successes: Array<Record<string, unknown>> = [];
    const matchedItemModes = new Map<
      string,
      { mode: "standard" | "partial"; rowIndex: number }
    >();
    const groups = new Map<string, ImportGroup>();

    for (let index = 1; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) continue;

      const row = this.parseCsvLine(line);
      const itemValRaw = row[itemIdx]?.trim() || "";
      const subId = subIdIdx >= 0 ? normalizeItemSubId(row[subIdIdx]) : "";
      if (!itemValRaw) {
        failed.push({ csvRow: `Zeile ${index + 1}`, reason: "Item fehlt" });
        continue;
      }
      if (requireEmpiricalDifficulty) {
        const empiricalValue = Number(
          (row[estIdx] || "").trim().replace(",", "."),
        );
        if (!Number.isFinite(empiricalValue)) continue;
      }

      const match = this.findItem(items, itemValRaw);
      if (!match) {
        failed.push({
          csvRow: itemValRaw,
          reason: "Kein passendes Item gefunden",
        });
        continue;
      }

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

      const rowScalars = new Map<ImportedScalarProperty, number>();
      let invalidReason = "";
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

      const occurrence = this.parseOccurrence(
        row,
        bookletIdx,
        positionIdx,
        group,
        match,
        subId,
        itemValRaw,
        failed,
      );
      if (occurrence === null) {
        if (!group.rowIndexes.length) groups.delete(rowKey);
        continue;
      }

      const previousMode = matchedItemModes.get(match.uuid);
      if (previousMode && previousMode.mode !== mode) {
        throw new BadRequestException(
          `Konflikt: Das Item "${match.itemId}" wird in derselben CSV sowohl mit als auch ohne Sub-ID verwendet (Zeile ${previousMode.rowIndex + 1} und Zeile ${index + 1}). Bitte verwenden Sie pro Item nur eine Darstellungsform.`,
        );
      }
      matchedItemModes.set(match.uuid, { mode, rowIndex: index });
      rowScalars.forEach((value, property) => {
        const values = group.scalars.get(property) || new Set<number>();
        values.add(value);
        group.scalars.set(property, values);
      });
      if (occurrence && "value" in occurrence) {
        group.occurrences.set(occurrence.key, occurrence.value);
      } else if (occurrence && "empty" in occurrence) {
        group.emptyOccurrenceRows.push(index);
      }
      group.rowIndexes.push(index);
    }

    this.validateGroupConflicts(groups);
    const itemTimesByUuid = this.collectScopedValues(
      groups,
      scalarColumns,
      "itemTimeSeconds",
      (group) => group.match.uuid,
    );
    const stimulusTimesByUnit = this.collectScopedValues(
      groups,
      scalarColumns,
      "stimulusTimeSeconds",
      (group) => group.match.unitId,
    );
    this.validateScopedConflicts(itemTimesByUuid, "item");
    this.validateScopedConflicts(stimulusTimesByUnit, "unit");

    const mutations: ImportMutation[] = [];
    const importedScalarProperties = new Set(
      scalarColumns.map((definition) => definition.property),
    );
    for (const definition of IMPORTED_SCALAR_COLUMNS) {
      if (importedScalarProperties.has(definition.property)) continue;
      mutations.push({
        action: "keep",
        scope: definition.scope,
        property: definition.property,
      });
    }
    if (bookletIdx < 0) {
      mutations.push({
        action: "keep",
        scope: "row",
        property: "bookletOccurrences",
      });
    }
    const importedRowProperties = scalarColumns.filter(
      (definition) => definition.scope === "row",
    );
    const importedRowMutationDefinitions: Array<{
      property: ImportedProperty;
      scope: ImportScope;
    }> = importedRowProperties.map((definition) => ({
      property: definition.property,
      scope: definition.scope,
    }));
    if (bookletIdx >= 0) {
      importedRowMutationDefinitions.push({
        property: "bookletOccurrences",
        scope: "row",
      });
    }

    for (const [rowKey, group] of groups.entries()) {
      const partialRowKeys = this.getPartialCreditRowKeys(
        request.itemProperties,
        group.match.uuid,
      );
      const affectedRowKeys =
        !group.subId && partialRowKeys.length ? partialRowKeys : [rowKey];

      if (group.subId || affectedRowKeys.length > 1) {
        for (const definition of importedRowMutationDefinitions) {
          mutations.push({
            action: "clear",
            scope: definition.scope,
            property: definition.property,
            targetKeys: [group.match.uuid],
          });
        }
      }

      if (group.subId) {
        mutations.push(
          {
            action: "set",
            scope: "row",
            property: "itemUuid",
            targetKeys: [rowKey],
            value: group.match.uuid,
          },
          {
            action: "set",
            scope: "row",
            property: "subId",
            targetKeys: [rowKey],
            value: group.subId,
          },
        );
      }

      for (const definition of importedRowProperties) {
        const values = group.scalars.get(definition.property);
        if (values?.size) {
          mutations.push({
            action: "set",
            scope: "row",
            property: definition.property,
            targetKeys: affectedRowKeys,
            value: Array.from(values)[0],
          });
        } else {
          mutations.push({
            action: "clear",
            scope: "row",
            property: definition.property,
            targetKeys: affectedRowKeys,
          });
        }
      }

      const bookletOccurrences =
        bookletIdx >= 0
          ? Array.from(group.occurrences.values()).sort(
              (left, right) =>
                left.booklet.localeCompare(right.booklet, "de", {
                  numeric: true,
                }) || left.position - right.position,
            )
          : undefined;
      if (bookletOccurrences) {
        mutations.push({
          action: "set",
          scope: "row",
          property: "bookletOccurrences",
          targetKeys: affectedRowKeys,
          value: bookletOccurrences,
        });
      }

      successes.push({
        itemId: group.match.itemId,
        unitId: group.match.unitId,
        ...(affectedRowKeys.length === 1 ? { rowKey: affectedRowKeys[0] } : {}),
        affectedRowKeys,
        subId: group.subId || undefined,
        ...(!requireEmpiricalDifficulty
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
        ...(!requireEmpiricalDifficulty && bookletIdx >= 0
          ? { bookletOccurrences }
          : {}),
      });
    }

    this.addItemScopeMutations(
      mutations,
      itemTimesByUuid,
      request.itemProperties,
    );
    this.addUnitScopeMutations(
      mutations,
      stimulusTimesByUnit,
      items,
      request.itemProperties,
    );

    return {
      mutations,
      updated: groups.size,
      failed,
      successes,
    };
  }

  applyPlan(
    source: Record<string, Record<string, unknown>>,
    plan: ItemParameterImportPlan,
  ): Record<string, Record<string, unknown>> {
    const next = this.cloneItemProperties(source);
    for (const mutation of plan.mutations) {
      if (mutation.action === "keep") continue;
      for (const targetKey of mutation.targetKeys) {
        if (mutation.action === "set") {
          next[targetKey] = { ...(next[targetKey] || {}) };
          next[targetKey][mutation.property] = mutation.value;
        } else if (next[targetKey]) {
          next[targetKey] = { ...next[targetKey] };
          delete next[targetKey][mutation.property];
        }
      }
    }
    return next;
  }

  private findItem(
    items: VomdItemData[],
    rawItemId: string,
  ): VomdItemData | undefined {
    const normalizedCsvItem = this.normalizeItemReference(rawItemId);
    return items.find((item) => {
      const combinedName1 =
        this.normalizeItemReference(item.unitId) +
        this.normalizeItemReference(item.itemId);
      const combinedName2 =
        this.normalizeItemReference(item.unitLabel) +
        this.normalizeItemReference(item.itemId);
      return (
        this.normalizeItemReference(item.itemId) === normalizedCsvItem ||
        combinedName1 === normalizedCsvItem ||
        combinedName2 === normalizedCsvItem
      );
    });
  }

  private normalizeItemReference(value: string): string {
    return (value || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }

  private parseOccurrence(
    row: string[],
    bookletIdx: number,
    positionIdx: number,
    group: ImportGroup,
    match: VomdItemData,
    subId: string,
    itemValRaw: string,
    failed: Array<{ csvRow: string; reason: string }>,
  ):
    | { key: string; value: { booklet: string; position: number } }
    | { empty: true }
    | undefined
    | null {
    if (bookletIdx < 0) return undefined;
    const booklet = row[bookletIdx]?.trim() || "";
    const rawPosition = row[positionIdx]?.trim() || "";
    if (!booklet && !rawPosition) {
      if (group.emptyOccurrenceRows.length > 0) {
        throw new BadRequestException(
          `Konflikt: Die leere Booklet-Zuordnung für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} kommt mehrfach vor.`,
        );
      }
      return { empty: true };
    }
    if (!booklet || !rawPosition) {
      failed.push({
        csvRow: itemValRaw,
        reason: "Booklet und Position müssen gemeinsam gesetzt sein",
      });
      return null;
    }
    const position = Number(rawPosition);
    if (!Number.isInteger(position) || position <= 0) {
      failed.push({
        csvRow: itemValRaw,
        reason: "Position muss eine positive Ganzzahl sein",
      });
      return null;
    }
    const key = `${booklet}\u0000${position}`;
    if (group.occurrences.has(key)) {
      throw new BadRequestException(
        `Konflikt: Booklet "${booklet}" und Position ${position} kommen für Item "${match.itemId}"${subId ? ` und Sub-ID "${subId}"` : ""} mehrfach vor.`,
      );
    }
    return { key, value: { booklet, position } };
  }

  private validateGroupConflicts(groups: Map<string, ImportGroup>): void {
    for (const group of groups.values()) {
      for (const [property, values] of group.scalars.entries()) {
        if (values.size > 1) {
          throw new BadRequestException(
            `Konflikt: Für Item "${group.match.itemId}"${group.subId ? ` und Sub-ID "${group.subId}"` : ""} wurden unterschiedliche Werte für ${property} geliefert.`,
          );
        }
      }
    }
  }

  private collectScopedValues(
    groups: Map<string, ImportGroup>,
    scalarColumns: Array<{ property: ImportedScalarProperty }>,
    property: "itemTimeSeconds" | "stimulusTimeSeconds",
    getScopeKey: (group: ImportGroup) => string,
  ): Map<string, Set<number>> {
    if (!scalarColumns.some((definition) => definition.property === property)) {
      return new Map();
    }
    const valuesByScope = new Map<string, Set<number>>();
    for (const group of groups.values()) {
      const scopeKey = getScopeKey(group);
      const values = valuesByScope.get(scopeKey) || new Set<number>();
      const groupValues = group.scalars.get(property);
      if (groupValues?.size) values.add(Array.from(groupValues)[0]);
      valuesByScope.set(scopeKey, values);
    }
    return valuesByScope;
  }

  private validateScopedConflicts(
    valuesByScope: Map<string, Set<number>>,
    scope: "item" | "unit",
  ): void {
    for (const [scopeKey, values] of valuesByScope.entries()) {
      if (values.size <= 1) continue;
      throw new BadRequestException(
        scope === "unit"
          ? `Konflikt: Für Unit "${scopeKey}" wurden unterschiedliche Stimuluszeiten geliefert.`
          : `Konflikt: Für Item "${scopeKey}" wurden unterschiedliche Itemzeiten geliefert.`,
      );
    }
  }

  private addItemScopeMutations(
    mutations: ImportMutation[],
    valuesByItem: Map<string, Set<number>>,
    source: Record<string, Record<string, unknown>>,
  ): void {
    for (const [itemUuid, values] of valuesByItem.entries()) {
      if (values.size) {
        mutations.push({
          action: "set",
          scope: "item",
          property: "itemTimeSeconds",
          targetKeys: [itemUuid],
          value: Array.from(values)[0],
        });
      } else {
        mutations.push({
          action: "clear",
          scope: "item",
          property: "itemTimeSeconds",
          targetKeys: [itemUuid],
        });
      }
      mutations.push({
        action: "clear",
        scope: "item",
        property: "itemTimeSeconds",
        targetKeys: this.getPartialCreditRowKeys(source, itemUuid),
      });
    }
  }

  private addUnitScopeMutations(
    mutations: ImportMutation[],
    valuesByUnit: Map<string, Set<number>>,
    items: VomdItemData[],
    source: Record<string, Record<string, unknown>>,
  ): void {
    const itemUuidsByUnit = new Map<string, Set<string>>();
    for (const item of items) {
      const itemUuids = itemUuidsByUnit.get(item.unitId) || new Set<string>();
      itemUuids.add(item.uuid);
      itemUuidsByUnit.set(item.unitId, itemUuids);
    }
    for (const [unitId, values] of valuesByUnit.entries()) {
      for (const itemUuid of itemUuidsByUnit.get(unitId) || []) {
        if (values.size) {
          mutations.push({
            action: "set",
            scope: "unit",
            property: "stimulusTimeSeconds",
            targetKeys: [itemUuid],
            value: Array.from(values)[0],
          });
        } else {
          mutations.push({
            action: "clear",
            scope: "unit",
            property: "stimulusTimeSeconds",
            targetKeys: [itemUuid],
          });
        }
        mutations.push({
          action: "clear",
          scope: "unit",
          property: "stimulusTimeSeconds",
          targetKeys: this.getPartialCreditRowKeys(source, itemUuid),
        });
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

  private cloneItemProperties(
    source: Record<string, Record<string, unknown>>,
  ): Record<string, Record<string, unknown>> {
    return JSON.parse(JSON.stringify(source || {}));
  }
}
