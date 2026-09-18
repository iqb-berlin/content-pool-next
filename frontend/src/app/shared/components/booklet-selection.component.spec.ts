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

  it('uses the ID as a fallback for a missing name', () => {
    const component = new BookletSelectionComponent();
    component.booklets = [{ id: 'booklet-without-name' }];

    expect(component.displayName(component.booklets[0])).toBe('booklet-without-name');
    expect(component.hasDistinctName(component.booklets[0])).toBe(false);
    expect(component.filteredBooklets[0].id).toBe('booklet-without-name');
  });

  it('shows a name only when it adds information to the ID', () => {
    const component = new BookletSelectionComponent();

    expect(component.hasDistinctName({ id: 'booklet-1', name: 'Teil 1' })).toBe(true);
    expect(component.hasDistinctName({ id: 'booklet-1', name: 'booklet-1' })).toBe(false);
  });
});
