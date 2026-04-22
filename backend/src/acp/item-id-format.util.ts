export type ItemIdFormat = "current" | "legacy";

export const DEFAULT_ITEM_ID_FORMAT: ItemIdFormat = "current";

export interface ParsedItemIdStructure {
  format: ItemIdFormat;
  subjectCode?: string;
  subjectLabel?: string;
  competenceAreaCode?: string;
  competenceAreaLabel?: string;
  projectPoolCode?: string;
  projectPoolLabel?: string;
  taskNumber?: string;
  itemNumber?: string;
  variableIndicator?: string;
  authorInitials?: string;
}

function sanitizeItemId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

const CURRENT_SUBJECT_LABELS: Record<string, string> = {
  D: "Deutsch Primar",
  M: "Mathematik Primar",
  G: "Deutsch Sekundar",
  N: "Mathematik Sekundar",
  F: "Französisch Sekundar",
  E: "Englisch Sekundar",
  B: "Biologie Sekundar",
  P: "Physik Sekundar",
  C: "Chemie Sekundar",
  K: "Kognitive Grundfähigkeiten",
};

const CURRENT_COMPETENCE_AREA_LABELS: Record<string, string> = {
  A: "Audiovisuelles Hörverstehen",
  Z: "Zahlen und Operationen",
  G: "Größen und Messen",
  M: "Muster und Strukturen",
  R: "Raum und Form",
  D: "Daten und Zufall",
  H: "Hörverstehen / Zuhören",
  O: "Orthografie",
  P: "Sprechen",
  L: "Leseverstehen / Lesen",
  T: "Texte und Medien",
  S: "Sprachgebrauch",
  V: "Texte verfassen",
  F: "Fachwissen / Sachkompetenz",
  E: "Erkenntnisgewinnung",
  B: "Bewertung",
  K: "Kommunikation",
  X: "Keine Zuordnung",
};

const CURRENT_PROJECT_POOL_LABELS: Record<string, string> = {
  B: "BiStaTest / BT",
  V: "VERA",
  K: "Kognitive Grundfähigkeiten",
  S: "BiStaTest SPF",
  P: "BiStaTest Papier",
  T: "BKT",
};

const LEGACY_SUBJECT_LABELS: Record<string, string> = {
  D: "Deutsch",
  M: "Mathematik",
  G: "Deutsch Sekundar",
  N: "Mathematik Sekundar",
  F: "Französisch",
  E: "Englisch",
  B: "Biologie",
  P: "Physik",
  C: "Chemie",
  K: "Kognitive Grundfähigkeiten",
};

const LEGACY_COMPETENCE_AREA_LABELS: Record<string, string> = {
  "1": "Zuhören",
  "2": "Orthografie",
  "3": "Lesen",
  "5": "Sprachgebrauch",
};

function normalizeToken(value: string): string | undefined {
  const normalized = String(value || "").trim();
  return normalized.length ? normalized : undefined;
}

function labelForCode(
  code: string | undefined,
  labels: Record<string, string>,
): string | undefined {
  if (!code) {
    return undefined;
  }
  return labels[code] || code;
}

export function normalizeItemIdFormat(value: unknown): ItemIdFormat {
  return value === "legacy" ? "legacy" : DEFAULT_ITEM_ID_FORMAT;
}

function parseCurrentItemId(itemId: string): ParsedItemIdStructure {
  const sanitized = sanitizeItemId(itemId);
  const subjectCode = normalizeToken(sanitized.slice(0, 1));
  const competenceAreaCode = normalizeToken(sanitized.slice(1, 2));
  const projectPoolCode = normalizeToken(sanitized.slice(2, 3));
  const taskNumber = normalizeToken(sanitized.slice(3, 6));
  const itemNumber = normalizeToken(sanitized.slice(6, 8));
  const variableIndicator = normalizeToken(sanitized.slice(8));

  return {
    format: "current",
    subjectCode,
    subjectLabel: labelForCode(subjectCode, CURRENT_SUBJECT_LABELS),
    competenceAreaCode,
    competenceAreaLabel: labelForCode(
      competenceAreaCode,
      CURRENT_COMPETENCE_AREA_LABELS,
    ),
    projectPoolCode,
    projectPoolLabel: labelForCode(
      projectPoolCode,
      CURRENT_PROJECT_POOL_LABELS,
    ),
    taskNumber,
    itemNumber,
    variableIndicator,
  };
}

function parseLegacyItemId(itemId: string): ParsedItemIdStructure {
  const sanitized = sanitizeItemId(itemId);
  const subjectCode = normalizeToken(sanitized.slice(0, 1));
  const competenceAreaCode = normalizeToken(sanitized.slice(1, 2));
  const remainder = sanitized.slice(2);
  const alphaPart = (remainder.match(/[A-Z]+/)?.[0] || "").trim();
  const digitPart = (remainder.match(/\d+/g) || []).join("").trim();
  const authorInitials = normalizeToken(alphaPart.slice(0, 2));
  const itemNumber = normalizeToken(
    digitPart.length >= 2 ? digitPart.slice(-2) : digitPart,
  );
  const competenceAreaLabels =
    subjectCode === "D" || subjectCode === "G"
      ? LEGACY_COMPETENCE_AREA_LABELS
      : {};

  return {
    format: "legacy",
    subjectCode,
    subjectLabel: labelForCode(subjectCode, LEGACY_SUBJECT_LABELS),
    competenceAreaCode,
    competenceAreaLabel: labelForCode(competenceAreaCode, competenceAreaLabels),
    authorInitials,
    itemNumber,
  };
}

function isLikelyCurrentCandidate(itemId: string): boolean {
  const sanitized = sanitizeItemId(itemId);
  if (sanitized.length < 8) {
    return false;
  }

  const subjectCode = sanitized.slice(0, 1);
  const competenceAreaCode = sanitized.slice(1, 2);
  const projectPoolCode = sanitized.slice(2, 3);
  const taskNumber = sanitized.slice(3, 6);
  const itemNumber = sanitized.slice(6, 8);

  return (
    Boolean(CURRENT_SUBJECT_LABELS[subjectCode]) &&
    Boolean(CURRENT_COMPETENCE_AREA_LABELS[competenceAreaCode]) &&
    Boolean(CURRENT_PROJECT_POOL_LABELS[projectPoolCode]) &&
    /^\d{3}$/.test(taskNumber) &&
    /^\d{2}$/.test(itemNumber)
  );
}

function isLikelyLegacyCandidate(itemId: string): boolean {
  const sanitized = sanitizeItemId(itemId);
  if (sanitized.length < 4) {
    return false;
  }

  const subjectCode = sanitized.slice(0, 1);
  const competenceAreaCode = sanitized.slice(1, 2);
  const remainder = sanitized.slice(2);
  const alphaPart = (remainder.match(/[A-Z]+/)?.[0] || "").trim();
  const digitPart = (remainder.match(/\d+/g) || []).join("");

  return (
    /^[A-Z]$/.test(subjectCode) &&
    /^\d$/.test(competenceAreaCode) &&
    alphaPart.length >= 2 &&
    digitPart.length >= 2
  );
}

export function parseItemIdStructure(
  itemIdRaw: string,
  formatRaw: unknown,
): ParsedItemIdStructure {
  const itemId = String(itemIdRaw || "").trim();
  const format = normalizeItemIdFormat(formatRaw);

  if (format === "legacy") {
    return parseLegacyItemId(itemId);
  }

  return parseCurrentItemId(itemId);
}

export function parseItemIdStructureFromCandidates(
  candidates: unknown[],
  formatRaw: unknown,
): ParsedItemIdStructure {
  const format = normalizeItemIdFormat(formatRaw);
  const normalizedCandidates = candidates
    .map((candidate) => String(candidate || "").trim())
    .filter((candidate) => candidate.length > 0);

  const matchingCandidate = normalizedCandidates.find((candidate) =>
    format === "legacy"
      ? isLikelyLegacyCandidate(candidate)
      : isLikelyCurrentCandidate(candidate),
  );

  if (matchingCandidate) {
    return parseItemIdStructure(matchingCandidate, format);
  }

  return {
    format,
  };
}
