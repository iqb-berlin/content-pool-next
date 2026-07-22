/// <reference types="vite/client" />

import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerCollectionsComponent } from './item-explorer-collections.component';
import collectionsTemplate from './item-explorer-collections.component.html?raw';
import collectionsStyles from './item-explorer-collections.component.css?raw';

describe('ItemExplorerCollectionsComponent', () => {
  beforeAll(async () => {
    await resolveComponentResources((url) => {
      if (url.endsWith('item-explorer-collections.component.html')) {
        return Promise.resolve(collectionsTemplate);
      }
      if (url.endsWith('item-explorer-collections.component.css')) {
        return Promise.resolve(collectionsStyles);
      }
      return Promise.reject(new Error(`Unexpected component resource: ${url}`));
    });
  });

  afterAll(() => TestBed.resetTestingModule());

  it('renders no more than 50 collection rows for 10,000 entries', async () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      rowKey: `row-${index}`,
      position: index + 1,
      item: {
        unitLabel: `Aufgabe ${index}`,
        itemId: `item-${index}`,
        subId: String(index),
      },
    }));
    const summary = {
      rowCount: entries.length,
      itemCount: entries.length,
      unitCount: entries.length,
      itemTimeSeconds: 0,
      stimulusTimeSeconds: 0,
      testTimeSeconds: 0,
      missingItemTimeCount: entries.length,
      missingStimulusTimeUnitCount: entries.length,
      complete: false,
    };
    const collection = {
      id: 'collection-1',
      name: 'Große Auswahlliste',
      rowKeys: entries.map((entry) => entry.rowKey),
      version: 1,
      createdAt: '',
      updatedAt: '',
      unavailableRowKeys: [],
      summary,
    };
    const noop = vi.fn();
    const vm = {
      enableItemCollections: true,
      collectionLoadState: 'loaded',
      collectionBusy: false,
      collectionError: '',
      collectionViewMode: 'all',
      activeCollectionId: collection.id,
      activeItemCollection: collection,
      activeCollectionItems: entries,
      itemCollections: [collection],
      showCollectionDialog: true,
      activateCollection: noop,
      clearActiveCollection: noop,
      closeCollectionDialog: noop,
      createCollection: noop,
      deleteActiveCollection: noop,
      exportActiveCollection: noop,
      formatDuration: () => '0:00',
      loadItemCollections: noop,
      openCollectionDialog: noop,
      removeRowFromActiveCollection: noop,
      removeRowsFromActiveCollection: noop,
      renameActiveCollection: noop,
      setCollectionViewMode: noop,
    };

    await TestBed.configureTestingModule({
      imports: [ItemExplorerCollectionsComponent],
      providers: [{ provide: ItemExplorerFacade, useValue: { collectionsViewModel: vm } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ItemExplorerCollectionsComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.collection-table tbody tr')).toHaveLength(50);
  });

  it('resets selection on collection changes and isolates removal errors', async () => {
    const vm = {
      activeItemCollection: { id: 'collection-1' },
      activeCollectionItems: [{ rowKey: 'shared-row', position: 1, item: null }],
      collectionBusy: false,
      collectionError: 'Ein vorheriger Export ist fehlgeschlagen.',
      removeRowsFromActiveCollection: vi.fn().mockImplementation(async () => {
        vm.collectionError = 'Die Auswahlliste konnte nicht gespeichert werden.';
        return false;
      }),
    } as any;
    const component = new ItemExplorerCollectionsComponent({ collectionsViewModel: vm } as any);
    component.ngDoCheck();
    component.toggleRowSelection('shared-row', true);

    component.openRemoveConfirmation();
    expect(component.removeConfirmationError).toBe('');
    await component.confirmRemoveSelected();
    expect(component.removeConfirmationError).toBe(
      'Die Auswahlliste konnte nicht gespeichert werden.',
    );

    vm.activeItemCollection = { id: 'collection-2' };
    component.ngDoCheck();

    expect(component.selectedCount).toBe(0);
    expect(component.showRemoveConfirmation).toBe(false);
    expect(component.removeConfirmationError).toBe('');
  });
});
