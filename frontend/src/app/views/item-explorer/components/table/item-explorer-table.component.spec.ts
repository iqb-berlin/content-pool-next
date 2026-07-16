import { ElementRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemExplorerTableComponent } from './item-explorer-table.component';
import template from './item-explorer-table.component.html?raw';

describe('ItemExplorerTableComponent', () => {
  it('names shared tag and personal category selectors per item', () => {
    expect(template).toContain("[attr.aria-label]=\"'Tag für ' + item.itemId + ' hinzufügen'\"");
    expect(template).toContain(
      '[attr.aria-label]="vm.personalItemCategoryLabel + \' für \' + item.itemId"',
    );
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
