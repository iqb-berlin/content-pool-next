import { of, Subject } from 'rxjs';
import { afterEach, vi } from 'vitest';
import { ItemListComponent } from './item-list.component';

describe('ItemListComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const createComponent = () =>
    new ItemListComponent(
      { snapshot: { paramMap: { get: () => 'acp-1' } } } as any,
      {
        getAcpStartPage: () => of({ featureConfig: {} }),
        getViewItems: () => of([]),
      } as any,
      { isLoggedIn: false, currentUser: null } as any,
    );

  it('filters and sorts mean task difficulty numerically with missing values last', () => {
    const component = createComponent();
    component.items = [
      { itemId: 'a', unitId: 'A', meanTaskDifficulty: -0.25 },
      { itemId: 'b', unitId: 'B', meanTaskDifficulty: 1 },
      { itemId: 'c', unitId: 'C' },
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
    const component = createComponent();
    component.items = [
      { itemId: 'negative', unitId: 'A', meanTaskDifficulty: -0.25 },
      { itemId: 'positive', unitId: 'B', meanTaskDifficulty: 1 },
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

  it('removes a restored mean filter when preferences arrive after a list without values', () => {
    vi.useFakeTimers();
    const startPage$ = new Subject<any>();
    const items$ = new Subject<any[]>();
    const preferences$ = new Subject<any>();
    const saveViewItemPreferences = vi.fn((_: string, preferences: any) => of(preferences));
    const component = new ItemListComponent(
      { snapshot: { paramMap: { get: () => 'acp-1' } } } as any,
      {
        getAcpStartPage: () => startPage$,
        getViewItems: () => items$,
        getViewItemPreferences: () => preferences$,
        saveViewItemPreferences,
      } as any,
      { isLoggedIn: true, currentUser: { id: 'user-1' } } as any,
    );

    component.ngOnInit();
    items$.next([{ itemId: 'a', unitId: 'A' }]);
    startPage$.next({ featureConfig: { persistUserPreferences: true } });
    preferences$.next({
      ui: {
        meanTaskDifficultyFilter: '-0.5..0',
        sortField: 'meanTaskDifficulty',
        sortDir: 'desc',
      },
    });

    expect(component.meanTaskDifficultyFilter).toBe('');
    expect(component.sortField).toBe('itemId');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['a']);

    vi.advanceTimersByTime(250);
    expect(saveViewItemPreferences).toHaveBeenCalledWith(
      'acp-1',
      {
        ui: expect.objectContaining({
          meanTaskDifficultyFilter: '',
          sortField: 'itemId',
        }),
        tags: {},
      },
      'item-list',
    );
    component.ngOnDestroy();
  });

  it('persists reconciled mean preferences in local storage', () => {
    localStorage.setItem(
      'cp:item-list:prefs:acp-1:anonymous',
      JSON.stringify({
        meanTaskDifficultyFilter: '-0.5..0',
        sortField: 'meanTaskDifficulty',
        sortDir: 'desc',
      }),
    );
    const startPage$ = new Subject<any>();
    const items$ = new Subject<any[]>();
    const component = new ItemListComponent(
      { snapshot: { paramMap: { get: () => 'acp-1' } } } as any,
      {
        getAcpStartPage: () => startPage$,
        getViewItems: () => items$,
      } as any,
      { isLoggedIn: false, currentUser: null } as any,
    );

    component.ngOnInit();
    items$.next([{ itemId: 'a', unitId: 'A' }]);
    startPage$.next({ featureConfig: { persistUserPreferences: true } });

    expect(
      JSON.parse(localStorage.getItem('cp:item-list:prefs:acp-1:anonymous') || '{}'),
    ).toEqual({
      filterText: '',
      meanTaskDifficultyFilter: '',
      sortField: 'itemId',
      sortDir: 'desc',
    });
  });

  it('keeps a restored mean filter when preferences arrive before a list with values', () => {
    const startPage$ = new Subject<any>();
    const items$ = new Subject<any[]>();
    const preferences$ = new Subject<any>();
    const component = new ItemListComponent(
      { snapshot: { paramMap: { get: () => 'acp-1' } } } as any,
      {
        getAcpStartPage: () => startPage$,
        getViewItems: () => items$,
        getViewItemPreferences: () => preferences$,
      } as any,
      { isLoggedIn: true, currentUser: { id: 'user-1' } } as any,
    );

    component.ngOnInit();
    startPage$.next({ featureConfig: { persistUserPreferences: true } });
    preferences$.next({
      ui: {
        meanTaskDifficultyFilter: '-0.5..0',
        sortField: 'meanTaskDifficulty',
        sortDir: 'asc',
      },
    });
    items$.next([
      { itemId: 'a', unitId: 'A', meanTaskDifficulty: -0.25 },
      { itemId: 'b', unitId: 'B', meanTaskDifficulty: 1 },
    ]);

    expect(component.meanTaskDifficultyFilter).toBe('-0.5..0');
    expect(component.sortField).toBe('meanTaskDifficulty');
    expect(component.filteredItems.map((item) => item.itemId)).toEqual(['a']);
  });
});
