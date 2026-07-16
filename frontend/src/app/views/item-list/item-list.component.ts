import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, Subject, switchMap, takeUntil } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SimpleItemListEntry } from '../../core/models/api.models';
import { matchesNumericFilter } from '../../core/utils/numeric-filter.util';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { ItemListPreferencesService } from './item-list-preferences.service';
import { ItemListPreferences, ItemListSortField, ItemListUiPreferences } from './item-list.models';

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [RouterLink, FormsModule, BreadcrumbComponent],
  providers: [ItemListPreferencesService],
  templateUrl: './item-list.component.html',
  styleUrl: './item-list.component.scss',
})
export class ItemListComponent implements OnInit, OnDestroy {
  acpId = '';
  items: SimpleItemListEntry[] = [];
  filteredItems: SimpleItemListEntry[] = [];
  filterText = '';
  sortField: ItemListSortField = 'itemId';
  sortDir: 'asc' | 'desc' = 'asc';
  meanTaskDifficultyFilter = '';
  hasMeanTaskDifficulty = false;
  breadcrumbs: BreadcrumbItem[] = [];

  enableFilter = true;
  enableSort = true;
  enableClick = true;
  enableTags = false;
  availableTags: string[] = [];
  itemTags: Record<string, string[]> = {};
  persistUserPreferences = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly preferences: ItemListPreferencesService,
  ) {}

  ngOnInit(): void {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Liste' },
    ];

    this.api
      .getAcpStartPage(this.acpId)
      .pipe(
        switchMap((data) => {
          const featureConfig = data?.featureConfig || {};
          this.enableFilter = featureConfig.enableItemListFilter !== false;
          this.enableSort = featureConfig.enableItemListSort !== false;
          this.enableClick = featureConfig.enableItemClick !== false;
          this.enableTags = featureConfig.enableItemListTags === true;
          this.availableTags = Array.isArray(featureConfig.availableTags)
            ? featureConfig.availableTags
            : [];
          this.persistUserPreferences = featureConfig.persistUserPreferences === true;

          return forkJoin({
            items: this.api.getViewItems(this.acpId),
            preferences: this.preferences.load({
              acpId: this.acpId,
              persist: this.persistUserPreferences,
              enableTags: this.enableTags,
            }),
          });
        }),
        takeUntil(this.destroy$),
      )
      .subscribe(({ items, preferences }) => this.initializeViewState(items, preferences));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilter(shouldPersist = true): void {
    const term = this.filterText.toLowerCase();
    this.filteredItems = this.items.filter((item) => {
      const matchesText =
        item.itemId.toLowerCase().includes(term) ||
        (item.name || '').toLowerCase().includes(term) ||
        item.unitId.toLowerCase().includes(term) ||
        item.unitName.toLowerCase().includes(term);
      if (!matchesText) return false;
      if (!this.meanTaskDifficultyFilter) return true;
      return (
        typeof item.meanTaskDifficulty === 'number' &&
        matchesNumericFilter(item.meanTaskDifficulty, this.meanTaskDifficultyFilter)
      );
    });
    this.applySort(false);
    if (shouldPersist) this.savePreferences();
  }

  sortBy(field: ItemListSortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.applySort(false);
    this.savePreferences();
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applySort(false);
    this.savePreferences();
  }

  applySort(shouldPersist = true): void {
    this.filteredItems.sort((left, right) => {
      const leftValue = left[this.sortField];
      const rightValue = right[this.sortField];
      const leftMissing = leftValue === undefined || leftValue === null || leftValue === '';
      const rightMissing = rightValue === undefined || rightValue === null || rightValue === '';
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      const comparison =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue || '').localeCompare(String(rightValue || ''), undefined, {
              numeric: true,
            });
      return this.sortDir === 'asc' ? comparison : -comparison;
    });
    if (shouldPersist) this.savePreferences();
  }

  navigateToItem(_item: SimpleItemListEntry): void {
    // Navigation is handled by the routerLink in the template.
  }

  addItemTag(itemId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const tag = select.value;
    if (!tag) return;

    const currentTags = this.itemTags[itemId] || [];
    if (!currentTags.includes(tag)) {
      this.itemTags = { ...this.itemTags, [itemId]: [...currentTags, tag] };
      this.savePreferences();
      this.applyFilter(false);
    }
    select.value = '';
  }

  removeItemTag(itemId: string, tag: string): void {
    if (!this.itemTags[itemId]) return;
    this.itemTags = {
      ...this.itemTags,
      [itemId]: this.itemTags[itemId].filter((candidate) => candidate !== tag),
    };
    this.savePreferences();
    this.applyFilter(false);
  }

  private initializeViewState(
    items: SimpleItemListEntry[],
    preferences: ItemListPreferences,
  ): void {
    this.items = items;
    this.hasMeanTaskDifficulty = items.some((item) => item.meanTaskDifficulty !== undefined);

    const reconciledUi = this.reconcileUiPreferences(preferences.ui);
    this.applyUiPreferences(reconciledUi);
    this.itemTags = preferences.tags;
    this.filteredItems = [...items];
    this.applyFilter(false);

    if (reconciledUi !== preferences.ui) {
      this.savePreferences();
    }
  }

  private reconcileUiPreferences(ui: ItemListUiPreferences): ItemListUiPreferences {
    if (this.hasMeanTaskDifficulty) return ui;
    if (!ui.meanTaskDifficultyFilter && ui.sortField !== 'meanTaskDifficulty') return ui;

    return {
      ...ui,
      meanTaskDifficultyFilter: '',
      sortField: ui.sortField === 'meanTaskDifficulty' ? 'itemId' : ui.sortField,
    };
  }

  private applyUiPreferences(ui: ItemListUiPreferences): void {
    this.filterText = ui.filterText;
    this.meanTaskDifficultyFilter = ui.meanTaskDifficultyFilter;
    this.sortField = ui.sortField;
    this.sortDir = ui.sortDir;
  }

  private savePreferences(): void {
    const normalized = this.preferences.save({
      ui: {
        filterText: this.filterText,
        meanTaskDifficultyFilter: this.meanTaskDifficultyFilter,
        sortField: this.sortField,
        sortDir: this.sortDir,
      },
      tags: this.itemTags,
    });
    this.itemTags = normalized.tags;
  }
}
