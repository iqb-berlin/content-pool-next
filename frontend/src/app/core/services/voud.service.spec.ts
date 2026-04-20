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
});
