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

  it('keeps the absolute page index when the first page already contains item aliases', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [{ elements: [{ alias: 'A1', id: 'page-a-0' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'B1', id: 'page-b-0' }] }],
        },
      ],
    });

    expect(service.getStartPage(definition, 'b1')).toBe(1);
  });

  it('maps alias-based targets into the scroll-page index space', () => {
    const definition = JSON.stringify({
      pages: [
        {
          alwaysVisible: true,
          sections: [{ elements: [{ id: 'cover-text' }, { id: 'cover-image' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'A1', id: 'page-a-1' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'B2', id: 'page-b-2' }] }],
        },
      ],
    });

    expect(service.getStartPage(definition, 'b2')).toBe(1);
  });

  it('maps id-based targets into the scroll-page index space too', () => {
    const definition = JSON.stringify({
      pages: [
        {
          alwaysVisible: true,
          sections: [{ elements: [{ id: 'cover-text' }, { id: 'cover-image' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'A1', id: 'field-a-1' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'B2', id: 'field-b-2' }] }],
        },
      ],
    });

    expect(service.getStartPage(definition, 'field-b-2')).toBe(1);
  });

  it('returns undefined for targets on always-visible pages', () => {
    const definition = JSON.stringify({
      pages: [
        {
          alwaysVisible: true,
          sections: [{ elements: [{ alias: 'INTRO', id: 'cover-text' }] }],
        },
        {
          sections: [{ elements: [{ alias: 'A1', id: 'page-a-1' }] }],
        },
      ],
    });

    expect(service.resolvePlayerTargetLocation(definition, 'INTRO')).toEqual({
      absolutePageIndex: 0,
      scrollPageIndex: undefined,
      isAlwaysVisiblePage: true,
    });
    expect(service.getStartPage(definition, 'INTRO')).toBeUndefined();
  });
});

describe('VoudService.getFocusIdentifiers', () => {
  const service = new VoudService();

  it('returns both alias and id for a matching element', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [{ elements: [{ alias: 'A1', id: 'text-field-1' }] }],
        },
      ],
    });

    expect(service.getFocusIdentifiers(definition, 'A1')).toEqual(['A1', 'text-field-1']);
  });

  it('matches identifiers case-insensitively and trims values', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [{ elements: [{ alias: '  DhB00102  ', id: 'text-field-2' }] }],
        },
      ],
    });

    expect(service.getFocusIdentifiers(definition, 'dhb00102')).toEqual(
      expect.arrayContaining(['dhb00102', 'DhB00102', 'text-field-2']),
    );
  });

  it('ignores visibility rule references when resolving identifiers', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [
            {
              visibilityRules: [{ id: 'RULE_TARGET' }],
              elements: [{ alias: 'visible-target', id: 'text-field-3' }],
            },
          ],
        },
      ],
    });

    expect(service.getFocusIdentifiers(definition, 'RULE_TARGET')).toEqual(['RULE_TARGET']);
    expect(service.getFocusIdentifiers(definition, 'visible-target')).toEqual([
      'visible-target',
      'text-field-3',
    ]);
  });
});

describe('VoudService.stripConditionalVisibility', () => {
  const service = new VoudService();

  it('removes section-level visibility controls for preview rendering', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [
            {
              activeAfterID: 'legacy-trigger',
              activeAfterIdDelay: 250,
              visibilityRules: [{ id: 'RULE_TARGET', operator: '=', value: '1' }],
              visibilityDelay: 500,
              animatedVisibility: true,
              enableReHide: true,
              logicalConnectiveOfRules: 'conjunction',
              elements: [{ alias: 'A1', id: 'field-1' }],
            },
          ],
        },
      ],
    });

    const sanitized = JSON.parse(service.stripConditionalVisibility(definition));
    const section = sanitized.pages[0].sections[0];

    expect(section).toMatchObject({
      activeAfterID: '',
      activeAfterIdDelay: 0,
      visibilityRules: [],
      visibilityDelay: 0,
      animatedVisibility: false,
      enableReHide: false,
      logicalConnectiveOfRules: 'disjunction',
    });
    expect(section.elements[0]).toMatchObject({ alias: 'A1', id: 'field-1' });
  });

  it('removes legacy media dependencies but keeps unrelated player settings', () => {
    const definition = JSON.stringify({
      pages: [
        {
          sections: [
            {
              elements: [
                {
                  alias: 'AUDIO_1',
                  id: 'audio-1',
                  player: {
                    activeAfter: 'legacy-audio',
                    activeAfterID: 'audio-0',
                    startControl: true,
                    showRestRuns: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const sanitized = JSON.parse(service.stripConditionalVisibility(definition));
    const player = sanitized.pages[0].sections[0].elements[0].player;

    expect(player).toMatchObject({
      activeAfter: '',
      activeAfterID: '',
      startControl: true,
      showRestRuns: true,
    });
  });
});
