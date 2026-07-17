import type { ItemExplorerFacade } from './item-explorer.facade';
import type { DeepReadonly } from './item-explorer.models';

type ReadonlyViewModelSlice<T> = {
  readonly [Key in keyof T]: DeepReadonly<T[Key]>;
};

export type ItemExplorerHeaderViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'allPersonalDataExportError'
    | 'allPersonalDataExportInProgress'
    | 'canEditExplorer'
    | 'canExportAllPersonalItemData'
    | 'canPublishExplorer'
    | 'canToggleReadOnlyPreview'
    | 'clearEmpiricalDifficultiesBusy'
    | 'clearEmpiricalDifficultiesError'
    | 'closeClearEmpiricalDifficultiesDialog'
    | 'closeDiscardDraftDialog'
    | 'closeDiscardPersonalItemDataDialog'
    | 'closeRenumberDialog'
    | 'confirmClearEmpiricalDifficulties'
    | 'confirmDiscardDraftDialog'
    | 'confirmDiscardPersonalItemDataChanges'
    | 'confirmRenumber'
    | 'discardAndLeave'
    | 'discardDraftDialogBusy'
    | 'discardDraftDialogError'
    | 'enableManualOrderMode'
    | 'explorerPublishedVersion'
    | 'explorerStatusLabel'
    | 'explorerUiStatus'
    | 'explorerVersion'
    | 'exportAllPersonalItemDataCsv'
    | 'exportPersonalItemDataXlsx'
    | 'filteredItems'
    | 'getRenumberingActionTitle'
    | 'hasPendingDraftChanges'
    | 'isFullscreen'
    | 'isReadOnlyPreview'
    | 'isRenumberingBlocked'
    | 'itemListError'
    | 'lastDraftOperationError'
    | 'lastExplorerChangeInfo'
    | 'latestExplorerState'
    | 'leaveWithChangesDialogError'
    | 'leaveWithChangesDialogState'
    | 'moveSelectedItem'
    | 'numberingSuccessMessage'
    | 'onCsvFileSelected'
    | 'openClearEmpiricalDifficultiesDialog'
    | 'openColumnManager'
    | 'openDiscardExplorerDraftDialog'
    | 'openRenumberDialog'
    | 'openSavePreviewDialog'
    | 'personalDataLoadState'
    | 'personalExportError'
    | 'personalExportInProgress'
    | 'perspectiveSwitchBusy'
    | 'renumberBusy'
    | 'renumberError'
    | 'saveAndLeave'
    | 'selectedItem'
    | 'showClearEmpiricalDifficultiesDialog'
    | 'showDiscardDraftDialog'
    | 'showDiscardPersonalItemDataDialog'
    | 'showExplorerDraftStatus'
    | 'showHistory'
    | 'showLeaveWithChangesDialog'
    | 'showPersonalItemData'
    | 'showReadOnlyPreviewBanner'
    | 'showRenumberDialog'
    | 'sortField'
    | 'stayOnPage'
    | 'toggleFullscreen'
    | 'toggleReadOnlyPreview'
    | 'visibleItemsCount'
  >
>;

export type ItemExplorerTableViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'addCustomTag'
    | 'addItemTag'
    | 'addPersonalItemTagToRow'
    | 'applyFilter'
    | 'availablePersonalTagsForRow'
    | 'availableTags'
    | 'canChangePersonalItemData'
    | 'canEditExplorer'
    | 'canPreviewItem'
    | 'collectionBusy'
    | 'collectionLoadState'
    | 'columnFilters'
    | 'columns'
    | 'enableItemCollections'
    | 'enableTags'
    | 'excludedItemsCount'
    | 'filterText'
    | 'filteredItems'
    | 'flushPersonalItemDataSave'
    | 'getItemRowId'
    | 'getMetaSortIndicator'
    | 'getMetadataColumnDisplayValue'
    | 'getPersonalTagColor'
    | 'getPlayerTarget'
    | 'getSortIndicator'
    | 'hasEmpiricalDifficulty'
    | 'hasMeanTaskDifficulty'
    | 'hasPartialCredit'
    | 'isItemExcluded'
    | 'isItemInActiveCollection'
    | 'itemSubIdLabel'
    | 'itemListLoading'
    | 'itemListSlow'
    | 'itemTags'
    | 'onTableKeydown'
    | 'openDiscardPersonalItemDataDialog'
    | 'personalColumnFilters'
    | 'personalDataError'
    | 'personalDataLoadState'
    | 'personalDataSaveState'
    | 'personalItemCategoryLabel'
    | 'personalItemCategoryValues'
    | 'personalItemData'
    | 'personalItemTagLabel'
    | 'removeItemTag'
    | 'removePersonalItemTagFromRow'
    | 'retryPersonalItemDataLoad'
    | 'retryPersonalItemDataSave'
    | 'selectItem'
    | 'selectedItem'
    | 'setColumnFilter'
    | 'setFilterText'
    | 'setPersonalColumnFilter'
    | 'setPersonalItemCategory'
    | 'setPersonalItemNote'
    | 'showExcludedItems'
    | 'showExplorerKeyboardHints'
    | 'showPersonalItemData'
    | 'showPlayerTargetInfo'
    | 'sortBy'
    | 'sortByMeta'
    | 'toggleItemInActiveCollection'
    | 'toggleShowExcludedItems'
  >
>;

export type ItemExplorerCollectionsViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'activateCollection'
    | 'activeCollectionId'
    | 'activeCollectionItems'
    | 'activeItemCollection'
    | 'clearActiveCollection'
    | 'collectionBusy'
    | 'collectionError'
    | 'collectionLoadState'
    | 'createCollection'
    | 'deleteActiveCollection'
    | 'enableItemCollections'
    | 'exportActiveCollection'
    | 'formatDuration'
    | 'itemCollections'
    | 'loadItemCollections'
    | 'removeRowFromActiveCollection'
    | 'renameActiveCollection'
    | 'showCollectionDrawer'
    | 'toggleCollectionDrawer'
  >
>;

export type ItemExplorerPreviewViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'applyCustomPreviewTarget'
    | 'canEditExplorer'
    | 'canPreviewSelectedItem'
    | 'customPreviewTargetDraft'
    | 'filteredItems'
    | 'hasStoredPreviewTargetOverride'
    | 'isItemExcluded'
    | 'isPreviewLoading'
    | 'itemSubIdLabel'
    | 'loadAllResponseStates'
    | 'navigateItem'
    | 'onPagingModeChange'
    | 'onPlayerLoaded'
    | 'onPreviewTargetSelectionChange'
    | 'openCodingOverlay'
    | 'pagingMode'
    | 'playerHeight'
    | 'playerSrcDoc'
    | 'previewTargetDefaultOptionLabel'
    | 'previewTargetOptions'
    | 'previewUnavailableMessage'
    | 'previewUnavailableReason'
    | 'previewLoadPhase'
    | 'previewSlow'
    | 'previewUpdateInProgress'
    | 'resetPreviewTargetSelection'
    | 'resetResponseState'
    | 'saveCurrentResponseState'
    | 'selectedIndex'
    | 'selectedItem'
    | 'selectedItemTarget'
    | 'selectedItemUsesDerivedTarget'
    | 'selectedPreviewTarget'
    | 'selectedPreviewTargetId'
    | 'setCustomPreviewTargetDraft'
    | 'setMetadataDrawerOpen'
    | 'setPagingMode'
    | 'setSelectedPreviewTargetId'
    | 'shouldRenderPlayerFrame'
    | 'showMetadataDrawer'
    | 'showPlayerTargetInfo'
    | 'showPreviewTargetSelector'
    | 'toggleSelectedItemExclusion'
  >
>;

export type ItemExplorerCodingDialogViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'closeCodingOverlay'
    | 'codingSearchText'
    | 'codingVariableFocus'
    | 'codingVariableFocusMessage'
    | 'currentCodingSchemeAsText'
    | 'filteredCodingSchemeAsText'
    | 'getCodingSortIndicator'
    | 'itemSubIdLabel'
    | 'selectedItem'
    | 'setCodingSearchText'
    | 'showOverlay'
    | 'toggleCodingSort'
  >
>;

export type ItemExplorerMetadataDrawerViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'currentUnitMetadata'
    | 'extractLabel'
    | 'extractValueText'
    | 'selectedItem'
    | 'setMetadataDrawerOpen'
    | 'showMetadataDrawer'
  >
>;

export type ItemExplorerUploadDialogsViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'closeUploadErrorDialog'
    | 'closeUploadReport'
    | 'errorMessage'
    | 'getUploadSuccessBookletSummary'
    | 'getUploadSuccessFieldSummary'
    | 'showErrorDialog'
    | 'showUploadReport'
    | 'uploadResult'
  >
>;

export type ItemExplorerColumnManagerDialogViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'allColumns'
    | 'closeColumnManager'
    | 'columnFilterText'
    | 'filteredAllColumns'
    | 'metadataSettings'
    | 'moveColumnDown'
    | 'moveColumnUp'
    | 'resetToDefault'
    | 'saveMetadataSettings'
    | 'setColumnFilterText'
    | 'showColumnManager'
    | 'toggleColumnVisibility'
  >
>;

export type ItemExplorerResponseStateDialogsViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'allResponseStates'
    | 'closeDeleteConfirmDialog'
    | 'closeRawDataOverlay'
    | 'closeSaveConfirmDialog'
    | 'confirmDeleteResponseState'
    | 'confirmDialogError'
    | 'confirmDialogState'
    | 'confirmSaveResponseState'
    | 'selectedItem'
    | 'showDeleteConfirmDialog'
    | 'showRawDataOverlay'
    | 'showSaveConfirmDialog'
  >
>;

export type ItemExplorerHistoryDialogViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'closeHistoryOverlay'
    | 'exportHistoryCsv'
    | 'filteredHistoryEntries'
    | 'historyError'
    | 'historyFilterFrom'
    | 'historyFilterTo'
    | 'historyFilterType'
    | 'historyFilterUser'
    | 'historyLoading'
    | 'setHistoryFilter'
    | 'showHistory'
    | 'showHistoryOverlay'
  >
>;

export type ItemExplorerDraftDialogsViewModel = ReadonlyViewModelSlice<
  Pick<
    ItemExplorerFacade,
    | 'cancelSavePreviewDialog'
    | 'confirmSaveExplorerDraft'
    | 'draftPreviewSummary'
    | 'explorerPublishedVersion'
    | 'explorerVersion'
    | 'showSavePreviewDialog'
  >
>;
