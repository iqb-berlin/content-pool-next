import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { ItemListPreferencesService } from './item-list-preferences.service';
import { ItemListComponent } from './item-list.component';
import { ItemListPreferences } from './item-list.models';

const emptyPreferences = (): ItemListPreferences => ({
  ui: {
    filterText: '',
    meanTaskDifficultyFilter: '',
    sortField: 'itemId',
    sortDir: 'asc',
  },
  tags: {},
});

describe('ItemListComponent', () => {
  const createComponent = (options?: {
    getAcpStartPage?: () => unknown;
    getViewItems?: () => unknown;
    loadPreferences?: () => unknown;
  }) => {
    const preferences = {
      load: vi.fn(options?.loadPreferences || (() => of(emptyPreferences()))),
      save: vi.fn((value: ItemListPreferences) => value),
    };
    const component = new ItemListComponent(
      { snapshot: { paramMap: { get: () => 'acp-1' } } } as never,
      {
        getAcpStartPage: options?.getAcpStartPage || (() => of({ featureConfig: {} })),
        getViewItems: options?.getViewItems || (() => of([])),
      } as never,
      preferences as unknown as ItemListPreferencesService,
    );
    return { component, preferences };
  };

  it('filters and sorts mean task difficulty numerically with missing values last', () => {
    const { component } = createComponent();
    component.items = [
      { itemId: 'a', unitId: 'A', unitName: 'A', meanTaskDifficulty: -0.25 },
      { itemId: 'b', unitId: 'B', unitName: 'B', meanTaskDifficulty: 1 },
      { itemId: 'c', unitId: 'C', unitName: 'C' },
    ];
    component.meanTaskDifficultyFilter = '-0.5..0';

    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['a']);

    component.meanTaskDifficultyFilter = '';
    component.applyFilter(false);
    component.sortBy('meanTaskDifficulty');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['a', 'b', 'c']);

    component.sortBy('meanTaskDifficulty');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['b', 'a', 'c']);
  });

  it('uses the same numeric filter grammar as the Item Explorer', () => {
    const { component } = createComponent();
    component.items = [
      { itemId: 'negative', unitId: 'A', unitName: 'A', meanTaskDifficulty: -0.25 },
      { itemId: 'positive', unitId: 'B', unitName: 'B', meanTaskDifficulty: 1 },
    ];

    component.meanTaskDifficultyFilter = '-0,5..0,5';
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['negative']);

    component.meanTaskDifficultyFilter = '>=1';
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['positive']);

    component.meanTaskDifficultyFilter = '..0';
    component.applyFilter(false);
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['negative']);
  });

  it.each(['preferences-first', 'items-first'])(
    'builds one reconciled state after %s initialization',
    (responseOrder) => {
      const items$ = new Subject<Array<{ itemId: string; unitId: string; unitName: string }>>();
      const preferences$ = new Subject<ItemListPreferences>();
      const { component, preferences } = createComponent({
        getAcpStartPage: () =>
          of({ featureConfig: { persistUserPreferences: true, enableItemListTags: true } }),
        getViewItems: () => items$,
        loadPreferences: () => preferences$,
      });
      const restored: ItemListPreferences = {
        ui: {
          filterText: '',
          meanTaskDifficultyFilter: '-0.5..0',
          sortField: 'meanTaskDifficulty',
          sortDir: 'desc',
        },
        tags: { a: ['review'] },
      };
      const items = [{ itemId: 'a', unitId: 'A', unitName: 'A' }];

      component.ngOnInit();
      if (responseOrder === 'preferences-first') {
        preferences$.next(restored);
        preferences$.complete();
        expect(component.items).toEqual([]);
        items$.next(items);
        items$.complete();
      } else {
        items$.next(items);
        items$.complete();
        expect(component.items).toEqual([]);
        preferences$.next(restored);
        preferences$.complete();
      }

      expect(component.items).toEqual(items);
      expect(component.meanTaskDifficultyFilter).toBe('');
      expect(component.sortField).toBe('itemId');
      expect(component.sortDir).toBe('desc');
      expect(component.filteredItems).toEqual(items);
      expect(component.itemTags).toEqual({ a: ['review'] });
      expect(preferences.save).toHaveBeenCalledWith({
        ui: {
          filterText: '',
          meanTaskDifficultyFilter: '',
          sortField: 'itemId',
          sortDir: 'desc',
        },
        tags: { a: ['review'] },
      });
      component.ngOnDestroy();
    },
  );

  it('keeps valid mean preferences when the backend provides means', () => {
    const restored: ItemListPreferences = {
      ui: {
        filterText: '',
        meanTaskDifficultyFilter: '-0.5..0',
        sortField: 'meanTaskDifficulty',
        sortDir: 'asc',
      },
      tags: {},
    };
    const { component, preferences } = createComponent({
      getViewItems: () =>
        of([
          { itemId: 'a', unitId: 'A', unitName: 'A', meanTaskDifficulty: -0.25 },
          { itemId: 'b', unitId: 'B', unitName: 'B', meanTaskDifficulty: 1 },
        ]),
      loadPreferences: () => of(restored),
    });

    component.ngOnInit();

    expect(component.meanTaskDifficultyFilter).toBe('-0.5..0');
    expect(component.sortField).toBe('meanTaskDifficulty');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['a']);
    expect(preferences.save).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
});
