import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AcpManagerContextComponent } from '../shared/acp-manager-context.component';
import { AccessConfigComponent } from './access-config.component';

describe('AccessConfigComponent', () => {
  let api: {
    getAccessConfig: ReturnType<typeof vi.fn>;
    getCredentials: ReturnType<typeof vi.fn>;
    updateAccessConfig: ReturnType<typeof vi.fn>;
  };

  const route = {
    parent: {
      snapshot: {
        paramMap: {
          get: vi.fn().mockReturnValue('acp-1'),
        },
      },
    },
  };

  beforeEach(() => {
    api = {
      getAccessConfig: vi.fn().mockReturnValue(
        of({
          accessModel: 'PUBLIC',
          allowRegistered: false,
          featureConfig: {},
        }),
      ),
      getCredentials: vi.fn().mockReturnValue(of([])),
      updateAccessConfig: vi.fn().mockReturnValue(of({})),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('saves access and features together and clears the dirty state after success', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.loadConfig();
    expect(component.hasUnsavedChanges).toBe(false);
    component.accessModel = 'PRIVATE';
    component.featureConfig.enableCommenting = true;
    expect(component.hasUnsavedChanges).toBe(true);
    component.saveFeatures();
    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        accessModel: 'PRIVATE',
        featureConfig: expect.objectContaining({ enableCommenting: true }),
      }),
    );
    expect(component.hasUnsavedChanges).toBe(false);
    expect(component.featuresSaved).toBe(true);
  });

  it('keeps changes made during a pending save dirty and prevents duplicate requests', () => {
    const response = new Subject<any>();
    api.updateAccessConfig.mockReturnValue(response);
    const component = new AccessConfigComponent(route as any, api as any);
    component.loadConfig();
    component.accessModel = 'PRIVATE';
    component.saveFeatures();
    component.saveFeatures();
    expect(api.updateAccessConfig).toHaveBeenCalledTimes(1);
    component.accessModel = 'PUBLIC';
    response.next({});
    expect(component.hasUnsavedChanges).toBe(true);
    expect(component.saving).toBe(false);
  });

  it('retains unsaved changes and allows retry after a failed save', () => {
    api.updateAccessConfig.mockReturnValue(throwError(() => new Error('offline')));
    const component = new AccessConfigComponent(route as any, api as any);
    component.loadConfig();
    component.availableTags.push('Prüfen');
    component.saveFeatures();
    expect(component.hasUnsavedChanges).toBe(true);
    expect(component.saveError).toContain('nicht gespeichert');
    expect(component.saving).toBe(false);
    expect(component.featuresSaved).toBe(false);
  });

  it.each([
    ['', ''],
    ['invalid', 'invalid'],
    ['2026-09-16T10:00', '2026-09-15T10:00'],
    ['2026-09-16T10:00', '2027-01-16T10:00'],
  ])('does not save an invalid credential window %s to %s', (from, until) => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.accessModel = 'CREDENTIALS_LIST';
    component.validFrom = from;
    component.validUntil = until;
    component.saveFeatures();
    expect(api.updateAccessConfig).not.toHaveBeenCalled();
    expect(component.saveError).not.toBe('');
  });

  it.each([undefined, true, false])(
    'renders and saves the effective Explorer setting for %s without blocking shared display controls',
    async (configured) => {
      api.getAccessConfig.mockReturnValue(
        of({
          accessModel: 'PUBLIC',
          featureConfig: configured === undefined ? {} : { enableItemList: configured },
        }),
      );
      await TestBed.configureTestingModule({
        imports: [AccessConfigComponent],
        providers: [
          { provide: ActivatedRoute, useValue: route },
          { provide: ApiService, useValue: api },
        ],
      })
        .overrideComponent(AccessConfigComponent, {
          remove: { imports: [AcpManagerContextComponent, RouterLink] },
          add: { schemas: [NO_ERRORS_SCHEMA] },
        })
        .compileComponents();
      const fixture = TestBed.createComponent(AccessConfigComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const root: HTMLElement = fixture.nativeElement;
      const enabled = configured !== false;
      expect(root.querySelector('.settings-overview')?.textContent).toContain(
        `Item-Explorer ${enabled ? 'aktiviert' : 'deaktiviert'}`,
      );
      const checkbox = (label: string): HTMLInputElement => {
        const element = [...root.querySelectorAll('label')].find((el) =>
          el.textContent?.includes(label),
        );
        return element!.querySelector('input')!;
      };
      expect(checkbox('Item-Explorer aktivieren').checked).toBe(enabled);
      expect(fixture.componentInstance.hasUnsavedChanges).toBe(false);
      const highlight = checkbox('Item im Player hervorheben');
      expect(highlight.matches(':disabled')).toBe(false);
      highlight.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.hasUnsavedChanges).toBe(true);
      fixture.componentInstance.saveFeatures();
      expect(api.updateAccessConfig).toHaveBeenCalledWith(
        'acp-1',
        expect.objectContaining({
          featureConfig: expect.objectContaining({
            enableItemList: enabled,
            enablePlayerFocusHighlight: true,
          }),
        }),
      );
      fixture.destroy();
    },
  );

  it('defaults showAudioVideoCodingVariables to true when flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showAudioVideoCodingVariablesKey]).toBe(true);
  });

  it('starts with PRIVATE as the default base access model', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    expect(component.accessModel).toBe('PRIVATE');
  });

  it('keeps explicit false for showAudioVideoCodingVariables', () => {
    api.getAccessConfig.mockReturnValue(
      of({
        accessModel: 'PUBLIC',
        allowRegistered: false,
        featureConfig: {
          showAudioVideoCodingVariables: false,
        },
      }),
    );

    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showAudioVideoCodingVariablesKey]).toBe(false);
  });

  it('defaults showItemExplorerPlayerTargetInfo to false when flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showItemExplorerPlayerTargetInfoKey]).toBe(false);
  });

  it('defaults player focus highlight to false when the flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.enablePlayerFocusHighlightKey]).toBe(false);
  });

  it('keeps item explorer conditional visibility disabled when the flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(
      component.featureConfig[component.enableItemExplorerConditionalVisibilityKey],
    ).toBeUndefined();
  });

  it('keeps explicit true for item explorer conditional visibility', () => {
    api.getAccessConfig.mockReturnValue(
      of({
        accessModel: 'PUBLIC',
        allowRegistered: false,
        featureConfig: {
          enableItemExplorerConditionalVisibility: true,
        },
      }),
    );

    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.enableItemExplorerConditionalVisibilityKey]).toBe(
      true,
    );
  });

  it('keeps explicit false for showItemExplorerPlayerTargetInfo', () => {
    api.getAccessConfig.mockReturnValue(
      of({
        accessModel: 'PUBLIC',
        allowRegistered: false,
        featureConfig: {
          showItemExplorerPlayerTargetInfo: false,
        },
      }),
    );

    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showItemExplorerPlayerTargetInfoKey]).toBe(false);
  });

  it('keeps explicit false for player focus highlight', () => {
    api.getAccessConfig.mockReturnValue(
      of({
        accessModel: 'PUBLIC',
        allowRegistered: false,
        featureConfig: {
          enablePlayerFocusHighlight: false,
        },
      }),
    );

    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.enablePlayerFocusHighlightKey]).toBe(false);
  });

  it('persists showAudioVideoCodingVariables when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      showAudioVideoCodingVariables: false,
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          showAudioVideoCodingVariables: false,
        }),
      }),
    );
  });

  it('persists showItemExplorerPlayerTargetInfo when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      showItemExplorerPlayerTargetInfo: false,
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          showItemExplorerPlayerTargetInfo: false,
        }),
      }),
    );
  });

  it('persists player focus highlight when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      enablePlayerFocusHighlight: false,
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          enablePlayerFocusHighlight: false,
        }),
      }),
    );
  });

  it('persists item explorer conditional visibility when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      enableItemExplorerConditionalVisibility: true,
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          enableItemExplorerConditionalVisibility: true,
        }),
      }),
    );
  });

  it('persists the empirical difficulty item filter when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      showOnlyItemsWithEmpiricalDifficulty: true,
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          showOnlyItemsWithEmpiricalDifficulty: true,
        }),
      }),
    );
  });
  it('persists the configured Sub-ID label and value labels', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = { enableItemList: true, itemSubIdLabel: 'Kategorie' };
    component.itemSubIdLabelEntries = [
      { value: '1', label: 'teilweise richtig' },
      { value: '2', label: 'vollständig richtig' },
    ];

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          itemSubIdLabel: 'Kategorie',
          itemSubIdLabels: {
            '1': 'teilweise richtig',
            '2': 'vollständig richtig',
          },
        }),
      }),
    );
  });

  it('persists personal item categories and colored tags', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enablePersonalItemData: true,
      personalItemCategoryLabel: 'Kompetenzstufe',
      personalItemTagLabel: 'Sichtung',
    };
    component.personalItemCategoryValues = [' I ', 'II', 'I'];
    component.personalItemTags = [
      { label: ' Prüfen ', color: '#ff0000' },
      { label: '', color: '#000000' },
    ];

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          enablePersonalItemData: true,
          personalItemCategoryLabel: 'Kompetenzstufe',
          personalItemCategoryValues: ['I', 'II'],
          personalItemTagLabel: 'Sichtung',
          personalItemTags: [{ label: 'Prüfen', color: '#ff0000' }],
        }),
      }),
    );
  });

  it('includes the existing validity window when saving credential features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.accessModel = 'CREDENTIALS_LIST';
    component.validFrom = '2026-07-13T10:00';
    component.validUntil = '2026-08-13T10:00';
    component.featureConfig = { enablePersonalItemData: true };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        accessModel: 'CREDENTIALS_LIST',
        validFrom: new Date(2026, 6, 13, 10, 0).toISOString(),
        validUntil: new Date(2026, 7, 13, 10, 0).toISOString(),
        featureConfig: expect.objectContaining({ enablePersonalItemData: true }),
      }),
    );
  });

  it('defaults existing comment configurations to private visibility', () => {
    api.getAccessConfig.mockReturnValue(
      of({
        accessModel: 'PUBLIC',
        allowRegistered: false,
        featureConfig: { enableCommenting: true, commentTargets: ['ITEM'] },
      }),
    );
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig['commentVisibilityMode']).toBe('PRIVATE');
  });

  it('persists explicitly shared item comments', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableCommenting: true,
      commentVisibilityMode: 'SHARED',
    };
    component.commentTargets = ['ITEM'];

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          enableCommenting: true,
          commentTargets: ['ITEM'],
          commentVisibilityMode: 'SHARED',
        }),
      }),
    );
  });
});
