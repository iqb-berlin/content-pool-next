import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { VoudService } from '../../core/services/voud.service';
import { AuthService } from '../../core/services/auth.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { SplitPaneComponent } from '../../shared/components/split-pane.component';
import { CodingSchemeTextFactory, CodingAsText } from '@iqb/responses';

interface MetadataColumn {
  id: string;
  label: string;
  visible?: boolean;
}

interface ExplorerItem {
  itemId: string;
  uuid: string;
  unitId: string;
  unitLabel: string;
  description: string;
  variableId: string;
  metadata: Record<string, string>;
  empiricalDifficulty?: number;
  tags?: string[];
}

interface MetadataSettings {
  visible: string[];
  order: string[];
}

@Component({
  selector: 'app-item-explorer',
  standalone: true,
  imports: [FormsModule, CommonModule, BreadcrumbComponent, SplitPaneComponent],
  template: `
    <app-breadcrumb [items]="breadcrumbs" />

    <div class="explorer-header">
      <h1>Item-Explorer</h1>
      <div class="header-actions">
        <span class="item-count">{{ filteredItems.length }} von {{ items.length }} Items</span>
        @if (isAcpManager) {
          <input type="file" #csvUploadInput style="display: none" accept=".csv" (change)="onCsvFileSelected($event)">
          <button class="btn btn-outline btn-sm" (click)="csvUploadInput.click()">
            📄 Item-Schwierigkeiten (CSV) hochladen
          </button>
          <button class="btn btn-outline btn-sm" style="color: #e74c3c; border-color: rgba(231, 76, 60, 0.4);" (click)="clearEmpiricalDifficulties()" title="Alle Itemschwierigkeiten löschen">
            🗑️ Werte bereinigen
          </button>
          <button class="btn btn-outline btn-sm" (click)="showColumnManager = true">
            👁️ Spalten verwalten
          </button>
        }
      </div>
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
                @if (hasEmpiricalDifficulty) {
                  <th (click)="sortBy('empiricalDifficulty')" class="sortable">
                    Empirische Itemschwierigkeit {{ getSortIndicator('empiricalDifficulty') }}
                  </th>
                }
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
                @if (hasEmpiricalDifficulty) {
                  <th>
                    <input type="number" class="col-filter-input" [(ngModel)]="columnFilters['empiricalDifficulty']" placeholder="🔍 Wert..." (input)="applyFilter()">
                  </th>
                }
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
              @for (item of filteredItems; track item.unitId + '_' + item.itemId; let i = $index) {
                <tr
                  [class.active]="selectedItem?.uuid === item.uuid"
                  (click)="selectItem(item, i)">
                  <td class="sticky-col"><code><span class="unit-id">{{ item.unitId }}</span><span class="item-id">{{ item.itemId }}</span></code></td>
                  <td>{{ item.unitLabel }}</td>
                  @if (hasEmpiricalDifficulty) {
                    <td>{{ item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null ? item.empiricalDifficulty : '–' }}</td>
                  }
                  @for (col of columns; track col.id) {
                    <td class="meta-cell">{{ item.metadata[col.id] || '–' }}</td>
                  }
                  @if (enableTags) {
                    <td class="tags-cell" (click)="$event.stopPropagation()">
                      @for (tag of (itemTags[item.uuid || (item.unitId + '_' + item.itemId)] || []); track tag) {
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
            <button class="btn btn-outline btn-sm" (click)="showOverlay = 'coding'">📋 Kodierung</button>
            <button class="btn btn-outline btn-sm" (click)="showMetadataDrawer = !showMetadataDrawer" [class.btn-primary]="showMetadataDrawer">📄 Metadaten</button>
            @if (isAcpManager) {
              <button class="btn btn-outline btn-sm" (click)="saveCurrentResponseState()" title="Aktuellen Zustand speichern">💾 Zustand speichern</button>
              <button class="btn btn-outline btn-sm" (click)="resetResponseState()" title="Zustand zurücksetzen" style="color: #e74c3c; border-color: rgba(231, 76, 60, 0.4);">🗑️ Zustand löschen</button>
              <button class="btn btn-outline btn-sm" (click)="loadAllResponseStates()" title="Alle gespeicherten Daten anzeigen">👁️ Rohdaten</button>
            }
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
            <h2>Kodierung – {{ selectedItem?.unitLabel }}</h2>
            <button class="btn btn-sm btn-outline" (click)="showOverlay = null">✕ Schließen</button>
          </div>
          <div class="overlay-content">
            @if (currentCodingSchemeAsText) {
              <div class="coding-toolbar">
                <div class="search-container">
                  <input
                    class="filter-input"
                    [(ngModel)]="codingSearchText"
                    placeholder="🔍 Variablen suchen (ID oder Label)...">
                </div>
                <div class="sort-actions">
                  <button class="btn btn-outline btn-sm" (click)="toggleCodingSort('id')" title="Nach ID sortieren">
                    ID {{ getCodingSortIndicator('id') }}
                  </button>
                  <button class="btn btn-outline btn-sm" (click)="toggleCodingSort('label')" title="Nach Label sortieren">
                    Label {{ getCodingSortIndicator('label') }}
                  </button>
                </div>
              </div>

              <div class="coding-scheme-view">
                @for (coding of filteredCodingSchemeAsText; track coding.id) {
                  <div class="coding-item">
                    <div class="coding-item-header">
                      <h4>{{ coding.label || coding.id }}</h4>
                      <div class="header-tags">
                        <code class="variable-id">{{ coding.id }}</code>
                      </div>
                    </div>
                    @if ($any(coding).manualInstructionText) {
                      <div class="global-manual-instruction">
                        <strong>📖 Variable-Instruktion:</strong>
                        <div class="html-content" [innerHTML]="sanitizer.bypassSecurityTrustHtml($any(coding).manualInstructionText)"></div>
                      </div>
                    }
                    <div class="codes-list">
                      @for (code of coding.codes; track code.id) {
                        <div class="code-row">
                          <div class="code-main">
                            <span class="code-id">{{ code.id }}</span>
                            <span class="code-score">({{ code.score }})</span>
                            <span class="code-label">{{ code.label }}</span>
                            @if (code.hasManualInstruction) {
                              <span class="manual-icon" title="Manuelle Prüfung erforderlich">📝</span>
                            }
                          </div>
                          @if ($any(code).manualInstructionText) {
                            <div class="code-manual-instruction">
                              <strong>Instruktion:</strong>
                              <div class="html-content" [innerHTML]="sanitizer.bypassSecurityTrustHtml($any(code).manualInstructionText)"></div>
                            </div>
                          }
                          @if (code.ruleSetDescriptions.length) {
                            <ul class="rule-list">
                              @for (rule of code.ruleSetDescriptions; track rule) {
                                <li>{{ rule }}</li>
                              }
                            </ul>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="help-text">Keine Kodierung für diese Aufgabe verfügbar.</p>
            }
          </div>
        </div>
      </div>
    }

    <!-- DRAWER: Metadata -->
    <div class="drawer-backdrop" [class.open]="showMetadataDrawer" (click)="showMetadataDrawer = false">
      <div class="drawer-container" [class.open]="showMetadataDrawer" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div class="drawer-title">
            <span class="drawer-icon">📄</span>
            <div>
              <h3>Metadaten</h3>
              <small>{{ selectedItem?.unitLabel }}</small>
            </div>
          </div>
          <button class="btn-close" (click)="showMetadataDrawer = false">✕</button>
        </div>
        <div class="drawer-content">
          @if (currentUnitMetadata && currentUnitMetadata.length) {
            <div class="meta-grid">
              @for (entry of currentUnitMetadata; track entry.id) {
                <div class="meta-item">
                  <div class="meta-label">{{ extractLabel(entry.label) }}</div>
                  <div class="meta-value">{{ extractValueText(entry.valueAsText) || extractValueText(entry.value) || '–' }}</div>
                </div>
              }
            </div>
          } @else {
            <div class="empty-state">
              <p>Keine Metadaten für diese Aufgabe verfügbar.</p>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- OVERLAY: Upload Report -->
    @if (showUploadReport) {
      <div class="overlay-backdrop" (click)="showUploadReport = false">
        <div class="overlay-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <h2>Upload Bericht</h2>
            <button class="btn btn-sm btn-outline" (click)="showUploadReport = false; reloadItems()">✕ Schließen</button>
          </div>
          <div class="overlay-content">
            <p><strong>Zusammenfassung:</strong> {{ uploadResult?.updated }} erfolgreich aktualisiert, {{ uploadResult?.failed?.length || 0 }} fehlgeschlagen.</p>

            @if (uploadResult?.successes?.length) {
              <div style="margin-top: 16px;">
                <h3 style="color: #27ae60;">Erfolgreich aktualisiert ({{ uploadResult!.successes.length }})</h3>
                <div style="margin: 8px 0; max-height: 350px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 4px;">
                  <table class="table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: var(--color-surface); z-index: 1;">
                      <tr>
                        <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border);">Aufgabe</th>
                        <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border);">Item-ID</th>
                        <th style="text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--color-border);">Wert (est)</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (success of uploadResult!.successes; track $index) {
                        <tr>
                          <td style="padding: 4px 8px; border-bottom: 1px dotted var(--color-border);"><code>{{ success.unitId }}</code></td>
                          <td style="padding: 4px 8px; border-bottom: 1px dotted var(--color-border);"><code>{{ success.itemId }}</code></td>
                          <td style="text-align: right; padding: 4px 8px; border-bottom: 1px dotted var(--color-border);">{{ success.value }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            @if (uploadResult?.failed?.length) {
              <div style="margin-top: 16px;">
                <h3 style="color: #e74c3c;">Fehlgeschlagen ({{ uploadResult!.failed.length }})</h3>
                <div style="margin: 8px 0; max-height: 250px; overflow-y: auto; background: rgba(231, 76, 60, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(231, 76, 60, 0.2);">
                  <ul style="margin: 0; padding-left: 20px; color: var(--color-text); font-size: 0.9rem;">
                    @for (fail of uploadResult!.failed; track $index) {
                      <li><code>{{ fail.csvRow }}</code>: {{ fail.reason }}</li>
                    }
                  </ul>
                </div>
                <p class="help-text" style="font-size: 0.8rem; margin-top: 8px;">Überprüfe diese Einträge in der CSV-Datei (Spalte "item" muss mit Item-ID oder Unit-Item Kombi übereinstimmen).</p>
              </div>
            } @else if (uploadResult?.successes?.length) {
              <p style="color: #27ae60; margin-top: 16px; font-weight: bold;">🎉 Alle Items aus der CSV konnten erfolgreich zugeordnet werden!</p>
            }

          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Error Dialog -->
    @if (showErrorDialog) {
      <div class="overlay-backdrop" (click)="showErrorDialog = false">
        <div class="overlay-dialog" style="max-width: 500px; border-top: 4px solid #e74c3c;" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <h2 style="color: #e74c3c; display: flex; align-items: center; gap: 8px;">
              <span>⚠️</span> Upload-Fehler
            </h2>
            <button class="btn btn-sm btn-outline" (click)="showErrorDialog = false">✕</button>
          </div>
          <div class="overlay-content" style="text-align: center; padding: 24px 16px;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🚫</div>
            <p style="font-size: 1.1rem; line-height: 1.5; color: var(--color-text);">{{ errorMessage }}</p>
            <div style="margin-top: 24px;">
              <button class="btn btn-primary" (click)="showErrorDialog = false">Verstanden</button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Column Manager -->
    @if (showColumnManager) {
      <div class="overlay-backdrop" (click)="showColumnManager = false">
        <div class="overlay-dialog column-manager-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">👁️</span>
              <div>
                <h2>Spalten verwalten</h2>
                <small>Wählen Sie die Metadaten-Spalten für die Tabelle aus</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="showColumnManager = false">✕</button>
          </div>
          <div class="overlay-content">
            <div class="column-manager-toolbar">
              <div class="search-container">
                <input
                  class="filter-input"
                  [(ngModel)]="columnFilterText"
                  placeholder="🔍 Spalten suchen (Label oder ID)...">
              </div>
              <button class="btn btn-outline btn-sm" (click)="resetToDefault()" [disabled]="!metadataSettings.visible.length">
                🔄 Standard
              </button>
            </div>

            <div class="column-grid">
              @for (col of filteredAllColumns; track col.id) {
                <div class="column-tile"
                     [class.active]="metadataSettings.visible.includes(col.id)"
                     (click)="toggleColumnVisibility(col)">
                  <div class="tile-check">
                    <input
                      type="checkbox"
                      [checked]="metadataSettings.visible.includes(col.id)"
                      (click)="$event.stopPropagation()"
                      (change)="toggleColumnVisibility(col)">
                  </div>
                  <div class="tile-body">
                    <span class="tile-label">{{ col.label }}</span>
                    <span class="tile-id">ID: {{ col.id }}</span>
                  </div>
                  @if (metadataSettings.visible.includes(col.id)) {
                    <div class="tile-actions" (click)="$event.stopPropagation()">
                      <button class="btn btn-xs btn-outline"
                              (click)="moveColumnUp(col)"
                              [disabled]="metadataSettings.order[0] === col.id"
                              title="Nach oben">
                        ↑
                      </button>
                      <button class="btn btn-xs btn-outline"
                              (click)="moveColumnDown(col)"
                              [disabled]="metadataSettings.order[metadataSettings.order.length - 1] === col.id"
                              title="Nach unten">
                        ↓
                      </button>
                    </div>
                  }
                </div>
              }
              @if (filteredAllColumns.length === 0) {
                <div class="empty-state">
                  <p>Keine Spalten gefunden für "{{ columnFilterText }}"</p>
                </div>
              }
            </div>

            <div class="column-manager-footer">
              <div class="selection-info">
                {{ metadataSettings.visible.length }} von {{ allColumns.length }} Spalten gewählt
              </div>
              <div class="footer-actions">
                <button class="btn btn-outline" (click)="showColumnManager = false">Abbrechen</button>
                <button class="btn btn-primary" (click)="saveMetadataSettings()">💾 Speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Save Response State Confirmation -->
    @if (showSaveConfirmDialog) {
      <div class="overlay-backdrop" (click)="!confirmDialogState && (showSaveConfirmDialog = false)">
        <div class="overlay-dialog" style="max-width: 450px;" (click)="$event.stopPropagation()">
          <div class="overlay-header" [style.border-top]="confirmDialogState === 'saving' ? '4px solid #3498db' : '4px solid #27ae60'">
            @if (confirmDialogState === 'saving') {
              <h2 style="color: #3498db; display: flex; align-items: center; gap: 8px;">
                <span class="spinner-inline"></span> Speichern...
              </h2>
            } @else {
              <h2 style="color: #27ae60; display: flex; align-items: center; gap: 8px;">
                <span>💾</span> Zustand speichern
              </h2>
            }
            <button class="btn btn-sm btn-outline" [disabled]="confirmDialogState === 'saving'" (click)="showSaveConfirmDialog = false">✕</button>
          </div>
          <div class="overlay-content" style="text-align: center; padding: 32px 24px;">
            @if (confirmDialogError) {
              <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
              <p style="color: #e74c3c; margin-bottom: 20px;">{{ confirmDialogError }}</p>
            } @else {
              <div style="font-size: 3rem; margin-bottom: 16px;">💾</div>
              <p style="font-size: 1.1rem; margin-bottom: 8px;">
                Möchten Sie den aktuellen Zustand speichern?
              </p>
              <p style="color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 24px;">
                Item: <code>{{ selectedItem?.unitId }}{{ selectedItem?.itemId }}</code>
              </p>
            }
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button class="btn btn-outline" [disabled]="confirmDialogState === 'saving'" (click)="showSaveConfirmDialog = false">
                Abbrechen
              </button>
              <button class="btn btn-primary" [disabled]="confirmDialogState === 'saving'" (click)="confirmSaveResponseState()">
                💾 Speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Delete Response State Confirmation -->
    @if (showDeleteConfirmDialog) {
      <div class="overlay-backdrop" (click)="!confirmDialogState && (showDeleteConfirmDialog = false)">
        <div class="overlay-dialog" style="max-width: 450px;" (click)="$event.stopPropagation()">
          <div class="overlay-header" [style.border-top]="confirmDialogState === 'deleting' ? '4px solid #3498db' : '4px solid #e74c3c'">
            @if (confirmDialogState === 'deleting') {
              <h2 style="color: #3498db; display: flex; align-items: center; gap: 8px;">
                <span class="spinner-inline"></span> Löschen...
              </h2>
            } @else {
              <h2 style="color: #e74c3c; display: flex; align-items: center; gap: 8px;">
                <span>🗑️</span> Zustand löschen
              </h2>
            }
            <button class="btn btn-sm btn-outline" [disabled]="confirmDialogState === 'deleting'" (click)="showDeleteConfirmDialog = false">✕</button>
          </div>
          <div class="overlay-content" style="text-align: center; padding: 32px 24px;">
            @if (confirmDialogError) {
              <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
              <p style="color: #e74c3c; margin-bottom: 20px;">{{ confirmDialogError }}</p>
            } @else {
              <div style="font-size: 3rem; margin-bottom: 16px;">🗑️</div>
              <p style="font-size: 1.1rem; margin-bottom: 8px;">
                Möchten Sie den gespeicherten Zustand löschen?
              </p>
              <p style="color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 24px;">
                Item: <code>{{ selectedItem?.unitId }}{{ selectedItem?.itemId }}</code>
              </p>
              <p style="color: #e74c3c; font-size: 0.85rem; margin-bottom: 24px; background: rgba(231, 76, 60, 0.05); padding: 8px 12px; border-radius: 4px;">
                ⚠️ Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            }
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button class="btn btn-outline" [disabled]="confirmDialogState === 'deleting'" (click)="showDeleteConfirmDialog = false">
                Abbrechen
              </button>
              <button class="btn btn-danger" [disabled]="confirmDialogState === 'deleting'" (click)="confirmDeleteResponseState()" style="background: #e74c3c; color: white; border-color: #e74c3c;">
                🗑️ Löschen
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Raw Response State Data -->
    @if (showRawDataOverlay) {
      <div class="overlay-backdrop" (click)="showRawDataOverlay = false">
        <div class="overlay-dialog" style="max-width: 900px;" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">📊</span>
              <div>
                <h2>Gespeicherte Zustände</h2>
                <small>Alle gespeicherten Response States</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="showRawDataOverlay = false">✕</button>
          </div>
          <div class="overlay-content">
            @if (allResponseStates.length === 0) {
              <div class="empty-state">
                <p>Keine gespeicherten Zustände vorhanden.</p>
              </div>
            } @else {
              <div class="state-list">
                @for (state of allResponseStates; track state.id) {
                  <div class="state-item">
                    <div class="state-header">
                      <code>{{ state.itemId }}</code>
                      <span class="unit-badge">{{ state.unitId }}</span>
                      <span class="date">{{ state.updatedAt | date:'short' }}</span>
                    </div>
                    <pre class="json-view">{{ state.responseData | json }}</pre>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 140px);
      overflow: hidden;
    }
    app-split-pane {
      flex: 1;
      min-height: 0;
    }

    .explorer-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .explorer-header h1 { margin-bottom: 0; }
    .header-actions {
      display: flex; align-items: center; gap: 16px;
    }
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
      /* Fix corner and layout shift */
      scrollbar-gutter: stable;
      position: relative;
    }
    /* Better scrollbar styling to avoid 'messy' intersection */
    .table-scroll::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    .table-scroll::-webkit-scrollbar-track {
      background: #f8f9fa;
      border-radius: 0 0 var(--radius) var(--radius);
    }
    .table-scroll::-webkit-scrollbar-thumb {
      background: #ced4da;
      border-radius: 10px;
      border: 3px solid #f8f9fa;
    }
    .table-scroll::-webkit-scrollbar-thumb:hover {
      background: #adb5bd;
    }
    .table-scroll::-webkit-scrollbar-corner {
      background: #f8f9fa;
    }

    .explorer-table {
      font-size: 0.85rem;
      margin-bottom: 0;
      width: 100%;
      min-width: max-content;
      border-collapse: collapse; /* Reverting to collapse for better background handling */
    }
    .explorer-table th, .explorer-table td {
      padding: 10px 16px;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
    }
    .explorer-table th {
      position: sticky; top: 0;
      background-color: var(--color-bg) !important;
      z-index: 100;
      white-space: nowrap;
      min-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      /* Using box-shadow instead of border-bottom for better sticky support in collapse mode */
      box-shadow: inset 0 -2px 0 var(--color-border);
    }
    .explorer-table td {
      white-space: nowrap;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sticky-col {
      position: sticky;
      left: 0;
      background-color: var(--color-surface) !important;
      z-index: 50;
      box-shadow: 2px 0 5px rgba(0,0,0,0.1);
    }
    th.sticky-col {
      background-color: var(--color-bg) !important;
      z-index: 200; /* Highest priority */
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
      background-color: var(--color-bg) !important;
      border-bottom: 2px solid var(--color-border);
      position: sticky; top: 44px; /* Matches the header height */
      z-index: 100;
    }
    .filter-row th.sticky-col { z-index: 200; }
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
    .item-nav {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; padding: 10px 0;
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }
    .item-nav-info {
      font-size: 0.85rem; font-weight: 500;
      color: var(--color-text-secondary);
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
    .spinner-inline {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary-light);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .overlay-content {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }
    .coding-scheme-view {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .coding-item {
      background: rgba(0, 0, 0, 0.02);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--color-border);
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    }
    .coding-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 10px;
    }
    .header-tags {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .manual-icon {
      font-size: 0.9rem;
      cursor: help;
      margin-left: 4px;
    }
    .coding-item h4 {
      margin: 0;
      color: var(--color-primary);
      font-size: 1.1rem;
      font-weight: 600;
    }
    .variable-id {
      font-size: 0.8rem;
      background: rgba(0,0,0,0.05);
      padding: 2px 8px;
      border-radius: 4px;
      color: var(--color-text-secondary);
    }
    .global-manual-instruction {
      background: rgba(243, 156, 18, 0.05);
      border-left: 4px solid #f39c12;
      padding: 10px 14px;
      margin-bottom: 20px;
      font-size: 0.85rem;
      border-radius: 4px;
      color: #7e5109;
      line-height: 1.4;
    }
    .codes-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .code-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border-radius: 6px;
      background: white;
      border-left: 4px solid transparent;
      transition: all 0.2s;
    }
    .code-row:hover {
      background: rgba(41,128,185,0.03);
      border-left-color: var(--color-primary-light);
    }
    .code-manual-instruction {
      margin: 2px 0 4px 44px;
      font-size: 0.8rem;
      color: #d35400;
      background: rgba(230, 126, 34, 0.03);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .html-content {
      margin-top: 4px;
    }
    .html-content ul, .html-content ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    .html-content p {
      margin: 4px 0;
    }
    .code-main {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 0.9rem;
    }
    .code-id {
      font-weight: 700;
      color: var(--color-text-secondary);
      min-width: 24px;
    }
    .code-score {
      font-weight: 700;
      color: #27ae60;
      min-width: 30px;
    }
    .code-label {
      font-weight: 500;
      color: var(--color-text);
    }
    .rule-list {
      margin: 4px 0 0 44px;
      padding-left: 0;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      list-style-type: none;
    }
    .rule-list li {
      position: relative;
      padding-left: 14px;
      margin-bottom: 2px;
    }
    .rule-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--color-primary-light);
    }

    /* Combined ID styling */
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
    /* Column Manager Premium */
    .column-manager-dialog {
      max-width: 650px;
    }
    .column-manager-toolbar {
      display: flex; gap: 12px; align-items: center; margin-bottom: 20px;
    }
    .column-manager-toolbar .search-container { flex: 1; }

    /* Coding Toolbar */
    .coding-toolbar {
      display: flex; gap: 12px; align-items: center; margin-bottom: 20px;
      padding: 0 4px;
    }
    .coding-toolbar .search-container { flex: 1; }
    .sort-actions { display: flex; gap: 8px; }

    .column-grid {
      display: flex; flex-direction: column; gap: 8px;
      max-height: 450px; overflow-y: auto; padding: 4px;
      scrollbar-gutter: stable;
    }
    .column-tile {
      display: flex; align-items: center; gap: 16px; padding: 12px 16px;
      background: var(--color-surface); border-radius: 12px;
      border: 1px solid var(--color-border); cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .column-tile:hover {
      transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      border-color: var(--color-primary-light);
    }
    .column-tile.active {
      background: rgba(26, 82, 118, 0.03);
      border-color: rgba(26, 82, 118, 0.3);
    }
    .tile-check { display: flex; align-items: center; }
    .tile-check input { width: 18px; height: 18px; cursor: pointer; }
    .tile-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .tile-label { font-size: 0.95rem; font-weight: 600; color: var(--color-text); }
    .tile-id { font-size: 0.75rem; color: var(--color-text-secondary); opacity: 0.7; }
    .tile-actions { display: flex; gap: 4px; }
    .column-manager-footer {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--color-border);
    }
    .selection-info { font-size: 0.85rem; color: var(--color-text-secondary); font-weight: 500; }
    .footer-actions { display: flex; gap: 12px; }

    /* Metadata Summary Card */
    .unit-metadata-card {
      margin-top: 16px; padding: 16px; background: rgba(26, 82, 118, 0.03);
      border: 1px solid rgba(26, 82, 118, 0.1);
    }
    .unit-metadata-card .card-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
    }
    .unit-metadata-card h4 { margin: 0; font-size: 0.9rem; color: var(--color-primary); }
    .meta-summary-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
    }
    .meta-summary-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-summary-label { font-size: 0.75rem; color: var(--color-text-secondary); }
    .meta-summary-value { font-size: 0.85rem; font-weight: 600; }

    /* Metadata Drawer */
    .drawer-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3); z-index: 1100;
      opacity: 0; visibility: hidden; transition: all 0.3s ease;
      backdrop-filter: blur(4px);
    }
    .drawer-backdrop.open { opacity: 1; visibility: visible; }
    .drawer-container {
      position: absolute; top: 0; right: -400px; width: 400px; height: 100%;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(20px) saturate(180%);
      box-shadow: -5px 0 25px rgba(0,0,0,0.1);
      display: flex; flex-direction: column;
      transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border-left: 1px solid rgba(255,255,255,0.3);
    }
    .drawer-container.open { right: 0; }
    .drawer-header {
      padding: 24px; border-bottom: 1px solid var(--color-border);
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .drawer-title { display: flex; gap: 16px; align-items: center; }
    .drawer-title h3 { margin: 0; font-size: 1.25rem; }
    .drawer-title small { color: var(--color-text-secondary); display: block; margin-top: 2px; }
    .drawer-icon {
      width: 40px; height: 40px; background: var(--color-primary-light);
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px; color: white; font-size: 1.2rem;
    }
    .btn-close {
      background: none; border: none; font-size: 1.5rem; cursor: pointer;
      color: var(--color-text-secondary); transition: color 0.2s;
    }
    .btn-close:hover { color: var(--color-danger); }
    .drawer-content { padding: 24px; overflow-y: auto; flex: 1; }
    .meta-grid { display: flex; flex-direction: column; gap: 20px; }
    .meta-item { border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px; }
    .meta-item:last-child { border-bottom: none; }
    .meta-label { font-size: 0.8rem; font-weight: 500; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .meta-value { font-size: 1rem; color: var(--color-text); font-weight: 500; }

    /* General Overlays */
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
    .state-list {
      display: flex; flex-direction: column; gap: 16px;
    }
    .state-item {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .state-header {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border);
    }
    .unit-badge {
      background: var(--color-primary-light);
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .state-header .date {
      color: var(--color-text-secondary);
      font-size: 0.8rem;
      margin-left: auto;
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
  hasEmpiricalDifficulty = false;
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
  showOverlay: 'coding' | null = null;
  showMetadataDrawer = false;
  unitMetadataCache: Record<string, any[]> = {};
  codingSchemeCache: Record<string, any> = {};
  currentCodingSchemeAsText: CodingAsText[] | null = null;
  currentUnitMetadata: any[] = [];
  currentCodingScheme: any = null;

  // Tags
  enableTags = false;
  availableTags: string[] = [];
  itemTags: Record<string, string[]> = {};
  persistUserPreferences = false;

  // File Upload
  showUploadReport = false;
  uploadResult: { updated: number, failed: any[], successes: any[] } | null = null;
  isUploading = false;
  showErrorDialog = false;
  errorMessage = '';

  // Metadata column management
  isAcpManager = false;
  showColumnManager = false;
  allColumns: MetadataColumn[] = [];
  metadataSettings: MetadataSettings = { visible: [], order: [] };
  columnFilterText = '';

  // Coding scheme display filtering
  codingSearchText = '';
  codingSortField: 'id' | 'label' = 'id';
  codingSortDir: 'asc' | 'desc' = 'asc';

  // Response State
  currentResponseData: Record<string, any> | null = null;
  hasResponseState = false;
  isFallbackState = false;
  showRawDataOverlay = false;
  allResponseStates: any[] = [];

  // Response State Confirmation Dialogs
  showSaveConfirmDialog = false;
  showDeleteConfirmDialog = false;
  confirmDialogState: 'idle' | 'saving' | 'deleting' = 'idle';
  confirmDialogError = '';

  get filteredCodingSchemeAsText(): CodingAsText[] {
    if (!this.currentCodingSchemeAsText) return [];
    
    let list = [...this.currentCodingSchemeAsText];
    
    // Search
    if (this.codingSearchText) {
      const term = this.codingSearchText.toLowerCase();
      list = list.filter(c => 
        c.id.toLowerCase().includes(term) || 
        (c.label && c.label.toLowerCase().includes(term))
      );
    }
    
    // Sort
    return list.sort((a, b) => {
      let aVal = (this.codingSortField === 'id' ? a.id : (a.label || a.id)).toLowerCase();
      let bVal = (this.codingSortField === 'id' ? b.id : (b.label || b.id)).toLowerCase();
      
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return this.codingSortDir === 'asc' ? cmp : -cmp;
    });
  }

  toggleCodingSort(field: 'id' | 'label') {
    if (this.codingSortField === field) {
      this.codingSortDir = this.codingSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.codingSortField = field;
      this.codingSortDir = 'asc';
    }
  }

  getCodingSortIndicator(field: 'id' | 'label'): string {
    if (this.codingSortField !== field) return '';
    return this.codingSortDir === 'asc' ? '↑' : '↓';
  }

  get filteredAllColumns() {
    let list = [...this.allColumns];
    if (this.columnFilterText) {
      const term = this.columnFilterText.toLowerCase();
      list = list.filter(c => 
        c.label.toLowerCase().includes(term) || 
        c.id.toLowerCase().includes(term)
      );
    }
    
    // Sort columns: selected/ordered ones first, then alphabetical
    return list.sort((a, b) => {
      const indexA = this.metadataSettings.order.indexOf(a.id);
      const indexB = this.metadataSettings.order.indexOf(b.id);
      
      // Both are in the custom order
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // Only A is in the order
      if (indexA !== -1) return -1;
      // Only B is in the order
      if (indexB !== -1) return 1;
      // Neither is in the order: alphabetical
      return a.label.localeCompare(b.label);
    });
  }

  private messageHandler = this.onPlayerMessage.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public sanitizer: DomSanitizer,
    private voudService: VoudService,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'ContentPool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Explorer' },
    ];

    window.addEventListener('message', this.messageHandler);

    // Check if user is ACP Manager
    this.checkUserRole();

    // Load feature config and metadata settings
    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      const fc = data?.featureConfig || {};
      this.enableTags = !!fc.enableItemListTags;
      this.availableTags = fc.availableTags || [];
      this.persistUserPreferences = !!fc.persistUserPreferences && this.authService.isLoggedIn;
      
      // Load metadata column settings
      this.metadataSettings = fc.metadataColumns || { visible: [], order: [] };
      this.loadUiPreferences();

      if (this.enableTags && this.items.length) {
        this.loadPersistedTags();
      }
    });

    this.reloadItems();
  }

  // --- Reload Items ---
  reloadItems() {
    // Load item list from .vomd files
    this.api.getFileItemList(this.acpId).subscribe(result => {
      this.allColumns = result.columns || [];
      this.columns = this.filterVisibleColumns(this.allColumns);
      this.items = result.items || [];
      this.hydrateItemTagsFromItems();
      this.hasEmpiricalDifficulty = this.items.some((item: any) => item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null);
      this.filteredItems = [...this.items];
      this.unitMetadataCache = result.unitMetadata || {};
      this.codingSchemeCache = result.codingSchemes || {};
      if (this.enableTags) {
        this.loadPersistedTags();
      }
      this.applyFilter(); // re-apply current filters and sort
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
        } else if (colId === 'empiricalDifficulty') {
          if (item.empiricalDifficulty === undefined || item.empiricalDifficulty === null) return false;
          if (item.empiricalDifficulty.toString() !== filterValue) return false;
        } else {
          // Metadata column
          const val = item.metadata[colId] || '';
          if (!val.toLowerCase().includes(subTerm)) return false;
        }
      }

      return true;
    });

    this.applySort();
    this.saveUiPreferences();
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
      let aVal: any = '';
      let bVal: any = '';

      if (this.sortIsMeta) {
        aVal = a.metadata[this.sortField] || '';
        bVal = b.metadata[this.sortField] || '';
      } else if (this.sortField === 'empiricalDifficulty') {
        aVal = a.empiricalDifficulty ?? -Infinity;
        bVal = b.empiricalDifficulty ?? -Infinity;
      } else {
        aVal = (a as any)[this.sortField] || '';
        bVal = (b as any)[this.sortField] || '';
      }

      // Handing numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return this.sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      aVal = aVal.toString().toLowerCase();
      bVal = bVal.toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    this.saveUiPreferences();
  }

  // --- CSV Upload Handling ---
  onCsvFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.isUploading = true;
    this.api.uploadEmpiricalDifficulties(this.acpId, file).subscribe({
      next: (result) => {
        this.isUploading = false;
        this.uploadResult = result;
        this.showUploadReport = true;
        // The list will reload when they close the dialog (handled in template)
      },
      error: (err) => {
        console.error(err);
        this.isUploading = false;
        this.errorMessage = err.error?.message || 'Fehler beim Hochladen der CSV-Datei. Bitte stelle sicher, dass die Spalten "item" und "est" vorhanden sind.';
        this.showErrorDialog = true;
      }
    });

    input.value = ''; // reset input
  }

  clearEmpiricalDifficulties() {
    if (confirm('Bist du sicher, dass du alle empirischen Itemschwierigkeiten für diesen ACP löschen möchtest? Dies betrifft alle Items.')) {
      this.api.clearEmpiricalDifficulties(this.acpId).subscribe({
        next: () => {
          this.reloadItems();
        },
        error: (err) => {
          console.error(err);
          alert('Fehler beim Löschen der Itemschwierigkeiten.');
        }
      });
    }
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
    
    // Reset response state flags
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.currentResponseData = null;

    // Load unit metadata and coding scheme from cache
    this.currentUnitMetadata = this.unitMetadataCache[item.unitId] || [];
    this.currentCodingScheme = this.codingSchemeCache[item.unitId] || null;
    if (this.currentCodingScheme) {
      const codings = Array.isArray(this.currentCodingScheme)
        ? this.currentCodingScheme
        : this.currentCodingScheme.variableCodings || [];
      this.currentCodingSchemeAsText = CodingSchemeTextFactory.asText(codings);
      // Enrich with manual instruction texts from raw JSON
      this.currentCodingSchemeAsText.forEach(cat => {
        const rawVariable = codings.find((v: any) => v.id === cat.id);
        if (rawVariable) {
          (cat as any).manualInstructionText = rawVariable.manualInstruction;
          cat.codes.forEach(c => {
            const rawCode = rawVariable.codes?.find((rc: any) => 
              (rc.id === null ? 'null' : rc.id.toString(10)) === c.id
            );
            if (rawCode) {
              (c as any).manualInstructionText = rawCode.manualInstruction;
            }
          });
        }
      });
    } else {
      this.currentCodingSchemeAsText = null;
    }

    // Load response state for this item (with fallback to previous item in same unit)
    this.loadResponseStateForItem(item, index);

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

  // --- Response State ---
  private loadResponseStateForItem(item: ExplorerItem, index: number) {
    // Build item list from filteredItems for fallback lookup
    const itemList = this.filteredItems.map(i => ({ itemId: i.itemId, unitId: i.unitId }));

    this.api.getResponseStateWithFallback(this.acpId, item.itemId, item.unitId, itemList).subscribe({
      next: (result) => {
        if (result.state && result.state.responseData && Object.keys(result.state.responseData).length > 0) {
          this.currentResponseData = result.state.responseData;
          this.hasResponseState = true;
          this.isFallbackState = result.isFallback;
        } else {
          // No state available (direct or fallback)
          this.currentResponseData = null;
          this.hasResponseState = false;
          this.isFallbackState = false;
        }
      },
      error: () => {
        // On error, continue without state
        this.currentResponseData = null;
        this.hasResponseState = false;
        this.isFallbackState = false;
      }
    });
  }

  saveCurrentResponseState() {
    if (!this.selectedItem || !this.currentResponseData) {
      this.confirmDialogError = 'Kein Zustand zum Speichern vorhanden. Bitte füllen Sie zuerst das Formular aus.';
      this.showSaveConfirmDialog = true;
      return;
    }
    this.confirmDialogError = '';
    this.showSaveConfirmDialog = true;
  }

  confirmSaveResponseState() {
    if (!this.selectedItem || !this.currentResponseData) return;

    this.confirmDialogState = 'saving';

    this.api.saveResponseState(
      this.acpId,
      this.selectedItem.itemId,
      this.selectedItem.unitId,
      this.currentResponseData
    ).subscribe({
      next: () => {
        this.hasResponseState = true;
        this.isFallbackState = false;
        this.confirmDialogState = 'idle';
        this.showSaveConfirmDialog = false;
      },
      error: (err) => {
        console.error('Error saving response state:', err);
        this.confirmDialogState = 'idle';
        this.confirmDialogError = 'Fehler beim Speichern des Zustands.';
      }
    });
  }

  resetResponseState() {
    if (!this.selectedItem) return;
    this.confirmDialogError = '';
    this.showDeleteConfirmDialog = true;
  }

  confirmDeleteResponseState() {
    if (!this.selectedItem) return;

    this.confirmDialogState = 'deleting';

    this.api.deleteResponseState(this.acpId, this.selectedItem.itemId).subscribe({
      next: () => {
        this.hasResponseState = false;
        this.isFallbackState = false;
        this.currentResponseData = null;
        this.confirmDialogState = 'idle';
        this.showDeleteConfirmDialog = false;
      },
      error: (err) => {
        console.error('Error deleting response state:', err);
        this.confirmDialogState = 'idle';
        this.confirmDialogError = 'Fehler beim Löschen des Zustands.';
      }
    });
  }

  loadAllResponseStates() {
    this.api.getAllResponseStates(this.acpId).subscribe({
      next: (states) => {
        this.allResponseStates = states;
        this.showRawDataOverlay = true;
      },
      error: (err) => {
        console.error('Error loading response states:', err);
        alert('Fehler beim Laden der gespeicherten Zustände.');
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
          
          // Prepare unitState with saved response data
          const unitState: any = { dataParts: {} };
          if (this.hasResponseState && this.currentResponseData) {
            unitState.dataParts = this.currentResponseData;
          }
          
          this.sendToPlayer({
            type: 'vopStartCommand',
            sessionId: `explorer-${this.selectedItem?.uuid || 'none'}`,
            unitDefinition: definition,
            unitState: unitState,
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
        // Capture response data from unitState.dataParts
        if (msg.unitState?.dataParts) {
          this.currentResponseData = msg.unitState.dataParts;
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
    if (this.persistUserPreferences) {
      localStorage.setItem(this.getTagPreferencesKey(), JSON.stringify(this.itemTags || {}));
      this.applyFilter();
      return;
    }

    this.api.saveItemTags(this.acpId, this.itemTags).subscribe({
      next: (savedTags) => {
        this.itemTags = savedTags || {};
        this.applyFilter();
      },
      error: (err) => {
        console.error('Failed to persist item tags', err);
      },
    });
  }

  private loadPersistedTags() {
    if (this.persistUserPreferences) {
      const raw = localStorage.getItem(this.getTagPreferencesKey());
      if (raw) {
        try {
          this.itemTags = JSON.parse(raw) || {};
        } catch {
          this.itemTags = {};
        }
      }
      this.applyFilter();
      return;
    }

    this.api.getItemTags(this.acpId).subscribe({
      next: (tags) => {
        this.itemTags = tags || this.itemTags;
        this.applyFilter();
      },
      error: (err) => {
        console.error('Failed to load item tags', err);
      },
    });
  }

  private hydrateItemTagsFromItems() {
    const tagsFromItems: Record<string, string[]> = {};
    for (const item of this.items) {
      if (item.uuid && Array.isArray(item.tags) && item.tags.length) {
        tagsFromItems[item.uuid] = [...item.tags];
      }
    }
    this.itemTags = tagsFromItems;
  }

  // --- Helpers ---
  extractLabel(label: any): string {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (Array.isArray(label)) {
      const de = label.find((l: any) => l.lang === 'de');
      return de?.value || label[0]?.value || '';
    }
    if (label && typeof label === 'object') {
      return label['de'] || label['value'] || JSON.stringify(label);
    }
    return '';
  }

  extractValueText(valueAsText: any): string {
    if (valueAsText === undefined || valueAsText === null) return '';
    if (typeof valueAsText === 'string') return valueAsText;
    if (typeof valueAsText === 'number') return valueAsText.toString();
    if (typeof valueAsText === 'boolean') return valueAsText ? 'Ja' : 'Nein';

    if (Array.isArray(valueAsText)) {
      const de = valueAsText.find((v: any) => v.lang === 'de');
      if (de) return de.value;
      if (valueAsText.every(v => v && typeof v === 'object' && v.value)) {
        return valueAsText.map(v => v.value).join(', ');
      }
      return valueAsText.map(v => this.extractValueText(v)).join(', ');
    }
    if (typeof valueAsText === 'object') {
      return valueAsText['de'] || valueAsText['value'] || '';
    }
    return '';
  }

  getSummaryMetadata(): any[] {
    if (!this.currentUnitMetadata) return [];
    // Prefer these IDs for summary
    const priorityIds = ['level', 'subject', 'competence', 'format', 'time', 'duration', 'difficulty'];
    const summary = this.currentUnitMetadata.filter(m =>
      priorityIds.some(pid => m.id.toLowerCase().includes(pid))
    );
    // If no priority items found, show the first 4 entries
    if (summary.length === 0 && this.currentUnitMetadata.length > 0) {
      return this.currentUnitMetadata.slice(0, 4);
    }
    return summary.slice(0, 4);
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

  // --- Metadata Column Management ---
  checkUserRole() {
    // Use AuthService to properly check ACP Manager role
    this.isAcpManager = this.authService.hasAcpRole(this.acpId, 'ACP_MANAGER');
    
    console.log('Role check result:', {
      acpId: this.acpId,
      isAcpManager: this.isAcpManager,
      currentUser: this.authService.currentUser
    });
  }

  filterVisibleColumns(allColumns: MetadataColumn[]): MetadataColumn[] {
    if (!this.metadataSettings?.visible?.length) {
      return allColumns; // Show all if no settings
    }
    
    // Filter visible columns and maintain order
    const visibleMap = new Set(this.metadataSettings.visible);
    const orderedColumns = [];
    
    // First, add columns in the specified order
    for (const colId of this.metadataSettings.order || []) {
      const col = allColumns.find(c => c.id === colId);
      if (col && visibleMap.has(colId)) {
        orderedColumns.push({ ...col, visible: true });
      }
    }
    
    // Then add any remaining visible columns not in the order list
    for (const col of allColumns) {
      if (visibleMap.has(col.id) && !orderedColumns.some(c => c.id === col.id)) {
        orderedColumns.push({ ...col, visible: true });
      }
    }
    
    return orderedColumns;
  }

  toggleColumnVisibility(column: MetadataColumn) {
    const colIndex = this.metadataSettings.visible.indexOf(column.id);
    if (colIndex === -1) {
      this.metadataSettings.visible.push(column.id);
      if (!this.metadataSettings.order.includes(column.id)) {
        this.metadataSettings.order.push(column.id);
      }
    } else {
      this.metadataSettings.visible.splice(colIndex, 1);
      const orderIndex = this.metadataSettings.order.indexOf(column.id);
      if (orderIndex !== -1) {
        this.metadataSettings.order.splice(orderIndex, 1);
      }
    }
    this.columns = this.filterVisibleColumns(this.allColumns);
  }

  moveColumnUp(column: MetadataColumn) {
    const index = this.metadataSettings.order.indexOf(column.id);
    if (index > 0) {
      [this.metadataSettings.order[index], this.metadataSettings.order[index - 1]] = 
        [this.metadataSettings.order[index - 1], this.metadataSettings.order[index]];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  moveColumnDown(column: MetadataColumn) {
    const index = this.metadataSettings.order.indexOf(column.id);
    if (index >= 0 && index < this.metadataSettings.order.length - 1) {
      [this.metadataSettings.order[index], this.metadataSettings.order[index + 1]] = 
        [this.metadataSettings.order[index + 1], this.metadataSettings.order[index]];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  saveMetadataSettings() {
    console.log('Saving metadata settings:', {
      acpId: this.acpId,
      visibleColumns: this.metadataSettings.visible,
      columnOrder: this.metadataSettings.order,
      currentUser: this.authService.currentUser
    });

    this.api.updateMetadataColumns(this.acpId, {
      visibleColumns: this.metadataSettings.visible,
      columnOrder: this.metadataSettings.order
    }).subscribe({
      next: (response) => {
        console.log('Save successful!', response);
        this.showColumnManager = false;
        // Refresh to get updated settings
        this.api.getAcpStartPage(this.acpId).subscribe(data => {
          this.metadataSettings = data?.featureConfig?.metadataColumns || { visible: [], order: [] };
          console.log('Refreshed settings:', this.metadataSettings);
        });
      },
      error: (error) => {
        console.error('Save failed with error:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          errorDetails: error.error,
          url: error.url
        });
        
        let errorMessage = 'Fehler beim Speichern: ';
        if (error.status === 403) {
          errorMessage += 'Zugang verweigert - Sie haben keine Berechtigung für diese Aktion.';
        } else if (error.status === 401) {
          errorMessage += 'Nicht autorisiert - Bitte melden Sie sich an.';
        } else if (error.error?.message) {
          errorMessage += error.error.message;
        } else {
          errorMessage += error.message || JSON.stringify(error);
        }
        
        alert(errorMessage);
      }
    });
  }

  resetToDefault() {
    this.metadataSettings = { visible: [], order: [] };
    this.columns = this.filterVisibleColumns(this.allColumns);
  }

  private getUiPreferencesKey(): string {
    const userId = this.authService.currentUser?.id || 'anonymous';
    return `cp:item-explorer:prefs:${this.acpId}:${userId}`;
  }

  private getTagPreferencesKey(): string {
    const userId = this.authService.currentUser?.id || 'anonymous';
    return `cp:item-explorer:tags:${this.acpId}:${userId}`;
  }

  private loadUiPreferences() {
    if (!this.persistUserPreferences) return;

    const raw = localStorage.getItem(this.getUiPreferencesKey());
    if (!raw) return;

    try {
      const prefs = JSON.parse(raw);
      this.filterText = typeof prefs.filterText === 'string' ? prefs.filterText : this.filterText;
      this.sortField = typeof prefs.sortField === 'string' ? prefs.sortField : this.sortField;
      this.sortIsMeta = typeof prefs.sortIsMeta === 'boolean' ? prefs.sortIsMeta : this.sortIsMeta;
      this.sortDir = prefs.sortDir === 'desc' ? 'desc' : 'asc';
      this.columnFilters =
        prefs.columnFilters && typeof prefs.columnFilters === 'object' ? prefs.columnFilters : {};
    } catch {
      // ignore malformed preference payloads
    }
  }

  private saveUiPreferences() {
    if (!this.persistUserPreferences) return;

    const prefs = {
      filterText: this.filterText,
      sortField: this.sortField,
      sortIsMeta: this.sortIsMeta,
      sortDir: this.sortDir,
      columnFilters: this.columnFilters,
    };
    localStorage.setItem(this.getUiPreferencesKey(), JSON.stringify(prefs));
  }
}
