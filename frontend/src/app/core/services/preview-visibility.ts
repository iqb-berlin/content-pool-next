import { collectVoudNodes, findVoudIdentifierMatches } from './voud-nodes';

/** Preview state is a transient input to the player, never an answer. */
export interface PreviewStart {
  page?: number;
  values: Record<string, string>;
}
interface Node {
  id?: string;
  alias?: string;
  value?: string;
  type?: string;
  action?: string;
  actionParam?: { id: string; value: string };
  alwaysVisible?: boolean | string | number;
  sections?: Node[];
  elements?: Node[];
  visibilityRules?: { id: string; operator: string; value: string }[];
  logicalConnectiveOfRules?: string;
  visibilityDelay?: number;
  activeAfterID?: string;
}
export interface PreviewDefinition {
  pages: Node[];
  stateVariables?: Node[];
}
export type VisibilityResolution =
  | { kind: 'ready'; page?: number; codes: { id: string; status: string; value: string }[] }
  | { kind: 'unavailable'; reason: string };

export function readPreviewDefinition(content: string): PreviewDefinition | null {
  try {
    const parsed = JSON.parse(content);
    const validNodes = (nodes: unknown): boolean =>
      Array.isArray(nodes) &&
      nodes.every((node) => {
        if (!node || typeof node !== 'object') return false;
        return (
          ['id', 'alias'].every((key) => node[key] == null || typeof node[key] === 'string') &&
          (node.sections === undefined || validNodes(node.sections)) &&
          (node.elements === undefined || validNodes(node.elements)) &&
          (node.visibilityRules === undefined ||
            (Array.isArray(node.visibilityRules) &&
              node.visibilityRules.every(
                (rule: unknown) =>
                  rule &&
                  typeof rule === 'object' &&
                  typeof (rule as Record<string, unknown>)['id'] === 'string',
              )))
        );
      });
    return validNodes(parsed.pages) &&
      (parsed.stateVariables === undefined || validNodes(parsed.stateVariables))
      ? parsed
      : null;
  } catch {
    return null;
  }
}
const always = (node: Node) =>
  node.alwaysVisible === true || node.alwaysVisible === 'true' || node.alwaysVisible === 1;
const children = (node: Node): Node[] => collectVoudNodes(node) as Node[];

/** Conservative finite equality solver. It chooses a stable context, not a replay of user actions.
 * External responses, timers and non-equality predicates remain the player's responsibility.
 */
export function resolvePreviewVisibility(
  content: string,
  target: string,
  manual?: PreviewStart,
): VisibilityResolution {
  const fail = (reason: string): VisibilityResolution => ({ kind: 'unavailable', reason });
  const definition = readPreviewDefinition(content);
  if (!definition) return fail('Die Aufgabendefinition kann nicht gelesen werden.');
  const { pages } = definition;
  const locations = pages.flatMap((page, pi) =>
    (page.sections || []).flatMap((section) =>
      children(section).map((node) => ({ node, section, pi })),
    ),
  );
  const targets = findVoudIdentifierMatches(locations, target);
  if (targets.length > 1) return fail('Das Player-Ziel ist nicht eindeutig.');
  const location = targets[0];
  if (!location) return fail('Das Player-Ziel kommt in der Aufgabendefinition nicht vor.');
  const navigable = pages.map((p, i) => (always(p) ? -1 : i)).filter((i) => i >= 0);
  const page =
    manual?.page ?? (always(pages[location.pi]) ? undefined : navigable.indexOf(location.pi));
  if (page !== undefined && (!Number.isInteger(page) || page < 0 || page >= navigable.length)) {
    return fail('Die konfigurierte Vorschauseite existiert nicht.');
  }
  if (!always(pages[location.pi]) && page !== navigable.indexOf(location.pi)) {
    return fail('Die Vorschauseite muss das ausgewählte Player-Ziel enthalten.');
  }
  const variables = definition.stateVariables || [];
  const byId = new Map(variables.map((v) => [v.id!, v]));
  if (byId.size !== variables.length || variables.some((v) => !v.id))
    return fail('Die Zustandsvariablen sind nicht eindeutig.');
  for (const id of Object.keys(manual?.values || {})) {
    if (!byId.has(id) || typeof manual?.values[id] !== 'string')
      return fail('Eine konfigurierte Zustandsvariable ist ungültig.');
  }
  const sections = pages.flatMap((p, i) =>
    always(p) || i === (page === undefined ? location.pi : navigable[page]) ? p.sections || [] : [],
  );
  const relevant = new Set<string>();
  for (const section of sections) {
    if (section.visibilityDelay || section.activeAfterID)
      return fail('Zeitabhängige Sichtbarkeit benötigt den regulären Aufgabenablauf.');
    for (const rule of section.visibilityRules || []) {
      if (!byId.has(rule.id) || rule.operator !== '=')
        return fail(
          'Diese Sichtbarkeit hängt von Antworten, Medien oder nicht unterstützten Bedingungen ab. Bitte den regulären Aufgabenablauf verwenden.',
        );
      relevant.add(rule.id);
    }
    for (const node of children(section)) {
      if (
        node !== section &&
        (node.visibilityRules?.length || node.visibilityDelay || node.activeAfterID)
      ) {
        return fail(
          'Verschachtelte Sichtbarkeitsbedingungen benötigen den regulären Aufgabenablauf.',
        );
      }
      if (node.type === 'trigger' && node.action === 'stateVariableChange') {
        if (!node.actionParam || !byId.has(node.actionParam.id))
          return fail('Ein Zustandstrigger kann nicht zugeordnet werden.');
        relevant.add(node.actionParam.id);
      }
    }
  }
  if (page === undefined && relevant.size > 0) {
    return fail(
      'Für diesen dauerhaft sichtbaren Stimulus muss eine Vorschauseite festgelegt werden.',
    );
  }
  const domains = new Map(
    [...relevant].map((id) => [id, new Set([String(byId.get(id)!.value ?? '')])]),
  );
  // Constants from all pages may describe the state required on the target page.
  for (const p of pages)
    for (const s of p.sections || []) {
      for (const r of s.visibilityRules || [])
        if (r.operator === '=') domains.get(r.id)?.add(String(r.value));
      for (const n of children(s))
        if (n.action === 'stateVariableChange' && n.actionParam)
          domains.get(n.actionParam.id)?.add(String(n.actionParam.value));
    }
  for (const [id, value] of Object.entries(manual?.values || {})) domains.set(id, new Set([value]));
  let assignments: Record<string, string>[] = [{}];
  for (const [id, values] of domains) {
    if (assignments.length * values.size > 4096)
      return fail('Zu viele mögliche Vorschauzustände. Bitte den Startzustand manuell eingrenzen.');
    assignments = assignments.flatMap((a) => [...values].map((value) => ({ ...a, [id]: value })));
  }
  const visible = (s: Node, a: Record<string, string>) => {
    const rules = s.visibilityRules || [];
    return (
      !rules.length ||
      (s.logicalConnectiveOfRules === 'disjunction'
        ? rules.some((r) => a[r.id] === String(r.value))
        : rules.every((r) => a[r.id] === String(r.value)))
    );
  };
  const candidates = assignments.filter(
    (a) =>
      visible(location.section, a) &&
      sections.every(
        (s) =>
          !visible(s, a) ||
          children(s).every(
            (n) =>
              n.type !== 'trigger' ||
              n.action !== 'stateVariableChange' ||
              a[n.actionParam!.id] === String(n.actionParam!.value),
          ),
      ),
  );
  if (candidates.length !== 1)
    return fail(
      candidates.length
        ? 'Mehrere Startzustände sind möglich. Bitte Vorschauseite und Zustandswerte festlegen oder die gesamte Aufgabe öffnen.'
        : 'Kein stabiler Startzustand erfüllt die Sichtbarkeitsregeln. Bitte die gesamte Aufgabe öffnen.',
    );
  return {
    kind: 'ready',
    page,
    codes: Object.entries(candidates[0]).map(([id, value]) => ({
      id: byId.get(id)!.alias || id,
      status: 'VALUE_CHANGED',
      value,
    })),
  };
}
