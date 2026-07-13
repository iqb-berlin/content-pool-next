import {
  DEFAULT_ITEM_ID_FORMAT,
  normalizeItemIdFormat,
} from "./item-id-format.util";

type UnknownRecord = Record<string, unknown>;

interface MetadataColumnsConfig {
  visible: string[];
  order: string[];
}

function asRecord(value: unknown): UnknownRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeStringMap(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const normalized: Record<string, string> = {};
  for (const [rawKey, rawLabel] of Object.entries(source)) {
    const key = rawKey.trim();
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    if (key && label) {
      normalized[key] = label;
    }
  }
  return normalized;
}

function normalizeMetadataColumns(
  metadataColumnsRaw: unknown,
  legacyItemListColumnsRaw: unknown,
): MetadataColumnsConfig | undefined {
  const metadataColumns = asRecord(metadataColumnsRaw);
  const visible = asStringArray(metadataColumns.visible);
  const order = asStringArray(metadataColumns.order);

  if (visible.length || order.length) {
    const normalizedVisible = visible.length ? visible : order;
    const normalizedOrder = order.length ? order : normalizedVisible;
    return {
      visible: normalizedVisible,
      order: normalizedOrder,
    };
  }

  const legacyColumns = asStringArray(legacyItemListColumnsRaw);
  if (!legacyColumns.length) {
    return undefined;
  }

  return {
    visible: legacyColumns,
    order: legacyColumns,
  };
}

/**
 * Canonical feature-config representation:
 * - use `metadataColumns` as the single source of truth
 * - migrate legacy `itemListMetadataColumns` if present
 * - strip legacy key from output
 */
export function normalizeFeatureConfig(featureConfig: unknown): UnknownRecord {
  const source = asRecord(featureConfig);
  const normalized: UnknownRecord = { ...source };

  normalized.itemIdFormat = normalizeItemIdFormat(
    source.itemIdFormat || DEFAULT_ITEM_ID_FORMAT,
  );

  normalized.enablePlayerFocusHighlight =
    source.enablePlayerFocusHighlight === true;

  normalized.itemSubIdLabel =
    typeof source.itemSubIdLabel === "string" &&
    source.itemSubIdLabel.trim().length > 0
      ? source.itemSubIdLabel.trim()
      : "Sub-ID";

  const itemSubIdLabels = normalizeStringMap(source.itemSubIdLabels);
  if (Object.keys(itemSubIdLabels).length > 0) {
    normalized.itemSubIdLabels = itemSubIdLabels;
  } else {
    delete normalized.itemSubIdLabels;
  }

  const metadataColumns = normalizeMetadataColumns(
    source.metadataColumns,
    source.itemListMetadataColumns,
  );

  if (metadataColumns) {
    normalized.metadataColumns = metadataColumns;
  } else {
    delete normalized.metadataColumns;
  }

  delete normalized.itemListMetadataColumns;

  return normalized;
}
