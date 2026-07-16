import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, vi } from 'vitest';
import { ItemListPreferencesService } from './item-list-preferences.service';
import { ItemListPreferences } from './item-list.models';

describe('ItemListPreferencesService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('falls back to normalized local preferences when the server load fails', async () => {
    localStorage.setItem(
      'cp:item-list:prefs:acp-1:user-1',
      JSON.stringify({
        filterText: 'alpha',
        sortField: 'meanTaskDifficulty',
        sortDir: 'desc',
      }),
    );
    localStorage.setItem(
      'cp:item-list:tags:acp-1:user-1',
      JSON.stringify({ item1: [' review ', 'review', ''] }),
    );
    const service = new ItemListPreferencesService(
      {
        getViewItemPreferences: () => throwError(() => new Error('offline')),
      } as never,
      { isLoggedIn: true, currentUser: { id: 'user-1' } } as never,
    );

    await expect(
      firstValueFrom(service.load({ acpId: 'acp-1', persist: true, enableTags: true })),
    ).resolves.toEqual({
      ui: {
        filterText: 'alpha',
        meanTaskDifficultyFilter: '',
        sortField: 'meanTaskDifficulty',
        sortDir: 'desc',
      },
      tags: { item1: ['review'] },
    });
    service.ngOnDestroy();
  });

  it('persists a complete normalized local snapshot under the existing keys', async () => {
    const service = new ItemListPreferencesService(
      {} as never,
      { isLoggedIn: false, currentUser: null } as never,
    );
    await firstValueFrom(service.load({ acpId: 'acp-1', persist: true, enableTags: true }));

    service.save({
      ui: {
        filterText: 'x',
        meanTaskDifficultyFilter: '>=0',
        sortField: 'meanTaskDifficulty',
        sortDir: 'desc',
      },
      tags: { item1: [' one ', 'one', 'two'] },
    });

    expect(JSON.parse(localStorage.getItem('cp:item-list:prefs:acp-1:anonymous') || '{}')).toEqual({
      filterText: 'x',
      meanTaskDifficultyFilter: '>=0',
      sortField: 'meanTaskDifficulty',
      sortDir: 'desc',
    });
    expect(JSON.parse(localStorage.getItem('cp:item-list:tags:acp-1:anonymous') || '{}')).toEqual({
      item1: ['one', 'two'],
    });
    service.ngOnDestroy();
  });

  it('debounces full server saves and continues after a failed request', async () => {
    vi.useFakeTimers();
    const saveViewItemPreferences = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('save failed')))
      .mockReturnValue(of({}));
    const service = new ItemListPreferencesService(
      {
        getViewItemPreferences: () => of({ ui: {}, tags: {} }),
        saveViewItemPreferences,
      } as never,
      { isLoggedIn: true, currentUser: { id: 'user-1' } } as never,
    );
    await firstValueFrom(service.load({ acpId: 'acp-1', persist: true, enableTags: true }));
    const first: ItemListPreferences = {
      ui: {
        filterText: 'first',
        meanTaskDifficultyFilter: '',
        sortField: 'itemId',
        sortDir: 'asc',
      },
      tags: {},
    };
    const latest = { ...first, ui: { ...first.ui, filterText: 'latest' } };

    service.save(first);
    service.save(latest);
    await vi.advanceTimersByTimeAsync(250);
    expect(saveViewItemPreferences).toHaveBeenCalledTimes(1);
    expect(saveViewItemPreferences).toHaveBeenLastCalledWith('acp-1', latest, 'item-list');

    service.save({ ...latest, tags: { item1: ['tag'] } });
    await vi.advanceTimersByTimeAsync(250);
    expect(saveViewItemPreferences).toHaveBeenCalledTimes(2);
    service.ngOnDestroy();
  });
});
