export interface ItemPreferencesPayload {
  [key: string]: unknown;
  ui: Record<string, unknown>;
  tags: Record<string, string[]>;
  rowData: Record<string, Record<string, unknown>>;
}

export function normalizeItemPreferences(raw: unknown): ItemPreferencesPayload {
  const payload = isRecord(raw) ? raw : {};
  const ui = isRecord(payload.ui) ? payload.ui : {};
  return {
    ui,
    tags: normalizeTags(payload.tags),
    rowData: normalizeItemPreferenceRowData(payload.rowData),
  };
}

export function normalizeItemPreferenceRowData(
  rawRowData: unknown,
): Record<string, Record<string, unknown>> {
  if (!isRecord(rawRowData)) return {};

  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [rawRowKey, value] of Object.entries(rawRowData)) {
    const rowKey = rawRowKey.trim();
    if (!rowKey || !isRecord(value)) continue;

    const category = normalizePlainText(value.category, 200);
    const note = normalizePlainText(value.note, 10_000, true);
    const tags = Array.isArray(value.tags)
      ? Array.from(
          new Set(
            value.tags
              .map((tag) => normalizePlainText(tag, 100))
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

function normalizeTags(rawTags: unknown): Record<string, string[]> {
  if (!isRecord(rawTags)) return {};

  const tags: Record<string, string[]> = {};
  for (const [itemKey, values] of Object.entries(rawTags)) {
    const normalizedItemKey = String(itemKey || "").trim();
    if (!normalizedItemKey || !Array.isArray(values)) continue;

    const normalizedValues = Array.from(
      new Set(
        values
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0),
      ),
    );
    if (normalizedValues.length) tags[normalizedItemKey] = normalizedValues;
  }
  return tags;
}

function normalizePlainText(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
