import { beforeEach, describe, it, expect, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ItemExplorerFacade } from './item-explorer.facade';
import { VoudService } from '../../core/services/voud.service';
import { PendingPersonalSessionStorageService } from '../../core/services/pending-personal-session-storage.service';

function createJwt(sub: string, type = 'user', acpId = ''): string {
  const payload = btoa(
    JSON.stringify({
      sub,
      type,
      acpId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function createFacade(options?: {
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
  authService?: Record<string, unknown>;
  pendingPersonalSessionStorage?: PendingPersonalSessionStorageService;
}) {
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
      options?.getFocusIdentifiers || ((_definition: string, variableId: string) => [variableId]),
    stripConditionalVisibility:
      options?.stripConditionalVisibility || ((definition: string) => definition),
  };
  const authOverrides = options?.authService || {};
  const defaultToken = authOverrides['isLoggedIn'] === true ? createJwt('test-user') : null;
  const authService = {
    hasAcpRole: () => false,
    isAdmin: false,
    isLoggedIn: false,
    currentUser$: of(null),
    getToken: () => defaultToken,
    ...authOverrides,
  };

  const component = new ItemExplorerFacade(
    api as any,
    sanitizer as any,
    voudService as any,
    authService as any,
    options?.pendingPersonalSessionStorage || new PendingPersonalSessionStorageService(),
  );
  (component as any).personalDataSessionIdentity = (
    component as any
  ).resolvePersonalItemDataSessionIdentity();
  (component as any).collectionSessionIdentity = (
    component as any
  ).resolvePersonalItemDataSessionIdentity();
  return component;
}

function registerPlayerDom(component: ItemExplorerFacade, postMessage = vi.fn()) {
  const port = {
    hasFrame: vi.fn(() => true),
    postMessage,
    focus: vi.fn(() => true),
    startAutoResize: vi.fn(),
    stopAutoResize: vi.fn(),
  };
  component.registerPlayerDom(port);
  return port;
}

function createExplorerEnvelope(
  overrides?: Partial<{
    canEdit: boolean;
    canPublish: boolean;
    status: 'CLEAN' | 'DIRTY';
    publishedFilterText: string;
    draftFilterText: string;
  }>,
) {
  const canEdit = overrides?.canEdit ?? true;
  const canPublish = overrides?.canPublish ?? true;
  const status = overrides?.status ?? 'DIRTY';
  const publishedFilterText = overrides?.publishedFilterText ?? 'published';
  const draftFilterText = overrides?.draftFilterText ?? 'draft';

  return {
    status,
    version: 3,
    publishedVersion: 2,
    canEdit,
    canPublish,
    updatedAt: '2026-04-22T10:00:00.000Z',
    updatedByUsername: 'alice',
    updatedByRole: 'ACP_MANAGER',
    activeState: {
      ui: { filterText: draftFilterText },
      tags: {},
      metadataColumns: { visible: [], order: [] },
      itemOrder: [],
      itemProperties: {},
    },
    publishedState: {
      ui: { filterText: publishedFilterText },
      tags: {},
      metadataColumns: { visible: [], order: [] },
      itemOrder: [],
      itemProperties: {},
    },
    draftState: {
      ui: { filterText: draftFilterText },
      tags: {},
      metadataColumns: { visible: [], order: [] },
      itemOrder: [],
      itemProperties: {},
    },
  } as any;
}

describe('ItemExplorerFacade', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('initializes exactly once and ignores pending responses after destroy', () => {
    const startPage$ = new Subject<any>();
    const itemList$ = new Subject<any>();
    const currentUser$ = new Subject<unknown>();
    const getAcpStartPage = vi.fn(() => startPage$);
    const getFileItemList = vi.fn(() => itemList$);
    const component = createFacade({
      api: { getAcpStartPage, getFileItemList },
      authService: { currentUser$ },
    });

    component.init('');
    component.init('acp-ignored');

    expect(getAcpStartPage).toHaveBeenCalledOnce();
    expect(getAcpStartPage).toHaveBeenCalledWith('');
    expect(getFileItemList).toHaveBeenCalledOnce();

    component.ngOnDestroy();
    startPage$.next({ featureConfig: { enableItemListTags: true } });
    itemList$.next({
      items: [
        {
          itemId: 'late',
          uuid: 'late',
          rowKey: 'late',
          unitId: 'late',
          unitLabel: 'Late response',
          description: '',
          variableId: 'late',
          metadata: {},
        },
      ],
      columns: [],
    });
    currentUser$.next(null);

    expect(component.enableTags).toBe(false);
    expect(component.items).toEqual([]);
    expect((component as any).personalDataSessionIdentity).toBeNull();
    expect((component as any).collectionSessionIdentity).toBeNull();
  });

  it('suspends pending personal changes instead of saving after destroy', () => {
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(of({ rowData: {} }));
    const component = createFacade({
      api: { patchViewItemPreferenceRow },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.setPersonalItemNote('uuid::1', 'Später speichern');

    component.ngOnDestroy();

    expect(patchViewItemPreferenceRow).not.toHaveBeenCalled();
    expect((component as any).pendingPersonalRowUpdates.size).toBe(0);
    expect(sessionStorage.getItem('cp_item_explorer_pending_personal:acp-1')).toContain(
      'Später speichern',
    );
  });

  it('stores personal category, colored tags and plain-text notes by row key', () => {
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(
      of({
        rowData: {
          'uuid-1::2': {
            category: 'II',
            tags: ['Prüfen'],
            note: 'Nur Text',
          },
        },
      }),
    );
    const component = createFacade({
      api: { patchViewItemPreferenceRow },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.personalItemTags = [{ label: 'Prüfen', color: '#ff0000' }];

    component.setPersonalItemCategory('uuid-1::2', 'II');
    component.addPersonalItemTagToRow('uuid-1::2', {
      target: { value: 'Prüfen' },
    } as any);
    component.setPersonalItemNote('uuid-1::2', 'Nur Text');
    component.flushPersonalItemDataSave();

    expect(patchViewItemPreferenceRow).toHaveBeenCalledWith(
      'acp-1',
      'uuid-1::2',
      {
        category: 'II',
        tags: ['Prüfen'],
        note: 'Nur Text',
      },
      'read-only',
    );
    expect(component.getPersonalTagColor('Prüfen')).toBe('#ff0000');
  });

  it('exports the filtered item order after pending personal changes are saved', async () => {
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(of({ rowData: {} }));
    const exportViewPersonalItemDataXlsx = vi.fn().mockReturnValue(of(new Blob(['xlsx'])));
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const component = createFacade({
      api: { patchViewItemPreferenceRow, exportViewPersonalItemDataXlsx },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.items = [
      {
        itemId: 'item-2',
        uuid: 'uuid-2',
        rowKey: 'uuid-2::1',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'var-2',
        metadata: {},
      },
      {
        itemId: 'item-1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::1',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'var-1',
        metadata: {},
      },
    ];
    component.sortField = '__manual__';
    component.itemOrder = ['uuid-2::1', 'uuid-1::1'];
    component.filteredItems = [...component.items];
    component.setPersonalItemNote('uuid-1::1', 'Noch zu speichern');

    await component.exportPersonalItemDataXlsx();

    expect(patchViewItemPreferenceRow).toHaveBeenCalledWith(
      'acp-1',
      'uuid-1::1',
      { note: 'Noch zu speichern' },
      'read-only',
    );
    expect(exportViewPersonalItemDataXlsx).toHaveBeenCalledWith(
      'acp-1',
      ['uuid-2::1', 'uuid-1::1'],
      'read-only',
    );
    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:export');
    expect(component.personalExportError).toBe('');
    expect(component.personalExportInProgress).toBe(false);

    component.ngOnDestroy();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    click.mockRestore();
  });

  it('exports all participants personal data only for ACP managers', async () => {
    const exportAllViewPersonalItemDataCsv = vi.fn().mockReturnValue(of(new Blob(['csv'])));
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:all-export');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const component = createFacade({ api: { exportAllViewPersonalItemDataCsv } });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.hasExplorerEditPermission = true;
    component.viewPerspective = 'editor';

    expect(component.canExportAllPersonalItemData).toBe(true);
    await component.exportAllPersonalItemDataCsv();

    expect(exportAllViewPersonalItemDataCsv).toHaveBeenCalledWith('acp-1', 'editor');
    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:all-export');
    expect(component.allPersonalDataExportError).toBe('');
    expect(component.allPersonalDataExportInProgress).toBe(false);

    component.hasExplorerEditPermission = false;
    expect(component.canExportAllPersonalItemData).toBe(false);
    component.ngOnDestroy();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    click.mockRestore();
  });

  it('does not expose personal working-data controls to anonymous visitors', () => {
    const component = createFacade({ authService: { isLoggedIn: false } });
    component.enablePersonalItemData = true;

    expect(component.showPersonalItemData).toBe(false);
  });

  it('saves manager personal data against the current editor perspective', () => {
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(of({ rowData: {} }));
    const component = createFacade({
      api: { patchViewItemPreferenceRow },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.hasExplorerEditPermission = true;
    component.viewPerspective = 'editor';

    component.setPersonalItemNote('uuid-1', 'Draft-Notiz');
    component.flushPersonalItemDataSave();

    expect(patchViewItemPreferenceRow).toHaveBeenCalledWith(
      'acp-1',
      'uuid-1',
      { note: 'Draft-Notiz' },
      'editor',
    );
  });

  it('keeps the queued perspective when it changes before the debounce is flushed', () => {
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(of({ rowData: {} }));
    const component = createFacade({
      api: { patchViewItemPreferenceRow },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.hasExplorerEditPermission = true;
    component.viewPerspective = 'editor';

    component.setPersonalItemNote('uuid-draft', 'Draft-Notiz');
    component.viewPerspective = 'read-only';
    component.flushPersonalItemDataSave();

    expect(patchViewItemPreferenceRow).toHaveBeenCalledWith(
      'acp-1',
      'uuid-draft',
      { note: 'Draft-Notiz' },
      'editor',
    );
  });

  it('blocks personal edits while the perspective is switching', () => {
    const component = createFacade({
      api: { patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })) },
      authService: { isLoggedIn: true },
    });
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.perspectiveSwitchBusy = true;

    component.setPersonalItemNote('uuid-1', 'Nicht übernehmen');

    expect(component.canChangePersonalItemData).toBe(false);
    expect(component.personalItemData).toEqual({});
    expect((component as any).pendingPersonalRowUpdates.size).toBe(0);
  });

  it('keeps personal filters out of the shared Explorer UI state', () => {
    const component = createFacade({ authService: { isLoggedIn: true } });
    component.columnFilters = {
      unitLabel: 'Mathematik',
      personalNote: 'vertraulich',
    };
    component.personalColumnFilters = { personalNote: 'vertraulich' };

    expect((component as any).buildUiPreferences().columnFilters).toEqual({
      unitLabel: 'Mathematik',
    });

    (component as any).applyUiPreferences({
      columnFilters: { unitLabel: 'Deutsch', personalCategory: 'III' },
    });
    expect(component.columnFilters).toEqual({ unitLabel: 'Deutsch' });
    expect(component.personalColumnFilters).toEqual({ personalNote: 'vertraulich' });
  });

  it('disables personal edits after a load failure without clearing known data', () => {
    const patchViewItemPreferenceRow = vi.fn();
    const component = createFacade({
      api: {
        getViewItemPreferences: vi.fn().mockReturnValue(throwError(() => new Error('offline'))),
        patchViewItemPreferenceRow,
      },
      authService: { isLoggedIn: true },
    });
    component.enablePersonalItemData = true;
    component.personalItemData = { 'uuid::1': { note: 'bestehend' } };

    (component as any).loadPersonalItemData();
    component.setPersonalItemNote('uuid::1', 'überschrieben');

    expect(component.personalDataLoadState).toBe('error');
    expect(component.personalItemData).toEqual({ 'uuid::1': { note: 'bestehend' } });
    expect(patchViewItemPreferenceRow).not.toHaveBeenCalled();
  });

  it('blocks navigation while a personal autosave keeps failing', async () => {
    const component = createFacade({
      api: {
        patchViewItemPreferenceRow: vi.fn().mockReturnValue(throwError(() => new Error('offline'))),
      },
      authService: { isLoggedIn: true },
    });
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.setPersonalItemNote('uuid::1', 'ungespeichert');
    component.flushPersonalItemDataSave();

    expect(component.personalDataSaveState).toBe('error');
    await expect(component.canDeactivate()).resolves.toBe(false);
  });

  it('allows navigation after failed personal changes are explicitly discarded', () => {
    const getViewItemPreferences = vi.fn().mockReturnValue(
      of({
        rowData: {
          'uuid::1': { note: 'Gespeicherter Stand' },
        },
      }),
    );
    const component = createFacade({
      api: {
        getViewItemPreferences,
        patchViewItemPreferenceRow: vi.fn().mockReturnValue(throwError(() => new Error('offline'))),
      },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.setPersonalItemNote('uuid::1', 'Ungespeicherter Stand');
    component.flushPersonalItemDataSave();

    component.openDiscardPersonalItemDataDialog();
    expect(component.showDiscardPersonalItemDataDialog).toBe(true);

    component.confirmDiscardPersonalItemDataChanges();

    expect((component as any).pendingPersonalRowUpdates.size).toBe(0);
    expect(component.personalItemData).toEqual({
      'uuid::1': { note: 'Gespeicherter Stand' },
    });
    expect(getViewItemPreferences).toHaveBeenCalledWith('acp-1', 'item-explorer');
    expect(component.canDeactivate()).toBe(true);
  });

  it('does not wait indefinitely when pending personal data can no longer be saved', async () => {
    const component = createFacade({
      api: { patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })) },
      authService: { isLoggedIn: true },
    });
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.setPersonalItemNote('uuid::1', 'ungespeichert');
    (component as any).personalDataSessionIdentity = null;

    await expect(component.canDeactivate()).resolves.toBe(false);
    component.ngOnDestroy();
  });

  it('clears personal data before loading a different session identity', () => {
    let token = createJwt('user-a');
    const secondLoad = new Subject<any>();
    const getViewItemPreferences = vi
      .fn()
      .mockReturnValueOnce(of({ rowData: { 'uuid::1': { note: 'Nur A' } } }))
      .mockReturnValueOnce(secondLoad);
    const component = createFacade({
      api: { getViewItemPreferences },
      authService: {
        isLoggedIn: true,
        getToken: () => token,
      },
    });
    component.enablePersonalItemData = true;
    (component as any).syncPersonalItemDataSession();
    expect(component.personalItemData).toEqual({ 'uuid::1': { note: 'Nur A' } });

    token = createJwt('user-b');
    (component as any).authStorageListener({ key: 'cp_token' } as StorageEvent);

    expect(component.personalItemData).toEqual({});
    expect(component.personalDataLoadState).toBe('loading');

    secondLoad.next({ rowData: { 'uuid::1': { note: 'Nur B' } } });
    secondLoad.complete();
    expect(component.personalItemData).toEqual({ 'uuid::1': { note: 'Nur B' } });
  });

  it('restores pending personal changes after the same identity logs in again', () => {
    let token: string | null = createJwt('user-a');
    const patchViewItemPreferenceRow = vi.fn().mockReturnValue(of({ rowData: {} }));
    const component = createFacade({
      api: {
        getViewItemPreferences: vi
          .fn()
          .mockReturnValue(of({ rowData: { 'uuid::1': { note: 'Serverwert' } } })),
        patchViewItemPreferenceRow,
      },
      authService: {
        isLoggedIn: true,
        getToken: () => token,
      },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.hasExplorerEditPermission = true;
    component.viewPerspective = 'read-only';
    component.setPersonalItemNote('uuid::1', 'Noch nicht gespeichert');

    token = null;
    (component as any).authStorageListener({ key: 'cp_token' } as StorageEvent);
    expect(component.personalItemData).toEqual({});

    token = createJwt('user-a');
    (component as any).authStorageListener({ key: 'cp_token' } as StorageEvent);

    expect(component.personalItemData).toEqual({
      'uuid::1': { note: 'Noch nicht gespeichert' },
    });
    expect((component as any).pendingPersonalRowUpdates.size).toBe(1);
    expect(component.personalDataSaveState).toBe('pending');
    component.viewPerspective = 'editor';
    component.flushPersonalItemDataSave();
    expect(patchViewItemPreferenceRow).toHaveBeenCalledWith(
      'acp-1',
      'uuid::1',
      { note: 'Noch nicht gespeichert' },
      'read-only',
    );
    component.ngOnDestroy();
  });

  it('restores pending changes from memory when session storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    const pendingStorage = new PendingPersonalSessionStorageService();
    let firstToken: string | null = createJwt('user-a');
    const firstComponent = createFacade({
      api: { patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })) },
      authService: {
        isLoggedIn: true,
        getToken: () => firstToken,
      },
      pendingPersonalSessionStorage: pendingStorage,
    });
    firstComponent.acpId = 'acp-1';
    firstComponent.enablePersonalItemData = true;
    firstComponent.personalDataLoadState = 'loaded';
    firstComponent.setPersonalItemNote('uuid::1', 'Fallback-Notiz');
    firstToken = null;
    (firstComponent as any).authStorageListener({ key: 'cp_token' } as StorageEvent);
    firstComponent.ngOnDestroy();

    const secondComponent = createFacade({
      api: {
        getViewItemPreferences: vi.fn().mockReturnValue(of({ rowData: {} })),
        patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })),
      },
      authService: {
        isLoggedIn: true,
        getToken: () => createJwt('user-a'),
      },
      pendingPersonalSessionStorage: pendingStorage,
    });
    secondComponent.acpId = 'acp-1';
    secondComponent.enablePersonalItemData = true;
    (secondComponent as any).syncPersonalItemDataSession();

    expect(secondComponent.personalItemData).toEqual({
      'uuid::1': { note: 'Fallback-Notiz' },
    });
    expect((secondComponent as any).pendingPersonalRowUpdates.size).toBe(1);
    secondComponent.ngOnDestroy();
    setItem.mockRestore();
    getItem.mockRestore();
    removeItem.mockRestore();
  });

  it('discards suspended personal changes when a different identity logs in', () => {
    let token: string | null = createJwt('user-a');
    const component = createFacade({
      api: {
        getViewItemPreferences: vi
          .fn()
          .mockReturnValue(of({ rowData: { 'uuid::1': { note: 'Nur B' } } })),
        patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })),
      },
      authService: {
        isLoggedIn: true,
        getToken: () => token,
      },
    });
    component.acpId = 'acp-1';
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.setPersonalItemNote('uuid::1', 'Nur A');

    token = null;
    (component as any).authStorageListener({ key: 'cp_token' } as StorageEvent);
    token = createJwt('user-b');
    (component as any).authStorageListener({ key: 'cp_token' } as StorageEvent);

    expect(component.personalItemData).toEqual({ 'uuid::1': { note: 'Nur B' } });
    expect((component as any).pendingPersonalRowUpdates.size).toBe(0);
    expect(sessionStorage.getItem('cp_item_explorer_pending_personal:acp-1')).toBeNull();
    component.ngOnDestroy();
  });

  it('reapplies an active personal note filter when a note changes', () => {
    const component = createFacade({
      api: { patchViewItemPreferenceRow: vi.fn().mockReturnValue(of({ rowData: {} })) },
      authService: { isLoggedIn: true },
    });
    component.enablePersonalItemData = true;
    component.personalDataLoadState = 'loaded';
    component.personalColumnFilters = { personalNote: 'prüfen' };
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid',
        rowKey: 'uuid::1',
        subId: '1',
        subIdDisplay: '',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
    ];
    component.applyFilter(false);
    expect(component.filteredItems).toEqual([]);

    component.setPersonalItemNote('uuid::1', 'Später prüfen');

    expect(component.filteredItems).toEqual(component.items);
    component.flushPersonalItemDataSave();
  });

  it('defaults to sorting by task label', () => {
    const component = createFacade();

    expect(component.sortField).toBe('unitLabel');
    expect(component.sortDir).toBe('asc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('keeps the task default when shared ui state is empty', () => {
    const component = createFacade();

    (component as any).applyUiPreferences({});

    expect(component.sortField).toBe('unitLabel');
    expect(component.sortDir).toBe('asc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('lets shared ui preferences override the default sorting', () => {
    const component = createFacade();

    (component as any).applyUiPreferences({
      sortField: 'itemId',
      sortDir: 'desc',
      sortIsMeta: false,
    });

    expect(component.sortField).toBe('itemId');
    expect(component.sortDir).toBe('desc');
    expect(component.sortIsMeta).toBe(false);
  });

  it('filters and sorts partial-credit rows independently by Sub-ID label', () => {
    const component = createFacade();
    component.hasPartialCredit = true;
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::2',
        subId: '2',
        subIdDisplay: 'vollständig richtig',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
        empiricalDifficulty: 0.8,
      },
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::1',
        subId: '1',
        subIdDisplay: 'teilweise richtig',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
        empiricalDifficulty: 0.2,
      },
    ];
    component.filteredItems = [...component.items];

    component.sortBy('subIdDisplay');
    expect(component.filteredItems.map((item) => item.rowKey)).toEqual(['uuid-1::1', 'uuid-1::2']);

    component.columnFilters['subId'] = 'vollständig';
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.rowKey)).toEqual(['uuid-1::2']);
    expect(component.filteredItems[0].empiricalDifficulty).toBe(0.8);
  });

  it('keeps persisted row numbers attached while filtering and sorting', () => {
    const component = createFacade();
    component.items = [
      {
        itemId: 'ITEM_10',
        uuid: 'uuid-10',
        rowKey: 'uuid-10',
        rowNumber: 8,
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_2',
        uuid: 'uuid-2',
        rowKey: 'uuid-2',
        rowNumber: 3,
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
    ];
    component.filteredItems = [...component.items];

    component.sortBy('itemId');
    expect(component.filteredItems.map((item) => [item.rowKey, item.rowNumber])).toEqual([
      ['uuid-2', 3],
      ['uuid-10', 8],
    ]);

    component.filterText = '10';
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => [item.rowKey, item.rowNumber])).toEqual([
      ['uuid-10', 8],
    ]);
  });

  it('ignores stale item-list responses after a newer reload completes', () => {
    const firstLoad = new Subject<any>();
    const secondLoad = new Subject<any>();
    const getFileItemList = vi
      .fn()
      .mockReturnValueOnce(firstLoad.asObservable())
      .mockReturnValueOnce(secondLoad.asObservable());
    const component = createFacade({ api: { getFileItemList } });
    component.acpId = 'acp-1';

    component.reloadItems();
    component.reloadItems();

    expect(component.itemListLoading).toBe(true);

    secondLoad.next({
      columns: [],
      items: [
        {
          itemId: 'ITEM_1',
          uuid: 'uuid-1',
          rowKey: 'uuid-1',
          rowNumber: 1,
          unitId: 'UNIT_1',
          unitLabel: 'Unit 1',
          description: '',
          variableId: '',
          metadata: {},
        },
      ],
      unitMetadata: {},
      codingSchemes: {},
    });

    expect(component.itemListLoading).toBe(false);
    expect(component.items.map((item) => item.rowNumber)).toEqual([1]);

    firstLoad.next({
      columns: [],
      items: [
        {
          itemId: 'ITEM_1',
          uuid: 'uuid-1',
          rowKey: 'uuid-1',
          rowNumber: 9,
          unitId: 'UNIT_1',
          unitLabel: 'Unit 1',
          description: '',
          variableId: '',
          metadata: {},
        },
      ],
      unitMetadata: {},
      codingSchemes: {},
    });

    expect(component.itemListLoading).toBe(false);
    expect(component.items.map((item) => item.rowNumber)).toEqual([1]);
  });

  it('lets ACP managers recalculate the numbering and reloads the rows', () => {
    const recalculateItemRowNumbers = vi.fn(() => of({ renumberedCount: 1 }));
    const component = createFacade({ api: { recalculateItemRowNumbers } });
    component.acpId = 'acp-1';
    component.canEditExplorer = true;
    component.latestExplorerState = createExplorerEnvelope({ status: 'CLEAN' });
    const reloadItems = vi.spyOn(component, 'reloadItems').mockImplementation(() => undefined);

    component.openRenumberDialog();
    component.confirmRenumber();

    expect(recalculateItemRowNumbers).toHaveBeenCalledWith('acp-1');
    expect(component.showRenumberDialog).toBe(false);
    expect(component.numberingSuccessMessage).toBe('Eine Zeile wurde neu nummeriert.');
    expect(reloadItems).toHaveBeenCalledTimes(1);
  });

  it('reloads shared state and canonical item projections after a renumbering conflict', () => {
    const recalculateItemRowNumbers = vi.fn(() =>
      throwError(() => ({ status: 409, error: { message: 'Source files changed' } })),
    );
    const component = createFacade({ api: { recalculateItemRowNumbers } });
    component.acpId = 'acp-1';
    component.latestExplorerState = createExplorerEnvelope({ status: 'CLEAN' });
    component.showRenumberDialog = true;
    const reloadSharedExplorerStateAndItems = vi
      .spyOn(component as any, 'reloadSharedExplorerStateAndItems')
      .mockResolvedValue(undefined);

    component.confirmRenumber();

    expect(component.renumberError).toBe('Source files changed');
    expect(reloadSharedExplorerStateAndItems).toHaveBeenCalledTimes(1);
  });

  it('keeps a draft patch conflict visible after reloading the shared state', async () => {
    const component = createFacade({
      api: {
        patchItemExplorerDraft: vi.fn(() => throwError(() => ({ status: 409 }))),
        getItemExplorerState: vi.fn(() => of(createExplorerEnvelope({ status: 'DIRTY' }))),
      },
    });
    component.acpId = 'acp-1';
    component.canEditExplorer = true;
    component.explorerVersion = 3;
    (component as any).pendingDraftPatch = { tags: { 'row-1': ['QA'] } };
    const reloadItems = vi
      .spyOn(component, 'reloadItems')
      .mockImplementation((onSettled) => onSettled?.());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const flushed = await (component as any).flushDraftPatch();

    expect(flushed).toBe(false);
    expect(component.lastDraftOperationError).toBe(
      'Konflikt beim Aktualisieren des Entwurfs. Der Explorer wurde neu geladen.',
    );
    expect(component.explorerUiStatus).toBe('ERROR');
    expect(reloadItems).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('blocks renumbering while draft changes are pending or being saved', () => {
    const recalculateItemRowNumbers = vi.fn(() => of({ renumberedCount: 0 }));

    for (const status of ['DIRTY', 'SAVING'] as const) {
      const component = createFacade({ api: { recalculateItemRowNumbers } });
      component.latestExplorerState = createExplorerEnvelope({ status: 'CLEAN' });
      component.explorerUiStatus = status;

      expect(component.isRenumberingBlocked()).toBe(true);
      expect(component.getRenumberingActionTitle()).toMatch(
        status === 'SAVING' ? /warten/i : /Entwurf/i,
      );

      component.openRenumberDialog();
      expect(component.showRenumberDialog).toBe(false);

      component.showRenumberDialog = true;
      component.confirmRenumber();
      expect(component.renumberError).toMatch(status === 'SAVING' ? /warten/i : /Entwurf/i);
    }

    expect(recalculateItemRowNumbers).not.toHaveBeenCalled();
  });

  it('blocks renumbering until state loading and perspective switching settle', () => {
    const recalculateItemRowNumbers = vi.fn(() => of({ renumberedCount: 0 }));
    const component = createFacade({ api: { recalculateItemRowNumbers } });

    expect(component.isRenumberingBlocked()).toBe(true);
    expect(component.getRenumberingActionTitle()).toMatch(/Status geladen/i);
    component.openRenumberDialog();
    expect(component.showRenumberDialog).toBe(false);

    component.latestExplorerState = createExplorerEnvelope({ status: 'CLEAN' });
    component.perspectiveSwitchBusy = true;
    expect(component.isRenumberingBlocked()).toBe(true);
    expect(component.getRenumberingActionTitle()).toMatch(/Ansichtswechsel/i);
    component.openRenumberDialog();

    expect(component.showRenumberDialog).toBe(false);

    component.perspectiveSwitchBusy = false;
    component.itemListLoading = true;
    expect(component.isRenumberingBlocked()).toBe(true);
    expect(component.getRenumberingActionTitle()).toMatch(/Item-Liste geladen/i);
    component.openRenumberDialog();

    expect(component.showRenumberDialog).toBe(false);
    expect(recalculateItemRowNumbers).not.toHaveBeenCalled();
  });

  it('sorts partial-credit rows manually by stable row key', () => {
    const component = createFacade();
    component.items = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::1',
        subId: '1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::2',
        subId: '2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
    ];
    component.filteredItems = [...component.items];
    component.itemOrder = ['uuid-1::2', 'uuid-1::1'];
    component.sortField = '__manual__';

    (component as any).applySort(false);

    expect(component.filteredItems.map((item) => item.rowKey)).toEqual(['uuid-1::2', 'uuid-1::1']);
  });

  it('selects partial-credit rows with the same item UUID by stable row key', () => {
    const component = createFacade();
    const first = {
      itemId: 'ITEM_1',
      uuid: 'uuid-1',
      rowKey: 'uuid-1::1',
      subId: '1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: '',
      variableId: '',
      metadata: {},
    } as any;
    const second = { ...first, rowKey: 'uuid-1::2', subId: '2' };

    component.selectItem(first, 0);
    component.selectItem(second, 1);

    expect(component.selectedItem?.rowKey).toBe('uuid-1::2');
    expect(component.selectedIndex).toBe(1);
  });

  it('lets a partial-credit row clear inherited tags, exclusion and preview target', () => {
    const component = createFacade();
    const item = {
      itemId: 'ITEM_1',
      uuid: 'uuid-1',
      rowKey: 'uuid-1::1',
      subId: '1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: '',
      variableId: '',
      metadata: {},
      tags: ['base'],
      excluded: true,
      previewTargetId: 'BASE_A',
    } as any;
    component.items = [item];
    component.filteredItems = [item];

    const envelope = createExplorerEnvelope();
    envelope.draftState.tags = {
      'uuid-1': ['base'],
      'uuid-1::1': [],
    };
    envelope.draftState.itemProperties = {
      'uuid-1': {
        tags: ['base'],
        excluded: true,
        previewTargetId: 'BASE_A',
      },
      'uuid-1::1': {
        tags: [],
        excluded: false,
        previewTargetId: '',
      },
    };

    (component as any).applySharedExplorerEnvelope(envelope);

    expect(component.itemTags['uuid-1::1']).toEqual([]);
    expect(item.tags).toEqual([]);
    expect(item.excluded).toBeUndefined();
    expect(item.previewTargetId).toBeUndefined();
  });

  it('does not persist fullscreen mode in the shared ui preferences', () => {
    const component = createFacade();
    component.isFullscreen = true;

    const ui = (component as any).buildUiPreferences();

    expect(ui).not.toHaveProperty('isFullscreen');
  });

  it('hides items without empirical difficulty when the ACP filter is enabled', () => {
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
    component.currentCodingSchemeAsText = [
      { id: 'AUDIO_VAR', label: 'Audio prompt', codes: [] },
      { id: 'TEXT_VAR', label: 'Text prompt', codes: [] },
      { id: 'VIDEO_VAR', label: 'Video prompt', codes: [] },
    ] as any;

    const ids = component.filteredCodingSchemeAsText.map((coding) => coding.id);

    expect(ids).toEqual(['AUDIO_VAR', 'TEXT_VAR', 'VIDEO_VAR']);
  });

  it('hides audio/video coding variables when disabled', () => {
    const component = createFacade();
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

  it('focuses the coding overlay on the variable assigned to the selected item', () => {
    const component = createFacade();
    component.selectedItem = {
      itemId: 'ITEM_1',
      uuid: 'uuid-1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'First item',
      variableId: 'IGNORED_FALLBACK',
      sourceVariable: 'result_alias',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', sourceType: 'BASE', deriveSources: [] },
        {
          id: 'RESULT',
          alias: 'RESULT_ALIAS',
          sourceType: 'SUM_SCORE',
          deriveSources: ['BASE_A'],
        },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Teil A', codes: [] },
      { id: 'RESULT_ALIAS', label: 'Ergebnis', codes: [] },
    ] as any;
    component.codingSearchText = 'does-not-match';

    expect(component.codingVariableFocus).toMatchObject({
      status: 'unique',
      targetId: 'result_alias',
      codingId: 'RESULT_ALIAS',
      isDerived: true,
      sourceIds: ['BASE_A'],
    });
    expect(component.filteredCodingSchemeAsText.map((coding) => coding.id)).toEqual([
      'RESULT_ALIAS',
    ]);
  });

  it('shows the full coding scheme and an explanation when an item has no variable', () => {
    const component = createFacade();
    component.selectedItem = {
      itemId: 'ITEM_2',
      uuid: 'uuid-2',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Unmapped item',
      variableId: '',
      metadata: {},
    } as any;
    component.currentCodingSchemeAsText = [
      { id: 'VAR_A', label: 'A', codes: [] },
      { id: 'VAR_B', label: 'B', codes: [] },
    ] as any;

    expect(component.codingVariableFocus.status).toBe('missing-target');
    expect(component.codingVariableFocusMessage).toContain('keine Variable zugeordnet');
    expect(component.filteredCodingSchemeAsText.map((coding) => coding.id)).toEqual([
      'VAR_A',
      'VAR_B',
    ]);
  });

  it('marks a valid base-variable alias shadow as ambiguous when the alias is targeted', () => {
    const component = createFacade();
    component.selectedItem = {
      itemId: 'ITEM_3',
      uuid: 'uuid-3',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Ambiguous item',
      variableId: 'BASE_A',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', sourceType: 'BASE' },
        {
          id: 'TOTAL',
          alias: 'BASE_A',
          sourceType: 'SUM_SCORE',
          deriveSources: ['BASE_A'],
        },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Basiswert', codes: [] },
      { id: 'BASE_A', label: 'Gesamtscore', codes: [] },
    ] as any;

    expect(component.codingVariableFocus.status).toBe('ambiguous');
    expect(component.codingVariableFocusMessage).toContain('nicht eindeutig');
    expect(component.filteredCodingSchemeAsText).toHaveLength(2);
  });

  it('focuses a valid alias-shadowing aggregate when its internal id is targeted', () => {
    const component = createFacade();
    component.selectedItem = {
      itemId: 'ITEM_4',
      uuid: 'uuid-4',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Aggregate item',
      variableId: 'TOTAL',
      metadata: {},
    } as any;
    component.currentCodingScheme = {
      variableCodings: [
        { id: 'BASE_A', sourceType: 'BASE' },
        {
          id: 'TOTAL',
          alias: 'BASE_A',
          sourceType: 'SUM_SCORE',
          deriveSources: ['BASE_A'],
        },
      ],
    };
    component.currentCodingSchemeAsText = [
      { id: 'BASE_A', label: 'Basiswert', codes: [] },
      { id: 'BASE_A', label: 'Gesamtscore', codes: [] },
    ] as any;

    expect(component.codingVariableFocus).toMatchObject({
      status: 'unique',
      targetId: 'TOTAL',
      codingId: 'BASE_A',
      isDerived: true,
      sourceIds: ['BASE_A'],
    });
    expect(component.filteredCodingSchemeAsText.map((coding) => coding.label)).toEqual([
      'Gesamtscore',
    ]);
  });

  it('keeps manual variable and code instructions when the coding uses an alias', () => {
    const component = createFacade();
    const codings = (component as any).createCodingSchemeAsText([
      {
        id: 'INTERNAL_ID',
        alias: 'VISIBLE_ALIAS',
        label: 'Visible result',
        sourceType: 'BASE',
        manualInstruction: '<p>Text <img src="figure.png"></p>',
        codes: [
          {
            id: 1,
            score: 1,
            label: 'Correct',
            manualInstruction: '<p>Inspect figure</p>',
            ruleSets: [],
          },
        ],
      },
    ]);

    expect(codings[0].id).toBe('VISIBLE_ALIAS');
    expect(codings[0].manualInstructionText).toContain('<img');
    expect(codings[0].codes[0].manualInstructionText).toContain('Inspect figure');
  });

  it('sanitizes manual variable and code instructions while preserving graphics', () => {
    const component = createFacade();
    const codings = (component as any).createCodingSchemeAsText([
      {
        id: 'INTERNAL_ID',
        alias: 'VISIBLE_ALIAS',
        sourceType: 'BASE',
        manualInstruction:
          '<p>Text <img src="figure.png" onerror="alert(1)"></p><script>alert(2)</script>',
        codes: [
          {
            id: 1,
            score: 1,
            label: 'Correct',
            manualInstruction:
              '<a href="javascript:alert(3)" onclick="alert(4)">Inspect figure</a>',
            ruleSets: [],
          },
        ],
      },
    ]);

    expect(codings[0].manualInstructionText).toContain('<img src="figure.png">');
    expect(codings[0].manualInstructionText).not.toContain('onerror');
    expect(codings[0].manualInstructionText).not.toContain('<script');
    expect(codings[0].codes[0].manualInstructionText).toContain('Inspect figure');
    expect(codings[0].codes[0].manualInstructionText).not.toContain('javascript:');
    expect(codings[0].codes[0].manualInstructionText).not.toContain('onclick');
  });

  it('keeps manual instructions paired by position for a valid alias shadow', () => {
    const component = createFacade();
    const codings = (component as any).createCodingSchemeAsText([
      {
        id: 'BASE_A',
        sourceType: 'BASE',
        manualInstruction: '<p>Base instruction</p>',
        codes: [],
      },
      {
        id: 'TOTAL',
        alias: 'BASE_A',
        sourceType: 'SUM_SCORE',
        deriveSources: ['BASE_A'],
        manualInstruction: '<p>Aggregate instruction</p>',
        codes: [],
      },
    ]);

    expect(codings.map((coding: any) => coding.manualInstructionText)).toEqual([
      '<p>Base instruction</p>',
      '<p>Aggregate instruction</p>',
    ]);
  });

  it('clears a previous coding search when the overlay is opened', () => {
    const component = createFacade();
    component.codingSearchText = 'old search';

    component.openCodingOverlay();

    expect(component.codingSearchText).toBe('');
    expect(component.showOverlay).toBe('coding');
  });

  it('adds the player highlight class when player focus highlighting is enabled', () => {
    const component = createFacade();
    component.playerFocusHighlightEnabled = true;
    component.selectedItem = {
      itemId: 'ITEM_1',
      rowKey: 'row-1',
      uuid: 'uuid-1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Item 1',
      variableId: 'VAR_1',
      metadata: {},
    };
    const playerDom = registerPlayerDom(component);

    (component as any).tryFocusItemInPlayer();

    expect(playerDom.focus).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), true);
  });

  it('keeps player focus without the highlight class when the ACP flag disables it', () => {
    const component = createFacade();
    component.playerFocusHighlightEnabled = false;
    component.selectedItem = {
      itemId: 'ITEM_1',
      rowKey: 'row-1',
      uuid: 'uuid-1',
      unitId: 'UNIT_1',
      unitLabel: 'Unit 1',
      description: 'Item 1',
      variableId: 'VAR_1',
      metadata: {},
    };
    const playerDom = registerPlayerDom(component);

    (component as any).tryFocusItemInPlayer();

    expect(playerDom.focus).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), false);
  });

  it('keeps the preview in loading state until both player assets are ready', () => {
    const component = createFacade();

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
    const component = createFacade();

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
    const component = createFacade();

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
    const component = createFacade({ getStartPage: () => 2 });
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade({
      getStartPage: realVoudService.getStartPage.bind(realVoudService),
      resolvePlayerTargetLocation:
        realVoudService.resolvePlayerTargetLocation.bind(realVoudService),
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade({
      getStartPage: realVoudService.getStartPage.bind(realVoudService),
      resolvePlayerTargetLocation:
        realVoudService.resolvePlayerTargetLocation.bind(realVoudService),
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade({
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade({
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade();

    component.canEditExplorer = true;
    component.itemExplorerPlayerTargetInfoEnabled = true;

    expect(component.showPlayerTargetInfo).toBe(true);
  });

  it('hides player target diagnostics for read-only users', () => {
    const component = createFacade();

    component.canEditExplorer = false;
    component.itemExplorerPlayerTargetInfoEnabled = true;

    expect(component.showPlayerTargetInfo).toBe(false);
  });

  it('hides the draft status bar for read-only users', () => {
    const component = createFacade();

    component.canEditExplorer = false;

    expect(component.showExplorerDraftStatus).toBe(false);
  });

  it('shows the draft status bar for editors', () => {
    const component = createFacade();

    component.canEditExplorer = true;

    expect(component.showExplorerDraftStatus).toBe(true);
  });

  it('hides keyboard hints for read-only users', () => {
    const component = createFacade();

    component.canEditExplorer = false;

    expect(component.showExplorerKeyboardHints).toBe(false);
  });

  it('shows keyboard hints for editors', () => {
    const component = createFacade();

    component.canEditExplorer = true;

    expect(component.showExplorerKeyboardHints).toBe(true);
  });

  it('switches to the published explorer state in read-only preview mode', async () => {
    const envelope = createExplorerEnvelope();
    const getItemExplorerState = vi.fn(() => of(envelope));
    const getFileItemList = vi.fn(() =>
      of({ columns: [], items: [], unitMetadata: {}, codingSchemes: {} }),
    );
    const component = createFacade({
      api: {
        getItemExplorerState,
        getFileItemList,
      },
    });
    component.acpId = 'acp-1';

    (component as any).applySharedExplorerEnvelope(envelope);
    expect(component.filterText).toBe('draft');

    const flushDraftPatch = vi.fn().mockResolvedValue(true);
    (component as any).flushDraftPatch = flushDraftPatch;

    await component.toggleReadOnlyPreview();

    expect(flushDraftPatch).toHaveBeenCalledTimes(1);
    expect(component.isReadOnlyPreview).toBe(true);
    expect(component.canEditExplorer).toBe(false);
    expect(component.filterText).toBe('published');
    expect(getItemExplorerState).toHaveBeenCalledWith('acp-1');
    expect(getFileItemList).toHaveBeenCalledWith('acp-1', {
      perspective: 'read-only',
    });
  });

  it('switches back to the draft explorer state when leaving read-only preview mode', async () => {
    const envelope = createExplorerEnvelope();
    const getItemExplorerState = vi.fn(() => of(envelope));
    const getFileItemList = vi.fn(() =>
      of({ columns: [], items: [], unitMetadata: {}, codingSchemes: {} }),
    );
    const component = createFacade({
      api: {
        getItemExplorerState,
        getFileItemList,
      },
    });
    component.acpId = 'acp-1';

    (component as any).applySharedExplorerEnvelope(envelope);
    (component as any).flushDraftPatch = vi.fn().mockResolvedValue(true);

    await component.toggleReadOnlyPreview();
    await component.toggleReadOnlyPreview();

    expect(component.isReadOnlyPreview).toBe(false);
    expect(component.canEditExplorer).toBe(true);
    expect(component.filterText).toBe('draft');
    expect(getFileItemList).toHaveBeenLastCalledWith('acp-1', {
      perspective: 'editor',
    });
  });

  it('restores a partial-credit manual order only after editor rows are loaded', async () => {
    const envelope = createExplorerEnvelope();
    envelope.draftState.ui = {
      filterText: '',
      sortField: '__manual__',
      sortDir: 'asc',
      sortIsMeta: false,
    };
    envelope.draftState.itemOrder = ['uuid-1::2', 'uuid-1::1'];
    const editorRows = [
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::1',
        subId: '1',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
      {
        itemId: 'ITEM_1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::2',
        subId: '2',
        unitId: 'UNIT_1',
        unitLabel: 'Unit 1',
        description: '',
        variableId: '',
        metadata: {},
      },
    ];
    const component = createFacade({
      api: {
        getItemExplorerState: vi.fn(() => of(envelope)),
        getFileItemList: vi.fn(() =>
          of({ columns: [], items: editorRows, unitMetadata: {}, codingSchemes: {} }),
        ),
      },
    });
    component.acpId = 'acp-1';
    component.hasExplorerEditPermission = true;
    component.viewPerspective = 'read-only';
    component.items = [
      {
        ...editorRows[0],
        rowKey: 'uuid-1',
        subId: undefined,
      },
    ];
    component.filteredItems = [...component.items];
    (component as any).applySharedExplorerEnvelope(envelope);

    await component.toggleReadOnlyPreview();

    expect(component.itemOrder).toEqual(['uuid-1::2', 'uuid-1::1']);
    expect(component.filteredItems.map((item) => item.rowKey)).toEqual(['uuid-1::2', 'uuid-1::1']);
  });

  it('does not enter read-only preview when the pending draft patch cannot be flushed', async () => {
    const envelope = createExplorerEnvelope();
    const getItemExplorerState = vi.fn(() => of(envelope));
    const getFileItemList = vi.fn(() =>
      of({ columns: [], items: [], unitMetadata: {}, codingSchemes: {} }),
    );
    const component = createFacade({
      api: {
        getItemExplorerState,
        getFileItemList,
      },
    });

    (component as any).applySharedExplorerEnvelope(envelope);
    (component as any).flushDraftPatch = vi.fn().mockResolvedValue(false);

    await component.toggleReadOnlyPreview();

    expect(component.isReadOnlyPreview).toBe(false);
    expect(component.canEditExplorer).toBe(true);
    expect(getItemExplorerState).not.toHaveBeenCalled();
    expect(getFileItemList).not.toHaveBeenCalled();
  });

  it('hides player target diagnostics when the ACP flag is disabled', () => {
    const component = createFacade();

    component.canEditExplorer = true;
    component.itemExplorerPlayerTargetInfoEnabled = false;

    expect(component.showPlayerTargetInfo).toBe(false);
  });

  it('marks items without a player target as unavailable and skips preview loading', () => {
    const getFileUnitView = vi.fn();
    const getResponseStateWithFallback = vi.fn();
    const component = createFacade({
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
    const component = createFacade({ resolvePlayerTargetLocation: () => undefined });
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
    registerPlayerDom(component, postMessage);
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
    const component = createFacade();

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
    const component = createFacade();

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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade({
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
      registerPlayerDom(component, postMessage);
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
    const component = createFacade({
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

    expect(getResponseStateWithFallback).toHaveBeenCalledWith('acp-1', 'ITEM_9', 'UNIT_9', []);
    expect(getFileUnitView).toHaveBeenCalledWith('acp-1', 'UNIT_9', {
      perspective: 'read-only',
    });
  });

  it('uses a generic preview warning when diagnostics are hidden', () => {
    const component = createFacade();

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
    const component = createFacade({
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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
    const component = createFacade();
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

  it('enters fullscreen on the explorer root and keeps the fullscreen state local', async () => {
    const component = createFacade();
    const shellDom = {
      toggleFullscreen: vi.fn().mockResolvedValue(true),
      isFullscreen: vi.fn(() => true),
      rememberFocusBeforeOverlay: vi.fn(),
      restoreFocusAfterOverlayClose: vi.fn(() => false),
    };
    component.registerShellDom(shellDom);

    await component.toggleFullscreen();
    component.handleFullscreenChange();

    expect(shellDom.toggleFullscreen).toHaveBeenCalledOnce();
    expect(component.isFullscreen).toBe(true);
  });

  it('leaves fullscreen when the toggle is used again', async () => {
    const component = createFacade();
    const shellDom = {
      toggleFullscreen: vi.fn().mockResolvedValue(false),
      isFullscreen: vi.fn(() => false),
      rememberFocusBeforeOverlay: vi.fn(),
      restoreFocusAfterOverlayClose: vi.fn(() => false),
    };
    component.registerShellDom(shellDom);
    component.isFullscreen = true;

    await component.toggleFullscreen();
    component.handleFullscreenChange();

    expect(shellDom.toggleFullscreen).toHaveBeenCalledOnce();
    expect(component.isFullscreen).toBe(false);
  });

  it('filters imported numeric values and paired booklet occurrences', () => {
    const component = createFacade();
    component.items = [
      {
        itemId: 'item-1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'v1',
        metadata: {},
        infit: 1.05,
        bookletOccurrences: [
          { booklet: 'B1', position: 5 },
          { booklet: 'B2', position: 2 },
        ],
      },
    ];
    component.allColumns = [
      { id: 'infit', label: 'Infit', kind: 'number' },
      { id: 'booklet', label: 'Booklet', kind: 'booklet' },
      { id: 'bookletPosition', label: 'Position', kind: 'position' },
    ];
    component.columnFilters = {
      infit: '1,0..1,1',
      booklet: 'B1',
      bookletPosition: '1..3',
    };

    component.applyFilter(false);
    expect(component.filteredItems).toEqual([]);

    component.columnFilters['booklet'] = 'B2';
    component.applyFilter(false);
    expect(component.filteredItems).toHaveLength(1);
  });

  it('calculates combined collection time once per item and unit', () => {
    const component = createFacade();
    component.items = [
      {
        itemId: 'item-1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::1',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'v1',
        metadata: {},
        itemTimeSeconds: 10,
        stimulusTimeSeconds: 5,
      },
      {
        itemId: 'item-1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1::2',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'v1',
        metadata: {},
        itemTimeSeconds: 10,
        stimulusTimeSeconds: 5,
      },
      {
        itemId: 'item-2',
        uuid: 'uuid-2',
        rowKey: 'uuid-2',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'v2',
        metadata: {},
        stimulusTimeSeconds: 5,
      },
    ];
    component.itemCollections = [
      {
        id: 'collection-1',
        name: 'Auswahl',
        rowKeys: ['uuid-1::1', 'uuid-1::2', 'uuid-2', 'removed'],
        version: 1,
        createdAt: '',
        updatedAt: '',
        unavailableRowKeys: [],
        summary: {} as any,
      },
    ];
    component.activeCollectionId = 'collection-1';

    (component as any).recalculateCollectionSummaries();

    expect(component.activeItemCollection?.summary).toEqual({
      rowCount: 4,
      itemCount: 2,
      unitCount: 1,
      itemTimeSeconds: 10,
      stimulusTimeSeconds: 5,
      testTimeSeconds: 15,
      missingItemTimeCount: 1,
      missingStimulusTimeUnitCount: 0,
      complete: false,
    });
    expect(component.activeItemCollection?.unavailableRowKeys).toEqual(['removed']);
  });

  it('persists selection changes against the active collection version', async () => {
    const response = {
      activeCollectionId: 'collection-1',
      collections: [
        {
          id: 'collection-1',
          name: 'Auswahl',
          rowKeys: ['uuid-1'],
          version: 2,
          createdAt: '',
          updatedAt: '',
          unavailableRowKeys: [],
          summary: {
            rowCount: 1,
            itemCount: 1,
            unitCount: 1,
            itemTimeSeconds: 10,
            stimulusTimeSeconds: 5,
            testTimeSeconds: 15,
            missingItemTimeCount: 0,
            missingStimulusTimeUnitCount: 0,
            complete: true,
          },
        },
      ],
    };
    const updateItemCollection = vi.fn().mockReturnValue(of(response));
    const component = createFacade({
      api: { updateItemCollection },
      authService: { isLoggedIn: true },
    });
    const item = {
      itemId: 'item-1',
      uuid: 'uuid-1',
      rowKey: 'uuid-1',
      unitId: 'unit-1',
      unitLabel: 'Aufgabe 1',
      description: '',
      variableId: 'v1',
      metadata: {},
      itemTimeSeconds: 10,
      stimulusTimeSeconds: 5,
    };
    component.acpId = 'acp-1';
    component.items = [item];
    component.itemCollections = [
      {
        ...response.collections[0],
        rowKeys: [],
        version: 1,
        summary: { ...response.collections[0].summary, rowCount: 0 },
      },
    ];
    component.activeCollectionId = 'collection-1';
    component.collectionLoadState = 'loaded';

    await component.toggleItemInActiveCollection(item);

    expect(updateItemCollection).toHaveBeenCalledWith(
      'acp-1',
      'collection-1',
      { baseVersion: 1, rowKeys: ['uuid-1'] },
      'read-only',
    );
    expect(component.activeItemCollection?.version).toBe(2);
  });

  it('keeps the collection conflict visible while reloading the latest version', async () => {
    const freshCollection = {
      id: 'collection-1',
      name: 'Server-Auswahl',
      rowKeys: [],
      version: 2,
      createdAt: '',
      updatedAt: '',
      unavailableRowKeys: [],
      summary: {} as any,
    };
    const getItemCollections = vi
      .fn()
      .mockReturnValue(of({ activeCollectionId: 'collection-1', collections: [freshCollection] }));
    const updateItemCollection = vi.fn().mockReturnValue(throwError(() => ({ status: 409 })));
    const component = createFacade({
      api: { getItemCollections, updateItemCollection },
      authService: { isLoggedIn: true },
    });
    component.acpId = 'acp-1';
    component.enableItemCollections = true;
    component.itemCollections = [{ ...freshCollection, name: 'Lokale Auswahl', version: 1 }];
    component.activeCollectionId = 'collection-1';
    component.collectionLoadState = 'loaded';

    await (component as any).persistActiveCollectionUpdate({ name: 'Geändert' });

    expect(getItemCollections).toHaveBeenCalledWith('acp-1', 'read-only');
    expect(component.activeItemCollection?.name).toBe('Server-Auswahl');
    expect(component.collectionLoadState).toBe('loaded');
    expect(component.collectionError).toBe(
      'Die Kollektion wurde parallel geändert und wird neu geladen.',
    );
  });

  it('filters empirical difficulty numerically and keeps missing values last', () => {
    const component = createFacade();
    const baseItem = {
      unitId: 'unit-1',
      unitLabel: 'Aufgabe 1',
      description: '',
      variableId: 'v1',
      metadata: {},
    };
    component.items = [
      { ...baseItem, itemId: 'missing', uuid: 'uuid-0', rowKey: 'uuid-0' },
      {
        ...baseItem,
        itemId: 'negative',
        uuid: 'uuid-1',
        rowKey: 'uuid-1',
        empiricalDifficulty: -1,
      },
      {
        ...baseItem,
        itemId: 'positive',
        uuid: 'uuid-2',
        rowKey: 'uuid-2',
        empiricalDifficulty: 2,
      },
    ];
    component.columnFilters = { empiricalDifficulty: '-2..0' };

    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['negative']);

    component.columnFilters = {};
    component.applyFilter(false);
    component.sortBy('empiricalDifficulty');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual([
      'negative',
      'positive',
      'missing',
    ]);
  });

  it('uses backend-provided mean task difficulties without deriving replacements', () => {
    const component = createFacade();
    const baseItem = {
      unitLabel: 'Aufgabe',
      description: '',
      variableId: 'v1',
      metadata: {},
    };
    component.items = [
      {
        ...baseItem,
        itemId: 'unit-1-a',
        uuid: 'uuid-1',
        rowKey: 'uuid-1',
        unitId: 'unit-1',
        empiricalDifficulty: -1,
        meanTaskDifficulty: 0.4,
      },
      {
        ...baseItem,
        itemId: 'unit-1-b',
        uuid: 'uuid-2',
        rowKey: 'uuid-2',
        unitId: 'unit-1',
        empiricalDifficulty: 0.5,
        meanTaskDifficulty: 0.4,
      },
      {
        ...baseItem,
        itemId: 'unit-1-missing',
        uuid: 'uuid-3',
        rowKey: 'uuid-3',
        unitId: 'unit-1',
        meanTaskDifficulty: 0.4,
      },
      {
        ...baseItem,
        itemId: 'unit-2',
        uuid: 'uuid-4',
        rowKey: 'uuid-4',
        unitId: 'unit-2',
        empiricalDifficulty: 1,
        meanTaskDifficulty: -0.2,
      },
      {
        ...baseItem,
        itemId: 'unit-3-missing',
        uuid: 'uuid-5',
        rowKey: 'uuid-5',
        unitId: 'unit-3',
      },
    ];

    (component as any).reconcileMeanTaskDifficultyState();

    expect(component.hasMeanTaskDifficulty).toBe(true);
    expect(component.items.slice(0, 3).map((item) => item.meanTaskDifficulty)).toEqual([
      0.4, 0.4, 0.4,
    ]);
    expect(component.items[4].meanTaskDifficulty).toBeUndefined();

    component.columnFilters = { meanTaskDifficulty: '0.3..0.5' };
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.unitId)).toEqual([
      'unit-1',
      'unit-1',
      'unit-1',
    ]);

    component.columnFilters = {};
    component.applyFilter(false);
    component.sortBy('meanTaskDifficulty');
    expect(component.filteredItems.map((item) => item.unitId)).toEqual([
      'unit-2',
      'unit-1',
      'unit-1',
      'unit-1',
      'unit-3',
    ]);
  });

  it('removes a hidden mean task difficulty filter after all difficulties are cleared', () => {
    const component = createFacade();
    component.canEditExplorer = true;
    component.items = [
      {
        itemId: 'item-1',
        uuid: 'uuid-1',
        rowKey: 'uuid-1',
        unitId: 'unit-1',
        unitLabel: 'Aufgabe 1',
        description: '',
        variableId: 'v1',
        metadata: {},
        empiricalDifficulty: 0.5,
        meanTaskDifficulty: 0.5,
      },
    ];
    component.columnFilters = { meanTaskDifficulty: '0..1' };
    component.sortField = 'meanTaskDifficulty';
    component.sortIsMeta = false;
    component.sortDir = 'desc';
    const queueDraftPatch = vi.spyOn(component as any, 'queueDraftPatch');

    (component as any).reconcileMeanTaskDifficultyState();
    component.applyFilter(false);
    expect(component.filteredItems).toHaveLength(1);

    delete component.items[0].meanTaskDifficulty;
    (component as any).reconcileMeanTaskDifficultyState();
    component.applyFilter(false);

    expect(component.hasMeanTaskDifficulty).toBe(false);
    expect(component.columnFilters['meanTaskDifficulty']).toBeUndefined();
    expect(component.sortField).toBe('unitLabel');
    expect(component.sortIsMeta).toBe(false);
    expect(component.sortDir).toBe('asc');
    expect(component.filteredItems).toHaveLength(1);
    expect(queueDraftPatch).toHaveBeenCalledWith('UI_STATE_CHANGED', {
      ui: expect.objectContaining({
        sortField: 'unitLabel',
        sortDir: 'asc',
        columnFilters: {},
      }),
    });
  });

  it('keeps all integrated parameter columns configurable when values are missing', () => {
    const component = createFacade();

    const columns = (component as any).getAvailableMetadataColumns([]);

    expect(columns.map((column: { id: string }) => column.id)).toEqual([
      'infit',
      'discrimination',
      'solutionRate',
      'itemTimeSeconds',
      'stimulusTimeSeconds',
      'booklet',
      'bookletPosition',
    ]);
  });

  it('formats wide and legacy upload successes without losing imported details', () => {
    const component = createFacade();
    const wideSuccess = {
      unitId: 'unit-1',
      itemId: 'item-1',
      subId: 'A',
      fields: ['infit', 'discrimination', 'booklet', 'position'],
      bookletOccurrences: [
        { booklet: 'B1', position: 2 },
        { booklet: 'B2', position: 5 },
      ],
    };

    expect(component.getUploadSuccessFieldSummary(wideSuccess)).toBe(
      'Infit, Trennschärfe, Booklet / Position',
    );
    expect(component.getUploadSuccessBookletSummary(wideSuccess)).toBe('B1 / 2 | B2 / 5');
    const clearedBooklets = {
      fields: ['booklet', 'position'],
      bookletOccurrences: [],
    };
    expect(component.getUploadSuccessFieldSummary(clearedBooklets)).toBe(
      'Booklet / Position gelöscht',
    );
    expect(component.getUploadSuccessBookletSummary(clearedBooklets)).toBe('Gelöscht');
    expect(component.getUploadSuccessFieldSummary({ value: -0.4 })).toBe(
      'Empirische Itemschwierigkeit: -0.4',
    );
    expect(component.getUploadSuccessBookletSummary({ value: -0.4 })).toBe('–');
  });

  it('applies the item-list visibility returned by a wide difficulty import', () => {
    const uploadItemParameters = vi.fn().mockReturnValue(
      of({
        updated: 1,
        failed: [],
        successes: [{ fields: ['est'], value: -0.4 }],
        showOnlyItemsWithEmpiricalDifficulty: true,
      }),
    );
    const getFileItemList = vi
      .fn()
      .mockReturnValue(of({ items: [], columns: [], unitMetadata: {}, codingSchemes: {} }));
    const component = createFacade({
      api: { uploadItemParameters, getFileItemList },
    });
    component.acpId = 'acp-1';
    component.explorerVersion = 7;
    component.showOnlyItemsWithEmpiricalDifficulty = false;
    const file = new File(['item;est\nI1;-0.4'], 'parameters.csv', { type: 'text/csv' });
    const input = { files: [file], value: 'parameters.csv' };

    component.onCsvFileSelected({ target: input } as unknown as Event);

    expect(uploadItemParameters).toHaveBeenCalledWith('acp-1', file, {
      draft: true,
      baseVersion: 7,
    });
    expect(component.showOnlyItemsWithEmpiricalDifficulty).toBe(true);
    expect(input.value).toBe('');
  });

  it('keeps server collection summaries while the item list is loading', () => {
    const summary = {
      rowCount: 2,
      itemCount: 2,
      unitCount: 1,
      itemTimeSeconds: 20,
      stimulusTimeSeconds: 5,
      testTimeSeconds: 25,
      missingItemTimeCount: 0,
      missingStimulusTimeUnitCount: 0,
      complete: true,
    };
    const getItemCollections = vi.fn().mockReturnValue(
      of({
        activeCollectionId: 'collection-1',
        collections: [
          {
            id: 'collection-1',
            name: 'Auswahl',
            rowKeys: ['uuid-1', 'uuid-2'],
            version: 1,
            createdAt: '',
            updatedAt: '',
            unavailableRowKeys: [],
            summary,
          },
        ],
      }),
    );
    const token = createJwt('user-1');
    const component = createFacade({
      api: { getItemCollections },
      authService: { getToken: () => token },
    });
    component.enableItemCollections = true;
    component.itemListLoading = true;

    (component as any).syncItemCollectionSession();

    expect(component.activeItemCollection?.summary).toEqual(summary);
    expect(component.activeItemCollection?.unavailableRowKeys).toEqual([]);
  });

  it('clears collections on identity changes and ignores stale responses', () => {
    const userAResponse = new Subject<any>();
    const userBResponse = new Subject<any>();
    const getItemCollections = vi
      .fn()
      .mockReturnValueOnce(userAResponse)
      .mockReturnValueOnce(userBResponse);
    let token: string | null = createJwt('user-a');
    const component = createFacade({
      api: { getItemCollections },
      authService: { getToken: () => token },
    });
    component.enableItemCollections = true;

    (component as any).syncItemCollectionSession();
    expect(component.collectionLoadState).toBe('loading');

    token = null;
    (component as any).syncItemCollectionSession();
    expect(component.itemCollections).toEqual([]);
    expect(component.collectionLoadState).toBe('error');

    userAResponse.next({
      activeCollectionId: 'collection-a',
      collections: [{ id: 'collection-a', name: 'User A', rowKeys: [] }],
    });
    expect(component.itemCollections).toEqual([]);

    token = createJwt('user-b');
    (component as any).syncItemCollectionSession();
    userBResponse.next({
      activeCollectionId: 'collection-b',
      collections: [{ id: 'collection-b', name: 'User B', rowKeys: [] }],
    });
    expect(component.itemCollections).toEqual([
      expect.objectContaining({ id: 'collection-b', name: 'User B' }),
    ]);
    expect(component.activeCollectionId).toBe('collection-b');
  });
});
