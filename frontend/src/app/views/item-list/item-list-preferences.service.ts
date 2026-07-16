import { Injectable, OnDestroy } from '@angular/core';
import {
  catchError,
  debounceTime,
  EMPTY,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
} from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ItemListPreferences, ItemListSortField, ItemListUiPreferences } from './item-list.models';

export interface ItemListPreferenceContext {
  acpId: string;
  persist: boolean;
  enableTags: boolean;
}

const DEFAULT_UI_PREFERENCES: ItemListUiPreferences = {
  filterText: '',
  meanTaskDifficultyFilter: '',
  sortField: 'itemId',
  sortDir: 'asc',
};

@Injectable()
export class ItemListPreferencesService implements OnDestroy {
  private readonly viewId = 'item-list';
  private readonly destroy$ = new Subject<void>();
  private readonly serverSaveRequests$ = new Subject<ItemListPreferences>();
  private context: ItemListPreferenceContext = {
    acpId: '',
    persist: false,
    enableTags: false,
  };
  private useServerPreferences = false;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.serverSaveRequests$
      .pipe(
        debounceTime(250),
        switchMap((preferences) =>
          this.api.saveViewItemPreferences(this.context.acpId, preferences, this.viewId).pipe(
            catchError((error) => {
              console.error('Failed to persist item list preferences', error);
              return EMPTY;
            }),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  load(context: ItemListPreferenceContext): Observable<ItemListPreferences> {
    this.context = context;
    this.useServerPreferences = context.persist && this.auth.isLoggedIn;

    if (!context.persist) {
      return of(this.emptyPreferences());
    }
    if (!this.useServerPreferences) {
      return of(this.loadLocalPreferences());
    }

    return this.api.getViewItemPreferences(context.acpId, this.viewId).pipe(
      map((preferences) =>
        this.normalizePreferences({
          ui: preferences?.ui,
          tags: context.enableTags ? preferences?.tags : {},
        }),
      ),
      catchError(() => of(this.loadLocalPreferences())),
    );
  }

  save(preferences: ItemListPreferences): ItemListPreferences {
    const normalized = this.normalizePreferences(preferences);
    if (!this.context.persist) {
      return normalized;
    }

    if (this.useServerPreferences) {
      this.serverSaveRequests$.next(normalized);
    } else {
      localStorage.setItem(this.uiPreferencesKey(), JSON.stringify(normalized.ui));
      if (this.context.enableTags) {
        localStorage.setItem(this.tagPreferencesKey(), JSON.stringify(normalized.tags));
      }
    }
    return normalized;
  }

  normalizePreferences(raw: { ui?: unknown; tags?: unknown }): ItemListPreferences {
    return {
      ui: this.normalizeUiPreferences(raw.ui),
      tags: this.context.enableTags ? this.normalizeTags(raw.tags) : {},
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyPreferences(): ItemListPreferences {
    return { ui: { ...DEFAULT_UI_PREFERENCES }, tags: {} };
  }

  private loadLocalPreferences(): ItemListPreferences {
    return this.normalizePreferences({
      ui: this.parseJsonObject(localStorage.getItem(this.uiPreferencesKey())),
      tags: this.context.enableTags
        ? this.parseJsonObject(localStorage.getItem(this.tagPreferencesKey()))
        : {},
    });
  }

  private normalizeUiPreferences(raw: unknown): ItemListUiPreferences {
    const value = this.isObject(raw) ? raw : {};
    const sortField = value['sortField'];
    const allowedSortFields: ItemListSortField[] = [
      'itemId',
      'unitId',
      'name',
      'meanTaskDifficulty',
    ];

    return {
      filterText: typeof value['filterText'] === 'string' ? value['filterText'] : '',
      meanTaskDifficultyFilter:
        typeof value['meanTaskDifficultyFilter'] === 'string'
          ? value['meanTaskDifficultyFilter']
          : '',
      sortField:
        typeof sortField === 'string' && allowedSortFields.includes(sortField as ItemListSortField)
          ? (sortField as ItemListSortField)
          : 'itemId',
      sortDir: value['sortDir'] === 'desc' ? 'desc' : 'asc',
    };
  }

  private normalizeTags(raw: unknown): Record<string, string[]> {
    if (!this.isObject(raw)) return {};

    const tags: Record<string, string[]> = {};
    for (const [itemId, values] of Object.entries(raw)) {
      const normalizedItemId = itemId.trim();
      if (!normalizedItemId || !Array.isArray(values)) continue;
      const normalizedValues = Array.from(
        new Set(
          values.map((value) => String(value || '').trim()).filter((value) => value.length > 0),
        ),
      );
      if (normalizedValues.length) tags[normalizedItemId] = normalizedValues;
    }
    return tags;
  }

  private uiPreferencesKey(): string {
    return `cp:item-list:prefs:${this.context.acpId}:${this.preferenceIdentity()}`;
  }

  private tagPreferencesKey(): string {
    return `cp:item-list:tags:${this.context.acpId}:${this.preferenceIdentity()}`;
  }

  private preferenceIdentity(): string {
    return this.auth.currentUser?.id || 'anonymous';
  }

  private parseJsonObject(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return this.isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
