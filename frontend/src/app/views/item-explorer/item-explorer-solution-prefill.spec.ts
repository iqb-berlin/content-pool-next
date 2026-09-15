import { describe, expect, it } from 'vitest';
import {
  derivePlayerSolutionPrefill,
  mergePlayerSolutionIntoDataParts,
} from './item-explorer-solution-prefill';

const residualCode = {
  id: 0,
  type: 'RESIDUAL_AUTO',
  score: 0,
  ruleSets: [],
};

const target = (responseId: string, elementType: string) => {
  const optionCount = ['radio', 'radio-group-images', 'dropdown', 'toggle-button'].includes(
    elementType,
  )
    ? 4
    : undefined;
  return {
    responseId,
    elementType,
    identifiers: [responseId],
    ...(optionCount !== undefined ? { optionCount } : {}),
  };
};

describe('derivePlayerSolutionPrefill', () => {
  it('derives and validates a numeric single-choice answer', () => {
    const variable = {
      id: 'internal-a',
      alias: 'A1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['2'] }] }],
        },
        residualCode,
      ],
    };

    expect(
      derivePlayerSolutionPrefill(variable, [variable], () => target('A1', 'radio')),
    ).toEqual({
      status: 'available',
      responses: [{ id: 'A1', status: 'VALUE_CHANGED', value: 2 }],
      message: 'Eine eindeutige Musterlösung ist verfügbar.',
    });
  });

  it('derives an exact sample answer for a simple text field', () => {
    const variable = {
      id: 'text-internal',
      alias: 'TEXT_1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['Musterantwort'] }] }],
        },
        residualCode,
      ],
    };

    expect(
      derivePlayerSolutionPrefill(variable, [variable], () => target('TEXT_1', 'text-field')),
    ).toMatchObject({
      status: 'available',
      responses: [{ id: 'TEXT_1', status: 'VALUE_CHANGED', value: 'Musterantwort' }],
    });
  });

  it.each([
    { value: '0', optionCount: 4 },
    { value: '2.5', optionCount: 4 },
    { value: '5', optionCount: 4 },
    { value: '2', optionCount: undefined },
  ])(
    'rejects choice value $value when it is not representable by $optionCount options',
    ({ value, optionCount }) => {
      const variable = {
        id: 'A1',
        sourceType: 'BASE',
        codes: [
          {
            id: 1,
            type: 'FULL_CREDIT',
            ruleSets: [{ rules: [{ method: 'NUMERIC_MATCH', parameters: [value] }] }],
          },
        ],
      };

      expect(
        derivePlayerSolutionPrefill(variable, [variable], () => ({
          responseId: 'A1',
          elementType: 'radio',
          identifiers: ['A1'],
          ...(optionCount !== undefined ? { optionCount } : {}),
        })),
      ).toMatchObject({ status: 'unavailable', responses: [] });
    },
  );

  it('does not treat a formula area as a simple text response', () => {
    const variable = {
      id: 'MATH_1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['x'] }] }],
        },
      ],
    };

    expect(
      derivePlayerSolutionPrefill(variable, [variable], () =>
        target('MATH_1', 'text-area-math'),
      ),
    ).toMatchObject({ status: 'unavailable', responses: [] });
  });

  it('derives boolean checkbox answers for a validated derived multiple-choice result', () => {
    const optionA = {
      id: 'option-a',
      alias: 'A',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'IS_TRUE' }] }],
        },
        residualCode,
      ],
    };
    const optionB = {
      id: 'option-b',
      alias: 'B',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'IS_FALSE' }] }],
        },
        residualCode,
      ],
    };
    const aggregate = {
      id: 'aggregate',
      alias: 'MC',
      sourceType: 'SUM_SCORE',
      deriveSources: ['option-a', 'option-b'],
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'NUMERIC_MATCH', parameters: ['2'] }] }],
        },
        residualCode,
      ],
    };

    expect(
      derivePlayerSolutionPrefill(aggregate, [optionA, optionB, aggregate], (variable) =>
        variable === optionA ? target('A', 'checkbox') : target('B', 'checkbox'),
      ),
    ).toEqual({
      status: 'available',
      responses: [
        { id: 'A', status: 'VALUE_CHANGED', value: true },
        { id: 'B', status: 'VALUE_CHANGED', value: false },
      ],
      message: '2 eindeutige Teilantworten bilden die Musterlösung.',
    });
  });

  it('rejects alternatives even if both are marked as full credit', () => {
    const variable = {
      id: 'A1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['1'] }] }],
        },
        {
          id: 2,
          type: 'FULL_CREDIT',
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['2'] }] }],
        },
      ],
    };

    expect(derivePlayerSolutionPrefill(variable, [variable], () => target('A1', 'radio'))).toMatchObject({
      status: 'unavailable',
      responses: [],
    });
  });

  it('rejects partial-credit paths in a derived multiple-choice variable', () => {
    const option = {
      id: 'option-a',
      alias: 'A',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'IS_TRUE' }] }],
        },
        {
          id: 2,
          type: 'PARTIAL_CREDIT',
          score: 0.5,
          ruleSets: [{ rules: [{ method: 'IS_FALSE' }] }],
        },
      ],
    };
    const aggregate = {
      id: 'aggregate',
      alias: 'MC',
      sourceType: 'SUM_SCORE',
      deriveSources: ['option-a'],
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          score: 1,
          ruleSets: [{ rules: [{ method: 'NUMERIC_MATCH', parameters: ['1'] }] }],
        },
        residualCode,
      ],
    };

    expect(
      derivePlayerSolutionPrefill(aggregate, [option, aggregate], () =>
        target('A', 'checkbox'),
      ),
    ).toEqual({
      status: 'unavailable',
      responses: [],
      message: 'Die zusammengesetzte Kodierung enthält alternative oder partielle Lösungswege.',
    });
  });

  it('does not infer correctness from score when FULL_CREDIT is absent', () => {
    const variable = {
      id: 'A1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          score: 1,
          ruleSets: [{ rules: [{ method: 'MATCH', parameters: ['1'] }] }],
        },
      ],
    };

    expect(derivePlayerSolutionPrefill(variable, [variable], () => target('A1', 'radio'))).toEqual({
      status: 'unavailable',
      responses: [],
      message: 'Die Kodiervariable enthält keinen ausdrücklich markierten FULL_CREDIT-Code.',
    });
  });

  it('rejects non-invertible rules and unsupported player elements', () => {
    const variable = {
      id: 'A1',
      sourceType: 'BASE',
      codes: [
        {
          id: 1,
          type: 'FULL_CREDIT',
          ruleSets: [{ rules: [{ method: 'MATCH_REGEX', parameters: ['[ab]'] }] }],
        },
      ],
    };

    expect(
      derivePlayerSolutionPrefill(variable, [variable], () => target('A1', 'geometry')),
    ).toMatchObject({ status: 'unavailable' });
  });
});

describe('mergePlayerSolutionIntoDataParts', () => {
  it('preserves unrelated responses and data parts while replacing the selected solution', () => {
    const dataParts = {
      elementCodes: JSON.stringify([
        { id: 'A1', status: 'VALUE_CHANGED', value: 1 },
        { id: 'B1', status: 'VALUE_CHANGED', value: 'keep' },
      ]),
      stateVariableCodes: '[]',
    };

    const merged = mergePlayerSolutionIntoDataParts(dataParts, [
      { id: 'A1', status: 'VALUE_CHANGED', value: 2 },
    ]);

    expect(merged['stateVariableCodes']).toBe('[]');
    expect(JSON.parse(merged['elementCodes'])).toEqual([
      { id: 'B1', status: 'VALUE_CHANGED', value: 'keep' },
      { id: 'A1', status: 'VALUE_CHANGED', value: 2 },
    ]);
  });
});
