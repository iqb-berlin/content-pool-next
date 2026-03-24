import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { VoudService } from '../../core/services/voud.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { SplitPaneComponent } from '../../shared/components/split-pane.component';

interface MetadataColumn {
  id: string;
  label: string;
}

interface ExplorerItem {
  itemId: string;
  uuid: string;
  unitId: string;
  unitLabel: string;
  description: string;
  variableId: string;
  metadata: Record<string, string>;
}

@Component({
  selector: 'app-item-explorer',
  standalone: true,
  imports: [FormsModule, CommonModule, BreadcrumbComponent, SplitPaneComponent],
  template: `
    <app-breadcrumb [items]="breadcrumbs" />

    <div class="explorer-header">
      <h1>Item-Explorer</h1>
      <span class="item-count">{{ filteredItems.length }} von {{ items.length }} Items</span>
    </div>

    <app-split-pane [initialLeftPercent]="45" [minLeftPx]="350" [minRightPx]="400">
      <!-- LEFT: Table -->
      <div left class="table-panel">
        <div class="table-toolbar">
          <input
            class="filter-input"
            [(ngModel)]="filterText"
            placeholder="🔍 Items filtern..."
            (input)="applyFilter()">
        </div>

        <div class="table-scroll">
          <table class="table explorer-table">
            <thead>
              <tr>
                <th (click)="sortBy('itemId')" class="sortable sticky-col">
                  Item-ID {{ getSortIndicator('itemId') }}
                </th>
                <th (click)="sortBy('unitLabel')" class="sortable">
                  Aufgabe {{ getSortIndicator('unitLabel') }}
                </th>
                @for (col of columns; track col.id) {
                  <th (click)="sortByMeta(col.id)" class="sortable">
                    {{ col.label }} {{ getMetaSortIndicator(col.id) }}
                  </th>
                }
                @if (enableTags) {
                  <th>Tags</th>
                }
              </tr>
              <tr class="filter-row">
                <th class="sticky-col">
                  <input class="col-filter-input" [(ngModel)]="columnFilters['itemId']" placeholder="🔍 ID..." (input)="applyFilter()">
                </th>
                <th>
                  <input class="col-filter-input" [(ngModel)]="columnFilters['unitLabel']" placeholder="🔍 Aufgabe..." (input)="applyFilter()">
                </th>
                @for (col of columns; track col.id) {
                  <th>
                    <input class="col-filter-input" [(ngModel)]="columnFilters[col.id]" [placeholder]="'🔍 ' + col.label + '...'" (input)="applyFilter()">
                  </th>
                }
                @if (enableTags) {
                  <th>
                    <input class="col-filter-input" [(ngModel)]="columnFilters['tags']" placeholder="🔍 Tags..." (input)="applyFilter()">
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of filteredItems; track item.uuid; let i = $index) {
                <tr
                  [class.active]="selectedItem?.uuid === item.uuid"
                  (click)="selectItem(item, i)">
                  <td class="sticky-col"><code><span class="unit-id">{{ item.unitId }}</span><span class="item-id">{{ item.itemId }}</span></code></td>
                  <td>{{ item.unitLabel }}</td>
                  @for (col of columns; track col.id) {
                    <td class="meta-cell">{{ item.metadata[col.id] || '–' }}</td>
                  }
                  @if (enableTags) {
                    <td class="tags-cell" (click)="$event.stopPropagation()">
                      @for (tag of (itemTags[item.uuid] || []); track tag) {
                        <span class="badge badge-info tag-badge" (click)="removeItemTag(item.uuid, tag)">{{ tag }} ✕</span>
                      }
                      <div class="tag-add-container">
                        @if (availableTags.length > 0) {
                          <select class="tag-select" (change)="addItemTag(item.uuid, $event)">
                            <option value="">+Tag</option>
                            @for (tag of availableTags; track tag) {
                              <option [value]="tag">{{ tag }}</option>
                            }
                          </select>
                        }
                        <input type="text"
                               class="tag-input-inline"
                               placeholder="Neu..."
                               (keydown.enter)="addCustomTag(item.uuid, $event)"
                               (blur)="addCustomTag(item.uuid, $event)">
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- RIGHT: Preview -->
      <div right class="preview-panel">
        @if (selectedItem) {
          <!-- Player -->
          <div class="player-container card" [class.view-all-mode]="pagingMode === 'view-all' || pagingMode === 'print-ids'">
            @if (playerSrcDoc) {
              <iframe
                #playerFrame
                [srcdoc]="playerSrcDoc"
                class="player-iframe"
                [class.view-all-mode]="pagingMode === 'view-all' || pagingMode === 'print-ids'"
                [style.height]="playerHeight"
                sandbox="allow-scripts allow-same-origin allow-downloads"
                (load)="onPlayerLoaded()">
              </iframe>
            } @else if (loadingUnit) {
              <div class="empty-state">
                <div class="spinner"></div>
                <p>Aufgabe wird geladen...</p>
              </div>
            } @else {
              <div class="empty-state">
                <div style="font-size:2.5rem;margin-bottom:12px">🎮</div>
                <h3>Kein Player verfügbar</h3>
              </div>
            }
          </div>

          <!-- Page Navigation (within player) -->
          @if (totalPages > 1 && pagingMode !== 'view-all' && pagingMode !== 'print-ids') {
            <div class="page-nav">
              <button class="btn btn-outline btn-sm" [disabled]="currentPage <= 1" (click)="navigateToPage(currentPage - 1)">← Vorherige Seite</button>
              <span class="page-info">Seite {{ currentPage }} / {{ totalPages }}</span>
              <button class="btn btn-outline btn-sm" [disabled]="currentPage >= totalPages" (click)="navigateToPage(currentPage + 1)">Nächste Seite →</button>
            </div>
          }

          <!-- Item Navigation -->
          <div class="item-nav">
            <button class="btn btn-outline" [disabled]="selectedIndex <= 0" (click)="navigateItem(-1)">← Vorheriges Item</button>
            <span class="item-nav-info">Item {{ selectedIndex + 1 }} von {{ filteredItems.length }}</span>
            <button class="btn btn-outline" [disabled]="selectedIndex >= filteredItems.length - 1" (click)="navigateItem(1)">Nächstes Item →</button>
          </div>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <select class="btn btn-outline btn-sm" [(ngModel)]="pagingMode" (change)="onPagingModeChange()">
              <option value="buttons">Paging: Buttons</option>
              <option value="separate">Paging: Separate</option>
              <option value="concat-scroll">Paging: Scroll</option>
              <option value="concat-scroll-snap">Paging: Scroll-Snap</option>
              <option value="view-all">Paging: Alles (Print)</option>
              <option value="print-ids">Paging: Alles + IDs (Print)</option>
            </select>
            <button class="btn btn-outline btn-sm" (click)="showOverlay = 'coding'">📋 Kodierschema</button>
            <button class="btn btn-outline btn-sm" (click)="showOverlay = 'metadata'">📄 Metadaten</button>
          </div>

          <!-- Info Card -->
          <div class="info-card card">
            <div class="info-row">
              <span class="info-label">Aufgabe:</span>
              <strong>{{ selectedItem.unitLabel }}</strong> <code>({{ selectedItem.unitId }})</code>
            </div>
            <div class="info-row">
              <span class="info-label">Item-ID:</span>
              <code><span class="unit-id">{{ selectedItem.unitId }}</span><span class="item-id">{{ selectedItem.itemId }}</span></code>
            </div>
            <div class="info-row">
              <span class="info-label">Variable:</span>
              <code>{{ selectedItem.variableId || '–' }}</code>
            </div>
            @if (selectedItem.description) {
              <div class="info-row">
                <span class="info-label">Beschreibung:</span>
                {{ selectedItem.description }}
              </div>
            }
          </div>

        } @else {
          <div class="empty-state preview-empty">
            <div style="font-size:3rem;margin-bottom:16px">👈</div>
            <h3>Item auswählen</h3>
            <p>Klicken Sie auf ein Item in der Tabelle, um es hier anzuzeigen.</p>
          </div>
        }
      </div>
    </app-split-pane>

    <!-- OVERLAY: Coding Scheme -->
    @if (showOverlay === 'coding') {
      <div class="overlay-backdrop" (click)="showOverlay = null">
        <div class="overlay-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <h2>Kodierschema – {{ selectedItem?.unitLabel }}</h2>
            <button class="btn btn-sm btn-outline" (click)="showOverlay = null">✕ Schließen</button>
          </div>
          <div class="overlay-content">
            @if (currentCodingScheme) {
              <pre class="json-view">{{ currentCodingScheme | json }}</pre>
            } @else {
              <p class="help-text">Kein Kodierschema für diese Aufgabe verfügbar.</p>
            }
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Metadata -->
    @if (showOverlay === 'metadata') {
      <div class="overlay-backdrop" (click)="showOverlay = null">
        <div class="overlay-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <h2>Metadaten – {{ selectedItem?.unitLabel }}</h2>
            <button class="btn btn-sm btn-outline" (click)="showOverlay = null">✕ Schließen</button>
          </div>
          <div class="overlay-content">
            @if (currentUnitMetadata && currentUnitMetadata.length) {
              <dl class="meta-dl">
                @for (entry of currentUnitMetadata; track entry.id) {
                  <dt>{{ extractLabel(entry.label) }}</dt>
                  <dd>{{ extractValueText(entry.valueAsText) || extractValueText(entry.value) || '–' }}</dd>
                }
              </dl>
            } @else {
              <p class="help-text">Keine Metadaten für diese Aufgabe verfügbar.</p>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: calc(100vh - 140px); }

    .explorer-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .explorer-header h1 { margin-bottom: 0; }
    .item-count { font-size: 0.85rem; color: var(--color-text-secondary); }

    /* Table panel */
    .table-panel {
      display: flex; flex-direction: column;
      height: 100%; overflow: hidden;
    }
    .table-toolbar {
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      flex-shrink: 0;
    }
    .filter-input {
      width: 100%; padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius); font-size: 0.9rem;
      font-family: inherit;
    }
    .filter-input:focus {
      outline: none; border-color: var(--color-primary-light);
      box-shadow: 0 0 0 3px rgba(41,128,185,0.15);
    }
    .table-scroll {
      flex: 1; overflow: auto;
      background: var(--color-surface);
      border-radius: 0 0 var(--radius) var(--radius);
      box-shadow: var(--shadow);
    }
    .explorer-table {
      font-size: 0.85rem;
      margin-bottom: 0;
      width: 100%;
      min-width: max-content;
    }
    .explorer-table th {
      position: sticky; top: 0;
      background: var(--color-bg);
      z-index: 2;
      white-space: nowrap;
    }
    .explorer-table td {
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticky-col {
      position: sticky;
      left: 0;
      background: var(--color-surface);
      z-index: 3;
    }
    th.sticky-col {
      background: var(--color-bg);
      z-index: 4;
    }
    tr.active .sticky-col {
      background: rgba(41,128,185,0.1);
    }
    .meta-cell {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: var(--color-primary-light); }
    tr.active td {
      background: rgba(41,128,185,0.1) !important;
      border-left: 3px solid var(--color-primary-light);
    }
    tr:not(.active) { cursor: pointer; }

    /* Filter row */
    .filter-row th {
      padding: 4px 10px;
      background: var(--color-bg);
      border-bottom: 2px solid var(--color-border);
      position: sticky; top: 37px; /* Below the main header */
      z-index: 2;
    }
    .filter-row th.sticky-col { z-index: 4; }
    .col-filter-input {
      width: 100%; padding: 4px 8px;
      border: 1px solid var(--color-border);
      border-radius: 4px; font-size: 0.75rem;
      font-family: inherit;
    }
    .col-filter-input:focus {
      outline: none; border-color: var(--color-primary-light);
      box-shadow: 0 0 0 2px rgba(41,128,185,0.1);
    }

    /* Tags */
    .tags-cell { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .tag-badge { cursor: pointer; font-size: 0.7rem; }
    .tag-badge:hover { opacity: 0.7; }
    .tag-select {
      padding: 2px 4px; border: 1px solid var(--color-border);
      border-radius: 4px; font-size: 0.75rem; background: white;
      max-width: 80px;
    }
    .tag-add-container { display: flex; gap: 4px; align-items: center; }
    .tag-input-inline {
      width: 60px; padding: 2px 6px; border: 1px solid var(--color-border);
      border-radius: 4px; font-size: 0.75rem;
      transition: width 0.2s;
    }
    .tag-input-inline:focus { width: 100px; outline: none; border-color: var(--color-primary-light); }

    /* Combined ID styling */
    .unit-id { color: var(--color-text-secondary); }
    .item-id { color: var(--color-text); font-weight: 600; }

    /* Preview panel */
    .preview-panel {
      height: 100%; overflow-y: auto;
      padding: 0 16px; display: flex; flex-direction: column;
    }
    .player-container { padding: 0; overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 500px; transition: height 0.2s; }
    /* In view-all mode, we want the container to follow the iframe's height and not CLIP it */
    .player-container.view-all-mode { display: block; overflow: visible; flex: none; height: auto; min-height: 1000px; }
    .player-iframe {
      width: 100%; height: 100%; border: none; display: block;
    }
    .player-iframe.view-all-mode { min-height: 1000px; height: auto; }

    /* Navigations */
    .page-nav, .item-nav {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; padding: 10px 0;
    }
    .page-info, .item-nav-info {
      font-size: 0.85rem; font-weight: 500;
      color: var(--color-text-secondary);
    }
    .item-nav {
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }

    .action-buttons {
      display: flex; gap: 8px; padding: 10px 0;
      justify-content: center;
    }

    .info-card {
      font-size: 0.85rem; padding: 12px 16px;
    }
    .info-row { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; }
    .info-label { color: var(--color-text-secondary); min-width: 80px; }

    .preview-empty {
      height: 100%; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }

    /* Spinner */
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary-light);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Overlay */
    .overlay-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .overlay-dialog {
      background: var(--color-surface);
      border-radius: var(--radius);
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      width: 90vw; max-width: 800px;
      max-height: 85vh;
      display: flex; flex-direction: column;
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .overlay-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--color-border);
    }
    .overlay-header h2 { margin-bottom: 0; font-size: 1.1rem; }
    .overlay-content {
      padding: 24px; overflow-y: auto; flex: 1;
    }
    .json-view {
      background: var(--color-bg); padding: 16px;
      border-radius: var(--radius); font-size: 0.75rem;
      overflow: auto; max-height: 60vh;
      white-space: pre-wrap; word-break: break-word;
    }
    .meta-dl {
      display: grid; grid-template-columns: auto 1fr;
      gap: 8px 20px; font-size: 0.9rem;
    }
    .meta-dl dt { font-weight: 600; color: var(--color-text-secondary); }
    .meta-dl dd { margin: 0; }
    .help-text { color: var(--color-text-secondary); font-size: 0.9rem; }
  `]
})
export class ItemExplorerComponent implements OnInit, OnDestroy {
  @ViewChild('playerFrame') playerFrame!: ElementRef<HTMLIFrameElement>;

  acpId = '';
  columns: MetadataColumn[] = [];
  items: ExplorerItem[] = [];
  filteredItems: ExplorerItem[] = [];
  filterText = '';
  sortField = 'itemId';
  sortIsMeta = false;
  sortDir: 'asc' | 'desc' = 'asc';
  breadcrumbs: BreadcrumbItem[] = [];
  columnFilters: Record<string, string> = {};

  // Selection
  selectedItem: ExplorerItem | null = null;
  selectedIndex = -1;
  loadingUnit = false;

  // Player
  unit: any = null;
  playerSrcDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  pagingMode: 'buttons' | 'separate' | 'concat-scroll' | 'concat-scroll-snap' | 'view-all' | 'print-ids' = 'buttons';
  playerHeight = '100%';

  // Overlays
  showOverlay: 'coding' | 'metadata' | null = null;
  unitMetadataCache: Record<string, any[]> = {};
  codingSchemeCache: Record<string, any> = {};
  currentUnitMetadata: any[] = [];
  currentCodingScheme: any = null;

  // Tags
  enableTags = false;
  availableTags: string[] = [];
  itemTags: Record<string, string[]> = {};

  private messageHandler = this.onPlayerMessage.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private sanitizer: DomSanitizer,
    private voudService: VoudService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'ContentPool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Explorer' },
    ];

    window.addEventListener('message', this.messageHandler);

    // Load feature config
    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      const fc = data?.featureConfig || {};
      this.enableTags = !!fc.enableItemListTags;
      this.availableTags = fc.availableTags || [];
    });

    // Load item list from .vomd files
    this.api.getFileItemList(this.acpId).subscribe(result => {
      this.columns = result.columns || [];
      this.items = result.items || [];
      this.filteredItems = [...this.items];
      this.unitMetadataCache = result.unitMetadata || {};
      this.codingSchemeCache = result.codingSchemes || {};
      this.applySort();
    });
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
  }

  // --- Filtering ---
  applyFilter() {
    const term = this.filterText.toLowerCase();

    this.filteredItems = this.items.filter(item => {
      // 1. Global Filter
      if (term) {
        const matchesGlobal = (
          (item.unitId + item.itemId).toLowerCase().includes(term) ||
          item.unitLabel.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term) ||
          Object.values(item.metadata).some(val => val && val.toLowerCase().includes(term))
        );
        if (!matchesGlobal) return false;
      }

      // 2. Column Filters
      for (const [colId, filterValue] of Object.entries(this.columnFilters)) {
        if (!filterValue) continue;
        const subTerm = filterValue.toLowerCase();

        if (colId === 'itemId') {
          const combined = (item.unitId + item.itemId).toLowerCase();
          if (!combined.includes(subTerm)) return false;
        } else if (colId === 'unitLabel') {
          if (!item.unitLabel.toLowerCase().includes(subTerm)) return false;
        } else if (colId === 'tags') {
          const tags = this.itemTags[item.uuid] || [];
          if (!tags.some(t => t.toLowerCase().includes(subTerm))) return false;
        } else {
          // Metadata column
          const val = item.metadata[colId] || '';
          if (!val.toLowerCase().includes(subTerm)) return false;
        }
      }

      return true;
    });

    this.applySort();
  }

  // --- Sorting ---
  sortBy(field: string) {
    if (this.sortField === field && !this.sortIsMeta) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortIsMeta = false;
      this.sortDir = 'asc';
    }
    this.applySort();
  }

  sortByMeta(colId: string) {
    if (this.sortField === colId && this.sortIsMeta) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = colId;
      this.sortIsMeta = true;
      this.sortDir = 'asc';
    }
    this.applySort();
  }

  private applySort() {
    this.filteredItems.sort((a, b) => {
      let aVal: string, bVal: string;
      if (this.sortIsMeta) {
        aVal = (a.metadata[this.sortField] || '').toLowerCase();
        bVal = (b.metadata[this.sortField] || '').toLowerCase();
      } else {
        aVal = ((a as any)[this.sortField] || '').toString().toLowerCase();
        bVal = ((b as any)[this.sortField] || '').toString().toLowerCase();
      }
      const cmp = aVal.localeCompare(bVal);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  getSortIndicator(field: string): string {
    if (this.sortField !== field || this.sortIsMeta) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  getMetaSortIndicator(colId: string): string {
    if (this.sortField !== colId || !this.sortIsMeta) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  resetPlayer() {
    this.playerSrcDoc = null;
    this.unit = null;
  }

  // --- Item Selection ---
  selectItem(item: ExplorerItem, index: number) {
    if (this.selectedItem?.uuid === item.uuid) return;

    this.selectedItem = item;
    this.selectedIndex = index;
    this.resetPlayer();
    this.currentPage = 1;
    this.totalPages = 1;
    this.loadingUnit = true;

    // Load unit metadata and coding scheme from cache
    this.currentUnitMetadata = this.unitMetadataCache[item.unitId] || [];
    this.currentCodingScheme = this.codingSchemeCache[item.unitId] || null;

    // Load unit view data from files (for player + dependencies)
    this.api.getFileUnitView(this.acpId, item.unitId).subscribe({
      next: (u: any) => {
        this.unit = u;
        this.loadingUnit = false;

        if (!u) return;

        // Map dependency URLs with tokens
        const deps = (u.dependencies || []).map((d: any) => ({
          ...d,
          downloadUrl: this.api.appendAuthToken(d.downloadUrl),
        }));
        u.dependencies = deps;

        // Find player HTML file
        const playerDep = deps.find((d: any) =>
          d.type === 'PLAYER' || d.type === 'player'
        );
        if (playerDep) {
          fetch(playerDep.downloadUrl)
            .then(res => res.text())
            .then(html => {
              this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(html);
            });
        }
      },
      error: () => {
        this.loadingUnit = false;
      }
    });
  }

  navigateItem(delta: number) {
    const newIndex = this.selectedIndex + delta;
    if (newIndex < 0 || newIndex >= this.filteredItems.length) return;
    this.selectItem(this.filteredItems[newIndex], newIndex);

    // Scroll table row into view
    setTimeout(() => {
      const row = document.querySelector('tr.active');
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;

    const definitionDep = this.unit.dependencies?.find((d: any) =>
      d.type === 'UNIT_DEFINITION' || d.type === 'unitDefinition' || d.type === 'definition'
    );

    if (definitionDep) {
      fetch(definitionDep.downloadUrl)
        .then(res => res.text())
        .then(definition => {
          const startPage = this.voudService.getStartPage(definition, this.selectedItem?.variableId || '');
          this.sendToPlayer({
            type: 'vopStartCommand',
            sessionId: `explorer-${this.selectedItem?.uuid || 'none'}`,
            unitDefinition: definition,
            unitState: { dataParts: {} },
            playerConfig: {
              stateReportPolicy: 'none',
              pagingMode: (this.pagingMode === 'view-all' || this.pagingMode === 'print-ids') ? 'concat-scroll' : this.pagingMode,
              printMode: this.pagingMode === 'view-all' ? 'on' : (this.pagingMode === 'print-ids' ? 'on-with-ids' : 'off'),
              logPolicy: 'disabled',
              startPage: startPage !== undefined ? startPage.toString() : undefined,
              enabledNavigationTargets: ['next', 'previous', 'first', 'last', 'end']
            },
          });
          // Reset height for fresh load (unless print mode is on)
          if (this.pagingMode !== 'view-all' && this.pagingMode !== 'print-ids') {
            this.playerHeight = '100%';
            this.stopAutoResize();
          } else {
            // Provide a large enough initial height for print mode
            this.playerHeight = '2000px';
            this.startAutoResize();
          }
        });
    }
  }

  onPagingModeChange() {
    const src = this.playerSrcDoc;
    this.playerSrcDoc = null;
    setTimeout(() => {
      this.playerSrcDoc = src;
    }, 50);
  }

  private onPlayerMessage(event: MessageEvent) {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'vopStateChangedNotification':
        if (msg.playerState?.currentPage !== undefined) {
          this.currentPage = msg.playerState.currentPage + 1;
        }
        if (msg.playerState?.validPages !== undefined) {
          this.totalPages = msg.playerState.validPages.length || this.totalPages;
        }
        break;

      case 'vopPageNavigationCommand':
        if (msg.target !== undefined) {
          this.currentPage = msg.target + 1;
        }
        break;

      case 'vopResizeNotification':
        if (msg.height !== undefined) {
          this.playerHeight = `${msg.height}px`;
        }
        break;
    }
  }

  navigateToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.sendToPlayer({
      type: 'vopPageNavigationCommand',
      target: page - 1,
    });
  }

  private sendToPlayer(msg: any) {
    this.playerFrame?.nativeElement?.contentWindow?.postMessage(msg, '*');
  }

  // --- Tags ---
  addItemTag(uuid: string, event: Event) {
    const tag = (event.target as HTMLSelectElement).value;
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
    }
    (event.target as HTMLSelectElement).value = '';
  }

  removeItemTag(uuid: string, tag: string) {
    if (this.itemTags[uuid]) {
      this.itemTags[uuid] = this.itemTags[uuid].filter(t => t !== tag);
      this.saveTags();
    }
  }

  addCustomTag(uuid: string, event: any) {
    const input = event.target as HTMLInputElement;
    const tag = input.value.trim();
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
    }
    input.value = '';
  }

  private saveTags() {
    // TODO: Persist tags to backend/vomd
    console.log('Tags updated:', this.itemTags);
  }

  // --- Helpers ---
  extractLabel(label: any): string {
    if (typeof label === 'string') return label;
    if (label && label['de']) return label['de'];
    return JSON.stringify(label);
  }

  extractValueText(valueAsText: any): string {
    if (typeof valueAsText === 'string') return valueAsText;
    if (valueAsText && valueAsText['de']) return valueAsText['de'];
    if (Array.isArray(valueAsText)) return valueAsText.map(v => this.extractValueText(v)).join(', ');
    return '';
  }

  downloadUnit() {
    const url = `/api/acp/${this.acpId}/files?unitId=${this.selectedItem?.unitId}&format=zip`;
    window.open(this.api.appendAuthToken(url), '_blank');
  }

  private startAutoResize() {
    this.stopAutoResize();
    this.autoResizeInterval = setInterval(() => {
      try {
        const frame = this.playerFrame?.nativeElement;
        const doc = frame?.contentDocument || frame?.contentWindow?.document;
        if (doc && doc.body) {
          const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 600);
          if (height > 0 && this.playerHeight !== `${height}px`) {
            this.playerHeight = `${height}px`;
          }
        }
      } catch (e) {
        // Cross-origin restriction or other error
      }
    }, 500);
  }

  private stopAutoResize() {
    if (this.autoResizeInterval) {
      clearInterval(this.autoResizeInterval);
      this.autoResizeInterval = null;
    }
  }
}
