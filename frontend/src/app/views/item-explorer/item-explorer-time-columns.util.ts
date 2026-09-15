const METADATA_COLUMN_KEY_PREFIX = 'metadata:';

const TIME_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  iqb_time_item: 'itemTimeSeconds',
  iqb_item_time: 'itemTimeSeconds',
  iqb_time_stimulus: 'stimulusTimeSeconds',
};

export function normalizeItemExplorerMetadataColumnId(id: string): string {
  return TIME_COLUMN_ALIASES[id] || id;
}

export function normalizeItemExplorerTableColumnKey(key: string): string {
  if (!key.startsWith(METADATA_COLUMN_KEY_PREFIX)) return key;
  const id = key.slice(METADATA_COLUMN_KEY_PREFIX.length);
  return `${METADATA_COLUMN_KEY_PREFIX}${normalizeItemExplorerMetadataColumnId(id)}`;
}

export function normalizeItemExplorerColumnList(
  values: readonly string[],
  normalizeKey: (key: string) => string = normalizeItemExplorerMetadataColumnId,
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const key = normalizeKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

export function normalizeItemExplorerColumnRecord<T>(
  values: Readonly<Record<string, T>>,
  normalizeKey: (key: string) => string = normalizeItemExplorerMetadataColumnId,
): Record<string, T> {
  const normalized: Record<string, T> = {};
  const entries = Object.entries(values);

  for (const [key, value] of entries) {
    const canonicalKey = normalizeKey(key);
    if (canonicalKey !== key && normalized[canonicalKey] === undefined) {
      normalized[canonicalKey] = value;
    }
  }
  for (const [key, value] of entries) {
    const canonicalKey = normalizeKey(key);
    if (canonicalKey === key) normalized[canonicalKey] = value;
  }

  return normalized;
}

export function normalizeItemExplorerColumnFilters(
  values: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  const entries = Object.entries(values);

  for (const [key, value] of entries) {
    const canonicalKey = normalizeItemExplorerMetadataColumnId(key);
    if (canonicalKey === key || normalized[canonicalKey] !== undefined) continue;
    const normalizedValue = normalizeLegacyTimeFilter(typeof value === 'string' ? value : '');
    if (normalizedValue !== undefined) normalized[canonicalKey] = normalizedValue;
  }
  for (const [key, value] of entries) {
    if (normalizeItemExplorerMetadataColumnId(key) !== key) continue;
    normalized[key] = typeof value === 'string' ? value : '';
  }

  return normalized;
}

function normalizeLegacyTimeFilter(rawFilter: string): string | undefined {
  const filter = rawFilter.trim();
  if (!filter) return '';

  const durationParts = filter.split(':');
  if (durationParts.length !== 2 && durationParts.length !== 3) return undefined;
  if (!durationParts.every((part) => /^\d+$/.test(part))) return undefined;

  const numbers = durationParts.map(Number);
  const seconds = numbers.at(-1)!;
  const minutes = numbers.at(-2)!;
  if (seconds >= 60 || minutes >= 60) return undefined;
  const hours = numbers.length === 3 ? numbers[0] : 0;
  return String(hours * 3600 + minutes * 60 + seconds);
}
