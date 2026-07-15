import { VomdItemData } from "../files/unit-parser.service";

export interface ItemExportProjection {
  unitId: string;
  unitLabel: string;
  itemId: string;
  itemUuid: string | null;
  subId: string | null;
  rowKey: string;
  category: string | null;
  tags: string[];
  note: string | null;
  empiricalDifficulty: number | null;
  infit: number | null;
  discrimination: number | null;
  solutionRate: number | null;
  itemTimeSeconds: number | null;
  stimulusTimeSeconds: number | null;
  booklets: string | null;
  bookletPositions: string | null;
  meanTaskDifficulty: number | null;
}

export type ItemExportScalarKey = Exclude<keyof ItemExportProjection, "tags">;

export interface ItemExportColumnDefinition {
  header: string;
  key: ItemExportScalarKey;
  width: number;
  numeric?: boolean;
}

export const ITEM_EXPORT_IDENTITY_COLUMNS: readonly ItemExportColumnDefinition[] =
  [
    { header: "Unit-ID", key: "unitId", width: 22 },
    { header: "Unit-Label", key: "unitLabel", width: 30 },
    { header: "Item-ID", key: "itemId", width: 22 },
    { header: "Sub-ID", key: "subId", width: 18 },
    { header: "Zeilenschlüssel", key: "rowKey", width: 45 },
  ];

export const ITEM_UUID_EXPORT_COLUMN: ItemExportColumnDefinition = {
  header: "Item-UUID",
  key: "itemUuid",
  width: 38,
};

export const ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS: readonly ItemExportColumnDefinition[] =
  [
    ...ITEM_EXPORT_IDENTITY_COLUMNS.slice(0, 3),
    ITEM_UUID_EXPORT_COLUMN,
    ...ITEM_EXPORT_IDENTITY_COLUMNS.slice(3),
  ];

export const ITEM_EXPORT_PARAMETER_COLUMNS: readonly ItemExportColumnDefinition[] =
  [
    {
      header: "Empirische Itemschwierigkeit",
      key: "empiricalDifficulty",
      width: 30,
      numeric: true,
    },
    { header: "Infit", key: "infit", width: 16, numeric: true },
    {
      header: "Trennschärfe",
      key: "discrimination",
      width: 18,
      numeric: true,
    },
    {
      header: "Lösungshäufigkeit",
      key: "solutionRate",
      width: 22,
      numeric: true,
    },
    {
      header: "Itemzeit (s)",
      key: "itemTimeSeconds",
      width: 18,
      numeric: true,
    },
    {
      header: "Stimuluszeit (s)",
      key: "stimulusTimeSeconds",
      width: 20,
      numeric: true,
    },
    { header: "Booklet", key: "booklets", width: 30 },
    {
      header: "Position im Booklet",
      key: "bookletPositions",
      width: 25,
    },
  ];

export const MEAN_DIFFICULTY_EXPORT_COLUMN: ItemExportColumnDefinition = {
  header: "Mittlere Aufgabenschwierigkeit",
  key: "meanTaskDifficulty",
  width: 32,
  numeric: true,
};

export function projectItemExportRow(input: {
  rowKey: string;
  item?: VomdItemData;
  personalRow?: Record<string, unknown>;
  meanDifficultyByUnit?: ReadonlyMap<string, number>;
}): ItemExportProjection {
  const { item } = input;
  const personalRow = input.personalRow || {};
  const occurrences = item?.bookletOccurrences || [];
  return {
    unitId: item?.unitId || "",
    unitLabel: item?.unitLabel || "",
    itemId: item?.itemId || "",
    itemUuid: item?.uuid || null,
    subId: item?.subId || null,
    rowKey: input.rowKey,
    category:
      typeof personalRow.category === "string" ? personalRow.category : null,
    tags: Array.isArray(personalRow.tags)
      ? personalRow.tags.map((tag) => String(tag))
      : [],
    note: typeof personalRow.note === "string" ? personalRow.note : null,
    empiricalDifficulty: item?.empiricalDifficulty ?? null,
    infit: item?.infit ?? null,
    discrimination: item?.discrimination ?? null,
    solutionRate: item?.solutionRate ?? null,
    itemTimeSeconds: item?.itemTimeSeconds ?? null,
    stimulusTimeSeconds: item?.stimulusTimeSeconds ?? null,
    booklets: occurrences.length
      ? occurrences.map((occurrence) => occurrence.booklet).join(" | ")
      : null,
    bookletPositions: occurrences.length
      ? occurrences.map((occurrence) => String(occurrence.position)).join(" | ")
      : null,
    meanTaskDifficulty: item
      ? (input.meanDifficultyByUnit?.get(item.unitId) ?? null)
      : null,
  };
}

export function getItemExportCell(
  row: ItemExportProjection,
  column: ItemExportColumnDefinition,
): string | number {
  const value = row[column.key];
  return typeof value === "string" || typeof value === "number" ? value : "";
}
