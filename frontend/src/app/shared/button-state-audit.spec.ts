/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';

const productionSources = import.meta.glob(['../**/*.html', '../**/*.ts', '!../**/*.spec.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface ButtonSource {
  block: string;
  file: string;
  line: number;
}

function getButtons(): ButtonSource[] {
  return Object.entries(productionSources).flatMap(([file, source]) =>
    Array.from(source.matchAll(/<button\b[\s\S]*?<\/button>/g), (match) => ({
      block: match[0],
      file,
      line: source.slice(0, match.index).split('\n').length,
    })),
  );
}

function location(button: ButtonSource): string {
  return `${button.file}:${button.line}`;
}

describe('stateful button audit', () => {
  const buttons = getButtons();

  it('couples every shared state style to semantic state', () => {
    const stateButtons = buttons.filter(({ block }) => /class="[^"]*\bbtn-state\b/.test(block));
    const invalid = stateButtons.filter(
      ({ block }) => !/\[attr\.aria-(pressed|expanded)\]=/.test(block),
    );

    expect(stateButtons.length).toBeGreaterThanOrEqual(18);
    expect(invalid.map(location)).toEqual([]);
    expect(Object.values(productionSources).join('\n')).not.toContain('btn-state-indicator');
  });

  it('does not combine the primary and outline variants', () => {
    const conflicting = buttons.filter(({ block }) => {
      const hasPrimary =
        /class="[^"]*\bbtn-primary\b/.test(block) || /\[class\.btn-primary\]=/.test(block);
      const hasOutline =
        /class="[^"]*\bbtn-outline\b/.test(block) || /\[class\.btn-outline\]=/.test(block);
      return hasPrimary && hasOutline;
    });

    expect(conflicting.map(location)).toEqual([]);
  });

  it('marks direct boolean disclosures as expanded state buttons', () => {
    const disclosures = buttons.filter(({ block }) => /\(click\)="[^"]*=\s*!/.test(block));
    const invalid = disclosures.filter(
      ({ block }) =>
        !/class="[^"]*\bbtn-state\b/.test(block) || !/\[attr\.aria-expanded\]=/.test(block),
    );

    expect(disclosures.length).toBeGreaterThanOrEqual(4);
    expect(invalid.map(location)).toEqual([]);
  });

  it('gives custom active selections tab or current-item semantics', () => {
    const activeSelections = buttons.filter(({ block }) => /\[class\.active\]=/.test(block));
    const invalid = activeSelections.filter(
      ({ block }) =>
        !/\[attr\.aria-selected\]=/.test(block) && !/\[attr\.aria-current\]=/.test(block),
    );

    expect(activeSelections.length).toBeGreaterThanOrEqual(7);
    expect(invalid.map(location)).toEqual([]);
  });
});
