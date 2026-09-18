import { describe, expect, it } from 'vitest';
import { BookletSelectionComponent } from './booklet-selection.component';

describe('BookletSelectionComponent', () => {
  it('keeps booklets ungrouped and sorts them by ID', () => {
    const component = new BookletSelectionComponent();
    component.booklets = [
      { id: 'alpha-2', name: 'Gemeinsame Bezeichnung' },
      { id: 'beta-1', name: 'Andere Bezeichnung' },
      { id: 'alpha-1', name: 'Gemeinsame Bezeichnung' },
    ];

    expect(component.filteredBooklets).toEqual([
      { id: 'alpha-1', name: 'Gemeinsame Bezeichnung' },
      { id: 'alpha-2', name: 'Gemeinsame Bezeichnung' },
      { id: 'beta-1', name: 'Andere Bezeichnung' },
    ]);
    expect(component.labelOptions).toEqual(['Andere Bezeichnung', 'Gemeinsame Bezeichnung']);
    expect(component.filteredCount).toBe(3);
  });

  it('filters by label or ID without package-specific prefixes', () => {
    const component = new BookletSelectionComponent();
    component.booklets = [
      { id: 'instrument-01', name: 'Überprüfung' },
      { id: 'instrument-02', name: 'Überprüfung' },
    ];

    component.searchQuery = 'uber';
    expect(component.filteredCount).toBe(2);

    component.searchQuery = '02';
    expect(component.filteredBooklets).toEqual([{ id: 'instrument-02', name: 'Überprüfung' }]);
  });

  it('offers an explicit label filter without treating labels as groups', () => {
    const component = new BookletSelectionComponent();
    component.booklets = [
      { id: 'booklet-2', name: 'Teil 2' },
      { id: 'booklet-1', name: 'Teil 1' },
      { id: 'booklet-3', name: 'Teil 2' },
    ];

    component.selectedLabel = 'Teil 2';

    expect(component.filteredBooklets.map((item) => item.id)).toEqual(['booklet-2', 'booklet-3']);
  });

  it('uses the ID as a fallback for a missing name', () => {
    const component = new BookletSelectionComponent();
    component.booklets = [{ id: 'booklet-without-name' }];

    expect(component.displayName(component.booklets[0])).toBe('booklet-without-name');
    expect(component.filteredBooklets[0].id).toBe('booklet-without-name');
  });
});
