import { CodingSchemeFactory } from '@iqb/responses';
import type { VariableCodingData } from '@iqbspecs/coding-scheme';
import type { PlayerResponseTarget } from '../../core/services/voud.service';

type SolutionScalar = string | number | boolean;

interface CodingRuleLike {
  method?: string;
  parameters?: unknown;
  fragment?: number;
}

interface RuleSetLike {
  rules?: CodingRuleLike[];
  valueArrayPos?: number | string;
}

interface CodeLike {
  id?: unknown;
  type?: string;
  score?: unknown;
  ruleSets?: RuleSetLike[];
}

export interface CodingVariableLike {
  id?: unknown;
  alias?: unknown;
  sourceType?: string;
  deriveSources?: unknown[];
  fragmenting?: unknown;
  codeModel?: string;
  codes?: CodeLike[];
}

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

const normalizeIdentifier = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

const variableIdentifiers = (variable: CodingVariableLike): string[] =>
  Array.from(
    new Set(
      [variable?.id, variable?.alias]
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  );

const findVariable = (
  reference: unknown,
  variables: CodingVariableLike[],
): CodingVariableLike | undefined => {
  const normalizedReference = normalizeIdentifier(reference);
  if (!normalizedReference) return undefined;

  const idMatches = variables.filter(
    (variable) => normalizeIdentifier(variable?.id) === normalizedReference,
  );
  if (idMatches.length === 1) return idMatches[0];
  if (idMatches.length > 1) return undefined;

  const aliasMatches = variables.filter(
    (variable) => normalizeIdentifier(variable?.alias) === normalizedReference,
  );
  return aliasMatches.length === 1 ? aliasMatches[0] : undefined;
};

const collectBaseVariables = (
  variable: CodingVariableLike,
  variables: CodingVariableLike[],
  visited = new Set<string>(),
): CodingVariableLike[] | null => {
  const visitKey = normalizeIdentifier(variable?.id || variable?.alias);
  if (!visitKey || visited.has(visitKey)) return null;

  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);
  const sourceType = String(variable?.sourceType || 'BASE')
    .trim()
    .toUpperCase();
  if (sourceType === 'BASE') return [variable];
  // The first supported multiple-choice shape is the Studio convention where a SUM_SCORE
  // variable combines direct checkbox variables. Other derivations are not safely invertible.
  if (sourceType !== 'SUM_SCORE') return null;

  const sources = Array.isArray(variable?.deriveSources) ? variable.deriveSources : [];
  if (!sources.length) return null;

  const collected: CodingVariableLike[] = [];
  for (const source of sources) {
    const sourceVariable = findVariable(source, variables);
    if (!sourceVariable) return null;
    if (
      String(sourceVariable.sourceType || 'BASE')
        .trim()
        .toUpperCase() !== 'BASE'
    )
      return null;
    const sourceBases = collectBaseVariables(sourceVariable, variables, nextVisited);
    if (!sourceBases?.length) return null;
    collected.push(...sourceBases);
  }

  const seen = new Set<string>();
  return collected.filter((base) => {
    const key = normalizeIdentifier(base?.id || base?.alias);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const splitRuleParameters = (parameters: unknown): string[] =>
  (Array.isArray(parameters) ? parameters : [])
    .flatMap((parameter) => String(parameter).split(/\r?\n/))
    .filter((parameter) => parameter.length > 0);

const uniqueScalar = (values: SolutionScalar[]): SolutionScalar | null => {
  if (!values.length) return null;
  const first = values[0];
  return values.every((value) => Object.is(value, first)) ? first : null;
};

const deriveRuleValue = (rule: CodingRuleLike): SolutionScalar | null => {
  if (rule?.fragment !== undefined) return null;

  switch (rule?.method) {
    case 'IS_TRUE':
      return true;
    case 'IS_FALSE':
      return false;
    case 'MATCH':
      return uniqueScalar(splitRuleParameters(rule.parameters));
    case 'NUMERIC_MATCH': {
      const numericValues = splitRuleParameters(rule.parameters).map((value) => {
        const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
        if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
        return Number.parseFloat(normalized);
      });
      return numericValues.every(Number.isFinite) ? uniqueScalar(numericValues) : null;
    }
    default:
      return null;
  }
};

const deriveRuleSetValue = (ruleSet: RuleSetLike): SolutionScalar | null => {
  if (ruleSet?.valueArrayPos !== undefined) return null;
  const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];
  if (!rules.length) return null;

  const values = rules.map((rule) => deriveRuleValue(rule));
  if (values.some((value: SolutionScalar | null) => value === null)) return null;
  return uniqueScalar(values as SolutionScalar[]);
};

const deriveCodeValue = (code: CodeLike): SolutionScalar | null => {
  const ruleSets = Array.isArray(code?.ruleSets) ? code.ruleSets : [];
  if (!ruleSets.length) return null;

  const values = ruleSets.map((ruleSet) => deriveRuleSetValue(ruleSet));
  if (values.some((value: SolutionScalar | null) => value === null)) return null;
  return uniqueScalar(values as SolutionScalar[]);
};

const deriveVariableValue = (variable: CodingVariableLike): SolutionScalar | null => {
  if (variable?.fragmenting) return null;
  if (String(variable?.codeModel || '').toUpperCase() === 'MANUAL_ONLY') return null;

  const codes = Array.isArray(variable?.codes) ? variable.codes : [];
  const fullCreditCodes = codes.filter(
    (code) => String(code?.type || '').toUpperCase() === 'FULL_CREDIT',
  );
  if (!fullCreditCodes.length) return null;

  const values = fullCreditCodes.map((code) => deriveCodeValue(code));
  if (values.some((value: SolutionScalar | null) => value === null)) return null;
  return uniqueScalar(values as SolutionScalar[]);
};

const hasUnambiguousScoreContribution = (variable: CodingVariableLike): boolean => {
  const codes = Array.isArray(variable.codes) ? variable.codes : [];
  return codes.every((code) => {
    const type = String(code.type || '').toUpperCase();
    if (type === 'FULL_CREDIT') {
      const score = Number(code.score ?? 0);
      return Number.isFinite(score) && score > 0;
    }
    return (
      ['NO_CREDIT', 'RESIDUAL', 'RESIDUAL_AUTO'].includes(type) && Number(code.score || 0) === 0
    );
  });
};

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

const codeIsFullCredit = (variable: CodingVariableLike, codeId: unknown): boolean =>
  (Array.isArray(variable?.codes) ? variable.codes : []).some(
    (code) =>
      String(code?.id) === String(codeId) &&
      String(code?.type || '').toUpperCase() === 'FULL_CREDIT',
  );

const hasFullCreditCode = (variable: CodingVariableLike): boolean =>
  (Array.isArray(variable?.codes) ? variable.codes : []).some(
    (code) => String(code?.type || '').toUpperCase() === 'FULL_CREDIT',
  );

const validatesAsFullCredit = (
  selectedVariable: CodingVariableLike,
  variables: CodingVariableLike[],
  baseResponses: Array<{ variable: CodingVariableLike; value: SolutionScalar }>,
): boolean => {
  try {
    const coded = CodingSchemeFactory.code(
      baseResponses.map(({ variable, value }) => ({
        id: String(variable?.alias || variable?.id || '').trim(),
        value,
        status: 'VALUE_CHANGED',
      })),
      variables as VariableCodingData[],
    );
    const selectedIdentifiers = variableIdentifiers(selectedVariable).map(normalizeIdentifier);
    const selectedResponse = coded.find((response) =>
      selectedIdentifiers.includes(normalizeIdentifier(response?.id)),
    );
    return Boolean(
      selectedResponse &&
      selectedResponse.status === 'CODING_COMPLETE' &&
      codeIsFullCredit(selectedVariable, selectedResponse.code),
    );
  } catch (_error) {
    return false;
  }
};

export function derivePlayerSolutionPrefill(
  selectedVariable: CodingVariableLike | undefined,
  variables: CodingVariableLike[],
  resolvePlayerTarget: PlayerResponseTargetResolver,
): PlayerSolutionPrefill {
  if (!selectedVariable) {
    return unavailable('Für dieses Item konnte keine eindeutige Kodiervariable ermittelt werden.');
  }
  if (!hasFullCreditCode(selectedVariable)) {
    return unavailable(
      'Die Kodiervariable enthält keinen ausdrücklich markierten FULL_CREDIT-Code.',
    );
  }

  const baseVariables = collectBaseVariables(selectedVariable, variables);
  if (!baseVariables?.length) {
    return unavailable(
      'Die richtige Antwort ist nicht sicher auf Player-Basisvariablen abbildbar.',
    );
  }

  const selectedSourceType = String(selectedVariable.sourceType || 'BASE')
    .trim()
    .toUpperCase();
  if (
    selectedSourceType === 'SUM_SCORE' &&
    (typeof deriveVariableValue(selectedVariable) !== 'number' ||
      baseVariables.some((variable) => !hasUnambiguousScoreContribution(variable)))
  ) {
    return unavailable(
      'Die zusammengesetzte Kodierung enthält alternative oder partielle Lösungswege.',
    );
  }

  const resolved = baseVariables.map((variable) => {
    const rawValue = deriveVariableValue(variable);
    const target = resolvePlayerTarget(variable);
    const value = rawValue === null || !target ? null : coercePlayerValue(rawValue, target);
    return { variable, target, value };
  });
  if (resolved.some(({ target, value }) => !target || value === null)) {
    return unavailable(
      'Aus den FULL_CREDIT-Regeln lässt sich keine eindeutig darstellbare Player-Antwort erzeugen.',
    );
  }
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
    const key = normalizeIdentifier(responseId);
    if (!key || ids.has(key)) {
      return unavailable('Mehrere Lösungswerte würden dasselbe Player-Ziel belegen.');
    }
    ids.add(key);
    responses.push({ id: responseId, status: 'VALUE_CHANGED', value: value! });
  }

  if (
    !validatesAsFullCredit(
      selectedVariable,
      variables,
      resolved.map(({ variable, value }) => ({ variable, value: value! })),
    )
  ) {
    return unavailable(
      'Die abgeleitete Antwort konnte mit dem vorhandenen Kodierschema nicht als richtig bestätigt werden.',
    );
  }

  return {
    status: 'available',
    responses,
    message:
      responses.length === 1
        ? 'Eine eindeutige Musterlösung ist verfügbar.'
        : `${responses.length} eindeutige Teilantworten bilden die Musterlösung.`,
  };
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
    solutionResponses.map((response) => normalizeIdentifier(response.id)),
  );
  merged['elementCodes'] = JSON.stringify([
    ...existingResponses.filter((response) => !solutionIds.has(normalizeIdentifier(response?.id))),
    ...solutionResponses,
  ]);
  return merged;
}
