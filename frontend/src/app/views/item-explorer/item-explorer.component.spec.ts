import { describe, it, expect, vi } from 'vitest';
import { ItemExplorerComponent } from './item-explorer.component';

function createComponent(options?: {
  getStartPage?: (definition: string, variableId: string) => number | undefined;
  getFocusIdentifiers?: (definition: string, variableId: string) => string[];
  stripConditionalVisibility?: (definition: string) => string;
  api?: Record<string, unknown>;
}) {
  const route = { snapshot: { paramMap: { get: () => 'acp-1' } } };
  const router = { navigate: () => Promise.resolve(true) };
  const api = options?.api || {};
  const sanitizer = { bypassSecurityTrustHtml: (html: string) => html };
  const voudService = {
    getStartPage: options?.getStartPage || (() => 0),
    getFocusIdentifiers:
      options?.getFocusIdentifiers ||
      ((_definition: string, variableId: string) => [variableId]),
    stripConditionalVisibility:
      options?.stripConditionalVisibility || ((definition: string) => definition),
  };
  const authService = {};

  return new ItemExplorerComponent(
    route as any,
    router as any,
    api as any,
    sanitizer as any,
    voudService as any,
    authService as any,
  );
}

describe('ItemExplorerComponent', () => {
  it('defaults to sorting by task label', () => {
    const component = createComponent();

    expect(component.sortField).toBe('unitLabel');
    expect(component.sortDir).toBe('asc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('keeps the task default when shared ui state is empty', () => {
    const component = createComponent();

    (component as any).applyUiPreferences({});

    expect(component.sortField).toBe('unitLabel');
    expect(component.sortDir).toBe('asc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('lets shared ui preferences override the default sorting', () => {
    const component = createComponent();

    (component as any).applyUiPreferences({
      sortField: 'itemId',
      sortDir: 'desc',
      sortIsMeta: false,
    });

    expect(component.sortField).toBe('itemId');
    expect(component.sortDir).toBe('desc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('sorts by task label and then item id by default', () => {
    const component = createComponent();
    component.filteredItems = [
      {
        itemId: 'ITEM_20',
        uuid: 'uuid-20',
        unitId: 'UNIT_B',
        unitLabel: 'B Task',
        description: 'Second task item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_3',
        uuid: 'uuid-3',
        unitId: 'UNIT_A',
        unitLabel: 'A Task',
        description: 'Third item in first task',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_A',
        unitLabel: 'A Task',
        description: 'First item in first task',
        variableId: '',
        metadata: {},
      },
    ] as any;

    (component as any).applySort(false);

    expect(component.filteredItems.map((item) => `${item.unitLabel}:${item.itemId}`)).toEqual([
      'A Task:ITEM_1',
      'A Task:ITEM_3',
      'B Task:ITEM_20',
    ]);
  });

  it('shows audio/video coding variables by default', () => {
    const component = createComponent();
    component.currentCodingSchemeAsText = [
      { id: 'AUDIO_VAR', label: 'Audio prompt', codes: [] },
      { id: 'TEXT_VAR', label: 'Text prompt', codes: [] },
      { id: 'VIDEO_VAR', label: 'Video prompt', codes: [] },
    ] as any;

    const ids = component.filteredCodingSchemeAsText.map((coding) => coding.id);

    expect(ids).toEqual(['AUDIO_VAR', 'TEXT_VAR', 'VIDEO_VAR']);
  });

  it('hides audio/video coding variables when disabled', () => {
    const component = createComponent();
    component.showAudioVideoCodingVariables = false;
    component.currentCodingSchemeAsText = [
      { id: 'AUDIO_VAR', label: 'Prompt', codes: [] },
      { id: 'TEXT_VAR', label: 'Text prompt', codes: [] },
      { id: 'VAR_01', label: 'Video answer', codes: [] },
      { id: 'VAR_02', label: 'Other', codes: [] },
    ] as any;

    const ids = component.filteredCodingSchemeAsText.map((coding) => coding.id);

    expect(ids).toEqual(['TEXT_VAR', 'VAR_02']);
  });

  it('waits for response state before starting the player preview', () => {
    vi.useFakeTimers();
    const component = createComponent({ getStartPage: () => 2 });
    const postMessage = vi.fn();

    try {
      component.selectedItem = {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Item 1',
        variableId: 'VAR_1',
        metadata: {},
      };
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_1', dependencies: [] };
      (component as any).definitionContent = JSON.stringify({ pages: [] });
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = false;

      (component as any).startPlayerIfReady();
      expect(postMessage).not.toHaveBeenCalled();

      (component as any).responseStateReady = true;
      (component as any).startPlayerIfReady();

      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        sessionId: 'explorer-uuid-1-1',
        playerConfig: expect.objectContaining({
          startPage: '2',
        }),
      });

      vi.runAllTimers();

      expect(postMessage.mock.calls.slice(1).map((call) => call[0])).toEqual([
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-1-1',
          target: '2',
        },
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-1-1',
          target: '2',
        },
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-1-1',
          target: '2',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('strips conditional visibility from the item explorer preview by default', () => {
    vi.useFakeTimers();
    const stripConditionalVisibility = vi.fn().mockReturnValue('sanitized-definition');
    const component = createComponent({
      getStartPage: () => 2,
      stripConditionalVisibility,
    });
    const postMessage = vi.fn();

    try {
      component.selectedItem = {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Item 1',
        variableId: 'VAR_1',
        metadata: {},
      } as any;
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_1', dependencies: [] };
      (component as any).definitionContent = 'original-definition';
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = true;

      (component as any).startPlayerIfReady();

      expect(stripConditionalVisibility).toHaveBeenCalledWith('original-definition');
      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        unitDefinition: 'sanitized-definition',
      });

      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps conditional visibility when the ACP flag is enabled', () => {
    vi.useFakeTimers();
    const stripConditionalVisibility = vi.fn().mockReturnValue('sanitized-definition');
    const component = createComponent({
      getStartPage: () => 2,
      stripConditionalVisibility,
    });
    const postMessage = vi.fn();

    try {
      component.itemExplorerConditionalVisibilityEnabled = true;
      component.selectedItem = {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Item 1',
        variableId: 'VAR_1',
        metadata: {},
      } as any;
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_1', dependencies: [] };
      (component as any).definitionContent = 'original-definition';
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = true;

      (component as any).startPlayerIfReady();

      expect(stripConditionalVisibility).not.toHaveBeenCalled();
      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        unitDefinition: 'original-definition',
      });

      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows player target diagnostics for privileged users when enabled', () => {
    const component = createComponent();

    component.canEditExplorer = true;
    component.itemExplorerPlayerTargetInfoEnabled = true;

    expect(component.showPlayerTargetInfo).toBe(true);
  });

  it('hides player target diagnostics for read-only users', () => {
    const component = createComponent();

    component.canEditExplorer = false;
    component.itemExplorerPlayerTargetInfoEnabled = true;

    expect(component.showPlayerTargetInfo).toBe(false);
  });

  it('hides player target diagnostics when the ACP flag is disabled', () => {
    const component = createComponent();

    component.canEditExplorer = true;
    component.itemExplorerPlayerTargetInfoEnabled = false;

    expect(component.showPlayerTargetInfo).toBe(false);
  });

  it('marks items without a player target as unavailable and skips preview loading', () => {
    const getFileUnitView = vi.fn();
    const getResponseStateWithFallback = vi.fn();
    const component = createComponent({
      api: {
        getFileUnitView,
        getResponseStateWithFallback,
      },
    });

    component.selectItem(
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_2',
        unitLabel: 'Unit 2',
        description: 'Item without mapping',
        variableId: '',
        metadata: {},
      } as any,
      0,
    );

    expect(component.selectedPreviewTarget).toBe('');
    expect(component.previewUnavailableReason).toContain('keine Player-Variable');
    expect(getResponseStateWithFallback).not.toHaveBeenCalled();
    expect(getFileUnitView).not.toHaveBeenCalled();
  });

  it('shows an explanatory message when the player target is missing in the definition', () => {
    const component = createComponent({ getStartPage: () => undefined });
    const postMessage = vi.fn();
    component.canEditExplorer = true;
    component.itemExplorerPlayerTargetInfoEnabled = true;

    component.selectedItem = {
      itemId: 'ITEM_3',
      uuid: 'uuid-3',
      unitId: 'UNIT_3',
      unitLabel: 'Unit 3',
      description: 'Mapped item',
      variableId: 'VAR_404',
      metadata: {},
    } as any;
    component.playerFrame = {
      nativeElement: {
        contentWindow: { postMessage },
      },
    } as any;
    (component as any).unit = { id: 'UNIT_3', dependencies: [] };
    (component as any).definitionContent = JSON.stringify({ pages: [] });
    (component as any).playerFrameReady = true;
    (component as any).responseStateReady = true;

    (component as any).startPlayerIfReady();

    expect(postMessage).not.toHaveBeenCalled();
    expect(component.previewUnavailableReason).toContain('VAR_404');
    expect(component.previewUnavailableMessage).toContain('VAR_404');
  });

  it('uses a generic preview warning when diagnostics are hidden', () => {
    const component = createComponent();

    component.canEditExplorer = false;
    component.itemExplorerPlayerTargetInfoEnabled = true;
    component.previewUnavailableReason =
      'Das Player-Ziel "VAR_404" kommt in der Unit-Definition nicht vor.';

    expect(component.previewUnavailableMessage).toBe(
      'Für dieses Item ist keine zielgenaue Player-Vorschau verfügbar.',
    );
    expect(component.previewUnavailableMessage).not.toContain('VAR_404');
  });

  it('uses resolved VOUD identifiers and legacy player attributes for focus selection', () => {
    const component = createComponent({
      getFocusIdentifiers: () => ['alias-1', 'element-id-1'],
    });

    component.selectedItem = {
      itemId: 'ITEM_4',
      uuid: 'uuid-4',
      unitId: 'UNIT_4',
      unitLabel: 'Unit 4',
      description: 'Focusable item',
      variableId: 'alias-1',
      metadata: {},
    } as any;
    (component as any).definitionContent = JSON.stringify({ pages: [] });

    const selectors = (component as any).getFocusSelectors();

    expect(selectors).toContain('[data-element-id="element-id-1"]');
    expect(selectors).toContain('[data-element-alias="alias-1"]');
    expect(selectors).toContain('[data-list-alias="alias-1"]');
    expect(selectors).toContain('[id="element-id-1"]');
  });

  it('supports keyboard navigation in the item list', () => {
    const component = createComponent();
    component.filteredItems = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'First item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Second item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_3',
        uuid: 'uuid-3',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Third item',
        variableId: '',
        metadata: {},
      },
    ] as any;

    const downEvent = {
      key: 'ArrowDown',
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      target: null,
    } as any;
    component.onTableKeydown(downEvent);

    expect(component.selectedIndex).toBe(0);
    expect(component.selectedItem?.uuid).toBe('uuid-1');
    expect(downEvent.preventDefault).toHaveBeenCalled();

    const endEvent = {
      key: 'End',
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      target: null,
    } as any;
    component.onTableKeydown(endEvent);

    expect(component.selectedIndex).toBe(2);
    expect(component.selectedItem?.uuid).toBe('uuid-3');
  });

  it('routes manual ordering shortcuts to moveSelectedItem', () => {
    const component = createComponent();
    component.filteredItems = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'First item',
        variableId: '',
        metadata: {},
      },
    ] as any;
    const moveSelectedItem = vi.spyOn(component, 'moveSelectedItem');

    component.onTableKeydown({
      key: 'ArrowUp',
      ctrlKey: true,
      metaKey: false,
      preventDefault: vi.fn(),
      target: null,
    } as any);

    expect(moveSelectedItem).toHaveBeenCalledWith(-1);
  });

  it('opens the draft save preview with Ctrl/Cmd+S', () => {
    const component = createComponent();
    component.canPublishExplorer = true;
    const openSavePreviewDialog = vi
      .spyOn(component, 'openSavePreviewDialog')
      .mockImplementation(() => {});

    const event = {
      key: 's',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: null,
    } as any;

    component.handleWindowKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openSavePreviewDialog).toHaveBeenCalled();
  });

  it('closes open overlays with Escape', () => {
    const component = createComponent();
    component.showHistoryOverlay = true;

    const event = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: null,
    } as any;

    component.handleWindowKeydown(event);

    expect(component.showHistoryOverlay).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });
});
