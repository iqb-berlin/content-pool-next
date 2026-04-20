import { describe, expect, it } from 'vitest';
import { VoudService } from './voud.service';

describe('VoudService.getStartPage', () => {
  const service = new VoudService();

  it('returns the matching page index for an exact variable id', () => {
    const definition = JSON.stringify({
      pages: [{ widgets: [{ id: 'DHB00101' }] }, { widgets: [{ id: 'DHB00102' }] }],
    });

    expect(service.getStartPage(definition, 'DHB00102')).toBe(1);
  });

  it('matches variable ids robustly with trim and case-insensitive fallback', () => {
    const definition = JSON.stringify({
      pages: [{ widgets: [{ id: 'DHB00101' }] }, { widgets: [{ id: '  DHB00103  ' }] }],
    });

    expect(service.getStartPage(definition, 'dhb00103')).toBe(1);
  });

  it('uses the absolute page index and supports alias-based mappings', () => {
    const definition = JSON.stringify({
      pages: [
        {
          alwaysVisible: ['A'],
          sections: [{ elements: [{ alias: 'INTRO', id: 'page-a-0' }] }],
        },
        {
          alwaysVisible: ['A'],
          sections: [{ elements: [{ alias: 'A1', id: 'page-a-1' }] }],
        },
        {
          alwaysVisible: ['B'],
          sections: [{ elements: [{ alias: 'B1', id: 'page-b-0' }] }],
        },
        {
          alwaysVisible: ['B'],
          sections: [{ elements: [{ alias: 'B2', id: 'page-b-1' }] }],
        },
      ],
    });

    expect(service.getStartPage(definition, 'b2')).toBe(3);
  });
});
