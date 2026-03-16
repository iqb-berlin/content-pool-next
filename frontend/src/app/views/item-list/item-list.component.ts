import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Item-Liste</h1>
      <a [routerLink]="['/view', acpId]" class="btn btn-outline">← Zurück</a>
    </div>

    <div class="toolbar">
      <input class="filter-input" [(ngModel)]="filterText" placeholder="🔍 Items filtern..." (input)="applyFilter()">
      <select [(ngModel)]="sortField" (change)="applySort()">
        <option value="itemId">Item-ID</option>
        <option value="unitId">Aufgabe</option>
        <option value="name">Name</option>
      </select>
      <button class="btn btn-sm btn-outline" (click)="toggleSortDir()">{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th (click)="sortBy('itemId')" class="sortable">Item-ID</th>
            <th (click)="sortBy('unitId')" class="sortable">Aufgabe</th>
            <th (click)="sortBy('name')" class="sortable">Name</th>
            <th>Quellvariable</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (item of filteredItems; track item.itemId) {
            <tr>
              <td><code>{{ item.itemId }}</code></td>
              <td>{{ item.unitName || item.unitId }}</td>
              <td>{{ item.name || '–' }}</td>
              <td><code>{{ item.sourceVariable || '–' }}</code></td>
              <td><a [routerLink]="['/view', acpId, 'unit', item.unitId]" class="btn btn-sm btn-outline">Aufgabe ansehen</a></td>
            </tr>
          }
        </tbody>
      </table>
      <div class="table-footer">{{ filteredItems.length }} von {{ items.length }} Items</div>
    </div>
  `,
  styles: [`
    .filter-input { padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.9rem; min-width: 250px; }
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: var(--color-primary-light); }
    .table-footer { text-align: right; padding: 8px 14px; color: var(--color-text-secondary); font-size: 0.85rem; }
  `]
})
export class ItemListComponent implements OnInit {
  acpId = '';
  items: any[] = [];
  filteredItems: any[] = [];
  filterText = '';
  sortField = 'itemId';
  sortDir: 'asc' | 'desc' = 'asc';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
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
      (i.unitId || '').toLowerCase().includes(term)
    );
    this.applySort();
  }

  sortBy(field: string) {
    if (this.sortField === field) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.sortField = field; this.sortDir = 'asc'; }
    this.applySort();
  }

  toggleSortDir() {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applySort();
  }

  applySort() {
    this.filteredItems.sort((a, b) => {
      const aVal = (a[this.sortField] || '').toLowerCase();
      const bVal = (b[this.sortField] || '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }
}
