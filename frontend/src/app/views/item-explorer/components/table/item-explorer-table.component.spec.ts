import { ElementRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemExplorerTableComponent } from './item-explorer-table.component';
import template from './item-explorer-table.component.html?raw';

describe('ItemExplorerTableComponent', () => {
  it('exposes the excluded-item filter as a semantic state button', () => {
    expect(template).toContain('class="btn btn-outline btn-sm btn-state"');
    expect(template).toContain('[attr.aria-pressed]="vm.showExcludedItems"');
    expect(template).not.toContain('btn-state-indicator');
  });

  it('names shared tag and personal category selectors per item', () => {
    expect(template).toContain("[attr.aria-label]=\"'Tag für ' + item.itemId + ' hinzufügen'\"");
    expect(template).toContain(
      '[attr.aria-label]="vm.personalItemCategoryLabel + \' für \' + item.itemId"',
    );
  });

  it('renders a gapless view position and the configured unified table columns', () => {
    expect(template).toContain('<td class="number-col">{{ i + 1 }}</td>');
    expect(template).toContain('@let tableColumns = vm.tableColumns;');
    expect(template).toContain('@for (col of tableColumns; track col.key)');
    expect(template).toContain('vm.isStickyTableColumn(col, tableColumns)');
    expect(template).toContain('[class.has-collection-selection]="vm.enableItemCollections"');
    expect(template).toContain("@case ('system:referenceNumber')");
    expect(template).toContain('{{ item.rowNumber }}');
    expect(template).toContain('[style.width.px]="vm.getColumnWidth(col)"');
  });

  it('distinguishes unavailable comment counts from a confirmed zero count', () => {
    expect(template).toContain('@if (!vm.itemCommentCountsAvailable)');
    expect(template).toContain("'Kommentaranzahl wird geladen'");
    expect(template).toContain("'Kommentaranzahl unbekannt'");
    expect(template).toContain('aria-label="Keine Kommentare"');
  });

  it('offers a dedicated empty state for an empty active selection list', () => {
    expect(template).toContain('Diese Auswahlliste ist noch leer.');
    expect(template).toContain('(click)="vm.setCollectionViewMode(\'all\')"');
  });

  it('owns filter focus and selection scrolling', () => {
    vi.useFakeTimers();
    const feature = {
      registerTableDom: vi.fn(),
      unregisterTableDom: vi.fn(),
      tableViewModel: {},
    } as any;
    const component = new ItemExplorerTableComponent(feature);
    const filterElement = document.createElement('input');
    document.body.appendChild(filterElement);
    const scrollElement = document.createElement('div');
    const row = document.createElement('tr');
    row.className = 'active';
    scrollElement.appendChild(row);
    const scrollIntoView = vi.fn();
    Object.defineProperty(row, 'scrollIntoView', { value: scrollIntoView });
    component.globalFilterInput = new ElementRef(filterElement);
    component.tableScroll = new ElementRef(scrollElement);

    component.focusFilter();
    component.scrollToSelection();
    vi.advanceTimersByTime(50);

    expect(document.activeElement).toBe(filterElement);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(component.vm).toBe(feature.tableViewModel);
    expect(feature.registerTableDom).toHaveBeenCalledWith(component);

    component.ngOnDestroy();
    filterElement.remove();
    expect(feature.unregisterTableDom).toHaveBeenCalledWith(component);
    vi.useRealTimers();
  });
});
