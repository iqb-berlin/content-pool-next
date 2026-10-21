import { describe, expect, it } from 'vitest';
import { CodingSchemeFactory } from '@iqb/responses';
import type { VariableCodingData } from '@iqbspecs/coding-scheme';
import { VoudService } from '../../core/services/voud.service';
import { ItemExplorerCodingService } from './item-explorer-coding.service';
import { mergePlayerSolutionIntoDataParts } from './item-explorer-solution-prefill';

const base = (id: string, alias: string, value: string) => ({
  id,
  alias,
  sourceType: 'BASE',
  codes: [
    {
      id: 1,
      type: 'FULL_CREDIT',
      score: 1,
      ruleSets: [{ rules: [{ method: 'MATCH', parameters: [value] }] }],
    },
    { id: 0, type: 'RESIDUAL_AUTO', score: 0, ruleSets: [] },
  ],
});
const aggregate = {
  id: 'sum',
  alias: 'RESULT',
  sourceType: 'SUM_SCORE',
  deriveSources: ['internal-a', 'internal-b'],
  codes: [
    {
      id: 1,
      type: 'FULL_CREDIT',
      score: 2,
      ruleSets: [{ rules: [{ method: 'NUMERIC_MATCH', parameters: ['2'] }] }],
    },
  ],
};
const item = {
  itemId: '01',
  unitId: 'UNIT',
  unitLabel: 'Unit',
  metadata: {},
  variableReadOnlyId: 'sum',
};
function serviceFor(first: string, second: string) {
  const variables = [base('internal-a', 'A', first), base('internal-b', 'B', second), aggregate];
  const service = new ItemExplorerCodingService(new VoudService());
  service.setScheme({ version: '3.0', variableCodings: variables });
  return { service, variables };
}
function likert() {
  return JSON.stringify({
    pages: [
      {
        elements: [
          {
            type: 'likert',
            id: 'table',
            options: [{ text: 'stimmt' }, { text: '<p>stimmt nicht</p>' }],
            rows: [
              {
                type: 'likert-row',
                id: 'row-a',
                alias: 'A',
                rowLabel: { text: 'Buchdruck' },
                columnCount: 2,
              },
              {
                type: 'likert-row',
                id: 'row-b',
                alias: 'B',
                rowLabel: { text: 'Telefon' },
                columnCount: 2,
              },
            ],
          },
        ],
      },
    ],
  });
}
function drag(copyOnDrop = false) {
  return JSON.stringify({
    pages: [
      {
        elements: [
          {
            type: 'drop-list',
            id: 'pool',
            alias: 'POOL',
            onlyOneItem: false,
            isSortList: false,
            copyOnDrop,
            connectedTo: ['target-a', 'target-b'],
            value: [
              { alias: 'X', text: 'Arbeitsschritt 7' },
              { alias: 'Y', text: 'Arbeitsschritt 5' },
            ],
          },
          ...['a', 'b'].map((id) => ({
            type: 'drop-list',
            id: 'target-' + id,
            alias: id.toUpperCase(),
            onlyOneItem: true,
            isSortList: false,
            copyOnDrop: false,
            connectedTo: ['pool'],
            value: [],
          })),
        ],
      },
    ],
  });
}

describe('compound solutions from structured player definitions', () => {
  it('shows Likert row/column text and validates the complete SUM_SCORE', () => {
    const { service, variables } = serviceFor('1', '2');
    service.refreshCorrectSolutionPrefill(item, likert());
    expect(service.codingInformation).toMatchObject({
      status: 'exact',
      answers: [
        { responseId: 'A', label: 'Buchdruck', valueLabel: 'stimmt' },
        { responseId: 'B', label: 'Telefon', valueLabel: 'stimmt nicht' },
      ],
    });
    expect(service.correctSolutionPrefill.responses.map((response) => response.value)).toEqual([
      1, 2,
    ]);
    expect(
      CodingSchemeFactory.code(
        service.correctSolutionPrefill.responses,
        variables as VariableCodingData[],
      ).find((response) => response.id === 'RESULT'),
    ).toMatchObject({ status: 'CODING_COMPLETE', code: 1, score: 2 });
  });
  it('keeps out-of-range Likert values as rules', () => {
    const { service } = serviceFor('3', '2');
    service.refreshCorrectSolutionPrefill(item, likert());
    expect(service.correctSolutionPrefill.status).toBe('unavailable');
    expect(service.codingInformation).toMatchObject({ status: 'rules', answers: [] });
  });
  it('does not present malformed Likert rows as unvalidated raw answers', () => {
    const { service } = serviceFor('1', '2');
    const definition = JSON.parse(likert());
    definition.pages[0].elements[0].rows[0].columnCount = 3;
    service.refreshCorrectSolutionPrefill(item, JSON.stringify(definition));
    expect(service.correctSolutionPrefill.status).toBe('unavailable');
    expect(service.codingInformation).toMatchObject({ status: 'rules', answers: [] });
  });
  it('uses drag object alias arrays, readable text and a balanced palette', () => {
    const { service, variables } = serviceFor('X', 'Y');
    service.refreshCorrectSolutionPrefill(item, drag());
    const solution = service.correctSolutionPrefill;
    if (solution.status !== 'available') throw new Error(solution.message);
    expect(solution.responses.map((response) => response.value)).toEqual([['X'], ['Y']]);
    expect(service.codingInformation).toMatchObject({
      status: 'exact',
      answers: [{ valueLabel: 'Arbeitsschritt 7' }, { valueLabel: 'Arbeitsschritt 5' }],
    });
    const responses = JSON.parse(
      mergePlayerSolutionIntoDataParts(null, solution.responses, solution.dropLists)[
        'elementCodes'
      ],
    );
    expect(responses.find((response: { id: string }) => response.id === 'POOL').value).toEqual([]);
    expect(
      CodingSchemeFactory.code(responses, variables as VariableCodingData[]).find(
        (response) => response.id === 'RESULT',
      ),
    ).toMatchObject({ status: 'CODING_COMPLETE', code: 1, score: 2 });
  });
  it.each(['missing-object', 'X'])('rejects impossible object allocation %s', (second) => {
    const { service } = serviceFor('X', second);
    service.refreshCorrectSolutionPrefill(item, drag());
    expect(service.correctSolutionPrefill.status).toBe('unavailable');
    expect(service.codingInformation).toMatchObject({ status: 'rules', answers: [] });
  });
  it('allows duplicate objects only with explicit copy-on-drop', () => {
    const { service } = serviceFor('X', 'X');
    service.refreshCorrectSolutionPrefill(item, drag(true));
    expect(service.correctSolutionPrefill.status).toBe('available');
  });
});
