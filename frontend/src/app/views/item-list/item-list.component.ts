import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [RouterLink, FormsModule, BreadcrumbComponent],
  template: `
    <app-breadcrumb [items]="breadcrumbs" />

    <div class="page-header">
      <h1>Item-Liste</h1>
      <span class="item-count">{{ filteredItems.length }} von {{ items.length }} Items</span>
    </div>

    <!-- Filter & Sort toolbar -->
    @if (enableFilter || enableSort) {
      <div class="toolbar">
        @if (enableFilter) {
          <input class="filter-input" [(ngModel)]="filterText" placeholder="🔍 Items filtern..." (input)="applyFilter()">
        }
        @if (enableSort) {
          <select [(ngModel)]="sortField" (change)="applySort()" class="sort-select">
            <option value="itemId">Item-ID</option>
            <option value="unitId">Aufgabe</option>
            <option value="name">Name</option>
          </select>
          <button class="btn btn-sm btn-outline" (click)="toggleSortDir()">{{ sortDir === 'asc' ? '↑ A-Z' : '↓ Z-A' }}</button>
        }
      </div>
    }

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th (click)="sortBy('itemId')" class="sortable">
              Item-ID {{ sortField === 'itemId' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th (click)="sortBy('unitId')" class="sortable">
              Aufgabe {{ sortField === 'unitId' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th (click)="sortBy('name')" class="sortable">
              Name {{ sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th>Quellvariable</th>
            @if (enableTags) {
              <th>Tags</th>
            }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (item of filteredItems; track item.itemId) {
            <tr [class.clickable]="enableClick" (click)="enableClick && navigateToItem(item)">
              <td><code>{{ item.itemId }}</code></td>
              <td>{{ item.unitName || item.unitId }}</td>
              <td>{{ item.name || '–' }}</td>
              <td><code>{{ item.sourceVariable || '–' }}</code></td>
              @if (enableTags) {
                <td class="tags-cell" (click)="$event.stopPropagation()">
                  @for (tag of (itemTags[item.itemId] || []); track tag) {
                    <span class="badge badge-info tag-badge" (click)="removeItemTag(item.itemId, tag)">{{ tag }} ✕</span>
                  }
                  <select class="tag-select" (change)="addItemTag(item.itemId, $event)">
                    <option value="">+Tag</option>
                    @for (tag of availableTags; track tag) {
                      <option [value]="tag">{{ tag }}</option>
                    }
                  </select>
                </td>
              }
              <td>
                @if (enableClick) {
                  <a [routerLink]="['/view', acpId, 'item', item.itemId]" class="btn btn-sm btn-outline" (click)="$event.stopPropagation()">Ansehen</a>
                } @else {
                  <a [routerLink]="['/view', acpId, 'unit', item.unitId]" class="btn btn-sm btn-outline" (click)="$event.stopPropagation()">Aufgabe</a>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .item-count { font-size: 0.85rem; color: var(--color-text-secondary); }
    .filter-input {
      padding: 8px 12px; border: 1px solid var(--color-border);
      border-radius: var(--radius); font-size: 0.9rem; min-width: 250px;
      font-family: inherit;
    }
    .sort-select {
      padding: 6px 10px; border: 1px solid var(--color-border);
      border-radius: var(--radius); font-size: 0.85rem; font-family: inherit;
    }
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: var(--color-primary-light); }
    .clickable { cursor: pointer; }
    .clickable:hover td { background: rgba(41,128,185,0.04); }
    .tags-cell { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .tag-badge { cursor: pointer; font-size: 0.7rem; }
    .tag-badge:hover { opacity: 0.7; }
    .tag-select {
      padding: 2px 4px; border: 1px solid var(--color-border);
      border-radius: 4px; font-size: 0.75rem; background: white;
    }
  `]
})
export class ItemListComponent implements OnInit, OnDestroy {
  acpId = '';
  items: any[] = [];
  filteredItems: any[] = [];
  filterText = '';
  sortField = 'itemId';
  sortDir: 'asc' | 'desc' = 'asc';
  breadcrumbs: BreadcrumbItem[] = [];

  // Feature flags
  enableFilter = true;
  enableSort = true;
  enableClick = true;
  enableTags = false;
  availableTags: string[] = [];
  itemTags: Record<string, string[]> = {};
  persistUserPreferences = false;
  useServerPreferences = false;

  private readonly preferenceViewId = 'item-list';
  private readonly serverPreferenceDebounceMs = 250;
  private pendingServerUiPreferences: Record<string, unknown> = {};
  private pendingServerTagPreferences: Record<string, string[]> = {};
  private serverSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Liste' },
    ];

    // Load feature config
    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      const fc = data?.featureConfig || {};
      this.enableFilter = fc.enableItemListFilter !== false;
      this.enableSort = fc.enableItemListSort !== false;
      this.enableClick = fc.enableItemClick !== false;
      this.enableTags = !!fc.enableItemListTags;
      this.availableTags = fc.availableTags || [];
      this.persistUserPreferences = !!fc.persistUserPreferences;
      this.useServerPreferences = this.persistUserPreferences && this.auth.isLoggedIn;
      this.loadPreferences();
    });

    this.api.getViewItems(this.acpId).subscribe(items => {
      this.items = items;
      this.filteredItems = [...items];
      this.applyFilter(false);
    });
  }

  ngOnDestroy() {
    if (this.serverSaveTimeout) {
      clearTimeout(this.serverSaveTimeout);
      this.serverSaveTimeout = null;
    }
  }

  applyFilter(shouldPersist = true) {
    const term = this.filterText.toLowerCase();
    this.filteredItems = this.items.filter(i =>
      i.itemId.toLowerCase().includes(term) ||
      (i.name || '').toLowerCase().includes(term) ||
      (i.unitId || '').toLowerCase().includes(term) ||
      (i.unitName || '').toLowerCase().includes(term)
    );
    this.applySort(false);
    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  sortBy(field: string) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }

    this.applySort(false);
    this.saveUiPreferences();
  }

  toggleSortDir() {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applySort(false);
    this.saveUiPreferences();
  }

  applySort(shouldPersist = true) {
    this.filteredItems.sort((a, b) => {
      const aVal = (a[this.sortField] || '').toLowerCase();
      const bVal = (b[this.sortField] || '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  navigateToItem(_item: any) {
    // Navigation handled by routerLink in template
  }

  addItemTag(itemId: string, event: Event) {
    const tag = (event.target as HTMLSelectElement).value;
    if (!tag) return;

    if (!this.itemTags[itemId]) this.itemTags[itemId] = [];
    if (!this.itemTags[itemId].includes(tag)) {
      this.itemTags[itemId].push(tag);
      this.saveTagPreferences();
      this.applyFilter(false);
    }

    (event.target as HTMLSelectElement).value = '';
  }

  removeItemTag(itemId: string, tag: string) {
    if (this.itemTags[itemId]) {
      this.itemTags[itemId] = this.itemTags[itemId].filter(t => t !== tag);
      this.saveTagPreferences();
      this.applyFilter(false);
    }
  }

  private getUiPreferencesKey(): string {
    const userId = this.auth.currentUser?.id || 'anonymous';
    return `cp:item-list:prefs:${this.acpId}:${userId}`;
  }

  private loadUiPreferences() {
    const raw = localStorage.getItem(this.getUiPreferencesKey());
    if (!raw) return;

    this.applyUiPreferences(this.parseJsonObject(raw));
  }

  private saveUiPreferences() {
    if (!this.persistUserPreferences) {
      return;
    }

    const ui = this.buildUiPreferences();
    if (this.useServerPreferences) {
      this.pendingServerUiPreferences = ui;
      this.scheduleServerPreferenceSave();
      return;
    }

    localStorage.setItem(this.getUiPreferencesKey(), JSON.stringify(ui));
  }

  private getTagPreferencesKey(): string {
    const userId = this.auth.currentUser?.id || 'anonymous';
    return `cp:item-list:tags:${this.acpId}:${userId}`;
  }

  private loadTagPreferences() {
    const raw = localStorage.getItem(this.getTagPreferencesKey());
    if (!raw) return;

    this.itemTags = this.normalizeTags(this.parseJsonObject(raw));
  }

  private saveTagPreferences() {
    const normalizedTags = this.normalizeTags(this.itemTags);
    this.itemTags = normalizedTags;

    if (!this.persistUserPreferences) {
      return;
    }

    if (this.useServerPreferences) {
      this.pendingServerTagPreferences = normalizedTags;
      this.scheduleServerPreferenceSave();
      return;
    }

    localStorage.setItem(this.getTagPreferencesKey(), JSON.stringify(normalizedTags));
  }

  private loadPreferences() {
    if (!this.persistUserPreferences) {
      this.itemTags = {};
      this.applyFilter(false);
      return;
    }

    if (this.useServerPreferences) {
      this.api.getViewItemPreferences(this.acpId, this.preferenceViewId).subscribe({
        next: (preferences) => {
          this.applyUiPreferences(preferences?.ui);
          this.itemTags = this.normalizeTags(preferences?.tags);
          this.pendingServerUiPreferences = this.buildUiPreferences();
          this.pendingServerTagPreferences = this.normalizeTags(this.itemTags);
          this.applyFilter(false);
        },
        error: () => {
          this.loadUiPreferences();
          if (this.enableTags) {
            this.loadTagPreferences();
          }
          this.applyFilter(false);
        },
      });
      return;
    }

    this.loadUiPreferences();
    if (this.enableTags) {
      this.loadTagPreferences();
    }
    this.applyFilter(false);
  }

  private scheduleServerPreferenceSave() {
    if (this.serverSaveTimeout) {
      clearTimeout(this.serverSaveTimeout);
    }

    this.serverSaveTimeout = setTimeout(() => {
      this.serverSaveTimeout = null;
      this.api.saveViewItemPreferences(
        this.acpId,
        {
          ui: this.pendingServerUiPreferences,
          tags: this.pendingServerTagPreferences,
        },
        this.preferenceViewId,
      ).subscribe({
        next: (savedPreferences) => {
          this.pendingServerUiPreferences = this.isObject(savedPreferences?.ui)
            ? savedPreferences.ui
            : this.pendingServerUiPreferences;
          this.pendingServerTagPreferences = this.normalizeTags(savedPreferences?.tags);
          this.itemTags = this.pendingServerTagPreferences;
        },
        error: (err) => {
          console.error('Failed to persist item list preferences', err);
        },
      });
    }, this.serverPreferenceDebounceMs);
  }

  private buildUiPreferences(): Record<string, unknown> {
    return {
      filterText: this.filterText,
      sortField: this.sortField,
      sortDir: this.sortDir,
    };
  }

  private applyUiPreferences(rawUi: unknown) {
    if (!this.isObject(rawUi)) return;

    const filterText = rawUi['filterText'];
    const sortField = rawUi['sortField'];
    const sortDir = rawUi['sortDir'];

    if (typeof filterText === 'string') {
      this.filterText = filterText;
    }

    if (typeof sortField === 'string' && ['itemId', 'unitId', 'name'].includes(sortField)) {
      this.sortField = sortField;
    }

    this.sortDir = sortDir === 'desc' ? 'desc' : 'asc';
  }

  private parseJsonObject(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw);
      return this.isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isObject(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};
    for (const [itemId, values] of Object.entries(rawTags)) {
      const normalizedItemId = String(itemId || '').trim();
      if (!normalizedItemId || !Array.isArray(values)) continue;

      const normalizedValues = Array.from(new Set(
        values
          .map(value => String(value || '').trim())
          .filter(value => value.length > 0),
      ));

      if (normalizedValues.length) {
        tags[normalizedItemId] = normalizedValues;
      }
    }

    return tags;
  }

  private isObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
