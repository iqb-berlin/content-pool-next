import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { of } from 'rxjs';
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
    vi.restoreAllMocks();
  });

  it('defaults showAudioVideoCodingVariables to true when flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showAudioVideoCodingVariablesKey]).toBe(true);
  });

  it('defaults itemIdFormat to current when the flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.itemIdFormatKey]).toBe('current');
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

  it('defaults showItemExplorerPlayerTargetInfo to true when flag is missing', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';

    component.loadConfig();

    expect(component.featureConfig[component.showItemExplorerPlayerTargetInfoKey]).toBe(true);
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

  it('persists the legacy item id format when saving features', () => {
    const component = new AccessConfigComponent(route as any, api as any);
    component.acpId = 'acp-1';
    component.featureConfig = {
      enableItemList: true,
      itemIdFormat: 'legacy',
    };

    component.saveFeatures();

    expect(api.updateAccessConfig).toHaveBeenCalledWith(
      'acp-1',
      expect.objectContaining({
        featureConfig: expect.objectContaining({
          itemIdFormat: 'legacy',
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
});
