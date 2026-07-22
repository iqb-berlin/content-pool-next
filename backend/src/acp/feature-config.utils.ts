type UnknownRecord = Record<string, unknown>;

interface MetadataColumnsConfig {
  visible: string[];
  order: string[];
  referenceNumberVisible?: boolean;
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

function normalizePersonalItemTags(
  value: unknown,
): Array<{ label: string; color: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: Array<{ label: string; color: string }> = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const label =
      typeof record.label === "string" ? record.label.trim().slice(0, 100) : "";
    if (!label || seen.has(label)) continue;
    const color =
      typeof record.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(record.color.trim())
        ? record.color.trim().toLowerCase()
        : "#3498db";
    seen.add(label);
    tags.push({ label, color });
  }
  return tags.slice(0, 50);
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
  const referenceNumberVisible =
    metadataColumns.referenceNumberVisible === true;

  if (visible.length || order.length || referenceNumberVisible) {
    const normalizedVisible = visible.length ? visible : order;
    const normalizedOrder = order.length ? order : normalizedVisible;
    return {
      visible: normalizedVisible,
      order: normalizedOrder,
      ...(referenceNumberVisible ? { referenceNumberVisible: true } : {}),
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

  normalized.enablePlayerFocusHighlight =
    source.enablePlayerFocusHighlight === true;

  normalized.enablePersonalItemData = source.enablePersonalItemData === true;
  normalized.enableItemCollections = source.enableItemCollections === true;
  normalized.personalItemCategoryLabel =
    typeof source.personalItemCategoryLabel === "string" &&
    source.personalItemCategoryLabel.trim()
      ? source.personalItemCategoryLabel.trim().slice(0, 100)
      : "Kompetenzstufe";
  normalized.personalItemCategoryValues = Array.from(
    new Set(
      asStringArray(source.personalItemCategoryValues).map((value) =>
        value.slice(0, 200),
      ),
    ),
  ).slice(0, 50);
  normalized.personalItemTagLabel =
    typeof source.personalItemTagLabel === "string" &&
    source.personalItemTagLabel.trim()
      ? source.personalItemTagLabel.trim().slice(0, 100)
      : "Markierungen";
  normalized.personalItemTags = normalizePersonalItemTags(
    source.personalItemTags,
  );

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
