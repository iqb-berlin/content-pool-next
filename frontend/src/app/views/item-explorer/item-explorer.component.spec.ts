import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { ItemExplorerComponent } from './item-explorer.component';
import { VoudService } from '../../core/services/voud.service';

function createComponent(options?: {
  getStartPage?: (definition: string, variableId: string) => number | undefined;
  resolvePlayerTargetLocation?: (
    definition: string,
    variableId: string,
  ) =>
    | {
        absolutePageIndex: number;
        scrollPageIndex?: number;
        isAlwaysVisiblePage: boolean;
      }
    | undefined;
  getFocusIdentifiers?: (definition: string, variableId: string) => string[];
  stripConditionalVisibility?: (definition: string) => string;
  api?: Record<string, unknown>;
}) {
  const route = { snapshot: { paramMap: { get: () => 'acp-1' } } };
  const router = { navigate: () => Promise.resolve(true) };
  const api = options?.api || {};
  const sanitizer = { bypassSecurityTrustHtml: (html: string) => html };
  const getStartPage = options?.getStartPage || (() => 0);
  const voudService = {
    getStartPage,
    resolvePlayerTargetLocation:
      options?.resolvePlayerTargetLocation ||
      ((definition: string, variableId: string) => {
        const startPage = getStartPage(definition, variableId);
        return startPage === undefined
          ? undefined
          : {
              absolutePageIndex: startPage,
              scrollPageIndex: startPage,
              isAlwaysVisiblePage: false,
            };
      }),
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

  it('hides items without empirical difficulty when the ACP filter is enabled', () => {
    const component = createComponent();
    component.showOnlyItemsWithEmpiricalDifficulty = true;
    component.hasEmpiricalDifficulty = true;
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'With difficulty',
        variableId: 'VAR_1',
        metadata: {},
        empiricalDifficulty: 0.4,
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Without difficulty',
        variableId: 'VAR_2',
        metadata: {},
      },
    ] as any;

    component.applyFilter(false);

    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['ITEM_1']);
  });

  it('keeps all items visible when no empirical difficulties were imported yet', () => {
    const component = createComponent();
    component.showOnlyItemsWithEmpiricalDifficulty = true;
    component.hasEmpiricalDifficulty = false;
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'First item',
        variableId: 'VAR_1',
        metadata: {},
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Second item',
        variableId: 'VAR_2',
        metadata: {},
      },
    ] as any;

    component.applyFilter(false);

    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['ITEM_1', 'ITEM_2']);
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

  it('hides excluded items by default and can reveal them temporarily', () => {
    const component = createComponent();
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Visible item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Excluded item',
        variableId: '',
        metadata: {},
        excluded: true,
      },
    ] as any;

    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.uuid)).toEqual(['uuid-1']);
    expect(component.visibleItemsCount).toBe(1);

    component.toggleShowExcludedItems();
    expect(component.filteredItems.map((item) => item.uuid)).toEqual(['uuid-1', 'uuid-2']);
    expect(component.visibleItemsCount).toBe(2);
  });

  it('keeps the header total on the visible item base when text filters narrow the list', () => {
    const component = createComponent();
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Visible alpha item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Visible beta item',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_3',
        uuid: 'uuid-3',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Ignored gamma item',
        variableId: '',
        metadata: {},
        excluded: true,
      },
    ] as any;
    component.filterText = 'alpha';

    component.applyFilter(false);

    expect(component.filteredItems.map((item) => item.uuid)).toEqual(['uuid-1']);
    expect(component.visibleItemsCount).toBe(2);
  });

  it('counts only items with empirical difficulty when that visibility rule is active', () => {
    const component = createComponent();
    component.showOnlyItemsWithEmpiricalDifficulty = true;
    component.hasEmpiricalDifficulty = true;
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'With difficulty',
        variableId: '',
        metadata: {},
        empiricalDifficulty: 0.4,
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: 'Without difficulty',
        variableId: '',
        metadata: {},
      },
    ] as any;

    component.applyFilter(false);

    expect(component.filteredItems.map((item) => item.uuid)).toEqual(['uuid-1']);
    expect(component.visibleItemsCount).toBe(1);
  });

  it('excludes the selected item and moves selection to the next visible entry', () => {
    const component = createComponent();
    component.canEditExplorer = true;
    component.items = [
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
    component.filteredItems = [...component.items];
    component.selectedItem = component.items[0];
    component.selectedIndex = 0;
    const queueDraftPatch = vi
      .spyOn(component as any, 'queueDraftPatch')
      .mockImplementation(() => undefined);

    component.toggleSelectedItemExclusion();

    expect(component.items[0].excluded).toBe(true);
    expect(component.filteredItems.map((item) => item.uuid)).toEqual(['uuid-2', 'uuid-3']);
    expect(component.selectedItem?.uuid).toBe('uuid-2');
    expect(queueDraftPatch).toHaveBeenCalledWith(
      'ITEM_EXCLUSION_CHANGED',
      {
        itemPropertiesPatch: {
          'uuid-1': {
            excluded: true,
          },
        },
      },
      true,
    );
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

  it('adds the player highlight class when player focus highlighting is enabled', () => {
    const component = createComponent();
    component.playerFocusHighlightEnabled = true;
    const doc = document.implementation.createHTMLDocument('Explorer');
    const target = doc.createElement('button');
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn(), writable: true });
    Object.defineProperty(target, 'focus', { value: vi.fn(), writable: true });
    doc.body.appendChild(target);

    (component as any).applyFocus(doc, target);

    expect(target.classList.contains('cp-item-focus-highlight')).toBe(true);
  });

  it('keeps player focus without the highlight class when the ACP flag disables it', () => {
    const component = createComponent();
    component.playerFocusHighlightEnabled = false;
    const doc = document.implementation.createHTMLDocument('Explorer');
    const target = doc.createElement('button');
    Object.defineProperty(target, 'scrollIntoView', { value: vi.fn(), writable: true });
    Object.defineProperty(target, 'focus', { value: vi.fn(), writable: true });
    doc.body.appendChild(target);

    (component as any).applyFocus(doc, target);

    expect(target.classList.contains('cp-item-focus-highlight')).toBe(false);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target.focus).toHaveBeenCalled();
  });

  it('keeps the preview in loading state until both player assets are ready', () => {
    const component = createComponent();

    component.selectedItem = {
      itemId: 'ITEM_1',
      uuid: 'uuid-1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Item 1',
      variableId: 'VAR_1',
      metadata: {},
    } as any;
    (component as any).loadingUnit = false;
    (component as any).responseStateReady = true;
    (component as any).playerHtmlLoadState = 'loading';
    (component as any).definitionLoadState = 'loading';

    expect(component.isPreviewLoading).toBe(true);
    expect(component.shouldRenderPlayerFrame).toBe(false);

    (component as any).playerHtmlLoadState = 'ready';
    component.playerSrcDoc = '<html></html>';

    expect(component.isPreviewLoading).toBe(true);
    expect(component.shouldRenderPlayerFrame).toBe(false);

    (component as any).definitionLoadState = 'ready';

    expect(component.isPreviewLoading).toBe(false);
    expect(component.shouldRenderPlayerFrame).toBe(true);
  });

  it('stops the loading state immediately when preview assets are missing', () => {
    const component = createComponent();

    component.selectedItem = {
      itemId: 'ITEM_2',
      uuid: 'uuid-2',
      unitId: 'UNIT_2',
      unitLabel: 'Unit 2',
      description: 'Item 2',
      variableId: 'VAR_2',
      metadata: {},
    } as any;
    (component as any).loadingUnit = false;
    (component as any).responseStateReady = false;
    (component as any).playerHtmlLoadState = 'missing';
    (component as any).definitionLoadState = 'ready';

    expect(component.isPreviewLoading).toBe(false);
    expect(component.shouldRenderPlayerFrame).toBe(false);
  });

  it('treats iframe refreshes as loading during paging-mode changes', () => {
    vi.useFakeTimers();
    const component = createComponent();

    try {
      component.selectedItem = {
        itemId: 'ITEM_3',
        uuid: 'uuid-3',
        unitId: 'UNIT_3',
        unitLabel: 'Unit 3',
        description: 'Item 3',
        variableId: 'VAR_3',
        metadata: {},
      } as any;
      (component as any).loadingUnit = false;
      (component as any).responseStateReady = true;
      (component as any).playerHtmlLoadState = 'ready';
      (component as any).definitionLoadState = 'ready';
      component.playerSrcDoc = '<html></html>';

      component.onPagingModeChange();

      expect(component.isPreviewLoading).toBe(true);
      expect(component.shouldRenderPlayerFrame).toBe(false);

      vi.advanceTimersByTime(50);

      expect(component.isPreviewLoading).toBe(false);
      expect(component.shouldRenderPlayerFrame).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

  it('uses the scroll-page index from the VOUD service in the player preview', () => {
    vi.useFakeTimers();
    const realVoudService = new VoudService();
    const component = createComponent({
      getStartPage: realVoudService.getStartPage.bind(realVoudService),
      resolvePlayerTargetLocation: realVoudService.resolvePlayerTargetLocation.bind(realVoudService),
    });
    const postMessage = vi.fn();

    try {
      component.selectedItem = {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        unitId: 'UNIT_2',
        unitLabel: 'Unit 2',
        description: 'Item on second logical page',
        variableId: 'B2',
        metadata: {},
      };
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_2', dependencies: [] };
      (component as any).definitionContent = JSON.stringify({
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
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = true;

      (component as any).startPlayerIfReady();

      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        playerConfig: expect.objectContaining({
          startPage: '1',
        }),
      });

      vi.runAllTimers();

      expect(postMessage.mock.calls.slice(1).map((call) => call[0])).toEqual([
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-2-1',
          target: '1',
        },
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-2-1',
          target: '1',
        },
        {
          type: 'vopPageNavigationCommand',
          sessionId: 'explorer-uuid-2-1',
          target: '1',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the preview without startPage when the target is on an always-visible page', () => {
    vi.useFakeTimers();
    const realVoudService = new VoudService();
    const component = createComponent({
      getStartPage: realVoudService.getStartPage.bind(realVoudService),
      resolvePlayerTargetLocation: realVoudService.resolvePlayerTargetLocation.bind(realVoudService),
    });
    const postMessage = vi.fn();

    try {
      component.selectedItem = {
        itemId: 'ITEM_2A',
        uuid: 'uuid-2a',
        unitId: 'UNIT_2',
        unitLabel: 'Unit 2',
        description: 'Item on always-visible page',
        variableId: 'INTRO',
        metadata: {},
      };
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_2', dependencies: [] };
      (component as any).definitionContent = JSON.stringify({
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
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = true;

      (component as any).startPlayerIfReady();

      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
      });
      expect(postMessage.mock.calls[0][0].playerConfig.startPage).toBeUndefined();

      vi.runAllTimers();

      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(component.previewUnavailableReason).toBe('');
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

  it('hides the draft status bar for read-only users', () => {
    const component = createComponent();

    component.canEditExplorer = false;

    expect(component.showExplorerDraftStatus).toBe(false);
  });

  it('shows the draft status bar for editors', () => {
    const component = createComponent();

    component.canEditExplorer = true;

    expect(component.showExplorerDraftStatus).toBe(true);
  });

  it('hides keyboard hints for read-only users', () => {
    const component = createComponent();

    component.canEditExplorer = false;

    expect(component.showExplorerKeyboardHints).toBe(false);
  });

  it('shows keyboard hints for editors', () => {
    const component = createComponent();

    component.canEditExplorer = true;

    expect(component.showExplorerKeyboardHints).toBe(true);
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
    const component = createComponent({ resolvePlayerTargetLocation: () => undefined });
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

  it('resolves dependent coding variables to selectable base variables', () => {
    const component = createComponent();

    component.selectedItem = {
      itemId: 'ITEM_5',
      uuid: 'uuid-5',
      unitId: 'UNIT_5',
      unitLabel: 'Unit 5',
      description: 'Dependent coding variable',
      variableId: 'TOTAL',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', label: 'Teil A', sourceType: 'BASE', deriveSources: [] },
        { id: 'BASE_B', label: 'Teil B', sourceType: 'BASE', deriveSources: [] },
        { id: 'GROUP', sourceType: 'SUM_SCORE', deriveSources: ['BASE_A', 'BASE_B'] },
        { id: 'TOTAL', sourceType: 'SUM_SCORE', deriveSources: ['GROUP'] },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Teil A', codes: [] },
      { id: 'BASE_B', label: 'Teil B', codes: [] },
      { id: 'GROUP', label: 'Zwischensumme', codes: [] },
      { id: 'TOTAL', label: 'Gesamtsumme', codes: [] },
    ] as any;

    (component as any).syncPreviewTargetResolution(component.selectedItem);

    expect(component.selectedItemUsesDerivedTarget).toBe(true);
    expect(component.showPreviewTargetSelector).toBe(true);
    expect(component.selectedItemTarget).toBe('TOTAL');
    expect(component.previewTargetOptions.map((option) => option.id)).toEqual([
      'BASE_A',
      'BASE_B',
      'GROUP',
      'TOTAL',
    ]);
    expect(component.selectedPreviewTarget).toBe('BASE_A');
  });

  it('offers known coding variables even when no standard preview target exists', () => {
    const component = createComponent();

    component.selectedItem = {
      itemId: 'ITEM_5',
      uuid: 'uuid-5',
      unitId: 'UNIT_5',
      unitLabel: 'Unit 5',
      description: 'Item without mapped target',
      variableId: '',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', label: 'Teil A', sourceType: 'BASE', deriveSources: [] },
        { id: 'BASE_B', label: 'Teil B', sourceType: 'BASE', deriveSources: [] },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Teil A', codes: [] },
      { id: 'BASE_B', label: 'Teil B', codes: [] },
    ] as any;

    (component as any).syncPreviewTargetResolution(component.selectedItem);

    expect(component.previewTargetOptions.map((option) => option.id)).toEqual(['BASE_A', 'BASE_B']);
    expect(component.selectedPreviewTarget).toBe('');
    expect(component.previewTargetDefaultOptionLabel).toBe('Kein Standardziel hinterlegt');
  });

  it('stores the selected base variable as shared item state', () => {
    const component = createComponent();
    const queueDraftPatch = vi.fn();
    const startPlayerIfReady = vi.fn();

    component.canEditExplorer = true;
    component.selectedItem = {
      itemId: 'ITEM_6',
      uuid: 'uuid-6',
      unitId: 'UNIT_6',
      unitLabel: 'Unit 6',
      description: 'Dependent preview',
      variableId: 'TOTAL',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', sourceType: 'BASE', deriveSources: [] },
        { id: 'BASE_B', sourceType: 'BASE', deriveSources: [] },
        { id: 'TOTAL', sourceType: 'SUM_SCORE', deriveSources: ['BASE_A', 'BASE_B'] },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Teil A', codes: [] },
      { id: 'BASE_B', label: 'Teil B', codes: [] },
      { id: 'TOTAL', label: 'Gesamtsumme', codes: [] },
    ] as any;
    (component as any).latestExplorerState = {
      activeState: {
        itemProperties: {
          UNIT_6_ITEM_6: {
            empiricalDifficulty: 1.5,
          },
        },
      },
    };
    (component as any).queueDraftPatch = queueDraftPatch;
    (component as any).startPlayerIfReady = startPlayerIfReady;
    (component as any).loadingUnit = true;

    (component as any).syncPreviewTargetResolution(component.selectedItem);
    component.selectedPreviewTargetId = 'BASE_B';
    component.onPreviewTargetSelectionChange();

    expect(component.selectedItem?.previewTargetId).toBe('BASE_B');
    expect(queueDraftPatch).toHaveBeenCalledWith(
      'PREVIEW_TARGET_CHANGED',
      {
        itemPropertiesPatch: {
          UNIT_6_ITEM_6: {
            previewTargetId: 'BASE_B',
          },
        },
      },
      true,
    );
    expect(startPlayerIfReady).not.toHaveBeenCalled();
  });

  it('stores a manual preview target outside the coding scheme as shared item state', () => {
    const component = createComponent();
    const queueDraftPatch = vi.fn();

    component.canEditExplorer = true;
    component.selectedItem = {
      itemId: 'ITEM_6',
      uuid: 'uuid-6',
      unitId: 'UNIT_6',
      unitLabel: 'Unit 6',
      description: 'Manual preview target',
      variableId: 'TOTAL',
      metadata: {},
    } as any;
    (component as any).latestExplorerState = {
      activeState: {
        itemProperties: {
          UNIT_6_ITEM_6: {
            empiricalDifficulty: 1.5,
          },
        },
      },
    };
    (component as any).queueDraftPatch = queueDraftPatch;
    (component as any).loadingUnit = true;

    component.customPreviewTargetDraft = '  alias.custom.target  ';
    component.applyCustomPreviewTarget();

    expect(component.selectedItem?.previewTargetId).toBe('alias.custom.target');
    expect(component.selectedPreviewTarget).toBe('alias.custom.target');
    expect(component.customPreviewTargetDraft).toBe('alias.custom.target');
    expect(queueDraftPatch).toHaveBeenCalledWith(
      'PREVIEW_TARGET_CHANGED',
      {
        itemPropertiesPatch: {
          UNIT_6_ITEM_6: {
            previewTargetId: 'alias.custom.target',
          },
        },
      },
      true,
    );
  });

  it('removes the stored preview target override when reset is triggered', () => {
    const component = createComponent();
    const queueDraftPatch = vi.fn();

    component.canEditExplorer = true;
    component.selectedItem = {
      itemId: 'ITEM_6',
      uuid: 'uuid-6',
      unitId: 'UNIT_6',
      unitLabel: 'Unit 6',
      description: 'Manual preview target',
      variableId: 'TOTAL',
      previewTargetId: 'BASE_B',
      metadata: {},
    } as any;
    (component as any).latestExplorerState = {
      activeState: {
        itemProperties: {
          UNIT_6_ITEM_6: {
            previewTargetId: 'BASE_B',
          },
        },
      },
    };
    (component as any).queueDraftPatch = queueDraftPatch;
    (component as any).loadingUnit = true;

    component.resetPreviewTargetSelection();

    expect(component.selectedItem?.previewTargetId).toBeUndefined();
    expect(component.selectedPreviewTarget).toBe('TOTAL');
    expect(queueDraftPatch).toHaveBeenCalledWith(
      'PREVIEW_TARGET_CHANGED',
      {
        itemPropertiesPatch: {
          UNIT_6_ITEM_6: {
            previewTargetId: '',
          },
        },
      },
      true,
    );
  });

  it('restores the persisted base variable selection from shared explorer state', () => {
    const component = createComponent();
    const item = {
      itemId: 'ITEM_7',
      uuid: 'uuid-7',
      unitId: 'UNIT_7',
      unitLabel: 'Unit 7',
      description: 'Persisted dependent preview',
      variableId: 'TOTAL',
      metadata: {},
    } as any;
    const state = {
      ui: {},
      tags: {},
      metadataColumns: { visible: [], order: [] },
      itemOrder: [],
      itemProperties: {
        'uuid-7': {
          previewTargetId: 'BASE_B',
        },
      },
    };

    component.items = [item];
    component.filteredItems = [item];
    component.selectedItem = item;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', sourceType: 'BASE', deriveSources: [] },
        { id: 'BASE_B', sourceType: 'BASE', deriveSources: [] },
        { id: 'TOTAL', sourceType: 'SUM_SCORE', deriveSources: ['BASE_A', 'BASE_B'] },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Teil A', codes: [] },
      { id: 'BASE_B', label: 'Teil B', codes: [] },
      { id: 'TOTAL', label: 'Gesamtsumme', codes: [] },
    ] as any;
    (component as any).applyFilter = vi.fn();
    (component as any).syncPreviewTargetResolution(component.selectedItem);

    expect(component.selectedPreviewTarget).toBe('BASE_A');

    (component as any).applySharedExplorerEnvelope({
      status: 'CLEAN',
      version: 2,
      publishedVersion: 1,
      canEdit: true,
      canPublish: true,
      updatedAt: '2026-04-21T15:00:00.000Z',
      updatedByUsername: 'alice',
      updatedByRole: 'ACP_MANAGER',
      activeState: state,
      publishedState: state,
      draftState: state,
    });

    expect(component.items[0].previewTargetId).toBe('BASE_B');
    expect(component.selectedPreviewTarget).toBe('BASE_B');
  });

  it('restarts the preview when a different base variable is chosen', () => {
    vi.useFakeTimers();
    const component = createComponent({
      getStartPage: (_definition, variableId) => {
        if (variableId === 'BASE_A') return 1;
        if (variableId === 'BASE_B') return 4;
        return undefined;
      },
    });
    const postMessage = vi.fn();

    try {
      component.selectedItem = {
        itemId: 'ITEM_6',
        uuid: 'uuid-6',
        unitId: 'UNIT_6',
        unitLabel: 'Unit 6',
        description: 'Dependent preview',
        variableId: 'TOTAL',
        metadata: {},
      } as any;
      component.currentCodingScheme = {
        variableCodings: [
          { id: 'BASE_A', sourceType: 'BASE', deriveSources: [] },
          { id: 'BASE_B', sourceType: 'BASE', deriveSources: [] },
          { id: 'TOTAL', sourceType: 'SUM_SCORE', deriveSources: ['BASE_A', 'BASE_B'] },
        ],
      };
      component.currentCodingSchemeAsText = [
        { id: 'BASE_A', label: 'Teil A', codes: [] },
        { id: 'BASE_B', label: 'Teil B', codes: [] },
        { id: 'TOTAL', label: 'Gesamtsumme', codes: [] },
      ] as any;
      (component as any).syncPreviewTargetResolution(component.selectedItem);
      component.playerFrame = {
        nativeElement: {
          contentWindow: { postMessage },
        },
      } as any;
      (component as any).unit = { id: 'UNIT_6', dependencies: [] };
      (component as any).definitionContent = JSON.stringify({ pages: [] });
      (component as any).playerFrameReady = true;
      (component as any).responseStateReady = true;

      (component as any).startPlayerIfReady();

      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        playerConfig: expect.objectContaining({
          startPage: '1',
        }),
      });

      postMessage.mockClear();
      component.selectedPreviewTargetId = 'BASE_B';
      component.onPreviewTargetSelectionChange();

      expect(postMessage.mock.calls[0][0]).toMatchObject({
        type: 'vopStartCommand',
        playerConfig: expect.objectContaining({
          startPage: '4',
        }),
      });
    } finally {
      vi.runAllTimers();
      vi.useRealTimers();
    }
  });

  it('loads preview context after setting a manual target for an unmapped item', () => {
    const getResponseStateWithFallback = vi.fn(() => of({ state: null, isFallback: false }));
    const getFileUnitView = vi.fn(() => of({ id: 'UNIT_9', dependencies: [] }));
    const component = createComponent({
      api: {
        getResponseStateWithFallback,
        getFileUnitView,
        appendAuthToken: (url: string) => url,
      },
    });
    component.acpId = 'acp-1';

    component.selectedItem = {
      itemId: 'ITEM_9',
      uuid: 'uuid-9',
      unitId: 'UNIT_9',
      unitLabel: 'Unit 9',
      description: 'Item without mapped target',
      variableId: '',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [{ id: 'BASE_A', label: 'Teil A', sourceType: 'BASE', deriveSources: [] }],
    };
    component.currentCodingSchemeAsText = [{ id: 'BASE_A', label: 'Teil A', codes: [] }] as any;
    component.selectedIndex = 0;
    (component as any).unitLoadToken = 7;
    (component as any).syncPreviewTargetResolution(component.selectedItem);

    component.customPreviewTargetDraft = 'BASE_A';
    component.applyCustomPreviewTarget();

    expect(getResponseStateWithFallback).toHaveBeenCalledWith(
      'acp-1',
      'ITEM_9',
      'UNIT_9',
      [],
    );
    expect(getFileUnitView).toHaveBeenCalledWith('acp-1', 'UNIT_9');
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
