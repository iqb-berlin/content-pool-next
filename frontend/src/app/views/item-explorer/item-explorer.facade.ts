import { Injectable, OnDestroy, Optional } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ApiService } from '../../core/services/api.service';
import { VoudService } from '../../core/services/voud.service';
import {
  GEOGEBRA_PLAYER_RESOURCE_BASE,
  rewriteGeoGebraAssetUrls,
} from '../../core/utils/geogebra-player-html.util';
import { AuthService } from '../../core/services/auth.service';
import { PendingPersonalSessionStorageService } from '../../core/services/pending-personal-session-storage.service';
import { BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { CodingSchemeTextFactory, CodingAsText } from '@iqb/responses';
import {
  catchError,
  EMPTY,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  of,
  ReplaySubject,
  Subject,
  Subscription,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import {
  ItemCollection,
  ItemCollectionSummary,
  ItemExplorerChangeLogEntry,
  ItemExplorerSharedState,
  ItemExplorerStateEnvelope,
  ItemExplorerPerspective,
} from '../../core/models/api.models';
import type {
  ItemExplorerHeaderViewModel,
  ItemExplorerTableViewModel,
  ItemExplorerPreviewViewModel,
  ItemExplorerCodingDialogViewModel,
  ItemExplorerCollectionsViewModel,
  ItemExplorerMetadataDrawerViewModel,
  ItemExplorerUploadDialogsViewModel,
  ItemExplorerColumnManagerDialogViewModel,
  ItemExplorerResponseStateDialogsViewModel,
  ItemExplorerHistoryDialogViewModel,
  ItemExplorerDraftDialogsViewModel,
} from './item-explorer.view-models';
import {
  CodingVariableFocusResolution,
  CodingVariableFocusStatus,
  ExplorerItem,
  ExplorerUiStatus,
  ItemParameterUploadResult,
  MetadataColumn,
  MetadataSettings,
  PendingPersonalRowUpdate,
  PersonalDataLoadState,
  PersonalDataSaveState,
  PersonalItemRowData,
  PersonalItemTagConfig,
  PreviewAssetLoadState,
  PreviewTargetOption,
  PreviewTargetResolution,
  ReadonlyExplorerItem,
  ReadonlyItemParameterUploadSuccess,
  SuspendedPersonalSession,
} from './item-explorer.models';
import {
  ItemExplorerPlayerDomPort,
  ItemExplorerShellDomPort,
  ItemExplorerTableDomPort,
} from './item-explorer.dom-ports';
import { matchesNumericFilter } from '../../core/utils/numeric-filter.util';
import {
  ItemExplorerPreviewAssets,
  ItemExplorerPreviewLoader,
} from './item-explorer-preview-loader.service';
import {
  ItemExplorerLoadDiagnostics,
  ItemExplorerTimingToken,
} from './item-explorer-load-diagnostics.service';

const DEFAULT_EXPLORER_SORT_FIELD = 'unitLabel';
const DEFAULT_EXPLORER_SORT_DIR: 'asc' | 'desc' = 'asc';
type ItemListLoadOutcome = 'loaded' | 'version-mismatch' | 'superseded' | 'error';
const IMPORTED_PARAMETER_COLUMNS: MetadataColumn[] = [
  { id: 'infit', label: 'Infit', kind: 'number' },
  { id: 'discrimination', label: 'Trennschärfe', kind: 'number' },
  { id: 'solutionRate', label: 'Lösungshäufigkeit', kind: 'number' },
  { id: 'itemTimeSeconds', label: 'Itemzeit (s)', kind: 'number' },
  { id: 'stimulusTimeSeconds', label: 'Stimuluszeit (s)', kind: 'number' },
  { id: 'booklet', label: 'Booklet', kind: 'booklet' },
  { id: 'bookletPosition', label: 'Position im Booklet', kind: 'position' },
];
const UPLOAD_FIELD_LABELS: Record<string, string> = {
  est: 'Empirische Itemschwierigkeit',
  empiricalDifficulty: 'Empirische Itemschwierigkeit',
  infit: 'Infit',
  discrimination: 'Trennschärfe',
  solution_rate: 'Lösungshäufigkeit',
  solutionRate: 'Lösungshäufigkeit',
  item_time_s: 'Itemzeit (s)',
  itemTimeSeconds: 'Itemzeit (s)',
  stimulus_time_s: 'Stimuluszeit (s)',
  stimulusTimeSeconds: 'Stimuluszeit (s)',
  booklet: 'Booklet',
  position: 'Position im Booklet',
};

@Injectable()
export class ItemExplorerFacade implements OnDestroy {
  private initialized = false;
  private destroyed = false;
  private readonly destroy$ = new ReplaySubject<void>(1);
  private readonly previewTargetItemPropertyKey = 'previewTargetId';
  private readonly excludedItemPropertyKey = 'excluded';
  private shellDom?: ItemExplorerShellDomPort;
  private tableDom?: ItemExplorerTableDomPort;
  private playerDom?: ItemExplorerPlayerDomPort;

  acpId = '';
  columns: MetadataColumn[] = [];
  items: ExplorerItem[] = [];
  filteredItems: ExplorerItem[] = [];
  hasEmpiricalDifficulty = false;
  hasMeanTaskDifficulty = false;
  hasPartialCredit = false;
  itemSubIdLabel = 'Sub-ID';
  filterText = '';
  isFullscreen = false;
  sortField = DEFAULT_EXPLORER_SORT_FIELD;
  sortIsMeta = false;
  sortDir: 'asc' | 'desc' = DEFAULT_EXPLORER_SORT_DIR;
  breadcrumbs: BreadcrumbItem[] = [];
  columnFilters: Record<string, string> = {};
  showExcludedItems = false;

  // Selection
  selectedItem: ExplorerItem | null = null;
  selectedIndex = -1;
  loadingUnit = false;
  private playerHtmlLoadState: PreviewAssetLoadState = 'idle';
  private definitionLoadState: PreviewAssetLoadState = 'idle';
  private playerFrameRefreshPending = false;

  // Player
  unit: any = null;
  playerSrcDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  pagingMode:
    | 'buttons'
    | 'separate'
    | 'concat-scroll'
    | 'concat-scroll-snap'
    | 'view-all'
    | 'print-ids' = 'buttons';
  playerHeight = '100%';

  // Overlays
  showOverlay: 'coding' | null = null;
  showMetadataDrawer = false;
  unitMetadataCache: Record<string, any[]> = {};
  codingSchemeCache: Record<string, any> = {};
  currentCodingSchemeAsText: CodingAsText[] | null = null;
  currentUnitMetadata: any[] = [];
  currentCodingScheme: any = null;

  // Tags
  enableTags = false;
  availableTags: string[] = [];
  showAudioVideoCodingVariables = true;
  itemExplorerConditionalVisibilityEnabled = false;
  playerFocusHighlightEnabled = false;
  itemExplorerPlayerTargetInfoEnabled = true;
  showOnlyItemsWithEmpiricalDifficulty = false;
  itemTags: Record<string, string[]> = {};
  persistUserPreferences = false;
  useServerPreferences = false;

  // Personal row-level working data (never part of the shared Explorer state)
  enablePersonalItemData = false;
  personalItemCategoryLabel = 'Kompetenzstufe';
  personalItemCategoryValues: string[] = [];
  personalItemTagLabel = 'Markierungen';
  personalItemTags: PersonalItemTagConfig[] = [];
  personalItemData: Record<string, PersonalItemRowData> = {};
  personalColumnFilters: Record<string, string> = {};
  personalDataLoadState: PersonalDataLoadState = 'idle';
  personalDataSaveState: PersonalDataSaveState = 'idle';
  personalDataError = '';
  personalExportInProgress = false;
  personalExportError = '';
  allPersonalDataExportInProgress = false;
  allPersonalDataExportError = '';
  showDiscardPersonalItemDataDialog = false;
  private readonly personalPreferenceViewId = 'item-explorer';
  private readonly personalSaveDebounceMs = 350;
  private personalSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private personalSaveInFlight = false;
  private personalRowUpdateVersion = 0;
  private readonly pendingPersonalRowUpdates = new Map<string, PendingPersonalRowUpdate>();
  private personalSaveWaiters: Array<(saved: boolean) => void> = [];
  private personalDataSessionIdentity: string | null = null;
  private personalDataSessionVersion = 0;
  private authSessionSubscription: Subscription | null = null;
  private readonly authStorageListener = (event: StorageEvent) => {
    if (!event.key || event.key === 'cp_token') {
      this.syncPersonalItemDataSession();
      this.syncItemCollectionSession();
    }
  };

  // Personal named item collections
  enableItemCollections = false;
  itemCollections: ItemCollection[] = [];
  activeCollectionId: string | null = null;
  collectionLoadState: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  collectionBusy = false;
  collectionError = '';
  showCollectionDrawer = false;
  private collectionSessionIdentity: string | null = null;
  private collectionSessionVersion = 0;

  private readonly draftPatchDebounceMs = 250;
  private draftPatchTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingDraftPatch: Record<string, unknown> | null = null;
  private pendingDraftChangeType = 'UI_UPDATE';
  private suppressDraftPatch = false;
  private saveStatusResetTimeout: ReturnType<typeof setTimeout> | null = null;
  private focusRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private playerFrameRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private legacyPageNavigationTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly legacyPageNavigationDelaysMs = [160, 520, 1100];
  private readonly listPageSize = 10;
  private definitionContent: string | null = null;
  private playerFrameReady = false;
  private responseStateReady = false;
  private activePlayerSessionId: string | null = null;
  private unitLoadToken = 0;
  private itemListLoadToken = 0;
  private startSessionCounter = 0;
  private readonly previewSelection$ = new Subject<{
    item: ExplorerItem;
    token: number;
    reuseLoadedUnit: boolean;
    timing: ItemExplorerTimingToken | null;
  } | null>();
  private itemListSlowTimer: ReturnType<typeof setTimeout> | null = null;
  private previewSlowTimer: ReturnType<typeof setTimeout> | null = null;
  private playerReadyTiming: ItemExplorerTimingToken | null = null;
  itemListSlow = false;
  previewSlow = false;
  previewLoadPhase = '';
  previewUpdateInProgress = false;

  // File Upload
  showUploadReport = false;
  uploadResult: ItemParameterUploadResult | null = null;
  isUploading = false;
  showErrorDialog = false;
  errorMessage = '';

  // Metadata column management
  isAcpManager = false;
  canEditExplorer = false;
  canPublishExplorer = false;
  hasExplorerEditPermission = false;
  hasExplorerPublishPermission = false;
  viewPerspective: ItemExplorerPerspective = 'editor';
  perspectiveSwitchBusy = false;
  showColumnManager = false;
  allColumns: MetadataColumn[] = [];
  metadataSettings: MetadataSettings = { visible: [], order: [] };
  columnFilterText = '';
  itemOrder: string[] = [];

  // Shared draft state
  explorerUiStatus: ExplorerUiStatus = 'CLEAN';
  explorerVersion = 1;
  explorerPublishedVersion = 1;
  lastExplorerChangeInfo = '';
  latestExplorerState: ItemExplorerStateEnvelope | null = null;
  itemListError = '';
  itemListLoading = false;

  // History
  showHistoryOverlay = false;
  historyLoading = false;
  historyError = '';
  historyEntries: ItemExplorerChangeLogEntry[] = [];
  historyFilterUser = '';
  historyFilterType = '';
  historyFilterFrom = '';
  historyFilterTo = '';

  // Save preview
  showSavePreviewDialog = false;
  draftPreviewSummary: Array<{ label: string; detail: string }> = [];
  lastDraftOperationError = '';

  // Draft / destructive dialogs
  showDiscardDraftDialog = false;
  discardDraftDialogBusy = false;
  discardDraftDialogError = '';
  showClearEmpiricalDifficultiesDialog = false;
  clearEmpiricalDifficultiesBusy = false;
  clearEmpiricalDifficultiesError = '';
  showRenumberDialog = false;
  renumberBusy = false;
  renumberError = '';
  numberingSuccessMessage = '';

  // Leave with pending changes dialog
  showLeaveWithChangesDialog = false;
  leaveWithChangesDialogState: 'idle' | 'saving' | 'discarding' = 'idle';
  leaveWithChangesDialogError = '';
  private leaveWithChangesResolver: ((value: boolean) => void) | null = null;

  // Coding scheme display filtering
  codingSearchText = '';
  codingSortField: 'id' | 'label' = 'id';
  codingSortDir: 'asc' | 'desc' = 'asc';

  // Response State
  currentResponseData: Record<string, any> | null = null;
  hasResponseState = false;
  isFallbackState = false;
  showRawDataOverlay = false;
  allResponseStates: any[] = [];
  previewUnavailableReason = '';
  previewUserFacingMessage = '';
  selectedPreviewTargetId = '';
  customPreviewTargetDraft = '';
  private previewTargetResolution: PreviewTargetResolution = {
    itemTarget: '',
    isDerived: false,
    options: [],
    defaultTargetId: '',
  };

  // Response State Confirmation Dialogs
  showSaveConfirmDialog = false;
  showDeleteConfirmDialog = false;
  confirmDialogState: 'idle' | 'saving' | 'deleting' = 'idle';
  confirmDialogError = '';

  get filteredCodingSchemeAsText(): CodingAsText[] {
    if (!this.currentCodingSchemeAsText) return [];

    const focus = this.codingVariableFocus;
    let list = focus.status === 'unique' ? [...focus.matches] : [...this.currentCodingSchemeAsText];

    if (!this.showAudioVideoCodingVariables) {
      list = list.filter((c) => !this.isAudioVideoCodingVariable(c));
    }

    // Search
    if (focus.status !== 'unique' && this.codingSearchText) {
      const term = this.codingSearchText.toLowerCase();
      list = list.filter(
        (c) =>
          c.id.toLowerCase().includes(term) || (c.label && c.label.toLowerCase().includes(term)),
      );
    }

    // Sort
    return list.sort((a, b) => {
      const aVal = (this.codingSortField === 'id' ? a.id : a.label || a.id).toLowerCase();
      const bVal = (this.codingSortField === 'id' ? b.id : b.label || b.id).toLowerCase();

      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return this.codingSortDir === 'asc' ? cmp : -cmp;
    });
  }

  get codingVariableFocus(): CodingVariableFocusResolution {
    const targetId = this.getPlayerTarget(this.selectedItem);
    const emptyResolution = (
      status: Exclude<CodingVariableFocusStatus, 'unique'>,
      matches: CodingAsText[] = [],
    ): CodingVariableFocusResolution => ({
      status,
      targetId,
      codingId: '',
      matches,
      isDerived: false,
      sourceIds: [],
    });

    if (!targetId) {
      return emptyResolution('missing-target');
    }

    const normalizedTarget = targetId.toLowerCase();
    const codings = this.currentCodingSchemeAsText || [];
    const rawVariables = this.getCurrentCodingVariables();
    const rawMatchIndices = rawVariables.flatMap((variable, index) =>
      this.getCodingVariableIdentifiers(variable).some(
        (identifier) => identifier.toLowerCase() === normalizedTarget,
      )
        ? [index]
        : [],
    );

    if (rawMatchIndices.length > 1) {
      return emptyResolution(
        'ambiguous',
        rawMatchIndices
          .map((index) => codings[index])
          .filter((coding): coding is CodingAsText => Boolean(coding)),
      );
    }

    if (rawMatchIndices.length === 1) {
      const matchIndex = rawMatchIndices[0];
      const textMatch = codings[matchIndex];
      if (!textMatch) {
        return emptyResolution('not-found');
      }

      const rawVariable = rawVariables[matchIndex];
      const sourceType = this.getCodingVariableSourceType(rawVariable);
      return {
        status: 'unique',
        targetId,
        codingId: textMatch.id,
        matches: [textMatch],
        isDerived: sourceType !== 'BASE' && sourceType !== 'BASE_NO_VALUE',
        sourceIds: this.getCodingVariableSources(rawVariable),
      };
    }

    const directMatches = codings.filter(
      (coding) =>
        String(coding.id || '')
          .trim()
          .toLowerCase() === normalizedTarget,
    );
    if (directMatches.length !== 1) {
      return emptyResolution(directMatches.length ? 'ambiguous' : 'not-found', directMatches);
    }

    return {
      status: 'unique',
      targetId,
      codingId: directMatches[0].id,
      matches: directMatches,
      isDerived: false,
      sourceIds: [],
    };
  }

  get codingVariableFocusMessage(): string {
    const focus = this.codingVariableFocus;
    if (focus.status === 'missing-target') {
      return 'Dem ausgewählten Item ist keine Variable zugeordnet. Das vollständige Kodierschema wird angezeigt.';
    }
    if (focus.status === 'not-found') {
      return `Die zugeordnete Variable „${focus.targetId}“ wurde im Kodierschema nicht gefunden. Das vollständige Kodierschema wird angezeigt.`;
    }
    if (focus.status === 'ambiguous') {
      return `Die zugeordnete Variable „${focus.targetId}“ kommt im Kodierschema nicht eindeutig vor. Das vollständige Kodierschema wird angezeigt.`;
    }
    return '';
  }

  get excludedItemsCount(): number {
    return this.items.filter((item) => this.isItemExcluded(item)).length;
  }

  get visibleItemsCount(): number {
    return this.items.filter((item) => this.isItemVisibleByBaseRules(item)).length;
  }

  get activeItemCollection(): ItemCollection | null {
    return (
      this.itemCollections.find((collection) => collection.id === this.activeCollectionId) || null
    );
  }

  get activeCollectionItems(): Array<{
    rowKey: string;
    item: ExplorerItem | null;
  }> {
    const collection = this.activeItemCollection;
    if (!collection) return [];
    const itemMap = new Map(this.items.map((item) => [item.rowKey, item] as const));
    return collection.rowKeys.map((rowKey) => ({ rowKey, item: itemMap.get(rowKey) || null }));
  }

  get selectedPreviewTarget(): string {
    const storedId = this.getStoredPreviewTargetId(this.selectedItem);
    if (storedId) {
      return storedId;
    }
    return this.previewTargetResolution.defaultTargetId || this.getPlayerTarget(this.selectedItem);
  }

  get selectedItemTarget(): string {
    return this.previewTargetResolution.itemTarget || this.getPlayerTarget(this.selectedItem);
  }

  get previewTargetOptions(): PreviewTargetOption[] {
    return this.previewTargetResolution.options;
  }

  get selectedItemUsesDerivedTarget(): boolean {
    return this.previewTargetResolution.isDerived;
  }

  get showPreviewTargetSelector(): boolean {
    return this.previewTargetOptions.length > 0;
  }

  get hasStoredPreviewTargetOverride(): boolean {
    return this.getStoredPreviewTargetId(this.selectedItem).length > 0;
  }

  get previewTargetDefaultOptionLabel(): string {
    if (this.previewTargetResolution.defaultTargetId) {
      return `Standardziel verwenden (${this.previewTargetResolution.defaultTargetId})`;
    }
    return 'Kein Standardziel hinterlegt';
  }

  get showPlayerTargetInfo(): boolean {
    return this.canEditExplorer && this.itemExplorerPlayerTargetInfoEnabled;
  }

  get isReadOnlyPreview(): boolean {
    return this.viewPerspective === 'read-only';
  }

  get canToggleReadOnlyPreview(): boolean {
    return this.hasExplorerEditPermission;
  }

  get showReadOnlyPreviewBanner(): boolean {
    return this.isReadOnlyPreview && this.hasExplorerEditPermission;
  }

  get showExplorerDraftStatus(): boolean {
    return this.canEditExplorer;
  }

  get showExplorerKeyboardHints(): boolean {
    return this.canEditExplorer;
  }

  get canPreviewSelectedItem(): boolean {
    return this.canPreviewItem(this.selectedItem) && !this.previewUnavailableReason;
  }

  get previewUnavailableMessage(): string {
    if (!this.previewUnavailableReason) return '';
    if (this.previewUserFacingMessage) return this.previewUserFacingMessage;
    if (this.showPlayerTargetInfo) return this.previewUnavailableReason;
    return 'Für dieses Item ist keine zielgenaue Player-Vorschau verfügbar.';
  }

  get isPreviewLoading(): boolean {
    if (!this.selectedItem || this.previewUnavailableReason || this.hasPreviewLoadFailure()) {
      return false;
    }

    return (
      this.loadingUnit ||
      this.playerFrameRefreshPending ||
      this.playerHtmlLoadState === 'loading' ||
      this.definitionLoadState === 'loading' ||
      (!this.responseStateReady && !this.previewUpdateInProgress)
    );
  }

  get shouldRenderPlayerFrame(): boolean {
    return (
      !!this.selectedItem &&
      !this.previewUnavailableReason &&
      !this.isPreviewLoading &&
      !!this.playerSrcDoc &&
      this.playerHtmlLoadState === 'ready' &&
      this.definitionLoadState === 'ready'
    );
  }

  private isAudioVideoCodingVariable(coding: CodingAsText): boolean {
    const id = coding.id?.toLowerCase() || '';
    const label = coding.label?.toLowerCase() || '';
    return (
      id.includes('audio') ||
      id.includes('video') ||
      label.includes('audio') ||
      label.includes('video')
    );
  }

  toggleCodingSort(field: 'id' | 'label') {
    if (this.codingSortField === field) {
      this.codingSortDir = this.codingSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.codingSortField = field;
      this.codingSortDir = 'asc';
    }
  }

  getCodingSortIndicator(field: 'id' | 'label'): string {
    if (this.codingSortField !== field) return '';
    return this.codingSortDir === 'asc' ? '↑' : '↓';
  }

  get filteredAllColumns() {
    let list = [...this.allColumns];
    if (this.columnFilterText) {
      const term = this.columnFilterText.toLowerCase();
      list = list.filter(
        (c) => c.label.toLowerCase().includes(term) || c.id.toLowerCase().includes(term),
      );
    }

    // Sort columns: selected/ordered ones first, then alphabetical
    return list.sort((a, b) => {
      const indexA = this.metadataSettings.order.indexOf(a.id);
      const indexB = this.metadataSettings.order.indexOf(b.id);

      // Both are in the custom order
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // Only A is in the order
      if (indexA !== -1) return -1;
      // Only B is in the order
      if (indexB !== -1) return 1;
      // Neither is in the order: alphabetical
      return a.label.localeCompare(b.label);
    });
  }

  get explorerStatusLabel(): string {
    switch (this.explorerUiStatus) {
      case 'DIRTY':
        return 'Ungespeichert';
      case 'SAVING':
        return 'Speichern läuft';
      case 'SAVED':
        return 'Gespeichert';
      case 'ERROR':
        return 'Fehler';
      default:
        return 'Unverändert';
    }
  }

  get filteredHistoryEntries(): ItemExplorerChangeLogEntry[] {
    const userNeedle = this.historyFilterUser.trim().toLowerCase();
    const typeNeedle = this.historyFilterType.trim().toLowerCase();
    const fromDate = this.historyFilterFrom ? new Date(`${this.historyFilterFrom}T00:00:00`) : null;
    const toDate = this.historyFilterTo ? new Date(`${this.historyFilterTo}T23:59:59.999`) : null;
    return this.historyEntries.filter((entry) => {
      const user = (entry.actorUsername || '').toLowerCase();
      const type = (entry.changeType || '').toLowerCase();
      const matchesUser = !userNeedle || user.includes(userNeedle);
      const matchesType = !typeNeedle || type.includes(typeNeedle);
      const entryDate = new Date(entry.createdAt);
      const matchesFrom = !fromDate || entryDate >= fromDate;
      const matchesTo = !toDate || entryDate <= toDate;
      return matchesUser && matchesType && matchesFrom && matchesTo;
    });
  }

  constructor(
    private api: ApiService,
    public sanitizer: DomSanitizer,
    private voudService: VoudService,
    private authService: AuthService,
    private pendingPersonalSessionStorage: PendingPersonalSessionStorageService,
    @Optional() private readonly previewLoader?: ItemExplorerPreviewLoader,
    @Optional() private readonly diagnostics?: ItemExplorerLoadDiagnostics,
  ) {
    this.initializePreviewSelectionPipeline();
  }

  get headerViewModel(): ItemExplorerHeaderViewModel {
    return this;
  }

  get tableViewModel(): ItemExplorerTableViewModel {
    return this;
  }

  get collectionsViewModel(): ItemExplorerCollectionsViewModel {
    return this;
  }

  get previewViewModel(): ItemExplorerPreviewViewModel {
    return this;
  }

  get codingDialogViewModel(): ItemExplorerCodingDialogViewModel {
    return this;
  }

  get metadataDrawerViewModel(): ItemExplorerMetadataDrawerViewModel {
    return this;
  }

  get uploadDialogsViewModel(): ItemExplorerUploadDialogsViewModel {
    return this;
  }

  get columnManagerDialogViewModel(): ItemExplorerColumnManagerDialogViewModel {
    return this;
  }

  get responseStateDialogsViewModel(): ItemExplorerResponseStateDialogsViewModel {
    return this;
  }

  get historyDialogViewModel(): ItemExplorerHistoryDialogViewModel {
    return this;
  }

  get draftDialogsViewModel(): ItemExplorerDraftDialogsViewModel {
    return this;
  }

  registerShellDom(port: ItemExplorerShellDomPort): void {
    this.shellDom = port;
  }

  unregisterShellDom(port: ItemExplorerShellDomPort): void {
    if (this.shellDom === port) this.shellDom = undefined;
  }

  registerTableDom(port: ItemExplorerTableDomPort): void {
    this.tableDom = port;
  }

  unregisterTableDom(port: ItemExplorerTableDomPort): void {
    if (this.tableDom === port) this.tableDom = undefined;
  }

  registerPlayerDom(port: ItemExplorerPlayerDomPort): void {
    this.playerDom = port;
    this.startPlayerIfReady();
  }

  unregisterPlayerDom(port: ItemExplorerPlayerDomPort): void {
    if (this.playerDom !== port) return;
    port.stopAutoResize();
    this.playerDom = undefined;
    this.playerFrameReady = false;
  }

  playerFrameChanged(hasFrame: boolean): void {
    if (!hasFrame) {
      this.playerFrameReady = false;
      return;
    }
    this.startPlayerIfReady();
  }

  setFilterText(value: string): void {
    this.filterText = value;
  }

  setColumnFilter(key: string, value: string): void {
    this.columnFilters[key] = value;
  }

  setPersonalColumnFilter(key: string, value: string): void {
    this.personalColumnFilters[key] = value;
  }

  setCodingSearchText(value: string): void {
    this.codingSearchText = value;
  }

  setHistoryFilter(
    key: 'historyFilterUser' | 'historyFilterType' | 'historyFilterFrom' | 'historyFilterTo',
    value: string,
  ): void {
    this[key] = value;
  }

  setSelectedPreviewTargetId(value: string): void {
    this.selectedPreviewTargetId = value;
  }

  setCustomPreviewTargetDraft(value: string): void {
    this.customPreviewTargetDraft = value;
  }

  setPagingMode(value: ItemExplorerFacade['pagingMode']): void {
    this.pagingMode = value;
  }

  setColumnFilterText(value: string): void {
    this.columnFilterText = value;
  }

  toggleCollectionDrawer(): void {
    this.showCollectionDrawer = !this.showCollectionDrawer;
  }

  setMetadataDrawerOpen(open: boolean): void {
    this.showMetadataDrawer = open;
  }

  closeUploadReport(reloadItems = false): void {
    this.showUploadReport = false;
    if (reloadItems) this.reloadItems();
  }

  closeUploadErrorDialog(): void {
    this.showErrorDialog = false;
  }

  init(acpId: string) {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this.acpId = acpId;
    this.breadcrumbs = [
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Explorer' },
    ];

    window.addEventListener('storage', this.authStorageListener);
    this.authSessionSubscription = this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncPersonalItemDataSession();
        this.syncItemCollectionSession();
      });

    // Check if user is ACP Manager
    this.checkUserRole();

    // Load feature config and metadata settings
    this.api
      .getAcpStartPage(this.acpId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          const fc = data?.featureConfig || {};
          this.enableTags = !!fc.enableItemListTags;
          this.availableTags = fc.availableTags || [];
          this.showAudioVideoCodingVariables = fc.showAudioVideoCodingVariables !== false;
          this.itemExplorerConditionalVisibilityEnabled =
            fc.enableItemExplorerConditionalVisibility === true;
          this.playerFocusHighlightEnabled = fc.enablePlayerFocusHighlight === true;
          this.itemExplorerPlayerTargetInfoEnabled = fc.showItemExplorerPlayerTargetInfo !== false;
          this.showOnlyItemsWithEmpiricalDifficulty =
            fc.showOnlyItemsWithEmpiricalDifficulty === true;
          this.itemSubIdLabel = String(fc.itemSubIdLabel || 'Sub-ID').trim() || 'Sub-ID';
          this.enablePersonalItemData = fc.enablePersonalItemData === true;
          this.enableItemCollections = fc.enableItemCollections === true;
          this.personalItemCategoryLabel =
            String(fc.personalItemCategoryLabel || 'Kompetenzstufe').trim() || 'Kompetenzstufe';
          this.personalItemCategoryValues = this.normalizeStringList(fc.personalItemCategoryValues);
          this.personalItemTagLabel =
            String(fc.personalItemTagLabel || 'Markierungen').trim() || 'Markierungen';
          this.personalItemTags = this.normalizePersonalItemTagConfig(fc.personalItemTags);
          // Explorer uses ACP-shared draft/published state instead of per-user preferences.
          this.persistUserPreferences = false;
          this.useServerPreferences = false;

          // Load metadata column settings
          this.metadataSettings = this.resolveMetadataSettings(fc);
          void this.reloadSharedExplorerStateAndItems();
          this.syncPersonalItemDataSession();
          this.syncItemCollectionSession();
          this.startPlayerIfReady();
        },
        error: (error) => {
          if (this.destroyed) return;
          console.error('Failed to load Item Explorer feature configuration', error);
          this.itemListError = 'Die Konfiguration des Item-Explorers konnte nicht geladen werden.';
          this.explorerUiStatus = 'ERROR';
        },
      });
  }

  // --- Reload Items ---
  reloadItems(
    onSettled?: (outcome: ItemListLoadOutcome) => void,
    expectedExplorerState?: ItemExplorerStateEnvelope,
  ) {
    const loadToken = ++this.itemListLoadToken;
    const timing = this.diagnostics?.start('item-list') || null;
    let settled = false;
    let outcome: ItemListLoadOutcome = 'error';
    const settle = () => {
      if (settled) return;
      settled = true;
      this.diagnostics?.finish(timing, { outcome });
      if (loadToken === this.itemListLoadToken) {
        this.clearItemListSlowTimer();
      }
      onSettled?.(outcome);
    };
    this.itemListError = '';
    this.itemListLoading = true;
    this.startItemListSlowTimer();

    // Load item list from .vomd files
    this.api
      .getFileItemList(this.acpId, {
        perspective: this.getPerspectiveForViewerRequests(),
      })
      .pipe(takeUntil(this.destroy$), finalize(settle))
      .subscribe({
        next: (result) => {
          if (loadToken !== this.itemListLoadToken) {
            outcome = 'superseded';
            settle();
            return;
          }
          if (!this.itemListMatchesCurrentExplorerState(result, expectedExplorerState)) {
            outcome = 'version-mismatch';
            this.itemListLoading = false;
            if (!onSettled) {
              void this.reloadSharedExplorerStateAndItems();
            }
            settle();
            return;
          }
          this.items = (result.items || []).map((item: ExplorerItem) => ({
            ...item,
            rowKey: item.rowKey || item.uuid || `${item.unitId}_${item.itemId}`,
            bookletOccurrences: Array.isArray(item.bookletOccurrences)
              ? item.bookletOccurrences
              : [],
          }));
          this.allColumns = this.getAvailableMetadataColumns(result.columns || []);
          this.columns = this.filterVisibleColumns(this.allColumns);
          this.itemSubIdLabel = String(result.subIdLabel || this.itemSubIdLabel).trim() || 'Sub-ID';
          this.hasPartialCredit = this.items.some((item) => !!item.subId);
          this.hydrateItemTagsFromItems();
          if (expectedExplorerState) {
            this.applySharedExplorerEnvelope(expectedExplorerState);
          } else {
            this.applyExplorerStateToItems();
          }
          this.hasEmpiricalDifficulty = this.items.some(
            (item: any) =>
              item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null,
          );
          this.reconcileMeanTaskDifficultyState();
          this.filteredItems = [...this.items];
          this.unitMetadataCache = result.unitMetadata || {};
          this.codingSchemeCache = result.codingSchemes || {};
          this.applyFilter(false); // re-apply current filters and sort
          if (this.enableItemCollections && this.collectionLoadState === 'loaded') {
            this.recalculateCollectionSummaries();
          }
          this.itemListLoading = false;
          outcome = 'loaded';
          settle();
        },
        error: (error) => {
          if (loadToken !== this.itemListLoadToken) {
            outcome = 'superseded';
            settle();
            return;
          }
          console.error('Failed to load explorer item list', error);
          this.itemListError =
            error?.status === 403
              ? this.getItemListAccessMessage()
              : 'Die Item-Liste konnte nicht geladen werden.';
          this.allColumns = [];
          this.columns = [];
          this.items = [];
          this.filteredItems = [];
          this.itemTags = {};
          this.hasEmpiricalDifficulty = false;
          this.hasMeanTaskDifficulty = false;
          this.hasPartialCredit = false;
          this.unitMetadataCache = {};
          this.codingSchemeCache = {};
          this.clearSelectedItem();
          this.itemListLoading = false;
          settle();
        },
      });
  }

  ngOnDestroy() {
    if (this.destroyed) return;
    if (this.personalDataSessionIdentity && this.pendingPersonalRowUpdates.size) {
      this.suspendPendingPersonalSession(this.personalDataSessionIdentity);
    }
    this.destroyed = true;
    this.itemListLoadToken += 1;
    this.unitLoadToken += 1;
    this.personalDataSessionVersion += 1;
    this.collectionSessionVersion += 1;
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('storage', this.authStorageListener);
    this.authSessionSubscription?.unsubscribe();
    this.authSessionSubscription = null;
    this.playerDom?.stopAutoResize();
    this.clearItemListSlowTimer();
    this.clearPreviewSlowTimer();
    this.cancelPlayerReadyTiming();
    this.previewLoader?.clear();
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    if (this.playerFrameRefreshTimeout) {
      clearTimeout(this.playerFrameRefreshTimeout);
      this.playerFrameRefreshTimeout = null;
    }
    if (this.personalSaveTimeout) {
      clearTimeout(this.personalSaveTimeout);
      this.personalSaveTimeout = null;
    }
    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }
    if (this.saveStatusResetTimeout) {
      clearTimeout(this.saveStatusResetTimeout);
      this.saveStatusResetTimeout = null;
    }
    this.personalDataSessionIdentity = null;
    this.collectionSessionIdentity = null;
    this.pendingPersonalRowUpdates.clear();
    this.resolvePersonalSaveWaiters(false);
    this.leaveWithChangesResolver?.(false);
    this.leaveWithChangesResolver = null;
    this.personalSaveInFlight = false;
    this.shellDom = undefined;
    this.tableDom = undefined;
    this.playerDom = undefined;
  }

  handleBeforeUnload(event: BeforeUnloadEvent) {
    const hasPendingSharedDraft = this.canPublishExplorer && this.hasPendingDraftChanges();
    if (!hasPendingSharedDraft && !this.hasPendingPersonalItemDataChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = true;
  }

  handleWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (lowerKey === 'escape' && this.closeTopmostOverlay()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && lowerKey === 's' && this.canPublishExplorer) {
      event.preventDefault();
      if (!this.hasModalOverlay()) {
        this.openSavePreviewDialog();
      }
      return;
    }

    if (this.hasModalOverlay()) {
      return;
    }

    if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.tableDom?.focusFilter();
    }
  }

  handleFullscreenChange() {
    this.isFullscreen = this.shellDom?.isFullscreen() ?? false;
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.hasPendingPersonalItemDataChanges()) {
      return this.savePersonalChangesBeforeLeaving();
    }
    return this.canDeactivateSharedExplorer();
  }

  private async savePersonalChangesBeforeLeaving(): Promise<boolean> {
    const saved = await this.flushPersonalItemDataSaveAndWait();
    if (!saved) return false;
    return this.canDeactivateSharedExplorer();
  }

  private canDeactivateSharedExplorer(): boolean | Promise<boolean> {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return true;
    }
    return this.confirmLeaveWithUnsavedChanges();
  }

  private getAvailableMetadataColumns(sourceColumns: MetadataColumn[]): MetadataColumn[] {
    const importedIds = new Set(IMPORTED_PARAMETER_COLUMNS.map((column) => column.id));
    const normalizedSourceColumns = sourceColumns.filter((column) => !importedIds.has(column.id));
    return [
      ...normalizedSourceColumns.map((column) => ({ ...column, kind: 'text' as const })),
      ...IMPORTED_PARAMETER_COLUMNS,
    ];
  }

  getMetadataColumnDisplayValue(item: ReadonlyExplorerItem, column: MetadataColumn): string {
    if (column.kind === 'booklet') {
      return (item.bookletOccurrences || []).map((occurrence) => occurrence.booklet).join(' | ');
    }
    if (column.kind === 'position') {
      return (item.bookletOccurrences || [])
        .map((occurrence) => String(occurrence.position))
        .join(' | ');
    }
    const value = this.getMetadataColumnRawValue(item, column);
    return value === undefined || value === null ? '' : String(value);
  }

  private getMetadataColumnRawValue(
    item: ReadonlyExplorerItem,
    column: MetadataColumn,
  ): string | number | undefined {
    switch (column.id) {
      case 'infit':
        return item.infit;
      case 'discrimination':
        return item.discrimination;
      case 'solutionRate':
        return item.solutionRate;
      case 'itemTimeSeconds':
        return item.itemTimeSeconds;
      case 'stimulusTimeSeconds':
        return item.stimulusTimeSeconds;
      case 'booklet':
        return item.bookletOccurrences?.[0]?.booklet;
      case 'bookletPosition':
        return item.bookletOccurrences?.length
          ? Math.min(...item.bookletOccurrences.map((occurrence) => occurrence.position))
          : undefined;
      default:
        return item.metadata[column.id];
    }
  }

  private syncItemCollectionSession() {
    const nextIdentity = this.enableItemCollections
      ? this.pendingPersonalSessionStorage.resolveIdentityFromToken(this.authService.getToken())
      : null;
    if (nextIdentity === this.collectionSessionIdentity) {
      if (nextIdentity && this.collectionLoadState === 'idle') {
        this.loadItemCollections();
      } else if (
        !nextIdentity &&
        this.enableItemCollections &&
        this.collectionLoadState === 'idle'
      ) {
        this.collectionLoadState = 'error';
        this.collectionError = 'Für persönliche Kollektionen ist eine Anmeldung erforderlich.';
      }
      return;
    }

    this.collectionSessionVersion += 1;
    this.collectionSessionIdentity = nextIdentity;
    this.itemCollections = [];
    this.activeCollectionId = null;
    this.collectionBusy = false;
    this.collectionError = '';
    this.collectionLoadState = 'idle';
    this.showCollectionDrawer = false;
    if (nextIdentity) {
      this.loadItemCollections();
    } else if (this.enableItemCollections) {
      this.collectionLoadState = 'error';
      this.collectionError = 'Für persönliche Kollektionen ist eine Anmeldung erforderlich.';
    }
  }

  private getItemCollectionSession(): { identity: string | null; version: number } {
    return {
      identity: this.collectionSessionIdentity,
      version: this.collectionSessionVersion,
    };
  }

  private isCurrentItemCollectionSession(session: {
    identity: string | null;
    version: number;
  }): boolean {
    return (
      session.identity !== null &&
      session.identity === this.collectionSessionIdentity &&
      session.version === this.collectionSessionVersion
    );
  }

  loadItemCollections(preserveError = false) {
    if (!this.enableItemCollections) return;
    const session = this.getItemCollectionSession();
    if (!session.identity) {
      this.collectionLoadState = 'error';
      this.collectionError = 'Für persönliche Kollektionen ist eine Anmeldung erforderlich.';
      return;
    }
    this.collectionLoadState = 'loading';
    if (!preserveError) this.collectionError = '';
    this.api
      .getItemCollections(this.acpId, this.getPerspectiveForViewerRequests())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payload) => {
          if (!this.isCurrentItemCollectionSession(session)) return;
          this.itemCollections = payload.collections || [];
          this.activeCollectionId = payload.activeCollectionId || null;
          this.collectionLoadState = 'loaded';
          if (!this.itemListLoading && !this.itemListError) {
            this.recalculateCollectionSummaries();
          }
        },
        error: (error) => {
          if (!this.isCurrentItemCollectionSession(session)) return;
          this.collectionLoadState = 'error';
          this.collectionError =
            error?.status === 401
              ? 'Für persönliche Kollektionen ist eine Anmeldung erforderlich.'
              : 'Kollektionen konnten nicht geladen werden.';
        },
      });
  }

  async createCollection(): Promise<ItemCollection | null> {
    if (this.collectionBusy) return null;
    const session = this.getItemCollectionSession();
    if (!session.identity) {
      this.collectionError = 'Für persönliche Kollektionen ist eine Anmeldung erforderlich.';
      return null;
    }
    this.collectionBusy = true;
    this.collectionError = '';
    const name =
      this.itemCollections.length === 0
        ? 'Meine Kollektion'
        : `Kollektion ${this.itemCollections.length + 1}`;
    try {
      const payload = await firstValueFrom(
        this.api.createItemCollection(this.acpId, name, this.getPerspectiveForViewerRequests()),
      );
      if (!this.isCurrentItemCollectionSession(session)) return null;
      this.applyItemCollectionsPayload(payload);
      return this.activeItemCollection;
    } catch {
      if (!this.isCurrentItemCollectionSession(session)) return null;
      this.collectionError = 'Die Kollektion konnte nicht erstellt werden.';
      return null;
    } finally {
      if (this.isCurrentItemCollectionSession(session)) this.collectionBusy = false;
    }
  }

  async activateCollection(collectionId: string | null) {
    if (this.collectionBusy) return;
    const session = this.getItemCollectionSession();
    if (!session.identity) return;
    this.collectionBusy = true;
    this.collectionError = '';
    try {
      const payload = await firstValueFrom(
        this.api.activateItemCollection(
          this.acpId,
          collectionId || null,
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.applyItemCollectionsPayload(payload);
    } catch {
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.collectionError = 'Die aktive Kollektion konnte nicht gespeichert werden.';
    } finally {
      if (this.isCurrentItemCollectionSession(session)) this.collectionBusy = false;
    }
  }

  isItemInActiveCollection(item: ReadonlyExplorerItem): boolean {
    return this.activeItemCollection?.rowKeys.includes(item.rowKey) === true;
  }

  async toggleItemInActiveCollection(item: ReadonlyExplorerItem) {
    let collection = this.activeItemCollection;
    if (!collection) collection = await this.createCollection();
    if (!collection) return;
    const nextRowKeys = collection.rowKeys.includes(item.rowKey)
      ? collection.rowKeys.filter((rowKey) => rowKey !== item.rowKey)
      : [...collection.rowKeys, item.rowKey];
    await this.persistActiveCollectionRows(nextRowKeys);
  }

  async removeRowFromActiveCollection(rowKey: string) {
    const collection = this.activeItemCollection;
    if (!collection) return;
    await this.persistActiveCollectionRows(
      collection.rowKeys.filter((candidate) => candidate !== rowKey),
    );
  }

  async clearActiveCollection() {
    if (!this.activeItemCollection?.rowKeys.length) return;
    await this.persistActiveCollectionRows([]);
  }

  async renameActiveCollection() {
    const collection = this.activeItemCollection;
    if (!collection || this.collectionBusy) return;
    const name = window.prompt('Name der Kollektion', collection.name)?.trim();
    if (!name || name === collection.name) return;
    await this.persistActiveCollectionUpdate({ name });
  }

  async deleteActiveCollection() {
    const collection = this.activeItemCollection;
    if (!collection || this.collectionBusy) return;
    if (!window.confirm(`Kollektion „${collection.name}“ löschen?`)) return;
    const session = this.getItemCollectionSession();
    if (!session.identity) return;
    this.collectionBusy = true;
    this.collectionError = '';
    try {
      const payload = await firstValueFrom(
        this.api.deleteItemCollection(
          this.acpId,
          collection.id,
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.applyItemCollectionsPayload(payload);
      if (!this.activeItemCollection) this.showCollectionDrawer = false;
    } catch {
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.collectionError = 'Die Kollektion konnte nicht gelöscht werden.';
    } finally {
      if (this.isCurrentItemCollectionSession(session)) this.collectionBusy = false;
    }
  }

  async exportActiveCollection() {
    const collection = this.activeItemCollection;
    if (!collection || this.collectionBusy) return;
    const session = this.getItemCollectionSession();
    if (!session.identity) return;
    this.collectionBusy = true;
    this.collectionError = '';
    try {
      const blob = await firstValueFrom(
        this.api.exportItemCollectionCsv(
          this.acpId,
          collection.id,
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (!this.isCurrentItemCollectionSession(session)) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `item-collection-${collection.id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.collectionError = 'Die Kollektion konnte nicht exportiert werden.';
    } finally {
      if (this.isCurrentItemCollectionSession(session)) this.collectionBusy = false;
    }
  }

  formatDuration(rawSeconds: number): string {
    const seconds = Math.max(0, Math.round(Number(rawSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  private async persistActiveCollectionRows(rowKeys: string[]) {
    await this.persistActiveCollectionUpdate({ rowKeys });
  }

  private async persistActiveCollectionUpdate(update: { name?: string; rowKeys?: string[] }) {
    const collection = this.activeItemCollection;
    if (!collection || this.collectionBusy) return;
    const session = this.getItemCollectionSession();
    if (!session.identity) return;
    const previous = structuredClone(collection);
    if (update.name !== undefined) collection.name = update.name;
    if (update.rowKeys !== undefined) collection.rowKeys = [...update.rowKeys];
    this.recalculateCollectionSummaries();
    this.collectionBusy = true;
    this.collectionError = '';
    try {
      const payload = await firstValueFrom(
        this.api.updateItemCollection(
          this.acpId,
          collection.id,
          { baseVersion: previous.version, ...update },
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (!this.isCurrentItemCollectionSession(session)) return;
      this.applyItemCollectionsPayload(payload);
    } catch (error: any) {
      if (!this.isCurrentItemCollectionSession(session)) return;
      const index = this.itemCollections.findIndex((candidate) => candidate.id === previous.id);
      if (index >= 0) this.itemCollections[index] = previous;
      this.collectionError =
        error?.status === 409
          ? 'Die Kollektion wurde parallel geändert und wird neu geladen.'
          : 'Die Kollektion konnte nicht gespeichert werden.';
      if (error?.status === 409) this.loadItemCollections(true);
    } finally {
      if (this.isCurrentItemCollectionSession(session)) this.collectionBusy = false;
    }
  }

  private applyItemCollectionsPayload(payload: {
    activeCollectionId: string | null;
    collections: ItemCollection[];
  }) {
    this.itemCollections = payload.collections || [];
    this.activeCollectionId = payload.activeCollectionId || null;
    this.collectionLoadState = 'loaded';
    if (!this.itemListLoading && !this.itemListError) {
      this.recalculateCollectionSummaries();
    }
  }

  private recalculateCollectionSummaries() {
    const itemMap = new Map(this.items.map((item) => [item.rowKey, item] as const));
    this.itemCollections = this.itemCollections.map((collection) => {
      const items = collection.rowKeys
        .map((rowKey) => itemMap.get(rowKey))
        .filter((item): item is ExplorerItem => Boolean(item));
      return {
        ...collection,
        unavailableRowKeys: collection.rowKeys.filter((rowKey) => !itemMap.has(rowKey)),
        summary: this.calculateCollectionSummary(items, collection.rowKeys.length),
      };
    });
  }

  private calculateCollectionSummary(
    items: ExplorerItem[],
    selectedRowCount = items.length,
  ): ItemCollectionSummary {
    const itemsByUuid = new Map<string, ExplorerItem[]>();
    const itemsByUnit = new Map<string, ExplorerItem[]>();
    items.forEach((item) => {
      itemsByUuid.set(item.uuid, [...(itemsByUuid.get(item.uuid) || []), item]);
      itemsByUnit.set(item.unitId, [...(itemsByUnit.get(item.unitId) || []), item]);
    });
    let itemTimeSeconds = 0;
    let stimulusTimeSeconds = 0;
    let missingItemTimeCount = 0;
    let missingStimulusTimeUnitCount = 0;
    itemsByUuid.forEach((rows) => {
      const value = rows.map((row) => row.itemTimeSeconds).find((time) => Number.isFinite(time));
      if (value === undefined) missingItemTimeCount += 1;
      else itemTimeSeconds += value;
    });
    itemsByUnit.forEach((rows) => {
      const value = rows
        .map((row) => row.stimulusTimeSeconds)
        .find((time) => Number.isFinite(time));
      if (value === undefined) missingStimulusTimeUnitCount += 1;
      else stimulusTimeSeconds += value;
    });
    return {
      rowCount: selectedRowCount,
      itemCount: itemsByUuid.size,
      unitCount: itemsByUnit.size,
      itemTimeSeconds,
      stimulusTimeSeconds,
      testTimeSeconds: itemTimeSeconds + stimulusTimeSeconds,
      missingItemTimeCount,
      missingStimulusTimeUnitCount,
      complete: missingItemTimeCount === 0 && missingStimulusTimeUnitCount === 0,
    };
  }

  // --- Filtering ---
  applyFilter(shouldPersist = true) {
    const term = this.filterText.toLowerCase();

    this.filteredItems = this.items.filter((item) => {
      if (!this.isItemVisibleByBaseRules(item)) {
        return false;
      }

      return this.matchesActiveItemFilters(item, term);
    });

    this.applySort(false);
    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  isItemExcluded(item?: ReadonlyExplorerItem | null): boolean {
    return item?.excluded === true;
  }

  private isItemVisibleByBaseRules(item: ExplorerItem): boolean {
    if (!this.showExcludedItems && this.isItemExcluded(item)) {
      return false;
    }

    if (
      this.showOnlyItemsWithEmpiricalDifficulty &&
      this.hasEmpiricalDifficulty &&
      (item.empiricalDifficulty === undefined || item.empiricalDifficulty === null)
    ) {
      return false;
    }

    return true;
  }

  private matchesActiveItemFilters(item: ExplorerItem, term: string): boolean {
    // 1. Global Filter
    if (term) {
      const matchesGlobal =
        (item.unitId + item.itemId).toLowerCase().includes(term) ||
        String(item.subId || '')
          .toLowerCase()
          .includes(term) ||
        String(item.subIdDisplay || '')
          .toLowerCase()
          .includes(term) ||
        item.unitLabel.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        Object.values(item.metadata).some((val) => val && val.toLowerCase().includes(term)) ||
        IMPORTED_PARAMETER_COLUMNS.some((column) =>
          this.getMetadataColumnDisplayValue(item, column).toLowerCase().includes(term),
        );
      if (!matchesGlobal) return false;
    }

    const bookletFilter = (this.columnFilters['booklet'] || '').trim().toLowerCase();
    const positionFilter = (this.columnFilters['bookletPosition'] || '').trim();
    if (bookletFilter || positionFilter) {
      const matchesOccurrence = (item.bookletOccurrences || []).some((occurrence) => {
        const matchesBooklet =
          !bookletFilter || occurrence.booklet.toLowerCase().includes(bookletFilter);
        const matchesPosition =
          !positionFilter || matchesNumericFilter(occurrence.position, positionFilter);
        return matchesBooklet && matchesPosition;
      });
      if (!matchesOccurrence) return false;
    }

    // 2. Column Filters
    for (const [colId, filterValue] of Object.entries(this.columnFilters)) {
      if (!filterValue) continue;
      const subTerm = filterValue.toLowerCase();

      if (colId === 'itemId') {
        const combined = (item.unitId + item.itemId).toLowerCase();
        if (!combined.includes(subTerm)) return false;
      } else if (colId === 'unitLabel') {
        if (!item.unitLabel.toLowerCase().includes(subTerm)) return false;
      } else if (colId === 'subId') {
        const subIdValue = `${item.subId || ''} ${item.subIdDisplay || ''}`.toLowerCase();
        if (!subIdValue.includes(subTerm)) return false;
      } else if (colId === 'tags') {
        const tags = this.itemTags[item.rowKey] || [];
        if (!tags.some((t) => t.toLowerCase().includes(subTerm))) return false;
      } else if (colId === 'empiricalDifficulty') {
        if (item.empiricalDifficulty === undefined || item.empiricalDifficulty === null)
          return false;
        if (!matchesNumericFilter(item.empiricalDifficulty, filterValue)) return false;
      } else if (colId === 'meanTaskDifficulty') {
        if (item.meanTaskDifficulty === undefined || item.meanTaskDifficulty === null) return false;
        if (!matchesNumericFilter(item.meanTaskDifficulty, filterValue)) return false;
      } else if (colId === 'booklet' || colId === 'bookletPosition') {
        continue;
      } else {
        const column = this.allColumns.find((candidate) => candidate.id === colId);
        if (column?.kind === 'number') {
          const value = this.getMetadataColumnRawValue(item, column);
          if (typeof value !== 'number' || !matchesNumericFilter(value, filterValue)) {
            return false;
          }
        } else {
          const val = column
            ? this.getMetadataColumnDisplayValue(item, column)
            : item.metadata[colId] || '';
          if (!val.toLowerCase().includes(subTerm)) return false;
        }
      }
    }

    if (this.showPersonalItemData) {
      const categoryFilter = (this.personalColumnFilters['personalCategory'] || '').toLowerCase();
      const tagFilter = (this.personalColumnFilters['personalTags'] || '').toLowerCase();
      const noteFilter = (this.personalColumnFilters['personalNote'] || '').toLowerCase();
      const row = this.personalItemData[item.rowKey];
      if (categoryFilter && !(row?.category || '').toLowerCase().includes(categoryFilter)) {
        return false;
      }
      if (tagFilter && !(row?.tags || []).some((tag) => tag.toLowerCase().includes(tagFilter))) {
        return false;
      }
      if (noteFilter && !(row?.note || '').toLowerCase().includes(noteFilter)) {
        return false;
      }
    }

    return true;
  }

  toggleShowExcludedItems() {
    this.showExcludedItems = !this.showExcludedItems;
    this.applyFilter(false);
  }

  async toggleFullscreen(): Promise<void> {
    this.isFullscreen = (await this.shellDom?.toggleFullscreen()) ?? false;
  }

  toggleSelectedItemExclusion() {
    if (!this.canEditExplorer || !this.selectedItem) {
      return;
    }

    const item = this.selectedItem;
    const nextExcluded = !this.isItemExcluded(item);
    this.updateItemExclusion(item, nextExcluded);
    this.applyFilter(false);
  }

  // --- Sorting ---
  onTableKeydown(event: KeyboardEvent) {
    if (this.filteredItems.length === 0) {
      return;
    }

    const hasModifier = event.ctrlKey || event.metaKey;
    if (hasModifier && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelectedItem(-1);
      return;
    }
    if (hasModifier && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelectedItem(1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(1), true);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(-1), true);
        return;
      case 'Home':
        event.preventDefault();
        this.selectFilteredItemAt(0, true);
        return;
      case 'End':
        event.preventDefault();
        this.selectFilteredItemAt(this.filteredItems.length - 1, true);
        return;
      case 'PageDown':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(this.listPageSize), true);
        return;
      case 'PageUp':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(-this.listPageSize), true);
        return;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(0), true);
        return;
      default:
        return;
    }
  }

  sortBy(field: string) {
    if (this.sortField === field && !this.sortIsMeta) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortIsMeta = false;
      this.sortDir = 'asc';
    }
    this.applySort();
  }

  sortByMeta(colId: string) {
    if (this.sortField === colId && this.sortIsMeta) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = colId;
      this.sortIsMeta = true;
      this.sortDir = 'asc';
    }
    this.applySort();
  }

  private applySort(shouldPersist = true) {
    if (this.sortField === '__manual__') {
      const rank = new Map<string, number>();
      this.itemOrder.forEach((entry, idx) => rank.set(entry, idx));
      this.filteredItems.sort((a, b) => {
        const posA = rank.get(this.getStableRowKey(a)) ?? Number.MAX_SAFE_INTEGER;
        const posB = rank.get(this.getStableRowKey(b)) ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });
      this.syncSelectionAfterListMutation();
      if (shouldPersist) {
        this.saveUiPreferences();
      }
      return;
    }

    this.filteredItems.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (this.sortIsMeta) {
        const column = this.allColumns.find((candidate) => candidate.id === this.sortField);
        aVal = column ? this.getMetadataColumnRawValue(a, column) : a.metadata[this.sortField];
        bVal = column ? this.getMetadataColumnRawValue(b, column) : b.metadata[this.sortField];
      } else if (
        this.sortField === 'empiricalDifficulty' ||
        this.sortField === 'meanTaskDifficulty'
      ) {
        aVal =
          this.sortField === 'empiricalDifficulty' ? a.empiricalDifficulty : a.meanTaskDifficulty;
        bVal =
          this.sortField === 'empiricalDifficulty' ? b.empiricalDifficulty : b.meanTaskDifficulty;
      } else {
        aVal = (a as any)[this.sortField] || '';
        bVal = (b as any)[this.sortField] || '';
      }

      const aMissing = aVal === undefined || aVal === null || aVal === '';
      const bMissing = bVal === undefined || bVal === null || bVal === '';
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      const primaryCmp = this.compareSortValues(aVal, bVal, this.sortDir);
      if (primaryCmp !== 0) {
        return primaryCmp;
      }

      if (!this.sortIsMeta && this.sortField === 'unitLabel') {
        const unitCmp = this.compareSortText(a.unitId, b.unitId);
        if (unitCmp !== 0) {
          return unitCmp;
        }
        const itemCmp = this.compareSortText(a.itemId, b.itemId);
        if (itemCmp !== 0) {
          return itemCmp;
        }
        return this.compareSortText(a.subIdDisplay, b.subIdDisplay);
      }

      return 0;
    });

    this.syncSelectionAfterListMutation();

    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  private compareSortValues(aVal: unknown, bVal: unknown, direction: 'asc' | 'desc'): number {
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const cmp = this.compareSortText(aVal, bVal);
    return direction === 'asc' ? cmp : -cmp;
  }

  private compareSortText(aVal: unknown, bVal: unknown): number {
    return String(aVal ?? '')
      .toLowerCase()
      .localeCompare(String(bVal ?? '').toLowerCase(), undefined, { numeric: true });
  }

  // --- CSV Upload Handling ---
  getUploadSuccessFieldSummary(success: ReadonlyItemParameterUploadSuccess): string {
    const fields = Array.isArray(success.fields) ? success.fields : [];
    const labels = fields.map((field) => UPLOAD_FIELD_LABELS[field] || field);
    const difficultyIndex = fields.findIndex(
      (field) => field === 'est' || field === 'empiricalDifficulty',
    );

    if (success.value !== undefined && success.value !== null) {
      const valueLabel = `Empirische Itemschwierigkeit: ${success.value}`;
      if (difficultyIndex >= 0) labels[difficultyIndex] = valueLabel;
      else labels.unshift(valueLabel);
    }

    const hasBookletUpdate =
      fields.includes('booklet') ||
      fields.includes('position') ||
      Array.isArray(success.bookletOccurrences);
    if (hasBookletUpdate) {
      const withoutSeparateBookletFields = labels.filter(
        (label) => label !== 'Booklet' && label !== 'Position im Booklet',
      );
      withoutSeparateBookletFields.push(
        success.bookletOccurrences?.length ? 'Booklet / Position' : 'Booklet / Position gelöscht',
      );
      return [...new Set(withoutSeparateBookletFields)].join(', ') || '–';
    }

    return [...new Set(labels)].join(', ') || '–';
  }

  getUploadSuccessBookletSummary(success: ReadonlyItemParameterUploadSuccess): string {
    if (!Array.isArray(success.bookletOccurrences)) {
      return '–';
    }
    if (!success.bookletOccurrences.length) return 'Gelöscht';

    return success.bookletOccurrences
      .map((occurrence) => `${occurrence.booklet} / ${occurrence.position}`)
      .join(' | ');
  }

  onCsvFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.isUploading = true;
    this.api
      .uploadItemParameters(this.acpId, file, {
        draft: true,
        baseVersion: this.explorerVersion,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.isUploading = false;
          this.uploadResult = result;
          this.showUploadReport = true;
          if (typeof result.showOnlyItemsWithEmpiricalDifficulty === 'boolean') {
            this.showOnlyItemsWithEmpiricalDifficulty = result.showOnlyItemsWithEmpiricalDifficulty;
          }
          if (result.explorerState) {
            this.applySharedExplorerEnvelope(result.explorerState, true);
          }
          this.reloadItems();
        },
        error: (err) => {
          console.error(err);
          this.isUploading = false;
          if (err?.status === 409) {
            this.errorMessage =
              'Konflikt beim Speichern des Entwurfs. Der Explorer wurde neu geladen.';
            void this.reloadSharedExplorerStateAndItems();
          } else {
            this.errorMessage =
              err.error?.message ||
              'Fehler beim Hochladen der CSV-Datei. Bitte prüfe die Spalte "item" und die unterstützten Itemparameter.';
          }
          this.showErrorDialog = true;
        },
      });

    input.value = ''; // reset input
  }

  openClearEmpiricalDifficultiesDialog() {
    this.rememberFocusBeforeOverlay();
    this.showClearEmpiricalDifficultiesDialog = true;
    this.clearEmpiricalDifficultiesBusy = false;
    this.clearEmpiricalDifficultiesError = '';
  }

  closeClearEmpiricalDifficultiesDialog() {
    if (this.clearEmpiricalDifficultiesBusy) return;
    this.showClearEmpiricalDifficultiesDialog = false;
    this.clearEmpiricalDifficultiesError = '';
    this.restoreFocusAfterOverlayClose();
  }

  confirmClearEmpiricalDifficulties() {
    if (this.clearEmpiricalDifficultiesBusy) return;
    this.clearEmpiricalDifficultiesBusy = true;
    this.clearEmpiricalDifficultiesError = '';
    this.lastDraftOperationError = '';

    this.api
      .clearEmpiricalDifficulties(this.acpId, {
        draft: true,
        baseVersion: this.explorerVersion,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.explorerState) {
            this.applySharedExplorerEnvelope(result.explorerState, true);
          }
          this.reloadItems();
          this.clearEmpiricalDifficultiesBusy = false;
          this.closeClearEmpiricalDifficultiesDialog();
        },
        error: (err) => {
          console.error(err);
          this.clearEmpiricalDifficultiesBusy = false;
          if (err?.status === 409) {
            this.clearEmpiricalDifficultiesError =
              'Konflikt beim Speichern des Entwurfs. Der Explorer wurde neu geladen.';
            this.lastDraftOperationError = this.clearEmpiricalDifficultiesError;
            void this.reloadSharedExplorerStateAndItems();
            return;
          }
          this.clearEmpiricalDifficultiesError =
            err?.error?.message || 'Fehler beim Löschen der Itemschwierigkeiten.';
          this.lastDraftOperationError = this.clearEmpiricalDifficultiesError;
        },
      });
  }

  openRenumberDialog() {
    if (this.isRenumberingBlocked()) return;
    this.rememberFocusBeforeOverlay();
    this.showRenumberDialog = true;
    this.renumberBusy = false;
    this.renumberError = '';
    this.numberingSuccessMessage = '';
  }

  closeRenumberDialog() {
    if (this.renumberBusy) return;
    this.showRenumberDialog = false;
    this.renumberError = '';
    this.restoreFocusAfterOverlayClose();
  }

  confirmRenumber() {
    if (this.renumberBusy) return;
    if (this.isRenumberingBlocked()) {
      this.renumberError = this.getRenumberingBlockedMessage();
      return;
    }
    this.renumberBusy = true;
    this.renumberError = '';

    this.api
      .recalculateItemRowNumbers(this.acpId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const count = Number(result?.renumberedCount) || 0;
          this.renumberBusy = false;
          this.closeRenumberDialog();
          this.numberingSuccessMessage =
            count === 1
              ? 'Eine Zeile wurde neu nummeriert.'
              : `${count} Zeilen wurden neu nummeriert.`;
          this.reloadItems();
        },
        error: (error) => {
          console.error('Failed to recalculate item row numbers', error);
          this.renumberBusy = false;
          this.renumberError =
            error?.error?.message || 'Die Nummerierung konnte nicht neu berechnet werden.';
          if (error?.status === 409) {
            void this.reloadSharedExplorerStateAndItems();
          }
        },
      });
  }

  isRenumberingBlocked(): boolean {
    return (
      !this.latestExplorerState ||
      this.perspectiveSwitchBusy ||
      this.itemListLoading ||
      this.hasPendingDraftChanges() ||
      this.explorerUiStatus === 'SAVING'
    );
  }

  getRenumberingActionTitle(): string {
    return this.isRenumberingBlocked()
      ? this.getRenumberingBlockedMessage()
      : 'Stabile Zeilennummerierung neu berechnen';
  }

  private getRenumberingBlockedMessage(): string {
    if (!this.latestExplorerState) {
      return 'Bitte warten Sie, bis der Explorer-Status geladen wurde.';
    }
    if (this.perspectiveSwitchBusy) {
      return 'Bitte warten Sie, bis der Ansichtswechsel abgeschlossen wurde.';
    }
    if (this.itemListLoading) {
      return 'Bitte warten Sie, bis die Item-Liste geladen wurde.';
    }
    return this.explorerUiStatus === 'SAVING'
      ? 'Bitte warten Sie, bis die Explorer-Änderungen gespeichert wurden.'
      : 'Bitte speichern oder verwerfen Sie den Entwurf, bevor Sie neu nummerieren.';
  }

  getSortIndicator(field: string): string {
    if (this.sortField !== field || this.sortIsMeta) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  getMetaSortIndicator(colId: string): string {
    if (this.sortField !== colId || !this.sortIsMeta) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  resetPlayer() {
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    this.playerSrcDoc = null;
    this.unit = null;
    this.definitionContent = null;
    this.playerFrameReady = false;
    this.responseStateReady = false;
    this.activePlayerSessionId = null;
    this.previewUnavailableReason = '';
    this.playerHtmlLoadState = 'idle';
    this.definitionLoadState = 'idle';
    this.playerFrameRefreshPending = false;
    this.previewUserFacingMessage = '';
    this.previewUpdateInProgress = false;
  }

  private startItemListSlowTimer(): void {
    this.clearItemListSlowTimer();
    this.itemListSlowTimer = setTimeout(() => {
      this.itemListSlowTimer = null;
      this.itemListSlow = true;
    }, 1500);
  }

  private clearItemListSlowTimer(): void {
    if (this.itemListSlowTimer) {
      clearTimeout(this.itemListSlowTimer);
      this.itemListSlowTimer = null;
    }
    this.itemListSlow = false;
  }

  private startPreviewSlowTimer(phase: string): void {
    this.clearPreviewSlowTimer();
    this.previewLoadPhase = phase;
    this.previewSlowTimer = setTimeout(() => {
      this.previewSlowTimer = null;
      this.previewSlow = true;
    }, 1500);
  }

  private clearPreviewSlowTimer(): void {
    if (this.previewSlowTimer) {
      clearTimeout(this.previewSlowTimer);
      this.previewSlowTimer = null;
    }
    this.previewSlow = false;
    this.previewLoadPhase = '';
  }

  private cancelPlayerReadyTiming(): void {
    if (!this.playerReadyTiming) return;
    this.diagnostics?.finish(this.playerReadyTiming, { outcome: 'cancelled' });
    this.playerReadyTiming = null;
  }

  // --- Item Selection ---
  selectItem(readonlyItem: ReadonlyExplorerItem, index: number) {
    const item = readonlyItem as ExplorerItem;
    item.rowKey = this.getStableRowKey(item);
    if (
      this.selectedItem &&
      this.getStableRowKey(this.selectedItem) === this.getStableRowKey(item)
    ) {
      this.selectedIndex = index;
      return;
    }

    this.cancelPlayerReadyTiming();
    const reuseLoadedUnit =
      this.unit?.id === item.unitId &&
      this.playerHtmlLoadState === 'ready' &&
      this.definitionLoadState === 'ready' &&
      !!this.playerSrcDoc &&
      !!this.definitionContent;
    this.selectedItem = item;
    this.selectedIndex = index;
    if (!reuseLoadedUnit) {
      this.resetPlayer();
    }
    this.currentPage = 1;
    this.totalPages = 1;
    this.loadingUnit = !reuseLoadedUnit;
    const token = ++this.unitLoadToken;
    const selectionTiming = this.diagnostics?.start('item-selection-total') || null;
    this.previewUpdateInProgress = reuseLoadedUnit;
    this.startPreviewSlowTimer(
      reuseLoadedUnit ? 'gespeicherter Zustand' : 'Aufgabendaten, Player und Definition',
    );

    // Reset response state flags
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.currentResponseData = null;
    this.responseStateReady = false;
    this.activePlayerSessionId = null;
    this.previewUnavailableReason = '';

    // Load unit metadata and coding scheme from cache
    this.currentUnitMetadata = this.unitMetadataCache[item.unitId] || [];
    this.currentCodingScheme = this.codingSchemeCache[item.unitId] || null;
    if (this.currentCodingScheme) {
      const codings = Array.isArray(this.currentCodingScheme)
        ? this.currentCodingScheme
        : this.currentCodingScheme.variableCodings || [];
      this.currentCodingSchemeAsText = this.createCodingSchemeAsText(codings);
    } else {
      this.currentCodingSchemeAsText = null;
    }
    this.syncPreviewTargetResolution(item);

    if (!this.canPreviewItem(item)) {
      this.previewSelection$.next(null);
      this.loadingUnit = false;
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      this.previewUpdateInProgress = false;
      this.clearPreviewSlowTimer();
      this.diagnostics?.finish(selectionTiming, { outcome: 'missing-target' });
      return;
    }

    if (this.previewLoader) {
      this.previewSelection$.next({
        item,
        token,
        reuseLoadedUnit,
        timing: selectionTiming,
      });
    } else {
      this.loadPreviewContext(item, token);
    }
  }

  private initializePreviewSelectionPipeline(): void {
    if (!this.previewLoader) return;

    this.previewSelection$
      .pipe(
        switchMap((request) => {
          if (!request) return EMPTY;

          let selectionOutcome = 'cancelled';
          const responseTiming = this.diagnostics?.start('response-state') || null;
          let responseOutcome = 'cancelled';
          const responseState$ = this.createResponseStateRequest(request.item).pipe(
            tap(() => {
              responseOutcome = 'loaded';
            }),
            catchError(() => {
              responseOutcome = 'error';
              return of(null);
            }),
            finalize(() => {
              this.diagnostics?.finish(responseTiming, { outcome: responseOutcome });
            }),
          );
          const assets$ = request.reuseLoadedUnit
            ? of({
                unit: this.unit,
                playerHtml: null,
                definition: null,
                cacheStatus: 'hit' as const,
              })
            : this.previewLoader!.load(
                this.acpId,
                this.getPerspectiveForViewerRequests(),
                request.item.unitId,
              );

          return forkJoin({ assets: assets$, responseState: responseState$ }).pipe(
            map((result) => {
              selectionOutcome = 'loaded';
              return { request, ...result, error: null };
            }),
            catchError((error) => {
              selectionOutcome = 'error';
              return of({
                request,
                assets: null,
                responseState: null,
                error,
              });
            }),
            finalize(() => {
              this.diagnostics?.finish(request.timing, { outcome: selectionOutcome });
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((result) => {
        const { request } = result;
        if (request.token !== this.unitLoadToken || this.destroyed) return;

        this.clearPreviewSlowTimer();
        this.loadingUnit = false;
        this.previewUpdateInProgress = false;

        if (result.error || !result.assets) {
          this.playerHtmlLoadState = 'error';
          this.definitionLoadState = 'error';
          this.previewUserFacingMessage =
            (result.error as any)?.status === 403
              ? this.getUnitViewAccessMessage()
              : 'Die Aufgaben-Vorschau konnte nicht geladen werden.';
          this.previewUnavailableReason = this.previewUserFacingMessage;
          return;
        }

        if (!request.reuseLoadedUnit) {
          this.applyPreviewAssets(result.assets);
        }
        this.applyResponseStateResult(result.responseState);
        this.responseStateReady = true;
        this.playerReadyTiming =
          this.playerHtmlLoadState === 'ready' && this.definitionLoadState === 'ready'
            ? this.diagnostics?.start('player-ready') || null
            : null;
        this.startPlayerIfReady();
      });
  }

  private createResponseStateRequest(item: ExplorerItem) {
    const itemList = this.filteredItems.map((candidate) => ({
      itemId: candidate.itemId,
      unitId: candidate.unitId,
      rowKey: this.getStableRowKey(candidate),
    }));
    return item.rowKey
      ? this.api.getResponseStateWithFallback(
          this.acpId,
          item.itemId,
          item.unitId,
          itemList,
          item.rowKey,
        )
      : this.api.getResponseStateWithFallback(this.acpId, item.itemId, item.unitId, itemList);
  }

  private applyPreviewAssets(assets: ItemExplorerPreviewAssets): void {
    this.unit = assets.unit;
    if (!assets.unit) {
      this.playerHtmlLoadState = 'missing';
      this.definitionLoadState = 'missing';
      this.playerSrcDoc = null;
      this.definitionContent = null;
      return;
    }

    if (assets.playerHtml === null) {
      this.playerHtmlLoadState = 'missing';
      this.playerSrcDoc = null;
    } else {
      this.playerHtmlLoadState = 'ready';
      this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(
        rewriteGeoGebraAssetUrls(assets.playerHtml),
      );
    }

    if (assets.definition === null) {
      this.definitionLoadState = 'missing';
      this.definitionContent = null;
    } else {
      this.definitionLoadState = 'ready';
      this.definitionContent = assets.definition;
    }
  }

  private applyResponseStateResult(result: any): void {
    if (result?.state?.responseData && Object.keys(result.state.responseData).length > 0) {
      this.currentResponseData = result.state.responseData;
      this.hasResponseState = true;
      this.isFallbackState = !!result.isFallback;
      return;
    }

    this.currentResponseData = null;
    this.hasResponseState = false;
    this.isFallbackState = false;
  }

  // --- Response State ---
  private loadPreviewContext(item: ExplorerItem, token: number) {
    this.loadingUnit = true;
    this.playerHtmlLoadState = 'idle';
    this.definitionLoadState = 'idle';
    this.loadResponseStateForItem(item, token);

    this.api
      .getFileUnitView(this.acpId, item.unitId, {
        perspective: this.getPerspectiveForViewerRequests(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (u: any) => {
          if (token !== this.unitLoadToken) return;
          this.unit = u;
          this.loadingUnit = false;

          if (!u) {
            this.playerHtmlLoadState = 'missing';
            this.definitionLoadState = 'missing';
            return;
          }

          const deps = (u.dependencies || []).map((d: any) => ({
            ...d,
            downloadUrl: this.api.appendAuthToken(d.downloadUrl),
          }));
          u.dependencies = deps;
          this.playerHtmlLoadState = 'loading';
          this.definitionLoadState = 'loading';
          this.loadPlayerHtml(deps, token);
          this.loadDefinition(deps, token);
        },
        error: (error) => {
          if (token !== this.unitLoadToken) return;
          this.loadingUnit = false;
          this.playerHtmlLoadState = 'error';
          this.definitionLoadState = 'error';
          this.previewUserFacingMessage =
            error?.status === 403
              ? this.getUnitViewAccessMessage()
              : 'Die Aufgaben-Vorschau konnte nicht geladen werden.';
          this.previewUnavailableReason = this.previewUserFacingMessage;
        },
      });
  }

  private loadResponseStateForItem(item: ExplorerItem, token: number) {
    // Build item list from filteredItems for fallback lookup
    const itemList = this.filteredItems.map((i) => ({
      itemId: i.itemId,
      unitId: i.unitId,
      rowKey: this.getStableRowKey(i),
    }));
    const responseStateRequest = item.rowKey
      ? this.api.getResponseStateWithFallback(
          this.acpId,
          item.itemId,
          item.unitId,
          itemList,
          item.rowKey,
        )
      : this.api.getResponseStateWithFallback(this.acpId, item.itemId, item.unitId, itemList);

    responseStateRequest.pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        if (token !== this.unitLoadToken) return;
        if (
          result.state &&
          result.state.responseData &&
          Object.keys(result.state.responseData).length > 0
        ) {
          this.currentResponseData = result.state.responseData;
          this.hasResponseState = true;
          this.isFallbackState = result.isFallback;
        } else {
          // No state available (direct or fallback)
          this.currentResponseData = null;
          this.hasResponseState = false;
          this.isFallbackState = false;
        }
        this.responseStateReady = true;
        this.startPlayerIfReady();
      },
      error: () => {
        if (token !== this.unitLoadToken) return;
        // On error, continue without state
        this.currentResponseData = null;
        this.hasResponseState = false;
        this.isFallbackState = false;
        this.responseStateReady = true;
        this.startPlayerIfReady();
      },
    });
  }

  saveCurrentResponseState() {
    this.rememberFocusBeforeOverlay();
    if (this.previewUpdateInProgress || !this.responseStateReady) {
      this.confirmDialogError =
        'Der Zustand des ausgewählten Items wird noch geladen. Bitte versuchen Sie es gleich erneut.';
      this.showSaveConfirmDialog = true;
      return;
    }
    if (!this.selectedItem || !this.currentResponseData) {
      this.confirmDialogError =
        'Kein Zustand zum Speichern vorhanden. Bitte füllen Sie zuerst das Formular aus.';
      this.showSaveConfirmDialog = true;
      return;
    }
    this.confirmDialogError = '';
    this.showSaveConfirmDialog = true;
  }

  confirmSaveResponseState() {
    if (
      !this.selectedItem ||
      !this.currentResponseData ||
      this.previewUpdateInProgress ||
      !this.responseStateReady
    ) {
      this.confirmDialogError =
        'Der Zustand des ausgewählten Items ist noch nicht vollständig geladen.';
      return;
    }

    this.confirmDialogState = 'saving';

    this.api
      .saveResponseState(
        this.acpId,
        this.selectedItem.itemId,
        this.selectedItem.unitId,
        this.currentResponseData,
        this.selectedItem.rowKey,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.hasResponseState = true;
          this.isFallbackState = false;
          this.confirmDialogState = 'idle';
          this.closeSaveConfirmDialog();
        },
        error: (err) => {
          console.error('Error saving response state:', err);
          this.confirmDialogState = 'idle';
          this.confirmDialogError = 'Fehler beim Speichern des Zustands.';
        },
      });
  }

  resetResponseState() {
    if (!this.selectedItem) return;
    this.rememberFocusBeforeOverlay();
    this.confirmDialogError = '';
    this.showDeleteConfirmDialog = true;
  }

  confirmDeleteResponseState() {
    if (!this.selectedItem) return;

    this.confirmDialogState = 'deleting';

    this.api
      .deleteResponseState(
        this.acpId,
        this.selectedItem.itemId,
        this.selectedItem.unitId,
        this.selectedItem.rowKey,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.hasResponseState = false;
          this.isFallbackState = false;
          this.currentResponseData = null;
          this.confirmDialogState = 'idle';
          this.closeDeleteConfirmDialog();
        },
        error: (err) => {
          console.error('Error deleting response state:', err);
          this.confirmDialogState = 'idle';
          this.confirmDialogError = 'Fehler beim Löschen des Zustands.';
        },
      });
  }

  loadAllResponseStates() {
    this.rememberFocusBeforeOverlay();
    this.api
      .getAllResponseStates(this.acpId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (states) => {
          this.allResponseStates = states;
          this.showRawDataOverlay = true;
        },
        error: (err) => {
          console.error('Error loading response states:', err);
          alert('Fehler beim Laden der gespeicherten Zustände.');
        },
      });
  }

  navigateItem(delta: number) {
    this.selectFilteredItemAt(this.selectedIndex + delta, true);
  }

  onPreviewTargetSelectionChange() {
    this.customPreviewTargetDraft = '';
    this.updatePreviewTargetSelection(this.selectedPreviewTargetId);
  }

  applyCustomPreviewTarget() {
    const customTarget = String(this.customPreviewTargetDraft || '').trim();
    if (!customTarget) {
      if (this.hasStoredPreviewTargetOverride) {
        this.resetPreviewTargetSelection();
      }
      return;
    }

    this.selectedPreviewTargetId = '';
    this.updatePreviewTargetSelection(customTarget);
  }

  resetPreviewTargetSelection() {
    this.selectedPreviewTargetId = '';
    this.customPreviewTargetDraft = '';
    this.updatePreviewTargetSelection('');
  }

  private updatePreviewTargetSelection(targetId: string) {
    this.previewUnavailableReason = '';
    if (!this.selectedItem) {
      return;
    }

    this.persistPreviewTargetSelection(this.selectedItem, targetId);
    this.syncPreviewTargetResolution(this.selectedItem);

    if (!this.canPreviewItem(this.selectedItem)) {
      this.unitLoadToken += 1;
      this.previewSelection$.next(null);
      this.clearPreviewSlowTimer();
      this.cancelPlayerReadyTiming();
      this.loadingUnit = false;
      this.previewUpdateInProgress = false;
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      return;
    }

    if (!this.loadingUnit && (!this.unit || !this.responseStateReady)) {
      this.reloadPreviewAfterTargetChange(this.selectedItem);
      return;
    }

    if (
      !this.playerFrameReady ||
      !this.definitionContent ||
      !this.unit ||
      !this.responseStateReady
    ) {
      return;
    }
    this.startPlayerIfReady();
  }

  private reloadPreviewAfterTargetChange(item: ExplorerItem): void {
    const reuseLoadedUnit =
      this.unit?.id === item.unitId &&
      this.playerHtmlLoadState === 'ready' &&
      this.definitionLoadState === 'ready' &&
      !!this.playerSrcDoc &&
      !!this.definitionContent;

    this.cancelPlayerReadyTiming();
    if (!reuseLoadedUnit) {
      this.resetPlayer();
    }
    this.loadingUnit = !reuseLoadedUnit;
    const token = ++this.unitLoadToken;
    this.previewUpdateInProgress = reuseLoadedUnit;
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.currentResponseData = null;
    this.responseStateReady = false;
    this.activePlayerSessionId = null;

    if (this.previewLoader) {
      const selectionTiming = this.diagnostics?.start('item-selection-total') || null;
      this.startPreviewSlowTimer(
        reuseLoadedUnit ? 'gespeicherter Zustand' : 'Aufgabendaten, Player und Definition',
      );
      this.previewSelection$.next({
        item,
        token,
        reuseLoadedUnit,
        timing: selectionTiming,
      });
      return;
    }

    this.loadPreviewContext(item, token);
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerDom?.hasFrame()) return;
    this.playerFrameReady = true;
    this.startPlayerIfReady();
  }

  onPagingModeChange() {
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    const src = this.playerSrcDoc;
    this.playerFrameReady = false;
    this.playerFrameRefreshPending = true;
    this.playerSrcDoc = null;
    if (this.playerFrameRefreshTimeout) clearTimeout(this.playerFrameRefreshTimeout);
    this.playerFrameRefreshTimeout = setTimeout(() => {
      this.playerFrameRefreshTimeout = null;
      this.playerSrcDoc = src;
      this.playerFrameRefreshPending = false;
    }, 50);
  }

  handlePlayerMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const playerMessage = msg as Record<string, any>;

    switch (playerMessage['type']) {
      case 'vopStateChangedNotification':
        if (
          this.previewUpdateInProgress ||
          !this.responseStateReady ||
          !this.activePlayerSessionId
        ) {
          break;
        }
        {
          const messageSessionId = String(
            playerMessage['sessionId'] || playerMessage['playerState']?.sessionId || '',
          ).trim();
          if (messageSessionId !== this.activePlayerSessionId) {
            break;
          }
        }
        if (playerMessage['playerState']?.currentPage !== undefined) {
          this.currentPage = playerMessage['playerState'].currentPage + 1;
        }
        if (playerMessage['playerState']?.validPages !== undefined) {
          this.totalPages = playerMessage['playerState'].validPages.length || this.totalPages;
        }
        // Capture response data from unitState.dataParts
        if (playerMessage['unitState']?.dataParts) {
          this.currentResponseData = playerMessage['unitState'].dataParts;
        }
        break;

      case 'vopPageNavigationCommand':
        if (playerMessage['target'] !== undefined) {
          this.currentPage = playerMessage['target'] + 1;
        }
        break;

      case 'vopResizeNotification':
        if (playerMessage['height'] !== undefined) {
          this.playerHeight = `${playerMessage['height']}px`;
        }
        break;
    }
  }

  private schedulePlayerFocus() {
    this.clearFocusRetryTimer();

    let attempts = 0;
    const maxAttempts = 16;

    const run = () => {
      attempts += 1;
      const focused = this.tryFocusItemInPlayer();
      if (focused || attempts >= maxAttempts) {
        return;
      }
      this.focusRetryTimer = setTimeout(run, 250);
    };

    this.focusRetryTimer = setTimeout(run, 180);
  }

  private tryFocusItemInPlayer(): boolean {
    const selectedItem = this.selectedItem;
    if (!selectedItem || !this.playerDom) return false;

    const variableRef = this.resolveVariableRef(selectedItem);
    return this.playerDom.focus(
      this.getFocusSelectors(),
      [selectedItem.itemId, variableRef, selectedItem.description],
      this.playerFocusHighlightEnabled,
    );
  }

  private loadPlayerHtml(dependencies: any[], token: number) {
    const playerDep = dependencies.find(
      (d: any) => String(d?.type || '').toLowerCase() === 'player',
    );
    if (!playerDep?.downloadUrl) {
      if (token !== this.unitLoadToken) return;
      this.playerHtmlLoadState = 'missing';
      this.playerSrcDoc = null;
      return;
    }

    fetch(playerDep.downloadUrl)
      .then((res) => res.text())
      .then((html) => {
        if (token !== this.unitLoadToken) return;
        this.playerHtmlLoadState = 'ready';
        this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(rewriteGeoGebraAssetUrls(html));
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.playerHtmlLoadState = 'error';
        this.playerSrcDoc = null;
      });
  }

  private loadDefinition(dependencies: any[], token: number) {
    const definitionDep = dependencies.find((d: any) => {
      const type = String(d?.type || '').toLowerCase();
      return type === 'unit_definition' || type === 'unitdefinition' || type === 'definition';
    });

    if (!definitionDep?.downloadUrl) {
      if (token !== this.unitLoadToken) return;
      this.definitionLoadState = 'missing';
      this.definitionContent = null;
      return;
    }

    fetch(definitionDep.downloadUrl)
      .then((res) => res.text())
      .then((definition) => {
        if (token !== this.unitLoadToken) return;
        this.definitionLoadState = 'ready';
        this.definitionContent = definition;
        this.startPlayerIfReady();
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.definitionLoadState = 'error';
        this.definitionContent = null;
      });
  }

  private hasPreviewLoadFailure(): boolean {
    return (
      this.playerHtmlLoadState === 'missing' ||
      this.playerHtmlLoadState === 'error' ||
      this.definitionLoadState === 'missing' ||
      this.definitionLoadState === 'error'
    );
  }

  private startPlayerIfReady() {
    if (
      !this.playerFrameReady ||
      !this.definitionContent ||
      !this.unit ||
      !this.selectedItem ||
      !this.responseStateReady
    ) {
      return;
    }

    const selectedItem = this.selectedItem;
    const previewTarget = this.getEffectivePlayerTarget(selectedItem);
    if (!previewTarget) {
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      this.diagnostics?.finish(this.playerReadyTiming, { outcome: 'missing-target' });
      this.playerReadyTiming = null;
      return;
    }
    const targetLocation = this.voudService.resolvePlayerTargetLocation(
      this.definitionContent,
      previewTarget,
    );
    if (!targetLocation) {
      this.previewUnavailableReason = `Das Player-Ziel "${previewTarget}" kommt in der Unit-Definition nicht vor.`;
      this.diagnostics?.finish(this.playerReadyTiming, { outcome: 'unresolved-target' });
      this.playerReadyTiming = null;
      return;
    }
    const startPage = targetLocation.scrollPageIndex;
    this.previewUnavailableReason = '';
    const sessionId = `explorer-${this.getStableRowKey(selectedItem) || 'none'}-${this.startSessionCounter + 1}`;
    const usesPagedNavigation = this.pagingMode !== 'view-all' && this.pagingMode !== 'print-ids';
    const playerDefinition = this.getPlayerDefinitionContent();

    this.startSessionCounter += 1;
    this.activePlayerSessionId = sessionId;
    this.sendToPlayer({
      type: 'vopStartCommand',
      sessionId,
      unitDefinition: playerDefinition,
      unitState: {
        dataParts:
          this.hasResponseState && this.currentResponseData ? this.currentResponseData : {},
      },
      playerConfig: {
        stateReportPolicy: 'none',
        pagingMode:
          this.pagingMode === 'view-all' || this.pagingMode === 'print-ids'
            ? 'concat-scroll'
            : this.pagingMode,
        printMode:
          this.pagingMode === 'view-all'
            ? 'on'
            : this.pagingMode === 'print-ids'
              ? 'on-with-ids'
              : 'off',
        logPolicy: 'disabled',
        directDownloadUrl: GEOGEBRA_PLAYER_RESOURCE_BASE,
        startPage: startPage !== undefined ? startPage.toString() : undefined,
        enabledNavigationTargets: ['next', 'previous', 'first', 'last', 'end'],
      },
    });
    this.diagnostics?.finish(this.playerReadyTiming, { outcome: 'started' });
    this.playerReadyTiming = null;
    this.scheduleLegacyPageNavigation(sessionId, startPage, usesPagedNavigation);

    if (usesPagedNavigation) {
      this.playerHeight = '100%';
      this.playerDom?.stopAutoResize();
    } else {
      this.playerHeight = '2000px';
      this.playerDom?.startAutoResize((height) => {
        const nextHeight = `${height}px`;
        if (this.playerHeight !== nextHeight) this.playerHeight = nextHeight;
      });
    }
    this.schedulePlayerFocus();
  }

  private getPlayerDefinitionContent(): string {
    if (!this.definitionContent) return '';
    if (this.itemExplorerConditionalVisibilityEnabled) {
      return this.definitionContent;
    }
    return this.voudService.stripConditionalVisibility(this.definitionContent);
  }

  private scheduleLegacyPageNavigation(
    sessionId: string,
    startPage: number | undefined,
    enabled: boolean,
  ) {
    this.clearLegacyPageNavigationTimers();
    if (!enabled || startPage === undefined) return;

    const target = startPage.toString();
    this.legacyPageNavigationDelaysMs.forEach((delayMs) => {
      const timer = setTimeout(() => {
        this.sendToPlayer({
          type: 'vopPageNavigationCommand',
          sessionId,
          target,
        });
      }, delayMs);
      this.legacyPageNavigationTimers.push(timer);
    });
  }

  private getFocusSelectors(): string[] {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return [];

    const selectors: string[] = [];

    for (const itemId of this.getCandidateItemIds()) {
      const escaped = this.escapeSelectorValue(itemId);
      if (!escaped) continue;
      selectors.push(
        `[data-item-id="${escaped}"]`,
        `[data-itemid="${escaped}"]`,
        `[data-id="${escaped}"]`,
        `[id="${escaped}"]`,
      );
    }

    this.getResolvedVariableRefs(selectedItem).forEach((identifier) => {
      const variableRef = this.escapeSelectorValue(identifier);
      if (!variableRef) return;
      selectors.push(
        `[data-element-id="${variableRef}"]`,
        `[data-element-alias="${variableRef}"]`,
        `[data-list-alias="${variableRef}"]`,
        `[data-variable-id="${variableRef}"]`,
        `[data-variable="${variableRef}"]`,
        `[data-alias="${variableRef}"]`,
        `[data-ref="${variableRef}"]`,
        `[data-source-variable="${variableRef}"]`,
        `[name="${variableRef}"]`,
        `[id="${variableRef}"]`,
      );
    });

    return Array.from(new Set(selectors));
  }

  private getResolvedVariableRefs(item?: ExplorerItem | null): string[] {
    const variableRef = this.resolveVariableRef(item);
    if (!variableRef) return [];
    if (!this.definitionContent) return [variableRef];

    return this.voudService.getFocusIdentifiers(this.definitionContent, variableRef);
  }

  private resolveVariableRef(item?: ExplorerItem | null): string {
    return this.getEffectivePlayerTarget(item);
  }

  private getPersistedOrDefaultPlayerTarget(item?: ReadonlyExplorerItem | null): string {
    const storedTarget = this.getStoredPreviewTargetId(item);
    if (storedTarget) {
      return storedTarget;
    }
    return this.getPlayerTarget(item);
  }

  getPlayerTarget(item?: ReadonlyExplorerItem | null): string {
    if (!item) return '';
    return String(item.sourceVariable || item.variableId || '').trim();
  }

  private getEffectivePlayerTarget(item?: ReadonlyExplorerItem | null): string {
    if (!item) return '';
    if (
      this.selectedItem &&
      this.getStableRowKey(this.selectedItem) === this.getStableRowKey(item)
    ) {
      return this.selectedPreviewTarget;
    }
    return this.getPersistedOrDefaultPlayerTarget(item);
  }

  canPreviewItem(item?: ReadonlyExplorerItem | null): boolean {
    return this.getEffectivePlayerTarget(item).length > 0;
  }

  private syncPreviewTargetResolution(item?: ReadonlyExplorerItem | null) {
    const resolution = this.buildPreviewTargetResolution(item);
    const selectedId = this.getStoredPreviewTargetId(item);
    this.previewTargetResolution = resolution;
    const matchesKnownOption = resolution.options.some((option) => option.id === selectedId);
    this.selectedPreviewTargetId = matchesKnownOption ? selectedId : '';
    this.customPreviewTargetDraft = selectedId && !matchesKnownOption ? selectedId : '';
  }

  private buildPreviewTargetResolution(
    item?: ReadonlyExplorerItem | null,
  ): PreviewTargetResolution {
    const codingVariables = this.getCurrentCodingVariables();
    const fallbackOptions = this.getAllPreviewTargetOptions(codingVariables);
    const itemTarget = this.getPlayerTarget(item);
    if (!itemTarget) {
      return {
        itemTarget: '',
        isDerived: false,
        options: fallbackOptions,
        defaultTargetId: '',
      };
    }

    if (!codingVariables.length) {
      return {
        itemTarget,
        isDerived: false,
        options: [this.createFallbackPreviewTargetOption(itemTarget)],
        defaultTargetId: itemTarget,
      };
    }

    const variableLookup = this.buildCodingVariableLookup(codingVariables);
    const selectedCodingVariable = variableLookup.get(itemTarget.toLowerCase());
    if (!selectedCodingVariable) {
      return {
        itemTarget,
        isDerived: false,
        options: this.dedupePreviewTargetOptions([
          ...fallbackOptions,
          this.createFallbackPreviewTargetOption(itemTarget),
        ]),
        defaultTargetId: itemTarget,
      };
    }

    const resolvedItemTarget = this.getCodingVariableId(selectedCodingVariable, itemTarget);
    const derivedOptions = this.collectBasePreviewTargetOptions(
      selectedCodingVariable,
      variableLookup,
    );
    const isDerived = this.isDerivedCodingVariable(selectedCodingVariable);
    const defaultTargetId =
      isDerived && derivedOptions.length ? derivedOptions[0].id : resolvedItemTarget;

    return {
      itemTarget: resolvedItemTarget,
      isDerived,
      options: this.dedupePreviewTargetOptions([
        ...derivedOptions,
        ...fallbackOptions,
        this.createPreviewTargetOption(selectedCodingVariable, resolvedItemTarget),
      ]),
      defaultTargetId,
    };
  }

  private getCurrentCodingVariables(): any[] {
    if (Array.isArray(this.currentCodingScheme)) {
      return this.currentCodingScheme;
    }
    return Array.isArray(this.currentCodingScheme?.variableCodings)
      ? this.currentCodingScheme.variableCodings
      : [];
  }

  private createCodingSchemeAsText(codings: any[]): CodingAsText[] {
    const codingSchemeAsText = CodingSchemeTextFactory.asText(codings);
    codingSchemeAsText.forEach((coding, index) => {
      const rawVariable = codings[index];
      if (!rawVariable) {
        return;
      }

      (coding as any).manualInstructionText = this.sanitizeManualInstruction(
        rawVariable.manualInstruction,
      );
      coding.codes.forEach((code) => {
        const rawCode = rawVariable.codes?.find(
          (candidate: any) =>
            String(candidate?.id === null ? 'null' : candidate?.id) === String(code.id),
        );
        if (rawCode) {
          (code as any).manualInstructionText = this.sanitizeManualInstruction(
            rawCode.manualInstruction,
          );
        }
      });
    });
    return codingSchemeAsText;
  }

  private sanitizeManualInstruction(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const sanitizedHtml = DOMPurify.sanitize(value, {
      USE_PROFILES: { html: true },
    }).trim();
    return sanitizedHtml || null;
  }

  private buildCodingVariableLookup(variables: any[]): Map<string, any> {
    const lookup = new Map<string, any>();
    variables.forEach((variable) => {
      this.getCodingVariableIdentifiers(variable).forEach((identifier) => {
        const key = identifier.toLowerCase();
        if (!lookup.has(key)) {
          lookup.set(key, variable);
        }
      });
    });
    return lookup;
  }

  private getAllPreviewTargetOptions(variables: any[]): PreviewTargetOption[] {
    return this.dedupePreviewTargetOptions(
      variables.map((variable) => this.createPreviewTargetOption(variable)),
    );
  }

  private collectBasePreviewTargetOptions(
    variable: any,
    variableLookup: Map<string, any>,
    visited = new Set<string>(),
  ): PreviewTargetOption[] {
    const variableId = this.getCodingVariableId(variable);
    const visitKey = variableId.toLowerCase();
    if (visitKey) {
      if (visited.has(visitKey)) {
        return [];
      }
      visited.add(visitKey);
    }

    const deriveSources = this.getCodingVariableSources(variable);
    if (!deriveSources.length) {
      return [this.createPreviewTargetOption(variable, variableId)];
    }

    const options = deriveSources.flatMap((sourceId) => {
      const sourceVariable = variableLookup.get(sourceId.toLowerCase());
      if (!sourceVariable) {
        return [this.createFallbackPreviewTargetOption(sourceId)];
      }
      if (!this.isDerivedCodingVariable(sourceVariable)) {
        return [this.createPreviewTargetOption(sourceVariable, sourceId)];
      }
      return this.collectBasePreviewTargetOptions(sourceVariable, variableLookup, new Set(visited));
    });

    return this.dedupePreviewTargetOptions(options);
  }

  private createPreviewTargetOption(variable: any, fallbackId = ''): PreviewTargetOption {
    const id = this.getCodingVariableId(variable, fallbackId);
    const label = this.getCodingVariableLabel(variable, id);
    return {
      id,
      label: this.formatPreviewTargetLabel(id, label),
      sourceType: this.getCodingVariableSourceType(variable),
    };
  }

  private createFallbackPreviewTargetOption(id: string): PreviewTargetOption {
    return {
      id,
      label: this.formatPreviewTargetLabel(id, id),
      sourceType: 'BASE',
    };
  }

  private dedupePreviewTargetOptions(options: PreviewTargetOption[]): PreviewTargetOption[] {
    const seen = new Set<string>();
    const deduped: PreviewTargetOption[] = [];

    options.forEach((option) => {
      const id = String(option.id || '').trim();
      if (!id) {
        return;
      }
      const key = id.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      deduped.push({
        ...option,
        id,
      });
    });

    return deduped;
  }

  private getCodingVariableIdentifiers(variable: any): string[] {
    return Array.from(
      new Set(
        [variable?.id, variable?.alias]
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private getCodingVariableId(variable: any, fallbackId = ''): string {
    const directId = String(variable?.id || '').trim();
    if (directId) {
      return directId;
    }
    const alias = String(variable?.alias || '').trim();
    return alias || fallbackId;
  }

  private getCodingVariableLabel(variable: any, fallbackId: string): string {
    const variableId = this.getCodingVariableId(variable, fallbackId);
    const textLabel = String(
      this.currentCodingSchemeAsText?.find((coding) => coding.id === variableId)?.label || '',
    ).trim();
    if (textLabel) {
      return textLabel;
    }

    const rawLabel = variable?.label;
    if (typeof rawLabel === 'string' && rawLabel.trim()) {
      return rawLabel.trim();
    }

    if (Array.isArray(rawLabel)) {
      const localizedLabel = rawLabel
        .map((entry: any) => String(entry?.value || '').trim())
        .find((value: string) => value.length > 0);
      if (localizedLabel) {
        return localizedLabel;
      }
    }

    return fallbackId;
  }

  private getCodingVariableSourceType(variable: any): string {
    const sourceType = String(variable?.sourceType || '')
      .trim()
      .toUpperCase();
    return sourceType || 'BASE';
  }

  private getCodingVariableSources(variable: any): string[] {
    if (!Array.isArray(variable?.deriveSources)) {
      return [];
    }
    return variable.deriveSources
      .map((value: unknown) => String(value || '').trim())
      .filter((value: string) => value.length > 0);
  }

  private isDerivedCodingVariable(variable: any): boolean {
    return this.getCodingVariableSources(variable).length > 0;
  }

  private formatPreviewTargetLabel(id: string, label: string): string {
    return label && label !== id ? `${label} (${id})` : id;
  }

  private getStoredPreviewTargetId(item?: ReadonlyExplorerItem | null): string {
    return String(item?.previewTargetId || '').trim();
  }

  private persistPreviewTargetSelection(item: ExplorerItem, targetId: string) {
    const previousTargetId = this.getStoredPreviewTargetId(item);
    const normalizedTargetId = String(targetId || '').trim();
    if (previousTargetId === normalizedTargetId) {
      return;
    }
    item.previewTargetId = normalizedTargetId || undefined;

    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.queueItemPropertyPatch(
      item,
      'PREVIEW_TARGET_CHANGED',
      {
        [this.previewTargetItemPropertyKey]: normalizedTargetId,
      },
      true,
    );
  }

  private updateItemExclusion(item: ExplorerItem, excluded: boolean) {
    item.excluded = excluded ? true : undefined;

    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.queueItemPropertyPatch(
      item,
      'ITEM_EXCLUSION_CHANGED',
      {
        [this.excludedItemPropertyKey]: excluded,
      },
      true,
    );
  }

  private queueItemPropertyPatch(
    item: ExplorerItem,
    changeType: string,
    propertyPatch: Record<string, unknown>,
    flushImmediately = false,
  ) {
    const itemKey = this.getExistingItemStateKey(item) || this.getPrimaryItemStateKey(item);
    if (!itemKey) {
      return;
    }

    this.queueDraftPatch(
      changeType,
      {
        itemPropertiesPatch: {
          [itemKey]: propertyPatch,
        },
      },
      flushImmediately,
    );
  }

  private getPrimaryItemStateKey(item?: ExplorerItem | null): string {
    if (!item) return '';

    const resolvedItemId = item.itemId?.startsWith(`${item.unitId}_`)
      ? item.itemId
      : `${item.unitId}_${item.itemId}`;

    for (const candidate of [item.rowKey, item.uuid, resolvedItemId, item.itemId]) {
      const key = String(candidate || '').trim();
      if (key) {
        return key;
      }
    }

    return '';
  }

  private getExistingItemStateKey(item?: ExplorerItem | null): string {
    if (!item) return '';

    const activeState = this.getExplorerStateForCurrentPerspective();
    const itemProperties = this.isRecord(activeState?.itemProperties)
      ? (activeState.itemProperties as Record<string, Record<string, unknown>>)
      : {};

    for (const key of this.getItemStateKeys(item)) {
      if (this.isRecord(itemProperties[key])) {
        return key;
      }
    }

    return '';
  }

  private getMissingPreviewTargetMessage(): string {
    return 'Für dieses Item ist in den Explorer-Daten keine Player-Variable hinterlegt. Sie können ein manuelles Sprungziel setzen.';
  }

  private getCandidateItemIds(): string[] {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return [];

    const unitId = String(this.unit?.id || selectedItem.unitId || '').trim();
    const selectedItemId = String(selectedItem.itemId || '').trim();
    const resolvedItemId = this.resolveFocusItemId();
    const withPrefix = (value: string) => (unitId && value ? `${unitId}_${value}` : '');

    const candidates = new Set<string>();
    for (const candidate of [
      resolvedItemId,
      selectedItemId,
      withPrefix(resolvedItemId),
      withPrefix(selectedItemId),
    ]) {
      if (candidate) {
        candidates.add(candidate);
      }
    }

    if (unitId && selectedItemId.startsWith(`${unitId}_`)) {
      candidates.add(selectedItemId.slice(unitId.length + 1));
    }

    return Array.from(candidates);
  }

  private resolveFocusItemId(): string {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return '';

    const selectedItemId = String(selectedItem.itemId || '').trim();
    const unitItems = Array.isArray(this.unit?.items) ? this.unit.items : [];
    const unitId = String(this.unit?.id || selectedItem.unitId || '').trim();

    for (const unitItem of unitItems) {
      const unitItemId = typeof unitItem?.id === 'string' ? unitItem.id : '';
      if (!unitItemId) continue;

      const prefixedId =
        unitItem.useUnitAliasAsPrefix !== false ? `${unitId}_${unitItemId}` : unitItemId;

      if (selectedItemId === unitItemId || selectedItemId === prefixedId) {
        return unitItemId;
      }
    }

    if (unitId && selectedItemId.startsWith(`${unitId}_`)) {
      return selectedItemId.slice(unitId.length + 1);
    }

    return selectedItemId;
  }

  private escapeSelectorValue(value: string): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  private clearFocusRetryTimer() {
    if (this.focusRetryTimer) {
      clearTimeout(this.focusRetryTimer);
      this.focusRetryTimer = null;
    }
  }

  private clearLegacyPageNavigationTimers() {
    this.legacyPageNavigationTimers.forEach((timer) => clearTimeout(timer));
    this.legacyPageNavigationTimers = [];
  }

  private sendToPlayer(msg: any) {
    this.playerDom?.postMessage(msg);
  }

  // --- Personal item working data ---
  get showPersonalItemData(): boolean {
    return this.enablePersonalItemData && this.personalDataSessionIdentity !== null;
  }

  get canEditPersonalItemData(): boolean {
    return this.showPersonalItemData && this.personalDataLoadState === 'loaded';
  }

  get canChangePersonalItemData(): boolean {
    return this.canEditPersonalItemData && !this.perspectiveSwitchBusy;
  }

  get canExportAllPersonalItemData(): boolean {
    return this.enablePersonalItemData && this.hasExplorerEditPermission;
  }

  private loadPersonalItemData(
    sessionIdentity = this.personalDataSessionIdentity,
    sessionVersion = this.personalDataSessionVersion,
  ) {
    if (!sessionIdentity) return;
    this.personalDataLoadState = 'loading';
    this.personalDataError = '';
    this.api
      .getViewItemPreferences(this.acpId, this.personalPreferenceViewId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (preferences) => {
          if (
            this.personalDataSessionIdentity !== sessionIdentity ||
            this.personalDataSessionVersion !== sessionVersion
          ) {
            return;
          }
          this.personalItemData = this.normalizePersonalItemRowData(preferences?.rowData);
          this.personalDataLoadState = 'loaded';
          this.restorePendingPersonalSession(sessionIdentity);
          this.applyFilter(false);
        },
        error: (error) => {
          if (
            this.personalDataSessionIdentity !== sessionIdentity ||
            this.personalDataSessionVersion !== sessionVersion
          ) {
            return;
          }
          console.error('Failed to load personal item working data', error);
          this.personalDataLoadState = 'error';
          this.personalDataError =
            'Persönliche Arbeitsdaten konnten nicht geladen werden. Bearbeitung ist deaktiviert.';
        },
      });
  }

  retryPersonalItemDataLoad() {
    if (!this.showPersonalItemData || this.personalSaveInFlight) return;
    this.loadPersonalItemData();
  }

  setPersonalItemCategory(rowKey: string, value: unknown) {
    if (!this.canChangePersonalItemData) return;
    const category = typeof value === 'string' ? value.trim().slice(0, 200) : '';
    const row = this.getOrCreatePersonalItemRow(rowKey);
    if (category) row.category = category;
    else delete row.category;
    this.compactPersonalItemRow(rowKey);
    this.queuePersonalItemRowSave(rowKey);
    this.applyFilter(false);
  }

  setPersonalItemNote(rowKey: string, value: unknown) {
    if (!this.canChangePersonalItemData) return;
    const note = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').slice(0, 10_000) : '';
    const row = this.getOrCreatePersonalItemRow(rowKey);
    if (note) row.note = note;
    else delete row.note;
    this.compactPersonalItemRow(rowKey);
    this.queuePersonalItemRowSave(rowKey);
    this.applyFilter(false);
  }

  addPersonalItemTagToRow(rowKey: string, event: Event) {
    if (!this.canChangePersonalItemData) return;
    const select = event.target as HTMLSelectElement;
    const tag = select.value.trim();
    select.value = '';
    if (!tag || !this.personalItemTags.some((entry) => entry.label === tag)) return;
    const row = this.getOrCreatePersonalItemRow(rowKey);
    const tags = row.tags || [];
    if (!tags.includes(tag)) row.tags = [...tags, tag];
    this.queuePersonalItemRowSave(rowKey);
    this.applyFilter(false);
  }

  removePersonalItemTagFromRow(rowKey: string, tag: string) {
    if (!this.canChangePersonalItemData) return;
    const row = this.personalItemData[rowKey];
    if (!row?.tags) return;
    row.tags = row.tags.filter((entry) => entry !== tag);
    if (!row.tags.length) delete row.tags;
    this.compactPersonalItemRow(rowKey);
    this.queuePersonalItemRowSave(rowKey);
    this.applyFilter(false);
  }

  availablePersonalTagsForRow(rowKey: string): PersonalItemTagConfig[] {
    const selected = new Set(this.personalItemData[rowKey]?.tags || []);
    return this.personalItemTags.filter((tag) => !selected.has(tag.label));
  }

  getPersonalTagColor(label: string): string {
    return this.personalItemTags.find((tag) => tag.label === label)?.color || '#6c757d';
  }

  flushPersonalItemDataSave() {
    this.clearPersonalSaveTimeout();
    this.saveNextPersonalItemRow();
  }

  async exportPersonalItemDataXlsx() {
    if (
      this.destroyed ||
      !this.showPersonalItemData ||
      this.personalDataLoadState !== 'loaded' ||
      !this.filteredItems.length ||
      this.personalExportInProgress
    ) {
      return;
    }

    this.personalExportInProgress = true;
    this.personalExportError = '';
    try {
      const saved = await this.flushPersonalItemDataSaveAndWait();
      if (this.destroyed) return;
      if (!saved) {
        this.personalExportError =
          'Persönliche Änderungen konnten vor dem Export nicht gespeichert werden.';
        return;
      }

      const rowKeys = this.filteredItems.map((item) => this.getStableRowKey(item));
      const blob = await firstValueFrom(
        this.api.exportViewPersonalItemDataXlsx(
          this.acpId,
          rowKeys,
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (this.destroyed) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `personal-item-data-${this.acpId}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (this.destroyed) return;
      console.error('Failed to export personal item working data', error);
      this.personalExportError = 'Persönliche Item-Arbeitsdaten konnten nicht exportiert werden.';
    } finally {
      if (!this.destroyed) this.personalExportInProgress = false;
    }
  }

  async exportAllPersonalItemDataCsv() {
    if (
      this.destroyed ||
      !this.canExportAllPersonalItemData ||
      this.allPersonalDataExportInProgress
    ) {
      return;
    }

    this.allPersonalDataExportInProgress = true;
    this.allPersonalDataExportError = '';
    try {
      const blob = await firstValueFrom(
        this.api.exportAllViewPersonalItemDataCsv(
          this.acpId,
          this.getPerspectiveForViewerRequests(),
        ),
      );
      if (this.destroyed) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `all-participant-item-data-${this.acpId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (this.destroyed) return;
      console.error('Failed to export all personal item working data', error);
      this.allPersonalDataExportError =
        'Die persönlichen Item-Arbeitsdaten aller Teilnehmenden konnten nicht exportiert werden.';
    } finally {
      if (!this.destroyed) this.allPersonalDataExportInProgress = false;
    }
  }

  retryPersonalItemDataSave() {
    if (!this.canEditPersonalItemData || !this.pendingPersonalRowUpdates.size) return;
    this.personalDataError = '';
    this.personalDataSaveState = 'pending';
    this.clearPersonalSaveTimeout();
    this.saveNextPersonalItemRow();
  }

  openDiscardPersonalItemDataDialog() {
    if (
      this.personalDataSaveState !== 'error' ||
      this.personalSaveInFlight ||
      !this.pendingPersonalRowUpdates.size
    ) {
      return;
    }
    this.rememberFocusBeforeOverlay();
    this.showDiscardPersonalItemDataDialog = true;
  }

  closeDiscardPersonalItemDataDialog() {
    this.showDiscardPersonalItemDataDialog = false;
    this.restoreFocusAfterOverlayClose();
  }

  confirmDiscardPersonalItemDataChanges() {
    if (
      this.personalDataSaveState !== 'error' ||
      this.personalSaveInFlight ||
      !this.pendingPersonalRowUpdates.size
    ) {
      this.closeDiscardPersonalItemDataDialog();
      return;
    }

    const sessionIdentity = this.personalDataSessionIdentity;
    const sessionVersion = this.personalDataSessionVersion;
    this.showDiscardPersonalItemDataDialog = false;
    this.clearPersonalSaveTimeout();
    this.pendingPersonalRowUpdates.clear();
    this.removePendingPersonalSession();
    this.personalItemData = {};
    this.personalDataSaveState = 'idle';
    this.personalDataError = '';
    this.resolvePersonalSaveWaiters(false);
    this.applyFilter(false);

    if (sessionIdentity) {
      this.loadPersonalItemData(sessionIdentity, sessionVersion);
    }
    this.restoreFocusAfterOverlayClose();
  }

  private queuePersonalItemRowSave(rowKey: string) {
    if (!this.canChangePersonalItemData) return;
    const normalizedRow = this.normalizePersonalItemRowData({
      [rowKey]: this.personalItemData[rowKey],
    })[rowKey];
    this.pendingPersonalRowUpdates.set(rowKey, {
      version: ++this.personalRowUpdateVersion,
      rowData: normalizedRow || null,
      perspective: this.getPerspectiveForViewerRequests(),
    });
    this.personalDataSaveState = 'pending';
    this.personalDataError = '';
    this.clearPersonalSaveTimeout();
    this.personalSaveTimeout = setTimeout(() => {
      this.personalSaveTimeout = null;
      this.saveNextPersonalItemRow();
    }, this.personalSaveDebounceMs);
  }

  private saveNextPersonalItemRow() {
    if (!this.canEditPersonalItemData || this.personalSaveInFlight) return;
    const nextUpdate = this.pendingPersonalRowUpdates.entries().next().value as
      | [string, PendingPersonalRowUpdate]
      | undefined;
    if (!nextUpdate) {
      this.personalDataSaveState = 'saved';
      this.resolvePersonalSaveWaiters(true);
      return;
    }

    const [rowKey, update] = nextUpdate;
    const saveSessionIdentity = this.personalDataSessionIdentity;
    const saveSessionVersion = this.personalDataSessionVersion;
    if (!saveSessionIdentity) return;
    this.personalSaveInFlight = true;
    this.personalDataSaveState = 'saving';
    this.api
      .patchViewItemPreferenceRow(this.acpId, rowKey, update.rowData, update.perspective)
      .pipe(
        finalize(() => {
          if (
            this.personalDataSessionIdentity !== saveSessionIdentity ||
            this.personalDataSessionVersion !== saveSessionVersion
          ) {
            return;
          }
          this.personalSaveInFlight = false;
          if (this.personalDataSaveState === 'error') {
            this.resolvePersonalSaveWaiters(false);
          } else if (this.pendingPersonalRowUpdates.size) {
            this.saveNextPersonalItemRow();
          } else {
            this.personalDataSaveState = 'saved';
            this.resolvePersonalSaveWaiters(true);
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          if (
            this.personalDataSessionIdentity !== saveSessionIdentity ||
            this.personalDataSessionVersion !== saveSessionVersion
          ) {
            return;
          }
          const current = this.pendingPersonalRowUpdates.get(rowKey);
          if (current?.version === update.version) {
            this.pendingPersonalRowUpdates.delete(rowKey);
          }
        },
        error: (error) => {
          if (
            this.personalDataSessionIdentity !== saveSessionIdentity ||
            this.personalDataSessionVersion !== saveSessionVersion
          ) {
            return;
          }
          console.error('Failed to save personal item working data', error);
          this.personalDataSaveState = 'error';
          this.personalDataError =
            'Persönliche Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen.';
        },
      });
  }

  private syncPersonalItemDataSession() {
    const nextIdentity = this.enablePersonalItemData
      ? this.resolvePersonalItemDataSessionIdentity()
      : null;
    if (nextIdentity === this.personalDataSessionIdentity) {
      if (nextIdentity && this.personalDataLoadState === 'idle') {
        this.loadPersonalItemData(nextIdentity);
      }
      return;
    }

    const previousIdentity = this.personalDataSessionIdentity;
    if (previousIdentity && !nextIdentity) {
      this.suspendPendingPersonalSession(previousIdentity);
    } else if (nextIdentity && nextIdentity !== previousIdentity) {
      this.discardPendingPersonalSessionUnlessOwnedBy(nextIdentity);
    }

    this.resetPersonalItemDataSession();
    this.personalDataSessionIdentity = nextIdentity;
    if (nextIdentity) {
      this.loadPersonalItemData(nextIdentity);
    }
  }

  private resetPersonalItemDataSession() {
    this.personalDataSessionIdentity = null;
    this.personalDataSessionVersion += 1;
    this.clearPersonalSaveTimeout();
    this.personalItemData = {};
    this.personalColumnFilters = {};
    this.personalDataLoadState = 'idle';
    this.personalDataSaveState = 'idle';
    this.personalDataError = '';
    this.showDiscardPersonalItemDataDialog = false;
    this.personalSaveInFlight = false;
    this.pendingPersonalRowUpdates.clear();
    this.resolvePersonalSaveWaiters(false);
    this.applyFilter(false);
  }

  private suspendPendingPersonalSession(identity: string) {
    if (!this.pendingPersonalRowUpdates.size) return;
    const snapshot: SuspendedPersonalSession = {
      identity,
      updates: Array.from(this.pendingPersonalRowUpdates.entries()).map(([rowKey, update]) => [
        rowKey,
        {
          version: update.version,
          rowData: update.rowData ? structuredClone(update.rowData) : null,
          perspective: update.perspective,
        },
      ]),
    };
    this.pendingPersonalSessionStorage.set(
      this.personalPendingStorageKey(),
      JSON.stringify(snapshot),
    );
  }

  private restorePendingPersonalSession(identity: string) {
    const snapshot = this.readPendingPersonalSession();
    if (!snapshot) return;
    if (snapshot.identity !== identity) {
      this.removePendingPersonalSession();
      return;
    }

    this.pendingPersonalRowUpdates.clear();
    for (const [rowKey, update] of snapshot.updates) {
      this.pendingPersonalRowUpdates.set(rowKey, update);
      this.personalRowUpdateVersion = Math.max(this.personalRowUpdateVersion, update.version);
      if (update.rowData) {
        this.personalItemData[rowKey] = structuredClone(update.rowData);
      } else {
        delete this.personalItemData[rowKey];
      }
    }
    this.removePendingPersonalSession();
    if (this.pendingPersonalRowUpdates.size) {
      this.personalDataSaveState = 'pending';
      this.personalDataError = '';
      this.clearPersonalSaveTimeout();
      this.personalSaveTimeout = setTimeout(() => {
        this.personalSaveTimeout = null;
        this.saveNextPersonalItemRow();
      }, this.personalSaveDebounceMs);
    }
  }

  private discardPendingPersonalSessionUnlessOwnedBy(identity: string) {
    const snapshot = this.readPendingPersonalSession();
    if (snapshot && snapshot.identity !== identity) {
      this.removePendingPersonalSession();
    }
  }

  private readPendingPersonalSession(): SuspendedPersonalSession | null {
    const raw = this.pendingPersonalSessionStorage.get(this.personalPendingStorageKey());
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<SuspendedPersonalSession>;
      if (typeof parsed.identity !== 'string' || !Array.isArray(parsed.updates)) {
        throw new Error('Invalid pending personal session');
      }
      const updates: Array<[string, PendingPersonalRowUpdate]> = [];
      for (const entry of parsed.updates) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue;
        const rawUpdate = entry[1] as Partial<PendingPersonalRowUpdate> | null;
        if (!rawUpdate || !Number.isFinite(rawUpdate.version)) continue;
        const rowData =
          rawUpdate.rowData === null
            ? null
            : this.normalizePersonalItemRowData({ [entry[0]]: rawUpdate.rowData })[entry[0]] ||
              null;
        const perspective =
          rawUpdate.perspective === 'editor' || rawUpdate.perspective === 'read-only'
            ? rawUpdate.perspective
            : 'read-only';
        updates.push([entry[0], { version: Number(rawUpdate.version), rowData, perspective }]);
      }
      return { identity: parsed.identity, updates };
    } catch {
      this.removePendingPersonalSession();
      return null;
    }
  }

  private removePendingPersonalSession() {
    this.pendingPersonalSessionStorage.remove(this.personalPendingStorageKey());
  }

  private personalPendingStorageKey(): string {
    return `cp_item_explorer_pending_personal:${this.acpId}`;
  }

  private resolvePersonalItemDataSessionIdentity(): string | null {
    return this.pendingPersonalSessionStorage.resolveIdentityFromToken(this.authService.getToken());
  }

  private flushPersonalItemDataSaveAndWait(): Promise<boolean> {
    if (!this.hasPendingPersonalItemDataChanges()) {
      return Promise.resolve(true);
    }
    if (!this.canEditPersonalItemData) {
      return Promise.resolve(false);
    }

    const result = new Promise<boolean>((resolve) => {
      this.personalSaveWaiters.push(resolve);
    });
    this.personalDataError = '';
    if (this.pendingPersonalRowUpdates.size) {
      this.personalDataSaveState = 'pending';
    }
    this.clearPersonalSaveTimeout();
    this.saveNextPersonalItemRow();
    return result;
  }

  private hasPendingPersonalItemDataChanges(): boolean {
    return (
      this.pendingPersonalRowUpdates.size > 0 ||
      this.personalSaveInFlight ||
      this.personalSaveTimeout !== null ||
      this.personalDataSaveState === 'error'
    );
  }

  private resolvePersonalSaveWaiters(saved: boolean) {
    const waiters = this.personalSaveWaiters;
    this.personalSaveWaiters = [];
    waiters.forEach((resolve) => resolve(saved));
  }

  private clearPersonalSaveTimeout() {
    if (!this.personalSaveTimeout) return;
    clearTimeout(this.personalSaveTimeout);
    this.personalSaveTimeout = null;
  }

  private getOrCreatePersonalItemRow(rowKey: string): PersonalItemRowData {
    if (!this.personalItemData[rowKey]) this.personalItemData[rowKey] = {};
    return this.personalItemData[rowKey];
  }

  private compactPersonalItemRow(rowKey: string) {
    const row = this.personalItemData[rowKey];
    if (row && !row.category && !row.note && !row.tags?.length) {
      delete this.personalItemData[rowKey];
    }
  }

  private normalizePersonalItemRowData(raw: unknown): Record<string, PersonalItemRowData> {
    if (!this.isRecord(raw)) return {};
    const normalized: Record<string, PersonalItemRowData> = {};
    for (const [rawRowKey, rawValue] of Object.entries(raw)) {
      const rowKey = rawRowKey.trim();
      if (!rowKey || !this.isRecord(rawValue)) continue;
      const category =
        typeof rawValue['category'] === 'string' ? rawValue['category'].trim().slice(0, 200) : '';
      const note =
        typeof rawValue['note'] === 'string'
          ? rawValue['note'].replace(/\r\n?/g, '\n').slice(0, 10_000)
          : '';
      const tags = this.normalizeStringList(rawValue['tags']).slice(0, 50);
      const row: PersonalItemRowData = {};
      if (category) row.category = category;
      if (tags.length) row.tags = tags;
      if (note) row.note = note;
      if (Object.keys(row).length) normalized[rowKey] = row;
    }
    return normalized;
  }

  private normalizePersonalItemTagConfig(raw: unknown): PersonalItemTagConfig[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .map((entry) => {
        const record = this.isRecord(entry) ? entry : {};
        const label = typeof record['label'] === 'string' ? record['label'].trim() : '';
        const colorRaw = typeof record['color'] === 'string' ? record['color'].trim() : '';
        return {
          label,
          color: /^#[0-9a-f]{6}$/i.test(colorRaw) ? colorRaw : '#3498db',
        };
      })
      .filter((tag) => {
        if (!tag.label || seen.has(tag.label)) return false;
        seen.add(tag.label);
        return true;
      })
      .slice(0, 50);
  }

  private normalizeStringList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return Array.from(
      new Set(
        raw
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  // --- Shared ACP tags ---
  addItemTag(uuid: string, event: Event) {
    if (!this.canEditExplorer) return;
    const tag = (event.target as HTMLSelectElement).value;
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
      this.applyFilter(false);
    }
    (event.target as HTMLSelectElement).value = '';
  }

  removeItemTag(uuid: string, tag: string) {
    if (!this.canEditExplorer) return;
    if (this.itemTags[uuid]) {
      this.itemTags[uuid] = this.itemTags[uuid].filter((t) => t !== tag);
      this.saveTags();
      this.applyFilter(false);
    }
  }

  addCustomTag(uuid: string, event: any) {
    if (!this.canEditExplorer) return;
    const input = event.target as HTMLInputElement;
    const tag = input.value.trim();
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
      this.applyFilter(false);
    }
    input.value = '';
  }

  private saveTags() {
    const normalizedTags = this.normalizeTags(this.itemTags);
    this.itemTags = normalizedTags;
    if (!this.canEditExplorer) {
      return;
    }
    this.queueDraftPatch('TAGS_CHANGED', { tags: normalizedTags });
  }

  private loadPersistedTags() {
    // Explorer uses shared ACP state; tags are loaded with the versioned item-list snapshot.
    this.applyFilter(false);
  }

  private hydrateItemTagsFromItems() {
    const tagsFromItems: Record<string, string[]> = {};
    for (const item of this.items) {
      if (item.rowKey && Array.isArray(item.tags) && item.tags.length) {
        tagsFromItems[item.rowKey] = [...item.tags];
      }
    }
    this.itemTags = tagsFromItems;
  }

  // --- Helpers ---
  extractLabel(label: any): string {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (Array.isArray(label)) {
      const de = label.find((l: any) => l.lang === 'de');
      return de?.value || label[0]?.value || '';
    }
    if (label && typeof label === 'object') {
      return label['de'] || label['value'] || JSON.stringify(label);
    }
    return '';
  }

  extractValueText(valueAsText: any): string {
    if (valueAsText === undefined || valueAsText === null) return '';
    if (typeof valueAsText === 'string') return valueAsText;
    if (typeof valueAsText === 'number') return valueAsText.toString();
    if (typeof valueAsText === 'boolean') return valueAsText ? 'Ja' : 'Nein';

    if (Array.isArray(valueAsText)) {
      const de = valueAsText.find((v: any) => v.lang === 'de');
      if (de) return de.value;
      if (valueAsText.every((v) => v && typeof v === 'object' && v.value)) {
        return valueAsText.map((v) => v.value).join(', ');
      }
      return valueAsText.map((v) => this.extractValueText(v)).join(', ');
    }
    if (typeof valueAsText === 'object') {
      return valueAsText['de'] || valueAsText['value'] || '';
    }
    return '';
  }

  getSummaryMetadata(): any[] {
    if (!this.currentUnitMetadata) return [];
    // Prefer these IDs for summary
    const priorityIds = [
      'level',
      'subject',
      'competence',
      'format',
      'time',
      'duration',
      'difficulty',
    ];
    const summary = this.currentUnitMetadata.filter((m) =>
      priorityIds.some((pid) => m.id.toLowerCase().includes(pid)),
    );
    // If no priority items found, show the first 4 entries
    if (summary.length === 0 && this.currentUnitMetadata.length > 0) {
      return this.currentUnitMetadata.slice(0, 4);
    }
    return summary.slice(0, 4);
  }

  downloadUnit() {
    const url = `/api/acp/${this.acpId}/files?unitId=${this.selectedItem?.unitId}&format=zip`;
    window.open(this.api.appendAuthToken(url), '_blank');
  }

  // --- Metadata Column Management ---
  checkUserRole() {
    this.isAcpManager = this.authService.hasAcpRole(this.acpId, 'ACP_MANAGER');
    this.hasExplorerEditPermission = this.isAcpManager || this.authService.isAdmin;
    this.hasExplorerPublishPermission = this.hasExplorerEditPermission;
    if (!this.hasExplorerEditPermission) {
      this.viewPerspective = 'read-only';
    }
    this.syncEffectiveExplorerPermissions();
  }

  async toggleReadOnlyPreview() {
    if (
      this.destroyed ||
      !this.canToggleReadOnlyPreview ||
      this.perspectiveSwitchBusy ||
      !this.latestExplorerState
    ) {
      return;
    }

    const nextPerspective: ItemExplorerPerspective = this.isReadOnlyPreview
      ? 'editor'
      : 'read-only';

    if (nextPerspective === 'read-only') {
      const flushed = await this.flushDraftPatch();
      if (!flushed) {
        return;
      }
    }

    this.perspectiveSwitchBusy = true;
    this.viewPerspective = nextPerspective;
    this.syncEffectiveExplorerPermissions();
    this.itemListError = '';

    await this.reloadSharedExplorerStateAndItems();
    if (this.destroyed) return;
    this.perspectiveSwitchBusy = false;
  }

  private syncEffectiveExplorerPermissions() {
    const inEditorPerspective = this.viewPerspective === 'editor';
    this.canEditExplorer = this.hasExplorerEditPermission && inEditorPerspective;
    this.canPublishExplorer = this.hasExplorerPublishPermission && inEditorPerspective;
  }

  private getExplorerStateForCurrentPerspective(
    envelope: ItemExplorerStateEnvelope | null = this.latestExplorerState,
  ): ItemExplorerSharedState | Record<string, unknown> {
    if (!envelope) {
      return {};
    }

    const stateCandidate =
      envelope.canEdit && this.viewPerspective === 'editor'
        ? envelope.draftState
        : envelope.publishedState;

    if (this.isRecord(stateCandidate)) {
      return stateCandidate;
    }

    if (this.isRecord(envelope.activeState)) {
      return envelope.activeState;
    }

    return {};
  }

  private getPerspectiveForViewerRequests(): ItemExplorerPerspective {
    return this.isReadOnlyPreview || !this.hasExplorerEditPermission ? 'read-only' : 'editor';
  }

  private getItemListAccessMessage(): string {
    return 'Die Item-Liste ist für diese Ansicht nicht freigegeben.';
  }

  private getUnitViewAccessMessage(): string {
    return 'Die Aufgaben-Vorschau ist für diese Ansicht nicht freigegeben.';
  }

  filterVisibleColumns(allColumns: MetadataColumn[]): MetadataColumn[] {
    if (!this.metadataSettings?.visible?.length) {
      return allColumns; // Show all if no settings
    }

    // Filter visible columns and maintain order
    const visibleMap = new Set(this.metadataSettings.visible);
    const orderedColumns = [];

    // First, add columns in the specified order
    for (const colId of this.metadataSettings.order || []) {
      const col = allColumns.find((c) => c.id === colId);
      if (col && visibleMap.has(colId)) {
        orderedColumns.push({ ...col, visible: true });
      }
    }

    // Then add any remaining visible columns not in the order list
    for (const col of allColumns) {
      if (visibleMap.has(col.id) && !orderedColumns.some((c) => c.id === col.id)) {
        orderedColumns.push({ ...col, visible: true });
      }
    }

    return orderedColumns;
  }

  toggleColumnVisibility(column: MetadataColumn) {
    const colIndex = this.metadataSettings.visible.indexOf(column.id);
    if (colIndex === -1) {
      this.metadataSettings.visible.push(column.id);
      if (!this.metadataSettings.order.includes(column.id)) {
        this.metadataSettings.order.push(column.id);
      }
    } else {
      this.metadataSettings.visible.splice(colIndex, 1);
      const orderIndex = this.metadataSettings.order.indexOf(column.id);
      if (orderIndex !== -1) {
        this.metadataSettings.order.splice(orderIndex, 1);
      }
    }
    this.columns = this.filterVisibleColumns(this.allColumns);
  }

  moveColumnUp(column: MetadataColumn) {
    const index = this.metadataSettings.order.indexOf(column.id);
    if (index > 0) {
      [this.metadataSettings.order[index], this.metadataSettings.order[index - 1]] = [
        this.metadataSettings.order[index - 1],
        this.metadataSettings.order[index],
      ];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  moveColumnDown(column: MetadataColumn) {
    const index = this.metadataSettings.order.indexOf(column.id);
    if (index >= 0 && index < this.metadataSettings.order.length - 1) {
      [this.metadataSettings.order[index], this.metadataSettings.order[index + 1]] = [
        this.metadataSettings.order[index + 1],
        this.metadataSettings.order[index],
      ];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  enableManualOrderMode() {
    this.sortField = '__manual__';
    this.sortIsMeta = false;
    this.sortDir = 'asc';
    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.rowKey);
    }
    this.applySort();
  }

  moveSelectedItem(delta: number) {
    if (!this.canEditExplorer || !this.selectedItem || this.sortField !== '__manual__') {
      return;
    }
    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.rowKey);
    }
    const currentIndex = this.itemOrder.indexOf(this.selectedItem.rowKey);
    if (currentIndex === -1) {
      return;
    }
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= this.itemOrder.length) {
      return;
    }
    [this.itemOrder[currentIndex], this.itemOrder[targetIndex]] = [
      this.itemOrder[targetIndex],
      this.itemOrder[currentIndex],
    ];
    this.applySort(false);
    this.queueDraftPatch('ITEM_ORDER_CHANGED', { itemOrder: [...this.itemOrder] }, true);
  }

  saveMetadataSettings() {
    this.columns = this.filterVisibleColumns(this.allColumns);
    this.showColumnManager = false;
    this.restoreFocusAfterOverlayClose();
    this.queueDraftPatch(
      'METADATA_COLUMNS_CHANGED',
      {
        metadataColumns: {
          visible: [...this.metadataSettings.visible],
          order: [...this.metadataSettings.order],
        },
      },
      true,
    );
  }

  resetToDefault() {
    this.metadataSettings = { visible: [], order: [] };
    this.columns = this.filterVisibleColumns(this.allColumns);
  }

  private resolveMetadataSettings(featureConfig: Record<string, any>): MetadataSettings {
    const metadataColumns = featureConfig?.['metadataColumns'];
    if (metadataColumns && typeof metadataColumns === 'object') {
      const visible = Array.isArray(metadataColumns.visible)
        ? metadataColumns.visible.filter(
            (entry: unknown): entry is string => typeof entry === 'string',
          )
        : [];
      const order = Array.isArray(metadataColumns.order)
        ? metadataColumns.order.filter(
            (entry: unknown): entry is string => typeof entry === 'string',
          )
        : [];

      return {
        visible: visible.length ? visible : order,
        order: order.length ? order : visible,
      };
    }

    const legacyColumns = featureConfig?.['itemListMetadataColumns'];
    const legacy = Array.isArray(legacyColumns)
      ? legacyColumns.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [];

    return { visible: legacy, order: legacy };
  }

  private buildUiPreferences(): Record<string, unknown> {
    const sharedColumnFilters = Object.fromEntries(
      Object.entries(this.columnFilters).filter(([key]) => !this.isPersonalColumnFilterKey(key)),
    );
    return {
      filterText: this.filterText,
      sortField: this.sortField,
      sortIsMeta: this.sortIsMeta,
      sortDir: this.sortDir,
      columnFilters: sharedColumnFilters,
    };
  }

  private applyUiPreferences(rawUi: unknown) {
    if (!this.isRecord(rawUi)) return;

    const filterText = rawUi['filterText'];
    const sortField = rawUi['sortField'];
    const sortIsMeta = rawUi['sortIsMeta'];
    const sortDir = rawUi['sortDir'];
    const columnFilters = rawUi['columnFilters'];

    if (typeof filterText === 'string') {
      this.filterText = filterText;
    }

    if (typeof sortField === 'string') {
      this.sortField = sortField;
    }

    if (typeof sortIsMeta === 'boolean') {
      this.sortIsMeta = sortIsMeta;
    }

    this.sortDir = sortDir === 'desc' ? 'desc' : 'asc';
    this.columnFilters = this.isRecord(columnFilters)
      ? Object.fromEntries(
          Object.entries(columnFilters)
            .filter(([key]) => !this.isPersonalColumnFilterKey(key))
            .map(([key, value]) => [key, typeof value === 'string' ? value : '']),
        )
      : {};
  }

  private isPersonalColumnFilterKey(key: string): boolean {
    return key === 'personalCategory' || key === 'personalTags' || key === 'personalNote';
  }

  private saveUiPreferences() {
    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }
    this.queueDraftPatch('UI_STATE_CHANGED', {
      ui: this.buildUiPreferences(),
    });
  }

  private async confirmLeaveWithUnsavedChanges(): Promise<boolean> {
    if (this.leaveWithChangesResolver) {
      return false;
    }

    this.rememberFocusBeforeOverlay();
    this.showLeaveWithChangesDialog = true;
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = '';

    return new Promise<boolean>((resolve) => {
      this.leaveWithChangesResolver = resolve;
    });
  }

  stayOnPage() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.resolveLeaveWithChangesDialog(false);
  }

  async saveAndLeave() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.leaveWithChangesDialogState = 'saving';
    this.leaveWithChangesDialogError = '';
    const saved = await this.saveExplorerDraft(true);
    if (saved) {
      this.resolveLeaveWithChangesDialog(true);
      return;
    }
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = this.lastDraftOperationError || 'Speichern fehlgeschlagen.';
  }

  async discardAndLeave() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.leaveWithChangesDialogState = 'discarding';
    this.leaveWithChangesDialogError = '';
    const discarded = await this.discardExplorerDraft(true);
    if (discarded) {
      this.resolveLeaveWithChangesDialog(true);
      return;
    }
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = this.lastDraftOperationError || 'Verwerfen fehlgeschlagen.';
  }

  private resolveLeaveWithChangesDialog(result: boolean) {
    const resolver = this.leaveWithChangesResolver;
    this.leaveWithChangesResolver = null;
    this.showLeaveWithChangesDialog = false;
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = '';
    if (!result) {
      this.restoreFocusAfterOverlayClose();
    }
    resolver?.(result);
  }

  private async fetchSharedExplorerState(): Promise<ItemExplorerStateEnvelope | null> {
    if (this.destroyed) return null;
    try {
      const envelope = await firstValueFrom(this.api.getItemExplorerState(this.acpId));
      return this.destroyed ? null : envelope;
    } catch (error) {
      if (this.destroyed) return null;
      console.error('Failed to load shared explorer state', error);
      this.explorerUiStatus = 'ERROR';
      return null;
    }
  }

  private async reloadSharedExplorerStateAndItems(
    preserveDraftOperationError = false,
  ): Promise<void> {
    const draftOperationError = preserveDraftOperationError ? this.lastDraftOperationError : '';
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const envelope = await this.fetchSharedExplorerState();
      if (!envelope || this.destroyed) return;
      const outcome = await new Promise<ItemListLoadOutcome>((resolve) =>
        this.reloadItems(resolve, envelope),
      );
      if (outcome === 'loaded' && preserveDraftOperationError) {
        this.lastDraftOperationError = draftOperationError;
        this.explorerUiStatus = 'ERROR';
      }
      if (outcome !== 'version-mismatch') return;
    }

    if (!this.destroyed) {
      this.itemListError =
        'Der Item-Explorer wurde während des Ladens mehrfach geändert. Bitte erneut laden.';
      this.explorerUiStatus = 'ERROR';
    }
  }

  private itemListMatchesCurrentExplorerState(
    result: unknown,
    expectedExplorerState: ItemExplorerStateEnvelope | undefined,
  ): boolean {
    if (!this.isRecord(result) || result['itemExplorerStateVersion'] === undefined) {
      // Compatibility for older cached responses and focused unit tests. The
      // current backend always supplies the version marker.
      return true;
    }
    const explorerState = expectedExplorerState || this.latestExplorerState;
    if (!explorerState) return false;

    const responseVersion = Number(result['itemExplorerStateVersion']);
    const expectedVersion =
      explorerState.canEdit && this.viewPerspective === 'editor'
        ? explorerState.version
        : explorerState.publishedVersion;
    return Number.isInteger(responseVersion) && responseVersion === expectedVersion;
  }

  private applySharedExplorerEnvelope(envelope: ItemExplorerStateEnvelope, markSaved = false) {
    this.lastDraftOperationError = '';
    this.latestExplorerState = envelope;
    this.explorerVersion = envelope.version;
    this.explorerPublishedVersion = envelope.publishedVersion;
    this.hasExplorerEditPermission = envelope.canEdit;
    this.hasExplorerPublishPermission = envelope.canPublish;
    if (!this.hasExplorerEditPermission) {
      this.viewPerspective = 'read-only';
    }
    this.syncEffectiveExplorerPermissions();

    const roleLabel = envelope.updatedByRole ? ` (${envelope.updatedByRole})` : '';
    const username = envelope.updatedByUsername || 'unbekannt';
    this.lastExplorerChangeInfo = `${username}${roleLabel} · ${new Date(envelope.updatedAt).toLocaleString()}`;

    const activeState = this.getExplorerStateForCurrentPerspective(envelope);
    this.suppressDraftPatch = true;
    try {
      this.applyUiPreferences((activeState as ItemExplorerSharedState).ui);
      this.itemTags = this.normalizeTags((activeState as ItemExplorerSharedState).tags);
      this.metadataSettings = this.resolveMetadataSettings({
        metadataColumns: (activeState as ItemExplorerSharedState).metadataColumns,
      });
      this.columns = this.filterVisibleColumns(this.allColumns);
      this.itemOrder = Array.isArray((activeState as ItemExplorerSharedState).itemOrder)
        ? (activeState as ItemExplorerSharedState).itemOrder!.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [];
    } finally {
      this.suppressDraftPatch = false;
    }

    const previousPreviewTarget = this.selectedItem
      ? this.getEffectivePlayerTarget(this.selectedItem)
      : '';
    this.applyExplorerStateToItems();
    if (this.selectedItem) {
      this.syncPreviewTargetResolution(this.selectedItem);
      const nextPreviewTarget = this.getEffectivePlayerTarget(this.selectedItem);
      if (
        previousPreviewTarget !== nextPreviewTarget &&
        this.playerFrameReady &&
        this.definitionContent &&
        this.unit &&
        this.responseStateReady
      ) {
        this.startPlayerIfReady();
      }
    }

    if (envelope.status === 'DIRTY') {
      this.explorerUiStatus = 'DIRTY';
      return;
    }
    if (markSaved) {
      this.explorerUiStatus = 'SAVED';
      if (this.saveStatusResetTimeout) {
        clearTimeout(this.saveStatusResetTimeout);
      }
      this.saveStatusResetTimeout = setTimeout(() => {
        this.saveStatusResetTimeout = null;
        if (!this.hasPendingDraftChanges()) {
          this.explorerUiStatus = 'CLEAN';
        }
      }, 1800);
      return;
    }
    this.explorerUiStatus = 'CLEAN';
  }

  private applyExplorerStateToItems() {
    const activeState = this.getExplorerStateForCurrentPerspective();
    if (!activeState || this.items.length === 0) {
      return;
    }

    const itemProperties = this.isRecord(activeState.itemProperties)
      ? (activeState.itemProperties as Record<string, Record<string, unknown>>)
      : {};
    const stateTags = this.normalizeTags(activeState.tags);

    for (const item of this.items) {
      const keys = this.getItemStateKeys(item);
      const itemProps = this.getItemPropsForKeys(itemProperties, keys);

      const empiricalDifficultyRaw = itemProps?.['empiricalDifficulty'];
      if (empiricalDifficultyRaw === undefined || empiricalDifficultyRaw === null) {
        delete item.empiricalDifficulty;
      } else {
        const parsed = Number(empiricalDifficultyRaw);
        if (Number.isFinite(parsed)) {
          item.empiricalDifficulty = parsed;
        } else {
          delete item.empiricalDifficulty;
        }
      }

      const previewTargetId = String(itemProps?.[this.previewTargetItemPropertyKey] || '').trim();
      if (previewTargetId) {
        item.previewTargetId = previewTargetId;
      } else {
        delete item.previewTargetId;
      }

      if (itemProps?.[this.excludedItemPropertyKey] === true) {
        item.excluded = true;
      } else {
        delete item.excluded;
      }

      const tagsFromState = this.getTagsForKeys(stateTags, keys);
      if (tagsFromState !== null) {
        item.tags = tagsFromState;
      } else if (Array.isArray(itemProps?.['tags'])) {
        item.tags = this.normalizeTagValues(itemProps['tags']);
      } else if (!Array.isArray(item.tags)) {
        item.tags = [];
      }
    }

    this.hydrateItemTagsFromItems();
    if (Object.keys(stateTags).length) {
      this.itemTags = { ...this.itemTags, ...stateTags };
    }

    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.rowKey);
    } else {
      const existing = new Set(this.items.map((item) => item.rowKey));
      const filteredOrder = this.itemOrder.filter((entry) => existing.has(entry));
      const missing = this.items
        .map((item) => item.rowKey)
        .filter((entry) => !filteredOrder.includes(entry));
      this.itemOrder = [...filteredOrder, ...missing];
    }

    this.hasEmpiricalDifficulty = this.items.some(
      (item: any) => item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null,
    );
    this.reconcileMeanTaskDifficultyState();
    this.applyFilter(false);
  }

  private reconcileMeanTaskDifficultyState(): void {
    this.hasMeanTaskDifficulty = this.items.some((item) => item.meanTaskDifficulty !== undefined);
    if (!this.hasMeanTaskDifficulty) {
      let uiStateChanged = false;
      if (this.columnFilters['meanTaskDifficulty'] !== undefined) {
        delete this.columnFilters['meanTaskDifficulty'];
        uiStateChanged = true;
      }
      if (this.sortField === 'meanTaskDifficulty') {
        this.sortField = DEFAULT_EXPLORER_SORT_FIELD;
        this.sortIsMeta = false;
        this.sortDir = DEFAULT_EXPLORER_SORT_DIR;
        uiStateChanged = true;
      }
      if (uiStateChanged) {
        this.saveUiPreferences();
      }
    }
  }

  private getItemStateKeys(item: ExplorerItem): string[] {
    const keys = new Set<string>();
    const resolvedItemId = item.itemId?.startsWith(`${item.unitId}_`)
      ? item.itemId
      : `${item.unitId}_${item.itemId}`;

    for (const candidate of [item.rowKey, item.uuid, resolvedItemId, item.itemId]) {
      const key = String(candidate || '').trim();
      if (key) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }

  private getItemPropsForKeys(
    itemProperties: Record<string, Record<string, unknown>>,
    keys: string[],
  ): Record<string, unknown> | null {
    const merged: Record<string, unknown> = {};
    let found = false;
    for (const key of [...keys].reverse()) {
      if (this.isRecord(itemProperties[key])) {
        Object.assign(merged, itemProperties[key]);
        found = true;
      }
    }
    return found ? merged : null;
  }

  private getTagsForKeys(tagsMap: Record<string, string[]>, keys: string[]): string[] | null {
    for (const key of keys) {
      const tags = tagsMap[key];
      if (Array.isArray(tags)) {
        return this.normalizeTagValues(tags);
      }
    }
    return null;
  }

  private normalizeTagValues(values: unknown[]): string[] {
    return Array.from(
      new Set(
        values.map((value) => String(value || '').trim()).filter((value) => value.length > 0),
      ),
    );
  }

  hasPendingDraftChanges(): boolean {
    return (
      Boolean(this.pendingDraftPatch) ||
      this.latestExplorerState?.status === 'DIRTY' ||
      this.explorerUiStatus === 'DIRTY'
    );
  }

  openSavePreviewDialog() {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return;
    }
    this.rememberFocusBeforeOverlay();
    this.draftPreviewSummary = this.buildDraftPreviewSummary();
    this.showSavePreviewDialog = true;
  }

  cancelSavePreviewDialog() {
    this.showSavePreviewDialog = false;
    this.restoreFocusAfterOverlayClose();
  }

  confirmSaveExplorerDraft() {
    this.showSavePreviewDialog = false;
    void this.saveExplorerDraft(true);
  }

  openDiscardExplorerDraftDialog() {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return;
    }
    this.rememberFocusBeforeOverlay();
    this.showDiscardDraftDialog = true;
    this.discardDraftDialogBusy = false;
    this.discardDraftDialogError = '';
  }

  closeDiscardDraftDialog() {
    if (this.discardDraftDialogBusy) return;
    this.showDiscardDraftDialog = false;
    this.discardDraftDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  async confirmDiscardDraftDialog() {
    if (this.discardDraftDialogBusy) return;
    this.discardDraftDialogBusy = true;
    this.discardDraftDialogError = '';
    const discarded = await this.discardExplorerDraft(true);
    this.discardDraftDialogBusy = false;
    if (discarded) {
      this.closeDiscardDraftDialog();
      return;
    }
    this.discardDraftDialogError =
      this.lastDraftOperationError || 'Entwurfsänderungen konnten nicht verworfen werden.';
  }

  async saveExplorerDraft(force = false): Promise<boolean> {
    if (this.destroyed || !this.canPublishExplorer) {
      return false;
    }
    if (!force) {
      this.openSavePreviewDialog();
      return false;
    }

    const flushed = await this.flushDraftPatch();
    if (!flushed) {
      return false;
    }

    this.lastDraftOperationError = '';
    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.saveItemExplorerDraft(this.acpId, this.explorerVersion),
      );
      if (this.destroyed) return false;
      this.applySharedExplorerEnvelope(envelope, true);
      this.reloadItems();
      this.lastDraftOperationError = '';
      if (!this.showLeaveWithChangesDialog) {
        this.restoreFocusAfterOverlayClose();
      }
      return true;
    } catch (error: any) {
      if (this.destroyed) return false;
      console.error('Failed to save draft', error);
      this.explorerUiStatus = 'ERROR';
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Speichern der Änderungen.',
      );
      if (error?.status === 409) {
        await this.reloadSharedExplorerStateAndItems(true);
      }
      return false;
    }
  }

  async discardExplorerDraft(skipConfirm = false): Promise<boolean> {
    if (this.destroyed || !this.canPublishExplorer) {
      return false;
    }
    if (!skipConfirm) {
      this.openDiscardExplorerDraftDialog();
      return false;
    }

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }
    this.pendingDraftPatch = null;
    this.pendingDraftChangeType = 'UI_UPDATE';
    this.showSavePreviewDialog = false;
    this.lastDraftOperationError = '';

    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.discardItemExplorerDraft(this.acpId, this.explorerVersion),
      );
      if (this.destroyed) return false;
      this.applySharedExplorerEnvelope(envelope, true);
      this.reloadItems();
      this.lastDraftOperationError = '';
      if (!this.showLeaveWithChangesDialog) {
        this.restoreFocusAfterOverlayClose();
      }
      return true;
    } catch (error: any) {
      if (this.destroyed) return false;
      console.error('Failed to discard draft', error);
      this.explorerUiStatus = 'ERROR';
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Verwerfen der Änderungen.',
      );
      if (error?.status === 409) {
        await this.reloadSharedExplorerStateAndItems(true);
      }
      return false;
    }
  }

  private extractDraftErrorMessage(error: any, fallback: string): string {
    if (error?.status === 409) {
      return 'Konflikt erkannt: Der Explorer wurde zwischenzeitlich geändert. Status wurde neu geladen.';
    }
    const message = String(error?.error?.message || '');
    return message || fallback;
  }

  showHistory() {
    this.rememberFocusBeforeOverlay();
    this.showHistoryOverlay = true;
    this.historyLoading = true;
    this.historyError = '';
    this.api
      .getItemExplorerChanges(this.acpId, 300)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (entries) => {
          this.historyEntries = entries || [];
          this.historyLoading = false;
        },
        error: (error) => {
          console.error('Failed to load history', error);
          this.historyLoading = false;
          this.historyError = 'Änderungsverlauf konnte nicht geladen werden.';
        },
      });
  }

  openCodingOverlay() {
    this.rememberFocusBeforeOverlay();
    this.codingSearchText = '';
    this.showOverlay = 'coding';
  }

  closeCodingOverlay() {
    if (this.showOverlay !== 'coding') {
      return;
    }
    this.showOverlay = null;
    this.restoreFocusAfterOverlayClose();
  }

  openColumnManager() {
    this.rememberFocusBeforeOverlay();
    this.showColumnManager = true;
  }

  closeColumnManager() {
    if (!this.showColumnManager) {
      return;
    }
    this.showColumnManager = false;
    this.restoreFocusAfterOverlayClose();
  }

  closeSaveConfirmDialog() {
    if (this.confirmDialogState !== 'idle') {
      return;
    }
    this.showSaveConfirmDialog = false;
    this.confirmDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  closeDeleteConfirmDialog() {
    if (this.confirmDialogState !== 'idle') {
      return;
    }
    this.showDeleteConfirmDialog = false;
    this.confirmDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  closeRawDataOverlay() {
    if (!this.showRawDataOverlay) {
      return;
    }
    this.showRawDataOverlay = false;
    this.restoreFocusAfterOverlayClose();
  }

  closeHistoryOverlay() {
    if (!this.showHistoryOverlay) {
      return;
    }
    this.showHistoryOverlay = false;
    this.restoreFocusAfterOverlayClose();
  }

  getItemRowId(item: ReadonlyExplorerItem): string {
    const rawId = this.getStableRowKey(item);
    return `item-explorer-row-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  exportHistoryCsv() {
    if (!this.filteredHistoryEntries.length) {
      return;
    }

    const escapeCsv = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Zeit', 'Nutzer', 'Rolle', 'Aktion', 'Draft-Version', 'Published-Version', 'Diff'],
      ...this.filteredHistoryEntries.map((entry) => [
        new Date(entry.createdAt).toISOString(),
        entry.actorUsername || '',
        entry.actorRole || '',
        entry.changeType || '',
        entry.draftVersion ?? '',
        entry.publishedVersion ?? '',
        JSON.stringify(entry.diff || {}),
      ]),
    ];

    const content = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(';')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `item-explorer-history-${this.acpId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private buildDraftPreviewSummary(): Array<{ label: string; detail: string }> {
    const draft = this.latestExplorerState?.draftState;
    const published = this.latestExplorerState?.publishedState;
    if (!draft || !published) {
      return [];
    }

    const summary: Array<{ label: string; detail: string }> = [];

    if (JSON.stringify(draft.ui || {}) !== JSON.stringify(published.ui || {})) {
      summary.push({
        label: 'Filter/Sortierung',
        detail: 'Globale Filter-, Sortier- oder Spaltenfilter-Einstellungen wurden geändert.',
      });
    }
    if (
      JSON.stringify(draft.metadataColumns || {}) !==
      JSON.stringify(published.metadataColumns || {})
    ) {
      summary.push({
        label: 'Metadaten-Spalten',
        detail: 'Sichtbarkeit oder Reihenfolge der Metadaten-Spalten wurde angepasst.',
      });
    }
    if (JSON.stringify(draft.itemOrder || []) !== JSON.stringify(published.itemOrder || [])) {
      summary.push({
        label: 'Item-Reihenfolge',
        detail: `Manuelle Reihenfolge mit ${Array.isArray(draft.itemOrder) ? draft.itemOrder.length : 0} Positionen wurde geändert.`,
      });
    }
    if (JSON.stringify(draft.tags || {}) !== JSON.stringify(published.tags || {})) {
      summary.push({
        label: 'Tags',
        detail: 'Tag-Zuordnungen für Items wurden verändert.',
      });
    }
    if (
      JSON.stringify(draft.itemProperties || {}) !== JSON.stringify(published.itemProperties || {})
    ) {
      const draftCount = this.isRecord(draft.itemProperties)
        ? Object.keys(draft.itemProperties).length
        : 0;
      const publishedCount = this.isRecord(published.itemProperties)
        ? Object.keys(published.itemProperties).length
        : 0;
      summary.push({
        label: 'Item-Werte',
        detail: `Item-Eigenschaften (z.B. empirische Schwierigkeit, Vorschauziele oder Ausschlüsse) geändert: ${publishedCount} → ${draftCount} Einträge.`,
      });
    }

    return summary;
  }

  private selectFilteredItemAt(index: number, shouldScroll = false) {
    if (this.filteredItems.length === 0) {
      this.clearSelectedItem();
      return;
    }

    const targetIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
    this.selectItem(this.filteredItems[targetIndex], targetIndex);
    if (shouldScroll) {
      this.scrollActiveRowIntoView();
    }
  }

  private getKeyboardNavigationIndex(delta: number): number {
    const currentIndex = this.getSelectedFilteredIndex();
    if (currentIndex === -1) {
      return delta < 0 ? this.filteredItems.length - 1 : 0;
    }
    return currentIndex + delta;
  }

  private getSelectedFilteredIndex(): number {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredItems.length) {
      const itemAtIndex = this.filteredItems[this.selectedIndex];
      if (
        itemAtIndex &&
        this.selectedItem &&
        this.getStableRowKey(itemAtIndex) === this.getStableRowKey(this.selectedItem)
      ) {
        return this.selectedIndex;
      }
    }

    if (!this.selectedItem) {
      return -1;
    }

    return this.filteredItems.findIndex(
      (item) => this.getStableRowKey(item) === this.getStableRowKey(this.selectedItem),
    );
  }

  private scrollActiveRowIntoView() {
    this.tableDom?.scrollToSelection();
  }

  private syncSelectionAfterListMutation() {
    if (this.filteredItems.length === 0) {
      this.clearSelectedItem();
      return;
    }

    if (!this.selectedItem) {
      this.selectedIndex = -1;
      return;
    }

    const selectedIndex = this.filteredItems.findIndex(
      (item) => this.getStableRowKey(item) === this.getStableRowKey(this.selectedItem),
    );
    if (selectedIndex >= 0) {
      this.selectItem(this.filteredItems[selectedIndex], selectedIndex);
      return;
    }

    this.selectFilteredItemAt(0);
  }

  private clearSelectedItem() {
    if (!this.selectedItem && this.selectedIndex === -1) {
      return;
    }

    this.unitLoadToken += 1;
    this.previewSelection$.next(null);
    this.clearPreviewSlowTimer();
    this.cancelPlayerReadyTiming();
    this.loadingUnit = false;
    this.selectedItem = null;
    this.selectedIndex = -1;
    this.currentUnitMetadata = [];
    this.currentCodingScheme = null;
    this.currentCodingSchemeAsText = null;
    this.currentResponseData = null;
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.previewUnavailableReason = '';
    this.selectedPreviewTargetId = '';
    this.customPreviewTargetDraft = '';
    this.syncPreviewTargetResolution(null);
    this.resetPlayer();
  }

  private getStableRowKey(item?: ReadonlyExplorerItem | null): string {
    if (!item) return '';
    return String(item.rowKey || item.uuid || `${item.unitId}_${item.itemId}`).trim();
  }

  private rememberFocusBeforeOverlay() {
    if (this.hasModalOverlay()) return;
    this.shellDom?.rememberFocusBeforeOverlay();
  }

  private restoreFocusAfterOverlayClose() {
    if (this.hasModalOverlay()) return;
    if (!this.shellDom?.restoreFocusAfterOverlayClose()) {
      this.tableDom?.focusFallback();
    }
  }

  private hasModalOverlay(): boolean {
    return (
      this.showOverlay === 'coding' ||
      this.showUploadReport ||
      this.showErrorDialog ||
      this.showColumnManager ||
      this.showSaveConfirmDialog ||
      this.showDeleteConfirmDialog ||
      this.showRawDataOverlay ||
      this.showHistoryOverlay ||
      this.showSavePreviewDialog ||
      this.showDiscardDraftDialog ||
      this.showDiscardPersonalItemDataDialog ||
      this.showClearEmpiricalDifficultiesDialog ||
      this.showRenumberDialog ||
      this.showLeaveWithChangesDialog
    );
  }

  private closeTopmostOverlay(): boolean {
    if (this.showLeaveWithChangesDialog) {
      this.stayOnPage();
      return true;
    }
    if (this.showClearEmpiricalDifficultiesDialog) {
      this.closeClearEmpiricalDifficultiesDialog();
      return true;
    }
    if (this.showRenumberDialog) {
      this.closeRenumberDialog();
      return true;
    }
    if (this.showDiscardDraftDialog) {
      this.closeDiscardDraftDialog();
      return true;
    }
    if (this.showDiscardPersonalItemDataDialog) {
      this.closeDiscardPersonalItemDataDialog();
      return true;
    }
    if (this.showSavePreviewDialog) {
      this.cancelSavePreviewDialog();
      return true;
    }
    if (this.showDeleteConfirmDialog) {
      this.closeDeleteConfirmDialog();
      return true;
    }
    if (this.showSaveConfirmDialog) {
      this.closeSaveConfirmDialog();
      return true;
    }
    if (this.showHistoryOverlay) {
      this.closeHistoryOverlay();
      return true;
    }
    if (this.showRawDataOverlay) {
      this.closeRawDataOverlay();
      return true;
    }
    if (this.showColumnManager) {
      this.closeColumnManager();
      return true;
    }
    if (this.showErrorDialog) {
      this.showErrorDialog = false;
      this.restoreFocusAfterOverlayClose();
      return true;
    }
    if (this.showUploadReport) {
      this.showUploadReport = false;
      this.restoreFocusAfterOverlayClose();
      return true;
    }
    if (this.showOverlay === 'coding') {
      this.closeCodingOverlay();
      return true;
    }
    if (this.showMetadataDrawer) {
      this.showMetadataDrawer = false;
      return true;
    }
    return false;
  }

  private queueDraftPatch(
    changeType: string,
    patch: Record<string, unknown>,
    flushImmediately = false,
  ) {
    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.pendingDraftPatch = this.mergeDraftPatches(this.pendingDraftPatch, patch);
    this.pendingDraftChangeType = changeType;
    this.explorerUiStatus = 'DIRTY';

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }

    if (flushImmediately) {
      void this.flushDraftPatch();
      return;
    }

    this.draftPatchTimeout = setTimeout(() => {
      this.draftPatchTimeout = null;
      void this.flushDraftPatch();
    }, this.draftPatchDebounceMs);
  }

  private mergeDraftPatches(
    current: Record<string, unknown> | null,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(current || {}) };
    for (const [key, value] of Object.entries(incoming || {})) {
      if (key === 'ui' && this.isRecord(value) && this.isRecord(merged['ui'])) {
        merged['ui'] = {
          ...merged['ui'],
          ...value,
        };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  private async flushDraftPatch(): Promise<boolean> {
    if (this.destroyed) return false;
    if (!this.canEditExplorer || !this.pendingDraftPatch) {
      return true;
    }

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }

    const patch = this.pendingDraftPatch;
    const changeType = this.pendingDraftChangeType;
    this.pendingDraftPatch = null;
    this.pendingDraftChangeType = 'UI_UPDATE';

    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.patchItemExplorerDraft(this.acpId, {
          changeType,
          patch: patch as ItemExplorerSharedState,
          baseVersion: this.explorerVersion,
        }),
      );
      if (this.destroyed) return false;
      this.applySharedExplorerEnvelope(envelope);
      return true;
    } catch (error: any) {
      if (this.destroyed) return false;
      console.error('Failed to patch draft', error);
      this.explorerUiStatus = 'ERROR';
      if (error?.status === 409) {
        this.lastDraftOperationError =
          'Konflikt beim Aktualisieren des Entwurfs. Der Explorer wurde neu geladen.';
        await this.reloadSharedExplorerStateAndItems(true);
        return false;
      }
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Aktualisieren des Entwurfs.',
      );
      this.pendingDraftPatch = this.mergeDraftPatches(this.pendingDraftPatch, patch);
      this.pendingDraftChangeType = changeType;
      return false;
    }
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isRecord(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};
    for (const [itemId, values] of Object.entries(rawTags)) {
      const normalizedItemId = String(itemId || '').trim();
      if (!normalizedItemId || !Array.isArray(values)) continue;

      const normalizedValues = Array.from(
        new Set(
          values.map((value) => String(value || '').trim()).filter((value) => value.length > 0),
        ),
      );

      if (normalizedValues.length || normalizedItemId.includes('::')) {
        tags[normalizedItemId] = normalizedValues;
      }
    }

    return tags;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
