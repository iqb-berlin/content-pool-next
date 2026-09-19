import type { PlayerResponseTarget } from '../../core/services/voud.service';
import {
  CodingVariableLike,
  deriveSolutionAnalysis,
  getValidatedFullCreditCodeId,
  normalizeSolutionIdentifier,
  SolutionScalar,
} from './item-explorer-solution-analysis';

export type { CodingVariableLike } from './item-explorer-solution-analysis';

export interface PlayerSolutionResponse {
  id: string;
  status: 'VALUE_CHANGED';
  value: SolutionScalar;
}

export type PlayerSolutionPrefill =
  | {
      status: 'available';
      responses: PlayerSolutionResponse[];
      message: string;
    }
  | {
      status: 'unavailable';
      responses: [];
      message: string;
    };

export type PlayerResponseTargetResolver = (
  variable: CodingVariableLike,
) => PlayerResponseTarget | undefined;

const unavailable = (message: string): PlayerSolutionPrefill => ({
  status: 'unavailable',
  responses: [],
  message,
});

const coercePlayerValue = (
  value: SolutionScalar,
  target: PlayerResponseTarget,
): SolutionScalar | null => {
  switch (target.elementType.trim().toLowerCase()) {
    case 'checkbox': {
      if (typeof value === 'boolean') return value;
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      return null;
    }
    case 'radio':
    case 'radio-group-images':
    case 'dropdown':
    case 'toggle-button': {
      const normalized = String(value).trim().replace(',', '.');
      const numericValue = Number(normalized);
      return normalized &&
        Number.isInteger(numericValue) &&
        numericValue >= 1 &&
        Number.isInteger(target.optionCount) &&
        numericValue <= target.optionCount!
        ? numericValue
        : null;
    }
    case 'text-field':
    case 'text-field-simple':
    case 'text-area':
      return typeof value === 'string' ? value : String(value);
    default:
      return null;
  }
};

export function derivePlayerSolutionPrefill(
  selectedVariable: CodingVariableLike | undefined,
  variables: CodingVariableLike[],
  resolvePlayerTarget: PlayerResponseTargetResolver,
): PlayerSolutionPrefill {
  const analysis = deriveSolutionAnalysis(selectedVariable, variables);
  if (analysis.status !== 'exact' || !selectedVariable) {
    return unavailable(analysis.message);
  }

  const resolved = analysis.answers.map(({ variable, value }) => {
    const target = resolvePlayerTarget(variable);
    const playerValue = target ? coercePlayerValue(value, target) : null;
    return { variable, target, value: playerValue };
  });
  if (resolved.some(({ target, value }) => !target || value === null)) {
    return unavailable(
      'Aus den FULL_CREDIT-Regeln lässt sich keine eindeutig darstellbare Player-Antwort erzeugen.',
    );
  }

  const selectedSourceType = String(selectedVariable.sourceType || 'BASE')
    .trim()
    .toUpperCase();
  if (
    selectedSourceType === 'SUM_SCORE' &&
    resolved.some(({ target }) => target?.elementType.trim().toLowerCase() !== 'checkbox')
  ) {
    return unavailable(
      'Die zusammengesetzte Lösung ist nicht vollständig auf Kontrollkästchen abbildbar.',
    );
  }

  const ids = new Set<string>();
  const responses: PlayerSolutionResponse[] = [];
  for (const { target, value } of resolved) {
    const responseId = String(target!.responseId || '').trim();
    const key = normalizeSolutionIdentifier(responseId);
    if (!key || ids.has(key)) {
      return unavailable('Mehrere Lösungswerte würden dasselbe Player-Ziel belegen.');
    }
    ids.add(key);
    responses.push({ id: responseId, status: 'VALUE_CHANGED', value: value! });
  }

  if (
    getValidatedFullCreditCodeId(
      selectedVariable,
      variables,
      resolved.map(({ variable, value }) => ({ variable, value: value! })),
    ) === null
  ) {
    return unavailable(
      'Die abgeleitete Antwort konnte mit dem vorhandenen Kodierschema nicht als richtig bestätigt werden.',
    );
  }

  return { status: 'available', responses, message: analysis.message };
}

export function mergePlayerSolutionIntoDataParts(
  dataParts: Record<string, any> | null | undefined,
  solutionResponses: PlayerSolutionResponse[],
): Record<string, any> {
  const merged = { ...(dataParts || {}) };
  let existingResponses: Array<{ id?: unknown; [key: string]: unknown }> = [];
  const elementCodes = merged['elementCodes'];
  try {
    const parsed = typeof elementCodes === 'string' ? JSON.parse(elementCodes) : elementCodes;
    if (Array.isArray(parsed)) existingResponses = parsed;
  } catch (_error) {
    existingResponses = [];
  }

  const solutionIds = new Set(
    solutionResponses.map((response) => normalizeSolutionIdentifier(response.id)),
  );
  merged['elementCodes'] = JSON.stringify([
    ...existingResponses.filter(
      (response) => !solutionIds.has(normalizeSolutionIdentifier(response?.id)),
    ),
    ...solutionResponses,
  ]);
  return merged;
}
