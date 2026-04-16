import { Component, OnInit } from '@angular/core';
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
export class ItemListComponent implements OnInit {
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

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'ContentPool', route: ['/'] },
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
      this.persistUserPreferences = !!fc.persistUserPreferences && this.auth.isLoggedIn;
      this.loadUiPreferences();
      if (this.enableTags) {
        this.loadTagPreferences();
      }
    });

    this.api.getViewItems(this.acpId).subscribe(items => {
      this.items = items;
      this.filteredItems = items;
    });
  }

  applyFilter() {
    const term = this.filterText.toLowerCase();
    this.filteredItems = this.items.filter(i =>
      i.itemId.toLowerCase().includes(term) ||
      (i.name || '').toLowerCase().includes(term) ||
      (i.unitId || '').toLowerCase().includes(term) ||
      (i.unitName || '').toLowerCase().includes(term)
    );
    this.applySort();
    this.saveUiPreferences();
  }

  sortBy(field: string) {
    if (this.sortField === field) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.sortField = field; this.sortDir = 'asc'; }
    this.applySort();
    this.saveUiPreferences();
  }

  toggleSortDir() {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applySort();
    this.saveUiPreferences();
  }

  applySort() {
    this.filteredItems.sort((a, b) => {
      const aVal = (a[this.sortField] || '').toLowerCase();
      const bVal = (b[this.sortField] || '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
    this.saveUiPreferences();
  }

  navigateToItem(item: any) {
    // Navigation handled by routerLink in template
  }

  addItemTag(itemId: string, event: Event) {
    const tag = (event.target as HTMLSelectElement).value;
    if (!tag) return;
    if (!this.itemTags[itemId]) this.itemTags[itemId] = [];
    if (!this.itemTags[itemId].includes(tag)) {
      this.itemTags[itemId].push(tag);
      this.saveTagPreferences();
    }
    (event.target as HTMLSelectElement).value = '';
  }

  removeItemTag(itemId: string, tag: string) {
    if (this.itemTags[itemId]) {
      this.itemTags[itemId] = this.itemTags[itemId].filter(t => t !== tag);
      this.saveTagPreferences();
    }
  }

  private getUiPreferencesKey(): string {
    const userId = this.auth.currentUser?.id || 'anonymous';
    return `cp:item-list:prefs:${this.acpId}:${userId}`;
  }

  private loadUiPreferences() {
    if (!this.persistUserPreferences) return;
    const raw = localStorage.getItem(this.getUiPreferencesKey());
    if (!raw) return;

    try {
      const prefs = JSON.parse(raw);
      this.filterText = typeof prefs.filterText === 'string' ? prefs.filterText : this.filterText;
      this.sortField = typeof prefs.sortField === 'string' ? prefs.sortField : this.sortField;
      this.sortDir = prefs.sortDir === 'desc' ? 'desc' : 'asc';
    } catch {
      // ignore malformed preference payloads
    }
  }

  private saveUiPreferences() {
    if (!this.persistUserPreferences) return;
    const prefs = {
      filterText: this.filterText,
      sortField: this.sortField,
      sortDir: this.sortDir,
    };
    localStorage.setItem(this.getUiPreferencesKey(), JSON.stringify(prefs));
  }

  private getTagPreferencesKey(): string {
    const userId = this.auth.currentUser?.id || 'anonymous';
    return `cp:item-list:tags:${this.acpId}:${userId}`;
  }

  private loadTagPreferences() {
    if (!this.persistUserPreferences) return;
    const raw = localStorage.getItem(this.getTagPreferencesKey());
    if (!raw) return;

    try {
      const tags = JSON.parse(raw);
      this.itemTags = tags && typeof tags === 'object' ? tags : {};
    } catch {
      this.itemTags = {};
    }
  }

  private saveTagPreferences() {
    if (!this.persistUserPreferences) return;
    localStorage.setItem(this.getTagPreferencesKey(), JSON.stringify(this.itemTags || {}));
  }
}
