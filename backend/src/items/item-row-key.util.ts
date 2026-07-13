export const ITEM_ROW_KEY_SEPARATOR = "::";

export function normalizeItemSubId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function buildItemRowKey(itemUuid: string, subId?: unknown): string {
  const normalizedUuid = String(itemUuid || "").trim();
  const normalizedSubId = normalizeItemSubId(subId);
  if (!normalizedSubId) {
    return normalizedUuid;
  }
  return `${normalizedUuid}${ITEM_ROW_KEY_SEPARATOR}${encodeURIComponent(normalizedSubId)}`;
}

export function parseItemRowKeyParts(
  rowKey: unknown,
): { itemUuid: string; subId: string } | null {
  const normalizedRowKey = String(rowKey || "").trim();
  const separatorIndex = normalizedRowKey.indexOf(ITEM_ROW_KEY_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  const itemUuid = normalizedRowKey.slice(0, separatorIndex).trim();
  const encodedSubId = normalizedRowKey.slice(
    separatorIndex + ITEM_ROW_KEY_SEPARATOR.length,
  );
  if (!itemUuid || !encodedSubId) {
    return null;
  }

  try {
    const subId = normalizeItemSubId(decodeURIComponent(encodedSubId));
    if (!subId || buildItemRowKey(itemUuid, subId) !== normalizedRowKey) {
      return null;
    }
    return { itemUuid, subId };
  } catch {
    return null;
  }
}

export function parseItemRowKey(
  rowKey: unknown,
  itemUuid: string,
): { subId?: string } | null {
  const normalizedRowKey = String(rowKey || "").trim();
  const normalizedUuid = String(itemUuid || "").trim();
  if (!normalizedRowKey || !normalizedUuid) {
    return null;
  }
  if (normalizedRowKey === normalizedUuid) {
    return {};
  }
  const parts = parseItemRowKeyParts(normalizedRowKey);
  return parts?.itemUuid === normalizedUuid ? { subId: parts.subId } : null;
}
