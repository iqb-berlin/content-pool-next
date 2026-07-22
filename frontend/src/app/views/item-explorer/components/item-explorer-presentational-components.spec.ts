/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import { ItemExplorerCodingDialogComponent } from './coding-dialog/item-explorer-coding-dialog.component';
import codingTemplate from './coding-dialog/item-explorer-coding-dialog.component.html?raw';
import { ItemExplorerCollectionsComponent } from './collections/item-explorer-collections.component';
import collectionsTemplate from './collections/item-explorer-collections.component.html?raw';
import { ItemExplorerColumnManagerDialogComponent } from './column-manager-dialog/item-explorer-column-manager-dialog.component';
import columnManagerTemplate from './column-manager-dialog/item-explorer-column-manager-dialog.component.html?raw';
import { ItemExplorerDraftDialogsComponent } from './draft-dialogs/item-explorer-draft-dialogs.component';
import draftDialogsTemplate from './draft-dialogs/item-explorer-draft-dialogs.component.html?raw';
import { ItemExplorerHeaderComponent } from './header/item-explorer-header.component';
import headerTemplate from './header/item-explorer-header.component.html?raw';
import { ItemExplorerHistoryDialogComponent } from './history-dialog/item-explorer-history-dialog.component';
import historyTemplate from './history-dialog/item-explorer-history-dialog.component.html?raw';
import { ItemExplorerMetadataDrawerComponent } from './metadata-drawer/item-explorer-metadata-drawer.component';
import metadataTemplate from './metadata-drawer/item-explorer-metadata-drawer.component.html?raw';
import { ItemExplorerResponseStateDialogsComponent } from './response-state-dialogs/item-explorer-response-state-dialogs.component';
import responseStateTemplate from './response-state-dialogs/item-explorer-response-state-dialogs.component.html?raw';
import { ItemExplorerUploadDialogsComponent } from './upload-dialogs/item-explorer-upload-dialogs.component';
import uploadTemplate from './upload-dialogs/item-explorer-upload-dialogs.component.html?raw';

describe('ItemExplorer presentational components', () => {
  it.each([
    ['header', 'headerViewModel', (facade: any) => new ItemExplorerHeaderComponent(facade)],
    [
      'collections',
      'collectionsViewModel',
      (facade: any) => new ItemExplorerCollectionsComponent(facade),
    ],
    [
      'coding dialog',
      'codingDialogViewModel',
      (facade: any) => new ItemExplorerCodingDialogComponent(facade),
    ],
    [
      'metadata drawer',
      'metadataDrawerViewModel',
      (facade: any) => new ItemExplorerMetadataDrawerComponent(facade),
    ],
    [
      'upload dialogs',
      'uploadDialogsViewModel',
      (facade: any) => new ItemExplorerUploadDialogsComponent(facade),
    ],
    [
      'column manager',
      'columnManagerDialogViewModel',
      (facade: any) => new ItemExplorerColumnManagerDialogComponent(facade),
    ],
    [
      'response state dialogs',
      'responseStateDialogsViewModel',
      (facade: any) => new ItemExplorerResponseStateDialogsComponent(facade),
    ],
    [
      'history dialog',
      'historyDialogViewModel',
      (facade: any) => new ItemExplorerHistoryDialogComponent(facade),
    ],
    [
      'draft dialogs',
      'draftDialogsViewModel',
      (facade: any) => new ItemExplorerDraftDialogsComponent(facade),
    ],
  ])('binds the %s to its dedicated facade slice', (_name, sliceName, createComponent) => {
    const slice = {};
    const component = createComponent({ [sliceName]: slice });

    expect(component.vm).toBe(slice);
  });

  it.each([
    ['header fullscreen', headerTemplate, '(click)="vm.toggleFullscreen()"'],
    ['header save', headerTemplate, '(click)="vm.openSavePreviewDialog()"'],
    ['collections create', collectionsTemplate, '(click)="vm.createCollection()"'],
    ['collections delete', collectionsTemplate, '(click)="deleteActiveCollection()"'],
    ['coding close', codingTemplate, '(click)="vm.closeCodingOverlay()"'],
    ['metadata close', metadataTemplate, '(click)="vm.setMetadataDrawerOpen(false)"'],
    ['upload close', uploadTemplate, '(click)="vm.closeUploadReport(true)"'],
    ['column save', columnManagerTemplate, '(click)="vm.saveMetadataSettings()"'],
    ['response save', responseStateTemplate, '(click)="vm.confirmSaveResponseState()"'],
    ['history refresh', historyTemplate, '(click)="vm.showHistory()"'],
    ['draft save', draftDialogsTemplate, '(click)="vm.confirmSaveExplorerDraft()"'],
  ])('keeps the %s action binding in the production template', (_name, template, binding) => {
    expect(template).toContain(binding);
  });

  it('gives the collection selector an accessible name', () => {
    expect(collectionsTemplate).toContain('aria-label="Aktive persönliche Auswahlliste auswählen"');
  });

  it('renders collection details as an accessible paginated modal', () => {
    expect(collectionsTemplate).toContain('role="dialog"');
    expect(collectionsTemplate).toContain('aria-modal="true"');
    expect(collectionsTemplate).toContain('pagedCollectionItems');
    expect(collectionsTemplate).toContain('Alle Einträge auf dieser Seite auswählen');
    expect(collectionsTemplate).toContain('[error]="removeConfirmationError"');
  });

  it('filters and paginates large collections without exposing more than 50 rows', () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      rowKey: `row-${index}`,
      position: index + 1,
      item: {
        unitLabel: `Aufgabe ${index}`,
        itemId: `item-${index}`,
        subId: String(index),
      },
    }));
    const vm = { activeCollectionItems: entries };
    const component = new ItemExplorerCollectionsComponent({ collectionsViewModel: vm } as any);

    expect(component.pagedCollectionItems).toHaveLength(50);
    component.nextPage();
    expect(component.pagedCollectionItems[0].position).toBe(51);

    component.toggleCurrentPage(true);
    expect(component.selectedCount).toBe(50);
    component.setCollectionFilterText('item-9999');
    expect(component.selectedCount).toBe(0);
    expect(component.filteredCollectionItems.map((entry) => entry.rowKey)).toEqual(['row-9999']);
    expect(component.collectionPage).toBe(1);
  });
});
