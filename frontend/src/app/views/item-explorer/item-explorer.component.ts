import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { VoudService } from '../../core/services/voud.service';
import {
  GEOGEBRA_PLAYER_RESOURCE_BASE,
  rewriteGeoGebraAssetUrls,
} from '../../core/utils/geogebra-player-html.util';
import { AuthService } from '../../core/services/auth.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { SplitPaneComponent } from '../../shared/components/split-pane.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { CodingSchemeTextFactory, CodingAsText } from '@iqb/responses';
import { firstValueFrom } from 'rxjs';
import {
  ItemExplorerChangeLogEntry,
  ItemExplorerSharedState,
  ItemExplorerStateEnvelope,
} from '../../core/models/api.models';

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
  sourceVariable?: string;
  metadata: Record<string, string>;
  empiricalDifficulty?: number;
  tags?: string[];
  previewTargetId?: string;
  excluded?: boolean;
}

interface MetadataSettings {
  visible: string[];
  order: string[];
}

interface PreviewTargetOption {
  id: string;
  label: string;
  sourceType: string;
}

interface PreviewTargetResolution {
  itemTarget: string;
  isDerived: boolean;
  options: PreviewTargetOption[];
  defaultTargetId: string;
}

type ExplorerUiStatus = 'CLEAN' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';

const DEFAULT_EXPLORER_SORT_FIELD = 'unitLabel';
const DEFAULT_EXPLORER_SORT_DIR: 'asc' | 'desc' = 'asc';

@Component({
  selector: 'app-item-explorer',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    BreadcrumbComponent,
    SplitPaneComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <app-breadcrumb [items]="breadcrumbs" />

    <div class="explorer-header">
      <h1>Item-Explorer</h1>
      <div class="header-actions">
        <span class="item-count">{{ filteredItems.length }} von {{ items.length }} Items</span>
        @if (canEditExplorer) {
          <input
            type="file"
            #csvUploadInput
            style="display: none"
            accept=".csv"
            (change)="onCsvFileSelected($event)"
          />
          <button class="btn btn-outline btn-sm" (click)="csvUploadInput.click()">
            📄 Item-Schwierigkeiten (CSV) hochladen
          </button>
          <button
            class="btn btn-outline btn-sm"
            style="color: #e74c3c; border-color: rgba(231, 76, 60, 0.4);"
            (click)="openClearEmpiricalDifficultiesDialog()"
            title="Alle Itemschwierigkeiten löschen"
          >
            🗑️ Werte bereinigen
          </button>
          <button class="btn btn-outline btn-sm" (click)="openColumnManager()">
            👁️ Spalten verwalten
          </button>
          <button
            class="btn btn-outline btn-sm"
            (click)="enableManualOrderMode()"
            [class.btn-primary]="sortField === '__manual__'"
          >
            ↕️ Reihenfolge
          </button>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="!selectedItem || sortField !== '__manual__'"
            (click)="moveSelectedItem(-1)"
          >
            ↑
          </button>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="!selectedItem || sortField !== '__manual__'"
            (click)="moveSelectedItem(1)"
          >
            ↓
          </button>
          <button class="btn btn-outline btn-sm" (click)="showHistory()">
            🕒 Änderungsverlauf
          </button>
        }
      </div>
    </div>

    <div class="card explorer-status-bar">
      <div class="status-main">
        <strong>Status:</strong>
        <span [class]="'status-pill status-' + explorerUiStatus.toLowerCase()">{{
          explorerStatusLabel
        }}</span>
        <span class="status-meta"
          >v{{ explorerVersion }} · veröffentlicht v{{ explorerPublishedVersion }}</span
        >
        @if (lastExplorerChangeInfo) {
          <span class="status-meta">· {{ lastExplorerChangeInfo }}</span>
        }
      </div>
      <div class="status-actions">
        @if (canPublishExplorer) {
          <button
            class="btn btn-primary btn-sm"
            [disabled]="!hasPendingDraftChanges() || explorerUiStatus === 'SAVING'"
            (click)="openSavePreviewDialog()"
          >
            💾 Speichern
          </button>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="!hasPendingDraftChanges() || explorerUiStatus === 'SAVING'"
            (click)="openDiscardExplorerDraftDialog()"
          >
            ↩️ Verwerfen
          </button>
        }
      </div>
    </div>

    @if (lastDraftOperationError) {
      <div class="alert alert-error" style="margin-bottom: 12px;">
        {{ lastDraftOperationError }}
      </div>
    }

    <app-confirm-dialog
      [open]="showClearEmpiricalDifficultiesDialog"
      title="Werte bereinigen"
      message="Alle empirischen Itemschwierigkeiten im Entwurf werden entfernt."
      [details]="[
        'Die Änderungen betreffen alle Items im aktuellen ACP.',
        'Veröffentlicht wird erst nach anschließendem Speichern.',
      ]"
      [error]="clearEmpiricalDifficultiesError"
      [busy]="clearEmpiricalDifficultiesBusy"
      busyLabel="Bereinige Werte..."
      confirmLabel="Alle Werte entfernen"
      confirmVariant="danger"
      (confirmed)="confirmClearEmpiricalDifficulties()"
      (cancelled)="closeClearEmpiricalDifficultiesDialog()"
    />

    <app-confirm-dialog
      [open]="showDiscardDraftDialog"
      title="Änderungen verwerfen"
      message="Die aktuellen Entwurfsänderungen im Item-Explorer werden verworfen."
      [details]="[
        'Nicht veröffentlichte Änderungen gehen verloren.',
        'Der veröffentlichte Stand bleibt unverändert.',
      ]"
      [error]="discardDraftDialogError"
      [busy]="discardDraftDialogBusy"
      busyLabel="Verwerfe Änderungen..."
      confirmLabel="Änderungen verwerfen"
      confirmVariant="danger"
      (confirmed)="confirmDiscardDraftDialog()"
      (cancelled)="closeDiscardDraftDialog()"
    />

    @if (showLeaveWithChangesDialog) {
      <div
        class="overlay-backdrop"
        (click)="leaveWithChangesDialogState === 'idle' && stayOnPage()"
      >
        <div class="overlay-dialog" style="max-width: 560px;" (click)="$event.stopPropagation()">
          <div
            class="overlay-header"
            [style.border-top]="
              leaveWithChangesDialogState === 'idle' ? '4px solid #f39c12' : '4px solid #3498db'
            "
          >
            <h2 style="display: flex; align-items: center; gap: 8px;">
              <span>⚠️</span> Ungespeicherte Änderungen
            </h2>
          </div>
          <div class="overlay-content" style="padding: 24px;">
            <p>Es gibt ungespeicherte Explorer-Änderungen. Wie möchten Sie fortfahren?</p>
            <ul style="margin: 10px 0 14px 18px; color: var(--color-text-secondary);">
              <li>
                <strong>Speichern & Weiter:</strong> Änderungen veröffentlichen und Seite verlassen
              </li>
              <li><strong>Nicht speichern:</strong> Änderungen verwerfen und Seite verlassen</li>
              <li><strong>Bleiben:</strong> Auf der aktuellen Seite bleiben</li>
            </ul>

            @if (leaveWithChangesDialogError) {
              <div class="alert alert-error" style="margin-bottom: 14px;">
                {{ leaveWithChangesDialogError }}
              </div>
            }

            <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
              <button
                class="btn btn-outline"
                [disabled]="leaveWithChangesDialogState !== 'idle'"
                (click)="stayOnPage()"
              >
                Bleiben
              </button>
              <button
                class="btn btn-danger"
                [disabled]="leaveWithChangesDialogState !== 'idle'"
                (click)="discardAndLeave()"
              >
                Nicht speichern
              </button>
              <button
                class="btn btn-primary"
                [disabled]="leaveWithChangesDialogState !== 'idle'"
                (click)="saveAndLeave()"
              >
                Speichern & Weiter
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <app-split-pane [initialLeftPercent]="45" [minLeftPx]="350" [minRightPx]="400">
      <!-- LEFT: Table -->
      <div left class="table-panel">
        <div class="table-toolbar">
          <input
            #globalFilterInput
            class="filter-input"
            [(ngModel)]="filterText"
            placeholder="🔍 Items filtern..."
            (input)="applyFilter()"
          />
          @if (excludedItemsCount > 0 || showExcludedItems) {
            <div class="table-toolbar-actions">
              <button
                class="btn btn-outline btn-sm"
                type="button"
                (click)="toggleShowExcludedItems()"
                [class.btn-primary]="showExcludedItems"
              >
                {{
                  showExcludedItems
                    ? 'Ausgeschlossene ausblenden'
                    : 'Ausgeschlossene anzeigen (' + excludedItemsCount + ')'
                }}
              </button>
            </div>
          }
          <div class="help-text">
            Tastatur: <kbd>/</kbd> Filter, <kbd>↑</kbd>/<kbd>↓</kbd> Auswahl,
            <kbd>Pos1</kbd>/<kbd>Ende</kbd> Sprung, <kbd>Strg/Cmd + S</kbd> speichern
          </div>
        </div>

        <div
          #tableScroll
          class="table-scroll"
          tabindex="0"
          role="region"
          aria-label="Item-Liste"
          (keydown)="onTableKeydown($event)"
        >
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
                  <input
                    class="col-filter-input"
                    [(ngModel)]="columnFilters['itemId']"
                    placeholder="🔍 ID..."
                    (input)="applyFilter()"
                  />
                </th>
                <th>
                  <input
                    class="col-filter-input"
                    [(ngModel)]="columnFilters['unitLabel']"
                    placeholder="🔍 Aufgabe..."
                    (input)="applyFilter()"
                  />
                </th>
                @if (hasEmpiricalDifficulty) {
                  <th>
                    <input
                      type="number"
                      class="col-filter-input"
                      [(ngModel)]="columnFilters['empiricalDifficulty']"
                      placeholder="🔍 Wert..."
                      (input)="applyFilter()"
                    />
                  </th>
                }
                @for (col of columns; track col.id) {
                  <th>
                    <input
                      class="col-filter-input"
                      [(ngModel)]="columnFilters[col.id]"
                      [placeholder]="'🔍 ' + col.label + '...'"
                      (input)="applyFilter()"
                    />
                  </th>
                }
                @if (enableTags) {
                  <th>
                    <input
                      class="col-filter-input"
                      [(ngModel)]="columnFilters['tags']"
                      placeholder="🔍 Tags..."
                      (input)="applyFilter()"
                    />
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of filteredItems; track item.unitId + '_' + item.itemId; let i = $index) {
                <tr
                  [id]="getItemRowId(item)"
                  [class.active]="selectedItem?.uuid === item.uuid"
                  [class.excluded]="isItemExcluded(item)"
                  [class.no-preview]="!canPreviewItem(item)"
                  [attr.aria-selected]="selectedItem?.uuid === item.uuid"
                  (click)="selectItem(item, i)"
                >
                  <td class="sticky-col">
                    <div class="item-id-cell">
                      <code
                        ><span class="unit-id">{{ item.unitId }}</span
                        ><span class="item-id">{{ item.itemId }}</span></code
                      >
                      @if (isItemExcluded(item)) {
                        <span class="excluded-item-badge">Ausgeschlossen</span>
                      }
                      @if (showPlayerTargetInfo) {
                        @if (getPlayerTarget(item)) {
                          <span class="player-target-badge">Player {{ getPlayerTarget(item) }}</span>
                        } @else {
                          <span class="player-target-badge unmapped">Kein Player-Ziel</span>
                        }
                      }
                    </div>
                  </td>
                  <td>{{ item.unitLabel }}</td>
                  @if (hasEmpiricalDifficulty) {
                    <td>
                      {{
                        item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null
                          ? item.empiricalDifficulty
                          : '–'
                      }}
                    </td>
                  }
                  @for (col of columns; track col.id) {
                    <td class="meta-cell">{{ item.metadata[col.id] || '–' }}</td>
                  }
                  @if (enableTags) {
                    <td class="tags-cell" (click)="$event.stopPropagation()">
                      @for (
                        tag of itemTags[item.uuid || item.unitId + '_' + item.itemId] || [];
                        track tag
                      ) {
                        <span
                          class="badge badge-info tag-badge"
                          (click)="removeItemTag(item.uuid, tag)"
                          >{{ tag }}
                          @if (canEditExplorer) {
                            ✕
                          }
                        </span>
                      }
                      @if (canEditExplorer) {
                        <div class="tag-add-container">
                          @if (availableTags.length > 0) {
                            <select class="tag-select" (change)="addItemTag(item.uuid, $event)">
                              <option value="">+Tag</option>
                              @for (tag of availableTags; track tag) {
                                <option [value]="tag">{{ tag }}</option>
                              }
                            </select>
                          }
                          <input
                            type="text"
                            class="tag-input-inline"
                            placeholder="Neu..."
                            (keydown.enter)="addCustomTag(item.uuid, $event)"
                            (blur)="addCustomTag(item.uuid, $event)"
                          />
                        </div>
                      }
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
          @if (canEditExplorer) {
            <div
              class="preview-target-info card"
              [class.unavailable]="!canPreviewSelectedItem || !!previewUnavailableReason"
            >
              <div class="preview-target-header">
                <strong>Explorer-Item</strong>
                <code>{{ selectedItem.unitId }}{{ selectedItem.itemId }}</code>
                @if (isItemExcluded(selectedItem)) {
                  <span class="excluded-item-badge">Ausgeschlossen</span>
                }
                @if (selectedItemTarget && selectedItemTarget !== selectedPreviewTarget) {
                  <span class="player-target-badge secondary">
                    Kodierschema {{ selectedItemTarget }}
                  </span>
                }
                @if (selectedPreviewTarget) {
                  <span class="player-target-badge">Player {{ selectedPreviewTarget }}</span>
                } @else {
                  <span class="player-target-badge unmapped">Kein Player-Ziel</span>
                }
              </div>
              @if (showPlayerTargetInfo) {
                @if (hasStoredPreviewTargetOverride && selectedItemTarget && selectedPreviewTarget) {
                  <p>
                    Das Item referenziert standardmäßig
                    <code>{{ selectedItemTarget }}</code
                    >. Für die Vorschau wird aktuell manuell
                    <code>{{ selectedPreviewTarget }}</code> verwendet.
                  </p>
                } @else if (selectedItemUsesDerivedTarget && selectedItemTarget && selectedPreviewTarget) {
                  <p>
                    Das Item referenziert im Kodierschema die abhängige Variable
                    <code>{{ selectedItemTarget }}</code
                    >. Für die Vorschau wird standardmäßig zur Basisvariable
                    <code>{{ selectedPreviewTarget }}</code> gesprungen.
                  </p>
                } @else if (selectedPreviewTarget && !previewUnavailableReason) {
                  <p>
                    Der Listeneintrag springt im Player zur Variable
                    <code>{{ selectedPreviewTarget }}</code
                    >.
                  </p>
                } @else if (selectedPreviewTarget) {
                  <p>
                    Für diesen Listeneintrag ist die Player-Variable
                    <code>{{ selectedPreviewTarget }}</code> hinterlegt, konnte aber nicht
                    zuverlässig in der Unit-Definition aufgelöst werden.
                  </p>
                } @else {
                  <p>
                    Für diesen Listeneintrag ist keine Player-Variable hinterlegt. Sie können unten
                    ein alternatives Sprungziel auswählen oder manuell eintragen.
                  </p>
                }
              }

              <div class="preview-target-controls">
                @if (showPreviewTargetSelector) {
                  <div class="preview-target-selector">
                    <label for="item-explorer-preview-target-select">Sprungziel aus Kodierschema</label>
                    <select
                      id="item-explorer-preview-target-select"
                      class="preview-target-select"
                      [(ngModel)]="selectedPreviewTargetId"
                      (ngModelChange)="onPreviewTargetSelectionChange()"
                    >
                      <option value="">{{ previewTargetDefaultOptionLabel }}</option>
                      @for (option of previewTargetOptions; track option.id) {
                        <option [value]="option.id">{{ option.label }}</option>
                      }
                    </select>
                    <small>
                      {{ previewTargetOptions.length }} bekannte Variablen aus dem Kodierschema
                      verfügbar.
                    </small>
                  </div>
                }

                <div class="preview-target-selector">
                  <label for="item-explorer-custom-preview-target">Manuelles Sprungziel</label>
                  <div class="preview-target-custom-row">
                    <input
                      id="item-explorer-custom-preview-target"
                      type="text"
                      class="preview-target-input"
                      placeholder="z.B. VAR_12 oder alias_12"
                      [(ngModel)]="customPreviewTargetDraft"
                      (keydown.enter)="applyCustomPreviewTarget()"
                    />
                    <button class="btn btn-outline btn-sm" (click)="applyCustomPreviewTarget()">
                      Übernehmen
                    </button>
                  </div>
                  <small>
                    Für VOUD-IDs oder Aliasse, die nicht im Kodierschema angeboten werden.
                  </small>
                </div>

                <div class="preview-target-actions">
                  <button
                    class="btn btn-outline btn-sm"
                    [disabled]="!hasStoredPreviewTargetOverride"
                    (click)="resetPreviewTargetSelection()"
                  >
                    Standardziel verwenden
                  </button>
                  @if (hasStoredPreviewTargetOverride && selectedPreviewTarget) {
                    <small>
                      Manueller Override aktiv:
                      <code>{{ selectedPreviewTarget }}</code>
                    </small>
                  }
                </div>
              </div>

              @if (previewUnavailableReason && showPlayerTargetInfo) {
                <p class="preview-warning">{{ previewUnavailableMessage }}</p>
              }
            </div>
          }

          <!-- Player -->
          <div
            class="player-container card"
            [class.view-all-mode]="pagingMode === 'view-all' || pagingMode === 'print-ids'"
          >
            @if (previewUnavailableReason) {
              <div class="empty-state">
                <div style="font-size:2.5rem;margin-bottom:12px">🧭</div>
                <h3>Keine zielgenaue Player-Vorschau</h3>
                <p>{{ previewUnavailableMessage }}</p>
              </div>
            } @else if (playerSrcDoc) {
              <iframe
                #playerFrame
                [srcdoc]="playerSrcDoc"
                class="player-iframe"
                [class.view-all-mode]="pagingMode === 'view-all' || pagingMode === 'print-ids'"
                [style.height]="playerHeight"
                sandbox="allow-scripts allow-same-origin allow-downloads"
                (load)="onPlayerLoaded()"
              >
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
            <button
              class="btn btn-outline"
              [disabled]="selectedIndex <= 0"
              (click)="navigateItem(-1)"
            >
              ← Vorheriges Item
            </button>
            <span class="item-nav-info"
              >Item {{ selectedIndex + 1 }} von {{ filteredItems.length }}</span
            >
            <button
              class="btn btn-outline"
              [disabled]="selectedIndex >= filteredItems.length - 1"
              (click)="navigateItem(1)"
            >
              Nächstes Item →
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <select
              class="btn btn-outline btn-sm"
              [(ngModel)]="pagingMode"
              (change)="onPagingModeChange()"
              [disabled]="!canPreviewSelectedItem"
            >
              <option value="buttons">Paging: Buttons</option>
              <option value="separate">Paging: Separate</option>
              <option value="concat-scroll">Paging: Scroll</option>
              <option value="concat-scroll-snap">Paging: Scroll-Snap</option>
              <option value="view-all">Paging: Alles (Print)</option>
              <option value="print-ids">Paging: Alles + IDs (Print)</option>
            </select>
            <button class="btn btn-outline btn-sm" (click)="openCodingOverlay()">
              📋 Kodierung
            </button>
            <button
              class="btn btn-outline btn-sm"
              (click)="showMetadataDrawer = !showMetadataDrawer"
              [class.btn-primary]="showMetadataDrawer"
            >
              📄 Metadaten
            </button>
            @if (canEditExplorer) {
              <button
                class="btn btn-outline btn-sm"
                (click)="toggleSelectedItemExclusion()"
                [class.btn-primary]="isItemExcluded(selectedItem)"
                [title]="
                  isItemExcluded(selectedItem)
                    ? 'Hebt den Ausschluss auf und zeigt das Item wieder standardmäßig an.'
                    : 'Schließt das Item aus und blendet es standardmäßig aus.'
                "
              >
                {{ isItemExcluded(selectedItem) ? '↩️ Ausschluss aufheben' : '🚫 Item ausschließen' }}
              </button>
              <button
                class="btn btn-outline btn-sm"
                (click)="saveCurrentResponseState()"
                title="Aktuellen Zustand speichern"
              >
                💾 Zustand speichern
              </button>
              <button
                class="btn btn-outline btn-sm"
                (click)="resetResponseState()"
                title="Zustand zurücksetzen"
                style="color: #e74c3c; border-color: rgba(231, 76, 60, 0.4);"
              >
                🗑️ Zustand löschen
              </button>
              <button
                class="btn btn-outline btn-sm"
                (click)="loadAllResponseStates()"
                title="Alle gespeicherten Daten anzeigen"
              >
                👁️ Rohdaten
              </button>
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
      <div class="overlay-backdrop" (click)="closeCodingOverlay()">
        <div class="overlay-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <h2>Kodierung – {{ selectedItem?.unitLabel }}</h2>
            <button class="btn btn-sm btn-outline" (click)="closeCodingOverlay()">
              ✕ Schließen
            </button>
          </div>
          <div class="overlay-content">
            @if (currentCodingSchemeAsText) {
              <div class="coding-toolbar">
                <div class="search-container">
                  <input
                    class="filter-input"
                    [(ngModel)]="codingSearchText"
                    placeholder="🔍 Variablen suchen (ID oder Label)..."
                  />
                </div>
                <div class="sort-actions">
                  <button
                    class="btn btn-outline btn-sm"
                    (click)="toggleCodingSort('id')"
                    title="Nach ID sortieren"
                  >
                    ID {{ getCodingSortIndicator('id') }}
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    (click)="toggleCodingSort('label')"
                    title="Nach Label sortieren"
                  >
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
                        <div
                          class="html-content"
                          [innerHTML]="
                            sanitizer.bypassSecurityTrustHtml($any(coding).manualInstructionText)
                          "
                        ></div>
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
                              <span class="manual-icon" title="Manuelle Prüfung erforderlich"
                                >📝</span
                              >
                            }
                          </div>
                          @if ($any(code).manualInstructionText) {
                            <div class="code-manual-instruction">
                              <strong>Instruktion:</strong>
                              <div
                                class="html-content"
                                [innerHTML]="
                                  sanitizer.bypassSecurityTrustHtml(
                                    $any(code).manualInstructionText
                                  )
                                "
                              ></div>
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
    <div
      class="drawer-backdrop"
      [class.open]="showMetadataDrawer"
      (click)="showMetadataDrawer = false"
    >
      <div
        class="drawer-container"
        [class.open]="showMetadataDrawer"
        (click)="$event.stopPropagation()"
      >
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
                  <div class="meta-value">
                    {{
                      extractValueText(entry.valueAsText) || extractValueText(entry.value) || '–'
                    }}
                  </div>
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
            <button
              class="btn btn-sm btn-outline"
              (click)="showUploadReport = false; reloadItems()"
            >
              ✕ Schließen
            </button>
          </div>
          <div class="overlay-content">
            <p>
              <strong>Zusammenfassung:</strong> {{ uploadResult?.updated }} erfolgreich
              aktualisiert, {{ uploadResult?.failed?.length || 0 }} fehlgeschlagen.
            </p>

            @if (uploadResult?.successes?.length) {
              <div style="margin-top: 16px;">
                <h3 style="color: #27ae60;">
                  Erfolgreich aktualisiert ({{ uploadResult!.successes.length }})
                </h3>
                <div
                  style="margin: 8px 0; max-height: 350px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 4px;"
                >
                  <table class="table" style="width: 100%; border-collapse: collapse;">
                    <thead
                      style="position: sticky; top: 0; background: var(--color-surface); z-index: 1;"
                    >
                      <tr>
                        <th
                          style="text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border);"
                        >
                          Aufgabe
                        </th>
                        <th
                          style="text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border);"
                        >
                          Item-ID
                        </th>
                        <th
                          style="text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--color-border);"
                        >
                          Wert (est)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (success of uploadResult!.successes; track $index) {
                        <tr>
                          <td
                            style="padding: 4px 8px; border-bottom: 1px dotted var(--color-border);"
                          >
                            <code>{{ success.unitId }}</code>
                          </td>
                          <td
                            style="padding: 4px 8px; border-bottom: 1px dotted var(--color-border);"
                          >
                            <code>{{ success.itemId }}</code>
                          </td>
                          <td
                            style="text-align: right; padding: 4px 8px; border-bottom: 1px dotted var(--color-border);"
                          >
                            {{ success.value }}
                          </td>
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
                <div
                  style="margin: 8px 0; max-height: 250px; overflow-y: auto; background: rgba(231, 76, 60, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(231, 76, 60, 0.2);"
                >
                  <ul
                    style="margin: 0; padding-left: 20px; color: var(--color-text); font-size: 0.9rem;"
                  >
                    @for (fail of uploadResult!.failed; track $index) {
                      <li>
                        <code>{{ fail.csvRow }}</code
                        >: {{ fail.reason }}
                      </li>
                    }
                  </ul>
                </div>
                <p class="help-text" style="font-size: 0.8rem; margin-top: 8px;">
                  Überprüfe diese Einträge in der CSV-Datei (Spalte "item" muss mit Item-ID oder
                  Unit-Item Kombi übereinstimmen).
                </p>
              </div>
            } @else if (uploadResult?.successes?.length) {
              <p style="color: #27ae60; margin-top: 16px; font-weight: bold;">
                🎉 Alle Items aus der CSV konnten erfolgreich zugeordnet werden!
              </p>
            }
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Error Dialog -->
    @if (showErrorDialog) {
      <div class="overlay-backdrop" (click)="showErrorDialog = false">
        <div
          class="overlay-dialog"
          style="max-width: 500px; border-top: 4px solid #e74c3c;"
          (click)="$event.stopPropagation()"
        >
          <div class="overlay-header">
            <h2 style="color: #e74c3c; display: flex; align-items: center; gap: 8px;">
              <span>⚠️</span> Upload-Fehler
            </h2>
            <button class="btn btn-sm btn-outline" (click)="showErrorDialog = false">✕</button>
          </div>
          <div class="overlay-content" style="text-align: center; padding: 24px 16px;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🚫</div>
            <p style="font-size: 1.1rem; line-height: 1.5; color: var(--color-text);">
              {{ errorMessage }}
            </p>
            <div style="margin-top: 24px;">
              <button class="btn btn-primary" (click)="showErrorDialog = false">Verstanden</button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Column Manager -->
    @if (showColumnManager) {
      <div class="overlay-backdrop" (click)="closeColumnManager()">
        <div class="overlay-dialog column-manager-dialog" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">👁️</span>
              <div>
                <h2>Spalten verwalten</h2>
                <small>Wählen Sie die Metadaten-Spalten für die Tabelle aus</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="closeColumnManager()">✕</button>
          </div>
          <div class="overlay-content">
            <div class="column-manager-toolbar">
              <div class="search-container">
                <input
                  class="filter-input"
                  [(ngModel)]="columnFilterText"
                  placeholder="🔍 Spalten suchen (Label oder ID)..."
                />
              </div>
              <button
                class="btn btn-outline btn-sm"
                (click)="resetToDefault()"
                [disabled]="!metadataSettings.visible.length"
              >
                🔄 Standard
              </button>
            </div>

            <div class="column-grid">
              @for (col of filteredAllColumns; track col.id) {
                <div
                  class="column-tile"
                  [class.active]="metadataSettings.visible.includes(col.id)"
                  (click)="toggleColumnVisibility(col)"
                >
                  <div class="tile-check">
                    <input
                      type="checkbox"
                      [checked]="metadataSettings.visible.includes(col.id)"
                      (click)="$event.stopPropagation()"
                      (change)="toggleColumnVisibility(col)"
                    />
                  </div>
                  <div class="tile-body">
                    <span class="tile-label">{{ col.label }}</span>
                    <span class="tile-id">ID: {{ col.id }}</span>
                  </div>
                  @if (metadataSettings.visible.includes(col.id)) {
                    <div class="tile-actions" (click)="$event.stopPropagation()">
                      <button
                        class="btn btn-xs btn-outline"
                        (click)="moveColumnUp(col)"
                        [disabled]="metadataSettings.order[0] === col.id"
                        title="Nach oben"
                      >
                        ↑
                      </button>
                      <button
                        class="btn btn-xs btn-outline"
                        (click)="moveColumnDown(col)"
                        [disabled]="
                          metadataSettings.order[metadataSettings.order.length - 1] === col.id
                        "
                        title="Nach unten"
                      >
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
                <button class="btn btn-outline" (click)="closeColumnManager()">
                  Abbrechen
                </button>
                <button class="btn btn-primary" (click)="saveMetadataSettings()">
                  💾 Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Save Response State Confirmation -->
    @if (showSaveConfirmDialog) {
      <div
        class="overlay-backdrop"
        (click)="!confirmDialogState && closeSaveConfirmDialog()"
      >
        <div class="overlay-dialog" style="max-width: 450px;" (click)="$event.stopPropagation()">
          <div
            class="overlay-header"
            [style.border-top]="
              confirmDialogState === 'saving' ? '4px solid #3498db' : '4px solid #27ae60'
            "
          >
            @if (confirmDialogState === 'saving') {
              <h2 style="color: #3498db; display: flex; align-items: center; gap: 8px;">
                <span class="spinner-inline"></span> Speichern...
              </h2>
            } @else {
              <h2 style="color: #27ae60; display: flex; align-items: center; gap: 8px;">
                <span>💾</span> Zustand speichern
              </h2>
            }
            <button
              class="btn btn-sm btn-outline"
              [disabled]="confirmDialogState === 'saving'"
              (click)="closeSaveConfirmDialog()"
            >
              ✕
            </button>
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
              <p
                style="color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 24px;"
              >
                Item: <code>{{ selectedItem?.unitId }}{{ selectedItem?.itemId }}</code>
              </p>
            }
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button
                class="btn btn-outline"
                [disabled]="confirmDialogState === 'saving'"
                (click)="closeSaveConfirmDialog()"
              >
                Abbrechen
              </button>
              <button
                class="btn btn-primary"
                [disabled]="confirmDialogState === 'saving'"
                (click)="confirmSaveResponseState()"
              >
                💾 Speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Delete Response State Confirmation -->
    @if (showDeleteConfirmDialog) {
      <div
        class="overlay-backdrop"
        (click)="!confirmDialogState && closeDeleteConfirmDialog()"
      >
        <div class="overlay-dialog" style="max-width: 450px;" (click)="$event.stopPropagation()">
          <div
            class="overlay-header"
            [style.border-top]="
              confirmDialogState === 'deleting' ? '4px solid #3498db' : '4px solid #e74c3c'
            "
          >
            @if (confirmDialogState === 'deleting') {
              <h2 style="color: #3498db; display: flex; align-items: center; gap: 8px;">
                <span class="spinner-inline"></span> Löschen...
              </h2>
            } @else {
              <h2 style="color: #e74c3c; display: flex; align-items: center; gap: 8px;">
                <span>🗑️</span> Zustand löschen
              </h2>
            }
            <button
              class="btn btn-sm btn-outline"
              [disabled]="confirmDialogState === 'deleting'"
              (click)="closeDeleteConfirmDialog()"
            >
              ✕
            </button>
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
              <p
                style="color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 24px;"
              >
                Item: <code>{{ selectedItem?.unitId }}{{ selectedItem?.itemId }}</code>
              </p>
              <p
                style="color: #e74c3c; font-size: 0.85rem; margin-bottom: 24px; background: rgba(231, 76, 60, 0.05); padding: 8px 12px; border-radius: 4px;"
              >
                ⚠️ Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            }
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button
                class="btn btn-outline"
                [disabled]="confirmDialogState === 'deleting'"
                (click)="closeDeleteConfirmDialog()"
              >
                Abbrechen
              </button>
              <button
                class="btn btn-danger"
                [disabled]="confirmDialogState === 'deleting'"
                (click)="confirmDeleteResponseState()"
                style="background: #e74c3c; color: white; border-color: #e74c3c;"
              >
                🗑️ Löschen
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Raw Response State Data -->
    @if (showRawDataOverlay) {
      <div class="overlay-backdrop" (click)="closeRawDataOverlay()">
        <div class="overlay-dialog" style="max-width: 900px;" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">📊</span>
              <div>
                <h2>Gespeicherte Zustände</h2>
                <small>Alle gespeicherten Response States</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="closeRawDataOverlay()">✕</button>
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
                      <span class="date">{{ state.updatedAt | date: 'short' }}</span>
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

    <!-- OVERLAY: Explorer Change History -->
    @if (showHistoryOverlay) {
      <div class="overlay-backdrop" (click)="closeHistoryOverlay()">
        <div class="overlay-dialog" style="max-width: 980px;" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">🕒</span>
              <div>
                <h2>Änderungsverlauf</h2>
                <small>Wer hat wann was geändert</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="closeHistoryOverlay()">✕</button>
          </div>
          <div class="overlay-content">
            <div class="column-manager-toolbar">
              <input
                class="filter-input"
                [(ngModel)]="historyFilterUser"
                placeholder="Nach Nutzer filtern..."
              />
              <input
                class="filter-input"
                [(ngModel)]="historyFilterType"
                placeholder="Nach Aktion filtern..."
              />
              <input
                class="filter-input"
                type="date"
                [(ngModel)]="historyFilterFrom"
                title="Von Datum"
              />
              <input
                class="filter-input"
                type="date"
                [(ngModel)]="historyFilterTo"
                title="Bis Datum"
              />
              <button class="btn btn-outline btn-sm" (click)="showHistory()">Aktualisieren</button>
              <button
                class="btn btn-outline btn-sm"
                [disabled]="filteredHistoryEntries.length === 0"
                (click)="exportHistoryCsv()"
              >
                Export CSV
              </button>
            </div>
            @if (historyLoading) {
              <div class="empty-state">
                <div class="spinner"></div>
                <p>Verlauf wird geladen...</p>
              </div>
            } @else if (historyError) {
              <div class="empty-state">
                <p>{{ historyError }}</p>
              </div>
            } @else if (filteredHistoryEntries.length === 0) {
              <div class="empty-state">
                <p>Keine Änderungen gefunden.</p>
              </div>
            } @else {
              <div class="state-list">
                @for (entry of filteredHistoryEntries; track entry.id) {
                  <div class="state-item">
                    <div class="state-header">
                      <strong>{{ entry.changeType }}</strong>
                      <span class="unit-badge">{{ entry.actorRole || 'unbekannt' }}</span>
                      <span>{{ entry.actorUsername || 'unbekannt' }}</span>
                      <span class="date">{{ entry.createdAt | date: 'short' }}</span>
                    </div>
                    <pre class="json-view">{{ entry.diff | json }}</pre>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    <!-- OVERLAY: Save Draft Preview -->
    @if (showSavePreviewDialog) {
      <div class="overlay-backdrop" (click)="cancelSavePreviewDialog()">
        <div class="overlay-dialog" style="max-width: 700px;" (click)="$event.stopPropagation()">
          <div class="overlay-header">
            <div class="drawer-title">
              <span class="drawer-icon" style="background:var(--color-primary)">📝</span>
              <div>
                <h2>Änderungsübersicht vor Speichern</h2>
                <small>Diese Änderungen werden veröffentlicht</small>
              </div>
            </div>
            <button class="btn btn-sm btn-outline" (click)="cancelSavePreviewDialog()">✕</button>
          </div>
          <div class="overlay-content">
            @if (draftPreviewSummary.length === 0) {
              <div class="empty-state">
                <p>Keine Unterschiede zum veröffentlichten Stand gefunden.</p>
              </div>
            } @else {
              <div class="state-list">
                @for (entry of draftPreviewSummary; track entry.label) {
                  <div class="state-item">
                    <div class="state-header">
                      <strong>{{ entry.label }}</strong>
                    </div>
                    <p>{{ entry.detail }}</p>
                  </div>
                }
              </div>
            }
            <div class="column-manager-footer" style="margin-top: 20px;">
              <span class="selection-info"
                >Draft v{{ explorerVersion }} → Publish v{{ explorerPublishedVersion + 1 }}</span
              >
              <div class="footer-actions">
                <button class="btn btn-outline" (click)="cancelSavePreviewDialog()">
                  Abbrechen
                </button>
                <button class="btn btn-primary" (click)="confirmSaveExplorerDraft()">
                  Veröffentlichen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .explorer-header h1 {
        margin-bottom: 0;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .item-count {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
      }
      .explorer-status-bar {
        margin-bottom: 12px;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .status-main {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.85rem;
      }
      .status-meta {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
      }
      .status-pill {
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid transparent;
      }
      .status-clean {
        color: #1e8449;
        background: rgba(39, 174, 96, 0.12);
        border-color: rgba(39, 174, 96, 0.4);
      }
      .status-saved {
        color: #117a65;
        background: rgba(26, 188, 156, 0.18);
        border-color: rgba(26, 188, 156, 0.45);
      }
      .status-dirty {
        color: #b9770e;
        background: rgba(241, 196, 15, 0.2);
        border-color: rgba(241, 196, 15, 0.5);
      }
      .status-saving {
        color: #1f618d;
        background: rgba(52, 152, 219, 0.2);
        border-color: rgba(52, 152, 219, 0.5);
      }
      .status-error {
        color: #922b21;
        background: rgba(231, 76, 60, 0.18);
        border-color: rgba(231, 76, 60, 0.45);
      }
      .status-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Table panel */
      .table-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .table-toolbar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        flex-shrink: 0;
      }
      .table-toolbar-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .filter-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.9rem;
        font-family: inherit;
      }
      .filter-input:focus {
        outline: none;
        border-color: var(--color-primary-light);
        box-shadow: 0 0 0 3px rgba(41, 128, 185, 0.15);
      }
      .table-scroll {
        flex: 1;
        overflow: auto;
        background: var(--color-surface);
        border-radius: 0 0 var(--radius) var(--radius);
        box-shadow: var(--shadow);
        /* Fix corner and layout shift */
        scrollbar-gutter: stable;
        position: relative;
      }
      .table-scroll:focus {
        outline: none;
        box-shadow:
          var(--shadow),
          inset 0 0 0 2px rgba(41, 128, 185, 0.35);
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
      .explorer-table th,
      .explorer-table td {
        padding: 10px 16px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      .explorer-table th {
        position: sticky;
        top: 0;
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
        box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
      }
      th.sticky-col {
        background-color: var(--color-bg) !important;
        z-index: 200; /* Highest priority */
      }
      tr.active .sticky-col {
        background: rgba(41, 128, 185, 0.1);
      }
      .meta-cell {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }
      .sortable {
        cursor: pointer;
        user-select: none;
      }
      .sortable:hover {
        color: var(--color-primary-light);
      }
      tr.active td {
        background: rgba(41, 128, 185, 0.1) !important;
        border-left: 3px solid var(--color-primary-light);
      }
      tr:not(.active) {
        cursor: pointer;
      }

      /* Filter row */
      .filter-row th {
        padding: 4px 10px;
        background-color: var(--color-bg) !important;
        border-bottom: 2px solid var(--color-border);
        position: sticky;
        top: 44px; /* Matches the header height */
        z-index: 100;
      }
      .filter-row th.sticky-col {
        z-index: 200;
      }
      .col-filter-input {
        width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.75rem;
        font-family: inherit;
      }
      .col-filter-input:focus {
        outline: none;
        border-color: var(--color-primary-light);
        box-shadow: 0 0 0 2px rgba(41, 128, 185, 0.1);
      }

      /* Tags */
      .tags-cell {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
      }
      .tag-badge {
        cursor: pointer;
        font-size: 0.7rem;
      }
      .tag-badge:hover {
        opacity: 0.7;
      }
      .tag-select {
        padding: 2px 4px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.75rem;
        background: white;
        max-width: 80px;
      }
      .tag-add-container {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .tag-input-inline {
        width: 60px;
        padding: 2px 6px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.75rem;
        transition: width 0.2s;
      }
      .tag-input-inline:focus {
        width: 100px;
        outline: none;
        border-color: var(--color-primary-light);
      }

      /* Combined ID styling */
      .unit-id {
        color: var(--color-text-secondary);
      }
      .item-id {
        color: var(--color-text);
        font-weight: 600;
      }
      .item-id-cell {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .player-target-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(52, 152, 219, 0.12);
        color: #1f618d;
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1.2;
      }
      .player-target-badge.unmapped {
        background: rgba(243, 156, 18, 0.14);
        color: #9c640c;
      }
      .player-target-badge.secondary {
        background: rgba(127, 140, 141, 0.16);
        color: #566573;
      }
      .excluded-item-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(231, 76, 60, 0.12);
        color: #a93226;
        font-size: 0.72rem;
        font-weight: 600;
        line-height: 1.2;
      }
      .explorer-table tbody tr.no-preview td {
        background: rgba(243, 156, 18, 0.05);
      }
      .explorer-table tbody tr.excluded:not(.active) td {
        background: rgba(231, 76, 60, 0.04);
      }

      /* Preview panel */
      .preview-panel {
        height: 100%;
        overflow-y: auto;
        padding: 0 16px;
        display: flex;
        flex-direction: column;
      }
      .preview-target-info {
        margin-bottom: 12px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .preview-target-info.unavailable {
        border-left: 4px solid #f39c12;
        background: rgba(243, 156, 18, 0.05);
      }
      .preview-target-info p {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
      }
      .preview-target-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .preview-warning {
        color: #9c640c;
        font-weight: 500;
      }
      .preview-target-selector {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .preview-target-controls {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .preview-target-selector label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-text-secondary);
      }
      .preview-target-selector small {
        color: var(--color-text-secondary);
        font-size: 0.78rem;
      }
      .preview-target-select {
        width: 100%;
        max-width: 360px;
        padding: 8px 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.9rem;
        font-family: inherit;
        background: var(--color-surface);
      }
      .preview-target-select:focus {
        outline: none;
        border-color: var(--color-primary-light);
        box-shadow: 0 0 0 3px rgba(41, 128, 185, 0.12);
      }
      .preview-target-custom-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .preview-target-input {
        width: 100%;
        max-width: 360px;
        padding: 8px 12px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.9rem;
        font-family: inherit;
        background: var(--color-surface);
      }
      .preview-target-input:focus {
        outline: none;
        border-color: var(--color-primary-light);
        box-shadow: 0 0 0 3px rgba(41, 128, 185, 0.12);
      }
      .preview-target-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .preview-target-actions small {
        color: var(--color-text-secondary);
        font-size: 0.78rem;
      }
      .player-container {
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 500px;
        transition: height 0.2s;
      }
      /* In view-all mode, we want the container to follow the iframe's height and not CLIP it */
      .player-container.view-all-mode {
        display: block;
        overflow: visible;
        flex: none;
        height: auto;
        min-height: 1000px;
      }
      .player-iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      }
      .player-iframe.view-all-mode {
        min-height: 1000px;
        height: auto;
      }

      /* Navigations */
      .item-nav {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
      }
      .item-nav-info {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--color-text-secondary);
      }

      .action-buttons {
        display: flex;
        gap: 8px;
        padding: 10px 0;
        justify-content: center;
      }

      .preview-empty {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      /* Spinner */
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary-light);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 12px;
      }
      .spinner-inline {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--color-border);
        border-top-color: var(--color-primary-light);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

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
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
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
        background: rgba(0, 0, 0, 0.05);
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
        background: rgba(41, 128, 185, 0.03);
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
      .html-content ul,
      .html-content ol {
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
        content: '•';
        position: absolute;
        left: 0;
        color: var(--color-primary-light);
      }

      /* Combined ID styling */
      .overlay-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.15s ease;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .overlay-dialog {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        width: 90vw;
        max-width: 800px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.2s ease;
      }
      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      /* Column Manager Premium */
      .column-manager-dialog {
        max-width: 650px;
      }
      .column-manager-toolbar {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 20px;
      }
      .column-manager-toolbar .search-container {
        flex: 1;
      }

      /* Coding Toolbar */
      .coding-toolbar {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 20px;
        padding: 0 4px;
      }
      .coding-toolbar .search-container {
        flex: 1;
      }
      .sort-actions {
        display: flex;
        gap: 8px;
      }

      .column-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 450px;
        overflow-y: auto;
        padding: 4px;
        scrollbar-gutter: stable;
      }
      .column-tile {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        background: var(--color-surface);
        border-radius: 12px;
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .column-tile:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        border-color: var(--color-primary-light);
      }
      .column-tile.active {
        background: rgba(26, 82, 118, 0.03);
        border-color: rgba(26, 82, 118, 0.3);
      }
      .tile-check {
        display: flex;
        align-items: center;
      }
      .tile-check input {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      .tile-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .tile-label {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--color-text);
      }
      .tile-id {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        opacity: 0.7;
      }
      .tile-actions {
        display: flex;
        gap: 4px;
      }
      .column-manager-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
      }
      .selection-info {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-weight: 500;
      }
      .footer-actions {
        display: flex;
        gap: 12px;
      }

      /* Metadata Summary Card */
      .unit-metadata-card {
        margin-top: 16px;
        padding: 16px;
        background: rgba(26, 82, 118, 0.03);
        border: 1px solid rgba(26, 82, 118, 0.1);
      }
      .unit-metadata-card .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .unit-metadata-card h4 {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-primary);
      }
      .meta-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .meta-summary-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .meta-summary-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }
      .meta-summary-value {
        font-size: 0.85rem;
        font-weight: 600;
      }

      /* Metadata Drawer */
      .drawer-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 1100;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        backdrop-filter: blur(4px);
      }
      .drawer-backdrop.open {
        opacity: 1;
        visibility: visible;
      }
      .drawer-container {
        position: absolute;
        top: 0;
        right: -400px;
        width: 400px;
        height: 100%;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(20px) saturate(180%);
        box-shadow: -5px 0 25px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-left: 1px solid rgba(255, 255, 255, 0.3);
      }
      .drawer-container.open {
        right: 0;
      }
      .drawer-header {
        padding: 24px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .drawer-title {
        display: flex;
        gap: 16px;
        align-items: center;
      }
      .drawer-title h3 {
        margin: 0;
        font-size: 1.25rem;
      }
      .drawer-title small {
        color: var(--color-text-secondary);
        display: block;
        margin-top: 2px;
      }
      .drawer-icon {
        width: 40px;
        height: 40px;
        background: var(--color-primary-light);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        color: white;
        font-size: 1.2rem;
      }
      .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        transition: color 0.2s;
      }
      .btn-close:hover {
        color: var(--color-danger);
      }
      .drawer-content {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }
      .meta-grid {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .meta-item {
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        padding-bottom: 12px;
      }
      .meta-item:last-child {
        border-bottom: none;
      }
      .meta-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .meta-value {
        font-size: 1rem;
        color: var(--color-text);
        font-weight: 500;
      }

      /* General Overlays */
      .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid var(--color-border);
      }
      .overlay-header h2 {
        margin-bottom: 0;
        font-size: 1.1rem;
      }
      .overlay-content {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }
      .json-view {
        background: var(--color-bg);
        padding: 16px;
        border-radius: var(--radius);
        font-size: 0.75rem;
        overflow: auto;
        max-height: 60vh;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .state-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .state-item {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 16px;
      }
      .state-header {
        display: flex;
        align-items: center;
        gap: 12px;
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
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 20px;
        font-size: 0.9rem;
      }
      .meta-dl dt {
        font-weight: 600;
        color: var(--color-text-secondary);
      }
      .meta-dl dd {
        margin: 0;
      }
      .help-text {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class ItemExplorerComponent implements OnInit, OnDestroy {
  private readonly previewTargetItemPropertyKey = 'previewTargetId';
  private readonly excludedItemPropertyKey = 'excluded';
  @ViewChild('globalFilterInput') globalFilterInput?: ElementRef<HTMLInputElement>;
  @ViewChild('tableScroll') tableScroll?: ElementRef<HTMLDivElement>;
  @ViewChild('playerFrame') playerFrame!: ElementRef<HTMLIFrameElement>;

  acpId = '';
  columns: MetadataColumn[] = [];
  items: ExplorerItem[] = [];
  filteredItems: ExplorerItem[] = [];
  hasEmpiricalDifficulty = false;
  filterText = '';
  sortField = DEFAULT_EXPLORER_SORT_FIELD;
  sortIsMeta = false;
  sortDir: 'asc' | 'desc' = DEFAULT_EXPLORER_SORT_DIR;
  breadcrumbs: BreadcrumbItem[] = [];
  columnFilters: Record<string, string> = {};
  showExcludedItems = false;

  // Selection
  selectedItem: ExplorerItem | null = null;
  selectedIndex = -1;
  loadingUnit = false;

  // Player
  unit: any = null;
  playerSrcDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  pagingMode:
    | 'buttons'
    | 'separate'
    | 'concat-scroll'
    | 'concat-scroll-snap'
    | 'view-all'
    | 'print-ids' = 'buttons';
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
  showAudioVideoCodingVariables = true;
  itemExplorerConditionalVisibilityEnabled = false;
  playerFocusHighlightEnabled = true;
  itemExplorerPlayerTargetInfoEnabled = true;
  showOnlyItemsWithEmpiricalDifficulty = false;
  itemTags: Record<string, string[]> = {};
  persistUserPreferences = false;
  useServerPreferences = false;

  private readonly draftPatchDebounceMs = 250;
  private draftPatchTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingDraftPatch: Record<string, unknown> | null = null;
  private pendingDraftChangeType = 'UI_UPDATE';
  private suppressDraftPatch = false;
  private saveStatusResetTimeout: ReturnType<typeof setTimeout> | null = null;
  private focusRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private legacyPageNavigationTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly legacyPageNavigationDelaysMs = [160, 520, 1100];
  private readonly listPageSize = 10;
  private definitionContent: string | null = null;
  private playerFrameReady = false;
  private responseStateReady = false;
  private unitLoadToken = 0;
  private startSessionCounter = 0;
  private overlayReturnFocus: HTMLElement | null = null;

  // File Upload
  showUploadReport = false;
  uploadResult: { updated: number; failed: any[]; successes: any[] } | null = null;
  isUploading = false;
  showErrorDialog = false;
  errorMessage = '';

  // Metadata column management
  isAcpManager = false;
  canEditExplorer = false;
  canPublishExplorer = false;
  showColumnManager = false;
  allColumns: MetadataColumn[] = [];
  metadataSettings: MetadataSettings = { visible: [], order: [] };
  columnFilterText = '';
  itemOrder: string[] = [];

  // Shared draft state
  explorerUiStatus: ExplorerUiStatus = 'CLEAN';
  explorerVersion = 1;
  explorerPublishedVersion = 1;
  lastExplorerChangeInfo = '';
  latestExplorerState: ItemExplorerStateEnvelope | null = null;

  // History
  showHistoryOverlay = false;
  historyLoading = false;
  historyError = '';
  historyEntries: ItemExplorerChangeLogEntry[] = [];
  historyFilterUser = '';
  historyFilterType = '';
  historyFilterFrom = '';
  historyFilterTo = '';

  // Save preview
  showSavePreviewDialog = false;
  draftPreviewSummary: Array<{ label: string; detail: string }> = [];
  lastDraftOperationError = '';

  // Draft / destructive dialogs
  showDiscardDraftDialog = false;
  discardDraftDialogBusy = false;
  discardDraftDialogError = '';
  showClearEmpiricalDifficultiesDialog = false;
  clearEmpiricalDifficultiesBusy = false;
  clearEmpiricalDifficultiesError = '';

  // Leave with pending changes dialog
  showLeaveWithChangesDialog = false;
  leaveWithChangesDialogState: 'idle' | 'saving' | 'discarding' = 'idle';
  leaveWithChangesDialogError = '';
  private leaveWithChangesResolver: ((value: boolean) => void) | null = null;

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
  previewUnavailableReason = '';
  selectedPreviewTargetId = '';
  customPreviewTargetDraft = '';
  private previewTargetResolution: PreviewTargetResolution = {
    itemTarget: '',
    isDerived: false,
    options: [],
    defaultTargetId: '',
  };

  // Response State Confirmation Dialogs
  showSaveConfirmDialog = false;
  showDeleteConfirmDialog = false;
  confirmDialogState: 'idle' | 'saving' | 'deleting' = 'idle';
  confirmDialogError = '';

  get filteredCodingSchemeAsText(): CodingAsText[] {
    if (!this.currentCodingSchemeAsText) return [];

    let list = [...this.currentCodingSchemeAsText];

    if (!this.showAudioVideoCodingVariables) {
      list = list.filter((c) => !this.isAudioVideoCodingVariable(c));
    }

    // Search
    if (this.codingSearchText) {
      const term = this.codingSearchText.toLowerCase();
      list = list.filter(
        (c) =>
          c.id.toLowerCase().includes(term) || (c.label && c.label.toLowerCase().includes(term)),
      );
    }

    // Sort
    return list.sort((a, b) => {
      const aVal = (this.codingSortField === 'id' ? a.id : a.label || a.id).toLowerCase();
      const bVal = (this.codingSortField === 'id' ? b.id : b.label || b.id).toLowerCase();

      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return this.codingSortDir === 'asc' ? cmp : -cmp;
    });
  }

  get excludedItemsCount(): number {
    return this.items.filter((item) => this.isItemExcluded(item)).length;
  }

  get selectedPreviewTarget(): string {
    const storedId = this.getStoredPreviewTargetId(this.selectedItem);
    if (storedId) {
      return storedId;
    }
    return this.previewTargetResolution.defaultTargetId || this.getPlayerTarget(this.selectedItem);
  }

  get selectedItemTarget(): string {
    return this.previewTargetResolution.itemTarget || this.getPlayerTarget(this.selectedItem);
  }

  get previewTargetOptions(): PreviewTargetOption[] {
    return this.previewTargetResolution.options;
  }

  get selectedItemUsesDerivedTarget(): boolean {
    return this.previewTargetResolution.isDerived;
  }

  get showPreviewTargetSelector(): boolean {
    return this.previewTargetOptions.length > 0;
  }

  get hasStoredPreviewTargetOverride(): boolean {
    return this.getStoredPreviewTargetId(this.selectedItem).length > 0;
  }

  get previewTargetDefaultOptionLabel(): string {
    if (this.previewTargetResolution.defaultTargetId) {
      return `Standardziel verwenden (${this.previewTargetResolution.defaultTargetId})`;
    }
    return 'Kein Standardziel hinterlegt';
  }

  get showPlayerTargetInfo(): boolean {
    return this.canEditExplorer && this.itemExplorerPlayerTargetInfoEnabled;
  }

  get canPreviewSelectedItem(): boolean {
    return this.canPreviewItem(this.selectedItem) && !this.previewUnavailableReason;
  }

  get previewUnavailableMessage(): string {
    if (!this.previewUnavailableReason) return '';
    if (this.showPlayerTargetInfo) return this.previewUnavailableReason;
    return 'Für dieses Item ist keine zielgenaue Player-Vorschau verfügbar.';
  }

  private isAudioVideoCodingVariable(coding: CodingAsText): boolean {
    const id = coding.id?.toLowerCase() || '';
    const label = coding.label?.toLowerCase() || '';
    return (
      id.includes('audio') ||
      id.includes('video') ||
      label.includes('audio') ||
      label.includes('video')
    );
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
      list = list.filter(
        (c) => c.label.toLowerCase().includes(term) || c.id.toLowerCase().includes(term),
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

  get explorerStatusLabel(): string {
    switch (this.explorerUiStatus) {
      case 'DIRTY':
        return 'Ungespeichert';
      case 'SAVING':
        return 'Speichern läuft';
      case 'SAVED':
        return 'Gespeichert';
      case 'ERROR':
        return 'Fehler';
      default:
        return 'Unverändert';
    }
  }

  get filteredHistoryEntries(): ItemExplorerChangeLogEntry[] {
    const userNeedle = this.historyFilterUser.trim().toLowerCase();
    const typeNeedle = this.historyFilterType.trim().toLowerCase();
    const fromDate = this.historyFilterFrom ? new Date(`${this.historyFilterFrom}T00:00:00`) : null;
    const toDate = this.historyFilterTo ? new Date(`${this.historyFilterTo}T23:59:59.999`) : null;
    return this.historyEntries.filter((entry) => {
      const user = (entry.actorUsername || '').toLowerCase();
      const type = (entry.changeType || '').toLowerCase();
      const matchesUser = !userNeedle || user.includes(userNeedle);
      const matchesType = !typeNeedle || type.includes(typeNeedle);
      const entryDate = new Date(entry.createdAt);
      const matchesFrom = !fromDate || entryDate >= fromDate;
      const matchesTo = !toDate || entryDate <= toDate;
      return matchesUser && matchesType && matchesFrom && matchesTo;
    });
  }

  private messageHandler = this.onPlayerMessage.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    public sanitizer: DomSanitizer,
    private voudService: VoudService,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.breadcrumbs = [
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'ACP', route: ['/view', this.acpId] },
      { label: 'Item-Explorer' },
    ];

    window.addEventListener('message', this.messageHandler);

    // Check if user is ACP Manager
    this.checkUserRole();

    // Load feature config and metadata settings
    this.api.getAcpStartPage(this.acpId).subscribe((data) => {
      const fc = data?.featureConfig || {};
      this.enableTags = !!fc.enableItemListTags;
      this.availableTags = fc.availableTags || [];
      this.showAudioVideoCodingVariables = fc.showAudioVideoCodingVariables !== false;
      this.itemExplorerConditionalVisibilityEnabled =
        fc.enableItemExplorerConditionalVisibility === true;
      this.playerFocusHighlightEnabled = fc.enablePlayerFocusHighlight !== false;
      this.itemExplorerPlayerTargetInfoEnabled = fc.showItemExplorerPlayerTargetInfo !== false;
      this.showOnlyItemsWithEmpiricalDifficulty =
        fc.showOnlyItemsWithEmpiricalDifficulty === true;
      // Explorer uses ACP-shared draft/published state instead of per-user preferences.
      this.persistUserPreferences = false;
      this.useServerPreferences = false;

      // Load metadata column settings
      this.metadataSettings = this.resolveMetadataSettings(fc);
      this.loadSharedExplorerState();
      this.startPlayerIfReady();
    });

    this.reloadItems();
  }

  // --- Reload Items ---
  reloadItems() {
    // Load item list from .vomd files
    this.api.getFileItemList(this.acpId).subscribe((result) => {
      this.allColumns = result.columns || [];
      this.columns = this.filterVisibleColumns(this.allColumns);
      this.items = result.items || [];
      this.hydrateItemTagsFromItems();
      this.applyExplorerStateToItems();
      this.hasEmpiricalDifficulty = this.items.some(
        (item: any) => item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null,
      );
      this.filteredItems = [...this.items];
      this.unitMetadataCache = result.unitMetadata || {};
      this.codingSchemeCache = result.codingSchemes || {};
      this.applyFilter(false); // re-apply current filters and sort
    });
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }
    if (this.saveStatusResetTimeout) {
      clearTimeout(this.saveStatusResetTimeout);
      this.saveStatusResetTimeout = null;
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = true;
  }

  @HostListener('window:keydown', ['$event'])
  handleWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (lowerKey === 'escape' && this.closeTopmostOverlay()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && lowerKey === 's' && this.canPublishExplorer) {
      event.preventDefault();
      if (!this.hasModalOverlay()) {
        this.openSavePreviewDialog();
      }
      return;
    }

    if (this.hasModalOverlay()) {
      return;
    }

    if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (this.isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      this.focusGlobalFilter();
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return true;
    }
    return this.confirmLeaveWithUnsavedChanges();
  }

  // --- Filtering ---
  applyFilter(shouldPersist = true) {
    const term = this.filterText.toLowerCase();

    this.filteredItems = this.items.filter((item) => {
      if (!this.showExcludedItems && this.isItemExcluded(item)) {
        return false;
      }

      if (
        this.showOnlyItemsWithEmpiricalDifficulty &&
        this.hasEmpiricalDifficulty &&
        (item.empiricalDifficulty === undefined || item.empiricalDifficulty === null)
      ) {
        return false;
      }

      // 1. Global Filter
      if (term) {
        const matchesGlobal =
          (item.unitId + item.itemId).toLowerCase().includes(term) ||
          item.unitLabel.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term) ||
          Object.values(item.metadata).some((val) => val && val.toLowerCase().includes(term));
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
          if (!tags.some((t) => t.toLowerCase().includes(subTerm))) return false;
        } else if (colId === 'empiricalDifficulty') {
          if (item.empiricalDifficulty === undefined || item.empiricalDifficulty === null)
            return false;
          if (item.empiricalDifficulty.toString() !== filterValue) return false;
        } else {
          // Metadata column
          const val = item.metadata[colId] || '';
          if (!val.toLowerCase().includes(subTerm)) return false;
        }
      }

      return true;
    });

    this.applySort(false);
    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  isItemExcluded(item?: ExplorerItem | null): boolean {
    return item?.excluded === true;
  }

  toggleShowExcludedItems() {
    this.showExcludedItems = !this.showExcludedItems;
    this.applyFilter(false);
  }

  toggleSelectedItemExclusion() {
    if (!this.canEditExplorer || !this.selectedItem) {
      return;
    }

    const item = this.selectedItem;
    const nextExcluded = !this.isItemExcluded(item);
    this.updateItemExclusion(item, nextExcluded);
    this.applyFilter(false);
  }

  // --- Sorting ---
  onTableKeydown(event: KeyboardEvent) {
    if (this.filteredItems.length === 0 || this.isEditableTarget(event.target)) {
      return;
    }

    const hasModifier = event.ctrlKey || event.metaKey;
    if (hasModifier && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelectedItem(-1);
      return;
    }
    if (hasModifier && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelectedItem(1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(1), true);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(-1), true);
        return;
      case 'Home':
        event.preventDefault();
        this.selectFilteredItemAt(0, true);
        return;
      case 'End':
        event.preventDefault();
        this.selectFilteredItemAt(this.filteredItems.length - 1, true);
        return;
      case 'PageDown':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(this.listPageSize), true);
        return;
      case 'PageUp':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(-this.listPageSize), true);
        return;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.selectFilteredItemAt(this.getKeyboardNavigationIndex(0), true);
        return;
      default:
        return;
    }
  }

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

  private applySort(shouldPersist = true) {
    if (this.sortField === '__manual__') {
      const rank = new Map<string, number>();
      this.itemOrder.forEach((entry, idx) => rank.set(entry, idx));
      this.filteredItems.sort((a, b) => {
        const posA = rank.has(a.uuid) ? (rank.get(a.uuid) as number) : Number.MAX_SAFE_INTEGER;
        const posB = rank.has(b.uuid) ? (rank.get(b.uuid) as number) : Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });
      this.syncSelectionAfterListMutation();
      if (shouldPersist) {
        this.saveUiPreferences();
      }
      return;
    }

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

      const primaryCmp = this.compareSortValues(aVal, bVal, this.sortDir);
      if (primaryCmp !== 0) {
        return primaryCmp;
      }

      if (!this.sortIsMeta && this.sortField === 'unitLabel') {
        const unitCmp = this.compareSortText(a.unitId, b.unitId);
        if (unitCmp !== 0) {
          return unitCmp;
        }
        return this.compareSortText(a.itemId, b.itemId);
      }

      return 0;
    });

    this.syncSelectionAfterListMutation();

    if (shouldPersist) {
      this.saveUiPreferences();
    }
  }

  private compareSortValues(aVal: unknown, bVal: unknown, direction: 'asc' | 'desc'): number {
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const cmp = this.compareSortText(aVal, bVal);
    return direction === 'asc' ? cmp : -cmp;
  }

  private compareSortText(aVal: unknown, bVal: unknown): number {
    return String(aVal ?? '')
      .toLowerCase()
      .localeCompare(String(bVal ?? '').toLowerCase(), undefined, { numeric: true });
  }

  // --- CSV Upload Handling ---
  onCsvFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.isUploading = true;
    this.api
      .uploadEmpiricalDifficulties(this.acpId, file, {
        draft: true,
        baseVersion: this.explorerVersion,
      })
      .subscribe({
        next: (result) => {
          this.isUploading = false;
          this.uploadResult = result;
          this.showUploadReport = true;
          if (typeof result.showOnlyItemsWithEmpiricalDifficulty === 'boolean') {
            this.showOnlyItemsWithEmpiricalDifficulty = result.showOnlyItemsWithEmpiricalDifficulty;
          }
          if (result.explorerState) {
            this.applySharedExplorerEnvelope(result.explorerState, true);
          }
          this.reloadItems();
        },
        error: (err) => {
          console.error(err);
          this.isUploading = false;
          if (err?.status === 409) {
            this.errorMessage = 'Konflikt beim Speichern des Entwurfs. Bitte neu laden.';
            this.loadSharedExplorerState();
          } else {
            this.errorMessage =
              err.error?.message ||
              'Fehler beim Hochladen der CSV-Datei. Bitte stelle sicher, dass die Spalten "item" und "est" vorhanden sind.';
          }
          this.showErrorDialog = true;
        },
      });

    input.value = ''; // reset input
  }

  openClearEmpiricalDifficultiesDialog() {
    this.rememberFocusBeforeOverlay();
    this.showClearEmpiricalDifficultiesDialog = true;
    this.clearEmpiricalDifficultiesBusy = false;
    this.clearEmpiricalDifficultiesError = '';
  }

  closeClearEmpiricalDifficultiesDialog() {
    if (this.clearEmpiricalDifficultiesBusy) return;
    this.showClearEmpiricalDifficultiesDialog = false;
    this.clearEmpiricalDifficultiesError = '';
    this.restoreFocusAfterOverlayClose();
  }

  confirmClearEmpiricalDifficulties() {
    if (this.clearEmpiricalDifficultiesBusy) return;
    this.clearEmpiricalDifficultiesBusy = true;
    this.clearEmpiricalDifficultiesError = '';
    this.lastDraftOperationError = '';

    this.api
      .clearEmpiricalDifficulties(this.acpId, {
        draft: true,
        baseVersion: this.explorerVersion,
      })
      .subscribe({
        next: (result) => {
          if (result.explorerState) {
            this.applySharedExplorerEnvelope(result.explorerState, true);
          }
          this.reloadItems();
          this.clearEmpiricalDifficultiesBusy = false;
          this.closeClearEmpiricalDifficultiesDialog();
        },
        error: (err) => {
          console.error(err);
          this.clearEmpiricalDifficultiesBusy = false;
          if (err?.status === 409) {
            this.clearEmpiricalDifficultiesError =
              'Konflikt beim Speichern des Entwurfs. Der Explorer wurde neu geladen.';
            this.lastDraftOperationError = this.clearEmpiricalDifficultiesError;
            void this.loadSharedExplorerState();
            return;
          }
          this.clearEmpiricalDifficultiesError =
            err?.error?.message || 'Fehler beim Löschen der Itemschwierigkeiten.';
          this.lastDraftOperationError = this.clearEmpiricalDifficultiesError;
        },
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
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    this.playerSrcDoc = null;
    this.unit = null;
    this.definitionContent = null;
    this.playerFrameReady = false;
    this.responseStateReady = false;
    this.previewUnavailableReason = '';
  }

  // --- Item Selection ---
  selectItem(item: ExplorerItem, index: number) {
    if (this.selectedItem?.uuid === item.uuid) {
      this.selectedIndex = index;
      return;
    }

    this.selectedItem = item;
    this.selectedIndex = index;
    this.resetPlayer();
    this.currentPage = 1;
    this.totalPages = 1;
    this.loadingUnit = true;
    const token = ++this.unitLoadToken;

    // Reset response state flags
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.currentResponseData = null;
    this.previewUnavailableReason = '';

    // Load unit metadata and coding scheme from cache
    this.currentUnitMetadata = this.unitMetadataCache[item.unitId] || [];
    this.currentCodingScheme = this.codingSchemeCache[item.unitId] || null;
    if (this.currentCodingScheme) {
      const codings = Array.isArray(this.currentCodingScheme)
        ? this.currentCodingScheme
        : this.currentCodingScheme.variableCodings || [];
      this.currentCodingSchemeAsText = CodingSchemeTextFactory.asText(codings);
      // Enrich with manual instruction texts from raw JSON
      this.currentCodingSchemeAsText.forEach((cat) => {
        const rawVariable = codings.find((v: any) => v.id === cat.id);
        if (rawVariable) {
          (cat as any).manualInstructionText = rawVariable.manualInstruction;
          cat.codes.forEach((c) => {
            const rawCode = rawVariable.codes?.find(
              (rc: any) => (rc.id === null ? 'null' : rc.id.toString(10)) === c.id,
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
    this.syncPreviewTargetResolution(item);

    if (!this.canPreviewItem(item)) {
      this.loadingUnit = false;
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      return;
    }

    this.loadPreviewContext(item, token);
  }

  // --- Response State ---
  private loadPreviewContext(item: ExplorerItem, token: number) {
    this.loadingUnit = true;
    this.loadResponseStateForItem(item, token);

    this.api.getFileUnitView(this.acpId, item.unitId).subscribe({
      next: (u: any) => {
        if (token !== this.unitLoadToken) return;
        this.unit = u;
        this.loadingUnit = false;

        if (!u) return;

        const deps = (u.dependencies || []).map((d: any) => ({
          ...d,
          downloadUrl: this.api.appendAuthToken(d.downloadUrl),
        }));
        u.dependencies = deps;
        this.loadPlayerHtml(deps, token);
        this.loadDefinition(deps, token);
      },
      error: () => {
        if (token !== this.unitLoadToken) return;
        this.loadingUnit = false;
      },
    });
  }

  private loadResponseStateForItem(item: ExplorerItem, token: number) {
    // Build item list from filteredItems for fallback lookup
    const itemList = this.filteredItems.map((i) => ({ itemId: i.itemId, unitId: i.unitId }));

    this.api
      .getResponseStateWithFallback(this.acpId, item.itemId, item.unitId, itemList)
      .subscribe({
        next: (result) => {
          if (token !== this.unitLoadToken) return;
          if (
            result.state &&
            result.state.responseData &&
            Object.keys(result.state.responseData).length > 0
          ) {
            this.currentResponseData = result.state.responseData;
            this.hasResponseState = true;
            this.isFallbackState = result.isFallback;
          } else {
            // No state available (direct or fallback)
            this.currentResponseData = null;
            this.hasResponseState = false;
            this.isFallbackState = false;
          }
          this.responseStateReady = true;
          this.startPlayerIfReady();
        },
        error: () => {
          if (token !== this.unitLoadToken) return;
          // On error, continue without state
          this.currentResponseData = null;
          this.hasResponseState = false;
          this.isFallbackState = false;
          this.responseStateReady = true;
          this.startPlayerIfReady();
        },
      });
  }

  saveCurrentResponseState() {
    this.rememberFocusBeforeOverlay();
    if (!this.selectedItem || !this.currentResponseData) {
      this.confirmDialogError =
        'Kein Zustand zum Speichern vorhanden. Bitte füllen Sie zuerst das Formular aus.';
      this.showSaveConfirmDialog = true;
      return;
    }
    this.confirmDialogError = '';
    this.showSaveConfirmDialog = true;
  }

  confirmSaveResponseState() {
    if (!this.selectedItem || !this.currentResponseData) return;

    this.confirmDialogState = 'saving';

    this.api
      .saveResponseState(
        this.acpId,
        this.selectedItem.itemId,
        this.selectedItem.unitId,
        this.currentResponseData,
      )
      .subscribe({
        next: () => {
          this.hasResponseState = true;
          this.isFallbackState = false;
          this.confirmDialogState = 'idle';
          this.closeSaveConfirmDialog();
        },
        error: (err) => {
          console.error('Error saving response state:', err);
          this.confirmDialogState = 'idle';
          this.confirmDialogError = 'Fehler beim Speichern des Zustands.';
        },
      });
  }

  resetResponseState() {
    if (!this.selectedItem) return;
    this.rememberFocusBeforeOverlay();
    this.confirmDialogError = '';
    this.showDeleteConfirmDialog = true;
  }

  confirmDeleteResponseState() {
    if (!this.selectedItem) return;

    this.confirmDialogState = 'deleting';

    this.api
      .deleteResponseState(this.acpId, this.selectedItem.itemId, this.selectedItem.unitId)
      .subscribe({
        next: () => {
          this.hasResponseState = false;
          this.isFallbackState = false;
          this.currentResponseData = null;
          this.confirmDialogState = 'idle';
          this.closeDeleteConfirmDialog();
        },
        error: (err) => {
          console.error('Error deleting response state:', err);
          this.confirmDialogState = 'idle';
          this.confirmDialogError = 'Fehler beim Löschen des Zustands.';
        },
      });
  }

  loadAllResponseStates() {
    this.rememberFocusBeforeOverlay();
    this.api.getAllResponseStates(this.acpId).subscribe({
      next: (states) => {
        this.allResponseStates = states;
        this.showRawDataOverlay = true;
      },
      error: (err) => {
        console.error('Error loading response states:', err);
        alert('Fehler beim Laden der gespeicherten Zustände.');
      },
    });
  }

  navigateItem(delta: number) {
    this.selectFilteredItemAt(this.selectedIndex + delta, true);
  }

  onPreviewTargetSelectionChange() {
    this.customPreviewTargetDraft = '';
    this.updatePreviewTargetSelection(this.selectedPreviewTargetId);
  }

  applyCustomPreviewTarget() {
    const customTarget = String(this.customPreviewTargetDraft || '').trim();
    if (!customTarget) {
      if (this.hasStoredPreviewTargetOverride) {
        this.resetPreviewTargetSelection();
      }
      return;
    }

    this.selectedPreviewTargetId = '';
    this.updatePreviewTargetSelection(customTarget);
  }

  resetPreviewTargetSelection() {
    this.selectedPreviewTargetId = '';
    this.customPreviewTargetDraft = '';
    this.updatePreviewTargetSelection('');
  }

  private updatePreviewTargetSelection(targetId: string) {
    this.previewUnavailableReason = '';
    if (!this.selectedItem) {
      return;
    }

    this.persistPreviewTargetSelection(this.selectedItem, targetId);
    this.syncPreviewTargetResolution(this.selectedItem);

    if (!this.canPreviewItem(this.selectedItem)) {
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      return;
    }

    if (!this.loadingUnit && (!this.unit || !this.responseStateReady)) {
      this.loadPreviewContext(this.selectedItem, this.unitLoadToken);
      return;
    }

    if (
      !this.playerFrameReady ||
      !this.definitionContent ||
      !this.unit ||
      !this.responseStateReady
    ) {
      return;
    }
    this.startPlayerIfReady();
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;
    this.playerFrameReady = true;
    this.startPlayerIfReady();
  }

  onPagingModeChange() {
    this.clearFocusRetryTimer();
    this.clearLegacyPageNavigationTimers();
    const src = this.playerSrcDoc;
    this.playerFrameReady = false;
    this.playerSrcDoc = null;
    setTimeout(() => {
      this.playerSrcDoc = src;
    }, 50);
  }

  private onPlayerMessage(event: MessageEvent) {
    const frameWindow = this.playerFrame?.nativeElement?.contentWindow;
    if (frameWindow && event.source !== frameWindow) return;

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

  private schedulePlayerFocus() {
    this.clearFocusRetryTimer();

    let attempts = 0;
    const maxAttempts = 16;

    const run = () => {
      attempts += 1;
      const focused = this.tryFocusItemInPlayer();
      if (focused || attempts >= maxAttempts) {
        return;
      }
      this.focusRetryTimer = setTimeout(run, 250);
    };

    this.focusRetryTimer = setTimeout(run, 180);
  }

  private tryFocusItemInPlayer(): boolean {
    const frame = this.playerFrame?.nativeElement;
    const doc = frame?.contentDocument || frame?.contentWindow?.document;
    if (!doc || !doc.body) return false;

    for (const selector of this.getFocusSelectors()) {
      const target = doc.querySelector(selector) as HTMLElement | null;
      if (target) {
        this.applyFocus(doc, target);
        return true;
      }
    }

    const selectedItem = this.selectedItem;
    if (!selectedItem) return false;

    const variableRef = this.resolveVariableRef(selectedItem);
    const textTarget = this.findElementByText(doc, [
      selectedItem.itemId,
      variableRef,
      selectedItem.description,
    ]);
    if (textTarget) {
      this.applyFocus(doc, textTarget);
      return true;
    }

    return false;
  }

  private loadPlayerHtml(dependencies: any[], token: number) {
    const playerDep = dependencies.find(
      (d: any) => String(d?.type || '').toLowerCase() === 'player',
    );
    if (!playerDep?.downloadUrl) {
      if (token !== this.unitLoadToken) return;
      this.playerSrcDoc = null;
      return;
    }

    fetch(playerDep.downloadUrl)
      .then((res) => res.text())
      .then((html) => {
        if (token !== this.unitLoadToken) return;
        this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(
          rewriteGeoGebraAssetUrls(html),
        );
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.playerSrcDoc = null;
      });
  }

  private loadDefinition(dependencies: any[], token: number) {
    const definitionDep = dependencies.find((d: any) => {
      const type = String(d?.type || '').toLowerCase();
      return type === 'unit_definition' || type === 'unitdefinition' || type === 'definition';
    });

    if (!definitionDep?.downloadUrl) {
      if (token !== this.unitLoadToken) return;
      this.definitionContent = null;
      return;
    }

    fetch(definitionDep.downloadUrl)
      .then((res) => res.text())
      .then((definition) => {
        if (token !== this.unitLoadToken) return;
        this.definitionContent = definition;
        this.startPlayerIfReady();
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.definitionContent = null;
      });
  }

  private startPlayerIfReady() {
    if (
      !this.playerFrameReady ||
      !this.definitionContent ||
      !this.unit ||
      !this.selectedItem ||
      !this.responseStateReady
    ) {
      return;
    }

    const selectedItem = this.selectedItem;
    const previewTarget = this.getEffectivePlayerTarget(selectedItem);
    if (!previewTarget) {
      this.previewUnavailableReason = this.getMissingPreviewTargetMessage();
      return;
    }
    const startPage = this.voudService.getStartPage(this.definitionContent, previewTarget);
    if (startPage === undefined) {
      this.previewUnavailableReason =
        `Das Player-Ziel "${previewTarget}" kommt in der Unit-Definition nicht vor.`;
      return;
    }
    this.previewUnavailableReason = '';
    const sessionId = `explorer-${selectedItem.uuid || 'none'}-${this.startSessionCounter + 1}`;
    const usesPagedNavigation = this.pagingMode !== 'view-all' && this.pagingMode !== 'print-ids';
    const playerDefinition = this.getPlayerDefinitionContent();

    this.startSessionCounter += 1;
    this.sendToPlayer({
      type: 'vopStartCommand',
      sessionId,
      unitDefinition: playerDefinition,
      unitState: {
        dataParts:
          this.hasResponseState && this.currentResponseData ? this.currentResponseData : {},
      },
      playerConfig: {
        stateReportPolicy: 'none',
        pagingMode:
          this.pagingMode === 'view-all' || this.pagingMode === 'print-ids'
            ? 'concat-scroll'
            : this.pagingMode,
        printMode:
          this.pagingMode === 'view-all'
            ? 'on'
            : this.pagingMode === 'print-ids'
              ? 'on-with-ids'
              : 'off',
        logPolicy: 'disabled',
        directDownloadUrl: GEOGEBRA_PLAYER_RESOURCE_BASE,
        startPage: startPage !== undefined ? startPage.toString() : undefined,
        enabledNavigationTargets: ['next', 'previous', 'first', 'last', 'end'],
      },
    });
    this.scheduleLegacyPageNavigation(sessionId, startPage, usesPagedNavigation);

    if (usesPagedNavigation) {
      this.playerHeight = '100%';
      this.stopAutoResize();
    } else {
      this.playerHeight = '2000px';
      this.startAutoResize();
    }
    this.schedulePlayerFocus();
  }

  private getPlayerDefinitionContent(): string {
    if (!this.definitionContent) return '';
    if (this.itemExplorerConditionalVisibilityEnabled) {
      return this.definitionContent;
    }
    return this.voudService.stripConditionalVisibility(this.definitionContent);
  }

  private scheduleLegacyPageNavigation(
    sessionId: string,
    startPage: number | undefined,
    enabled: boolean,
  ) {
    this.clearLegacyPageNavigationTimers();
    if (!enabled || startPage === undefined) return;

    const target = startPage.toString();
    this.legacyPageNavigationDelaysMs.forEach((delayMs) => {
      const timer = setTimeout(() => {
        this.sendToPlayer({
          type: 'vopPageNavigationCommand',
          sessionId,
          target,
        });
      }, delayMs);
      this.legacyPageNavigationTimers.push(timer);
    });
  }

  private getFocusSelectors(): string[] {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return [];

    const selectors: string[] = [];

    for (const itemId of this.getCandidateItemIds()) {
      const escaped = this.escapeSelectorValue(itemId);
      if (!escaped) continue;
      selectors.push(
        `[data-item-id="${escaped}"]`,
        `[data-itemid="${escaped}"]`,
        `[data-id="${escaped}"]`,
        `[id="${escaped}"]`,
      );
    }

    this.getResolvedVariableRefs(selectedItem).forEach((identifier) => {
      const variableRef = this.escapeSelectorValue(identifier);
      if (!variableRef) return;
      selectors.push(
        `[data-element-id="${variableRef}"]`,
        `[data-element-alias="${variableRef}"]`,
        `[data-list-alias="${variableRef}"]`,
        `[data-variable-id="${variableRef}"]`,
        `[data-variable="${variableRef}"]`,
        `[data-alias="${variableRef}"]`,
        `[data-ref="${variableRef}"]`,
        `[data-source-variable="${variableRef}"]`,
        `[name="${variableRef}"]`,
        `[id="${variableRef}"]`,
      );
    });

    return Array.from(new Set(selectors));
  }

  private getResolvedVariableRefs(item?: ExplorerItem | null): string[] {
    const variableRef = this.resolveVariableRef(item);
    if (!variableRef) return [];
    if (!this.definitionContent) return [variableRef];

    return this.voudService.getFocusIdentifiers(this.definitionContent, variableRef);
  }

  private resolveVariableRef(item?: ExplorerItem | null): string {
    return this.getEffectivePlayerTarget(item);
  }

  private getPersistedOrDefaultPlayerTarget(item?: ExplorerItem | null): string {
    const storedTarget = this.getStoredPreviewTargetId(item);
    if (storedTarget) {
      return storedTarget;
    }
    return this.getPlayerTarget(item);
  }

  getPlayerTarget(item?: ExplorerItem | null): string {
    if (!item) return '';
    return String(item.sourceVariable || item.variableId || '').trim();
  }

  private getEffectivePlayerTarget(item?: ExplorerItem | null): string {
    if (!item) return '';
    if (this.selectedItem?.uuid === item.uuid) {
      return this.selectedPreviewTarget;
    }
    return this.getPersistedOrDefaultPlayerTarget(item);
  }

  canPreviewItem(item?: ExplorerItem | null): boolean {
    return this.getEffectivePlayerTarget(item).length > 0;
  }

  private syncPreviewTargetResolution(item?: ExplorerItem | null) {
    const resolution = this.buildPreviewTargetResolution(item);
    const selectedId = this.getStoredPreviewTargetId(item);
    this.previewTargetResolution = resolution;
    const matchesKnownOption = resolution.options.some((option) => option.id === selectedId);
    this.selectedPreviewTargetId = matchesKnownOption ? selectedId : '';
    this.customPreviewTargetDraft = selectedId && !matchesKnownOption ? selectedId : '';
  }

  private buildPreviewTargetResolution(item?: ExplorerItem | null): PreviewTargetResolution {
    const codingVariables = this.getCurrentCodingVariables();
    const fallbackOptions = this.getAllPreviewTargetOptions(codingVariables);
    const itemTarget = this.getPlayerTarget(item);
    if (!itemTarget) {
      return {
        itemTarget: '',
        isDerived: false,
        options: fallbackOptions,
        defaultTargetId: '',
      };
    }

    if (!codingVariables.length) {
      return {
        itemTarget,
        isDerived: false,
        options: [this.createFallbackPreviewTargetOption(itemTarget)],
        defaultTargetId: itemTarget,
      };
    }

    const variableLookup = this.buildCodingVariableLookup(codingVariables);
    const selectedCodingVariable = variableLookup.get(itemTarget.toLowerCase());
    if (!selectedCodingVariable) {
      return {
        itemTarget,
        isDerived: false,
        options: this.dedupePreviewTargetOptions([
          ...fallbackOptions,
          this.createFallbackPreviewTargetOption(itemTarget),
        ]),
        defaultTargetId: itemTarget,
      };
    }

    const resolvedItemTarget = this.getCodingVariableId(selectedCodingVariable, itemTarget);
    const derivedOptions = this.collectBasePreviewTargetOptions(selectedCodingVariable, variableLookup);
    const isDerived = this.isDerivedCodingVariable(selectedCodingVariable);
    const defaultTargetId =
      isDerived && derivedOptions.length ? derivedOptions[0].id : resolvedItemTarget;

    return {
      itemTarget: resolvedItemTarget,
      isDerived,
      options: this.dedupePreviewTargetOptions([
        ...derivedOptions,
        ...fallbackOptions,
        this.createPreviewTargetOption(selectedCodingVariable, resolvedItemTarget),
      ]),
      defaultTargetId,
    };
  }

  private getCurrentCodingVariables(): any[] {
    if (Array.isArray(this.currentCodingScheme)) {
      return this.currentCodingScheme;
    }
    return Array.isArray(this.currentCodingScheme?.variableCodings)
      ? this.currentCodingScheme.variableCodings
      : [];
  }

  private buildCodingVariableLookup(variables: any[]): Map<string, any> {
    const lookup = new Map<string, any>();
    variables.forEach((variable) => {
      this.getCodingVariableIdentifiers(variable).forEach((identifier) => {
        const key = identifier.toLowerCase();
        if (!lookup.has(key)) {
          lookup.set(key, variable);
        }
      });
    });
    return lookup;
  }

  private getAllPreviewTargetOptions(variables: any[]): PreviewTargetOption[] {
    return this.dedupePreviewTargetOptions(
      variables.map((variable) => this.createPreviewTargetOption(variable)),
    );
  }

  private collectBasePreviewTargetOptions(
    variable: any,
    variableLookup: Map<string, any>,
    visited = new Set<string>(),
  ): PreviewTargetOption[] {
    const variableId = this.getCodingVariableId(variable);
    const visitKey = variableId.toLowerCase();
    if (visitKey) {
      if (visited.has(visitKey)) {
        return [];
      }
      visited.add(visitKey);
    }

    const deriveSources = this.getCodingVariableSources(variable);
    if (!deriveSources.length) {
      return [this.createPreviewTargetOption(variable, variableId)];
    }

    const options = deriveSources.flatMap((sourceId) => {
      const sourceVariable = variableLookup.get(sourceId.toLowerCase());
      if (!sourceVariable) {
        return [this.createFallbackPreviewTargetOption(sourceId)];
      }
      if (!this.isDerivedCodingVariable(sourceVariable)) {
        return [this.createPreviewTargetOption(sourceVariable, sourceId)];
      }
      return this.collectBasePreviewTargetOptions(sourceVariable, variableLookup, new Set(visited));
    });

    return this.dedupePreviewTargetOptions(options);
  }

  private createPreviewTargetOption(variable: any, fallbackId = ''): PreviewTargetOption {
    const id = this.getCodingVariableId(variable, fallbackId);
    const label = this.getCodingVariableLabel(variable, id);
    return {
      id,
      label: this.formatPreviewTargetLabel(id, label),
      sourceType: this.getCodingVariableSourceType(variable),
    };
  }

  private createFallbackPreviewTargetOption(id: string): PreviewTargetOption {
    return {
      id,
      label: this.formatPreviewTargetLabel(id, id),
      sourceType: 'BASE',
    };
  }

  private dedupePreviewTargetOptions(options: PreviewTargetOption[]): PreviewTargetOption[] {
    const seen = new Set<string>();
    const deduped: PreviewTargetOption[] = [];

    options.forEach((option) => {
      const id = String(option.id || '').trim();
      if (!id) {
        return;
      }
      const key = id.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      deduped.push({
        ...option,
        id,
      });
    });

    return deduped;
  }

  private getCodingVariableIdentifiers(variable: any): string[] {
    return Array.from(
      new Set(
        [variable?.id, variable?.alias]
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private getCodingVariableId(variable: any, fallbackId = ''): string {
    const directId = String(variable?.id || '').trim();
    if (directId) {
      return directId;
    }
    const alias = String(variable?.alias || '').trim();
    return alias || fallbackId;
  }

  private getCodingVariableLabel(variable: any, fallbackId: string): string {
    const variableId = this.getCodingVariableId(variable, fallbackId);
    const textLabel = String(
      this.currentCodingSchemeAsText?.find((coding) => coding.id === variableId)?.label || '',
    ).trim();
    if (textLabel) {
      return textLabel;
    }

    const rawLabel = variable?.label;
    if (typeof rawLabel === 'string' && rawLabel.trim()) {
      return rawLabel.trim();
    }

    if (Array.isArray(rawLabel)) {
      const localizedLabel = rawLabel
        .map((entry: any) => String(entry?.value || '').trim())
        .find((value: string) => value.length > 0);
      if (localizedLabel) {
        return localizedLabel;
      }
    }

    return fallbackId;
  }

  private getCodingVariableSourceType(variable: any): string {
    const sourceType = String(variable?.sourceType || '').trim().toUpperCase();
    return sourceType || 'BASE';
  }

  private getCodingVariableSources(variable: any): string[] {
    if (!Array.isArray(variable?.deriveSources)) {
      return [];
    }
    return variable.deriveSources
      .map((value: unknown) => String(value || '').trim())
      .filter((value: string) => value.length > 0);
  }

  private isDerivedCodingVariable(variable: any): boolean {
    return this.getCodingVariableSources(variable).length > 0;
  }

  private formatPreviewTargetLabel(id: string, label: string): string {
    return label && label !== id ? `${label} (${id})` : id;
  }

  private getStoredPreviewTargetId(item?: ExplorerItem | null): string {
    return String(item?.previewTargetId || '').trim();
  }

  private persistPreviewTargetSelection(item: ExplorerItem, targetId: string) {
    const previousTargetId = this.getStoredPreviewTargetId(item);
    const normalizedTargetId = String(targetId || '').trim();
    if (previousTargetId === normalizedTargetId) {
      return;
    }
    item.previewTargetId = normalizedTargetId || undefined;

    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.queueItemPropertyPatch(
      item,
      'PREVIEW_TARGET_CHANGED',
      {
        [this.previewTargetItemPropertyKey]: normalizedTargetId,
      },
      true,
    );
  }

  private updateItemExclusion(item: ExplorerItem, excluded: boolean) {
    item.excluded = excluded ? true : undefined;

    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.queueItemPropertyPatch(
      item,
      'ITEM_EXCLUSION_CHANGED',
      {
        [this.excludedItemPropertyKey]: excluded,
      },
      true,
    );
  }

  private queueItemPropertyPatch(
    item: ExplorerItem,
    changeType: string,
    propertyPatch: Record<string, unknown>,
    flushImmediately = false,
  ) {
    const itemKey = this.getExistingItemStateKey(item) || this.getPrimaryItemStateKey(item);
    if (!itemKey) {
      return;
    }

    this.queueDraftPatch(
      changeType,
      {
        itemPropertiesPatch: {
          [itemKey]: propertyPatch,
        },
      },
      flushImmediately,
    );
  }

  private getPrimaryItemStateKey(item?: ExplorerItem | null): string {
    if (!item) return '';

    const resolvedItemId = item.itemId?.startsWith(`${item.unitId}_`)
      ? item.itemId
      : `${item.unitId}_${item.itemId}`;

    for (const candidate of [item.uuid, resolvedItemId, item.itemId]) {
      const key = String(candidate || '').trim();
      if (key) {
        return key;
      }
    }

    return '';
  }

  private getExistingItemStateKey(item?: ExplorerItem | null): string {
    if (!item) return '';

    const activeState = this.latestExplorerState?.activeState;
    const itemProperties = this.isRecord(activeState?.itemProperties)
      ? (activeState.itemProperties as Record<string, Record<string, unknown>>)
      : {};

    for (const key of this.getItemStateKeys(item)) {
      if (this.isRecord(itemProperties[key])) {
        return key;
      }
    }

    return '';
  }

  private getMissingPreviewTargetMessage(): string {
    return 'Für dieses Item ist in den Explorer-Daten keine Player-Variable hinterlegt. Sie können ein manuelles Sprungziel setzen.';
  }

  private getCandidateItemIds(): string[] {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return [];

    const unitId = String(this.unit?.id || selectedItem.unitId || '').trim();
    const selectedItemId = String(selectedItem.itemId || '').trim();
    const resolvedItemId = this.resolveFocusItemId();
    const withPrefix = (value: string) => (unitId && value ? `${unitId}_${value}` : '');

    const candidates = new Set<string>();
    for (const candidate of [
      resolvedItemId,
      selectedItemId,
      withPrefix(resolvedItemId),
      withPrefix(selectedItemId),
    ]) {
      if (candidate) {
        candidates.add(candidate);
      }
    }

    if (unitId && selectedItemId.startsWith(`${unitId}_`)) {
      candidates.add(selectedItemId.slice(unitId.length + 1));
    }

    return Array.from(candidates);
  }

  private resolveFocusItemId(): string {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return '';

    const selectedItemId = String(selectedItem.itemId || '').trim();
    const unitItems = Array.isArray(this.unit?.items) ? this.unit.items : [];
    const unitId = String(this.unit?.id || selectedItem.unitId || '').trim();

    for (const unitItem of unitItems) {
      const unitItemId = typeof unitItem?.id === 'string' ? unitItem.id : '';
      if (!unitItemId) continue;

      const prefixedId =
        unitItem.useUnitAliasAsPrefix !== false ? `${unitId}_${unitItemId}` : unitItemId;

      if (selectedItemId === unitItemId || selectedItemId === prefixedId) {
        return unitItemId;
      }
    }

    if (unitId && selectedItemId.startsWith(`${unitId}_`)) {
      return selectedItemId.slice(unitId.length + 1);
    }

    return selectedItemId;
  }

  private findElementByText(
    doc: Document,
    candidates: Array<string | undefined>,
  ): HTMLElement | null {
    const needles = candidates
      .map((value) => (value || '').trim().toLowerCase())
      .filter((value) => value.length > 1);

    if (!needles.length) return null;

    const nodes = Array.from(doc.querySelectorAll<HTMLElement>('label, span, div, p, li, button'));
    const maxScan = Math.min(nodes.length, 3000);

    for (let i = 0; i < maxScan; i += 1) {
      const node = nodes[i];
      const text = (node.textContent || '').trim().toLowerCase();
      if (!text) continue;
      if (needles.some((needle) => text === needle || text.includes(needle))) {
        return node;
      }
    }

    return null;
  }

  private applyFocus(doc: Document, target: HTMLElement) {
    doc
      .querySelectorAll('.cp-item-focus-highlight')
      .forEach((el) => el.classList.remove('cp-item-focus-highlight'));
    if (this.playerFocusHighlightEnabled) {
      this.ensureFocusStyle(doc);
      target.classList.add('cp-item-focus-highlight');
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    try {
      target.focus({ preventScroll: true });
    } catch {
      // Ignore focus errors for non-focusable elements.
    }
  }

  private ensureFocusStyle(doc: Document) {
    if (doc.getElementById('cp-item-focus-style')) return;

    const style = doc.createElement('style');
    style.id = 'cp-item-focus-style';
    style.textContent = `
      .cp-item-focus-highlight {
        outline: 3px solid #e67e22 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.25) !important;
        border-radius: 4px !important;
        transition: box-shadow 0.2s ease;
      }
    `;
    doc.head?.appendChild(style);
  }

  private escapeSelectorValue(value: string): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  private clearFocusRetryTimer() {
    if (this.focusRetryTimer) {
      clearTimeout(this.focusRetryTimer);
      this.focusRetryTimer = null;
    }
  }

  private clearLegacyPageNavigationTimers() {
    this.legacyPageNavigationTimers.forEach((timer) => clearTimeout(timer));
    this.legacyPageNavigationTimers = [];
  }

  private sendToPlayer(msg: any) {
    this.playerFrame?.nativeElement?.contentWindow?.postMessage(msg, '*');
  }

  // --- Tags ---
  addItemTag(uuid: string, event: Event) {
    if (!this.canEditExplorer) return;
    const tag = (event.target as HTMLSelectElement).value;
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
      this.applyFilter(false);
    }
    (event.target as HTMLSelectElement).value = '';
  }

  removeItemTag(uuid: string, tag: string) {
    if (!this.canEditExplorer) return;
    if (this.itemTags[uuid]) {
      this.itemTags[uuid] = this.itemTags[uuid].filter((t) => t !== tag);
      this.saveTags();
      this.applyFilter(false);
    }
  }

  addCustomTag(uuid: string, event: any) {
    if (!this.canEditExplorer) return;
    const input = event.target as HTMLInputElement;
    const tag = input.value.trim();
    if (!tag) return;
    if (!this.itemTags[uuid]) this.itemTags[uuid] = [];
    if (!this.itemTags[uuid].includes(tag)) {
      this.itemTags[uuid].push(tag);
      this.saveTags();
      this.applyFilter(false);
    }
    input.value = '';
  }

  private saveTags() {
    const normalizedTags = this.normalizeTags(this.itemTags);
    this.itemTags = normalizedTags;
    if (!this.canEditExplorer) {
      return;
    }
    this.queueDraftPatch('TAGS_CHANGED', { tags: normalizedTags });
  }

  private loadPersistedTags() {
    // Explorer uses shared ACP state; tags are loaded through loadSharedExplorerState().
    this.applyFilter(false);
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
      if (valueAsText.every((v) => v && typeof v === 'object' && v.value)) {
        return valueAsText.map((v) => v.value).join(', ');
      }
      return valueAsText.map((v) => this.extractValueText(v)).join(', ');
    }
    if (typeof valueAsText === 'object') {
      return valueAsText['de'] || valueAsText['value'] || '';
    }
    return '';
  }

  getSummaryMetadata(): any[] {
    if (!this.currentUnitMetadata) return [];
    // Prefer these IDs for summary
    const priorityIds = [
      'level',
      'subject',
      'competence',
      'format',
      'time',
      'duration',
      'difficulty',
    ];
    const summary = this.currentUnitMetadata.filter((m) =>
      priorityIds.some((pid) => m.id.toLowerCase().includes(pid)),
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
      } catch (_e) {
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
    this.isAcpManager = this.authService.hasAcpRole(this.acpId, 'ACP_MANAGER');
    this.canEditExplorer = this.isAcpManager || this.authService.isAdmin;
    this.canPublishExplorer = this.canEditExplorer;
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
      const col = allColumns.find((c) => c.id === colId);
      if (col && visibleMap.has(colId)) {
        orderedColumns.push({ ...col, visible: true });
      }
    }

    // Then add any remaining visible columns not in the order list
    for (const col of allColumns) {
      if (visibleMap.has(col.id) && !orderedColumns.some((c) => c.id === col.id)) {
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
      [this.metadataSettings.order[index], this.metadataSettings.order[index - 1]] = [
        this.metadataSettings.order[index - 1],
        this.metadataSettings.order[index],
      ];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  moveColumnDown(column: MetadataColumn) {
    const index = this.metadataSettings.order.indexOf(column.id);
    if (index >= 0 && index < this.metadataSettings.order.length - 1) {
      [this.metadataSettings.order[index], this.metadataSettings.order[index + 1]] = [
        this.metadataSettings.order[index + 1],
        this.metadataSettings.order[index],
      ];
      this.columns = this.filterVisibleColumns(this.allColumns);
    }
  }

  enableManualOrderMode() {
    this.sortField = '__manual__';
    this.sortIsMeta = false;
    this.sortDir = 'asc';
    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.uuid);
    }
    this.applySort();
  }

  moveSelectedItem(delta: number) {
    if (!this.canEditExplorer || !this.selectedItem || this.sortField !== '__manual__') {
      return;
    }
    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.uuid);
    }
    const currentIndex = this.itemOrder.indexOf(this.selectedItem.uuid);
    if (currentIndex === -1) {
      return;
    }
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= this.itemOrder.length) {
      return;
    }
    [this.itemOrder[currentIndex], this.itemOrder[targetIndex]] = [
      this.itemOrder[targetIndex],
      this.itemOrder[currentIndex],
    ];
    this.applySort(false);
    this.queueDraftPatch('ITEM_ORDER_CHANGED', { itemOrder: [...this.itemOrder] }, true);
  }

  saveMetadataSettings() {
    this.columns = this.filterVisibleColumns(this.allColumns);
    this.showColumnManager = false;
    this.restoreFocusAfterOverlayClose();
    this.queueDraftPatch(
      'METADATA_COLUMNS_CHANGED',
      {
        metadataColumns: {
          visible: [...this.metadataSettings.visible],
          order: [...this.metadataSettings.order],
        },
      },
      true,
    );
  }

  resetToDefault() {
    this.metadataSettings = { visible: [], order: [] };
    this.columns = this.filterVisibleColumns(this.allColumns);
  }

  private resolveMetadataSettings(featureConfig: Record<string, any>): MetadataSettings {
    const metadataColumns = featureConfig?.['metadataColumns'];
    if (metadataColumns && typeof metadataColumns === 'object') {
      const visible = Array.isArray(metadataColumns.visible)
        ? metadataColumns.visible.filter(
            (entry: unknown): entry is string => typeof entry === 'string',
          )
        : [];
      const order = Array.isArray(metadataColumns.order)
        ? metadataColumns.order.filter(
            (entry: unknown): entry is string => typeof entry === 'string',
          )
        : [];

      return {
        visible: visible.length ? visible : order,
        order: order.length ? order : visible,
      };
    }

    const legacyColumns = featureConfig?.['itemListMetadataColumns'];
    const legacy = Array.isArray(legacyColumns)
      ? legacyColumns.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [];

    return { visible: legacy, order: legacy };
  }

  private buildUiPreferences(): Record<string, unknown> {
    return {
      filterText: this.filterText,
      sortField: this.sortField,
      sortIsMeta: this.sortIsMeta,
      sortDir: this.sortDir,
      columnFilters: this.columnFilters,
    };
  }

  private applyUiPreferences(rawUi: unknown) {
    if (!this.isRecord(rawUi)) return;

    const filterText = rawUi['filterText'];
    const sortField = rawUi['sortField'];
    const sortIsMeta = rawUi['sortIsMeta'];
    const sortDir = rawUi['sortDir'];
    const columnFilters = rawUi['columnFilters'];

    if (typeof filterText === 'string') {
      this.filterText = filterText;
    }

    if (typeof sortField === 'string') {
      this.sortField = sortField;
    }

    if (typeof sortIsMeta === 'boolean') {
      this.sortIsMeta = sortIsMeta;
    }

    this.sortDir = sortDir === 'desc' ? 'desc' : 'asc';
    this.columnFilters = this.isRecord(columnFilters)
      ? Object.fromEntries(
          Object.entries(columnFilters).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : '',
          ]),
        )
      : {};
  }

  private saveUiPreferences() {
    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }
    this.queueDraftPatch('UI_STATE_CHANGED', {
      ui: this.buildUiPreferences(),
    });
  }

  private async confirmLeaveWithUnsavedChanges(): Promise<boolean> {
    if (this.leaveWithChangesResolver) {
      return false;
    }

    this.rememberFocusBeforeOverlay();
    this.showLeaveWithChangesDialog = true;
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = '';

    return new Promise<boolean>((resolve) => {
      this.leaveWithChangesResolver = resolve;
    });
  }

  stayOnPage() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.resolveLeaveWithChangesDialog(false);
  }

  async saveAndLeave() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.leaveWithChangesDialogState = 'saving';
    this.leaveWithChangesDialogError = '';
    const saved = await this.saveExplorerDraft(true);
    if (saved) {
      this.resolveLeaveWithChangesDialog(true);
      return;
    }
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = this.lastDraftOperationError || 'Speichern fehlgeschlagen.';
  }

  async discardAndLeave() {
    if (this.leaveWithChangesDialogState !== 'idle') return;
    this.leaveWithChangesDialogState = 'discarding';
    this.leaveWithChangesDialogError = '';
    const discarded = await this.discardExplorerDraft(true);
    if (discarded) {
      this.resolveLeaveWithChangesDialog(true);
      return;
    }
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = this.lastDraftOperationError || 'Verwerfen fehlgeschlagen.';
  }

  private resolveLeaveWithChangesDialog(result: boolean) {
    const resolver = this.leaveWithChangesResolver;
    this.leaveWithChangesResolver = null;
    this.showLeaveWithChangesDialog = false;
    this.leaveWithChangesDialogState = 'idle';
    this.leaveWithChangesDialogError = '';
    if (!result) {
      this.restoreFocusAfterOverlayClose();
    }
    resolver?.(result);
  }

  private async loadSharedExplorerState(): Promise<void> {
    try {
      const envelope = await firstValueFrom(this.api.getItemExplorerState(this.acpId));
      this.applySharedExplorerEnvelope(envelope);
    } catch (error) {
      console.error('Failed to load shared explorer state', error);
      this.explorerUiStatus = 'ERROR';
    }
  }

  private applySharedExplorerEnvelope(envelope: ItemExplorerStateEnvelope, markSaved = false) {
    this.lastDraftOperationError = '';
    this.latestExplorerState = envelope;
    this.explorerVersion = envelope.version;
    this.explorerPublishedVersion = envelope.publishedVersion;
    this.canEditExplorer = envelope.canEdit;
    this.canPublishExplorer = envelope.canPublish;

    const roleLabel = envelope.updatedByRole ? ` (${envelope.updatedByRole})` : '';
    const username = envelope.updatedByUsername || 'unbekannt';
    this.lastExplorerChangeInfo = `${username}${roleLabel} · ${new Date(envelope.updatedAt).toLocaleString()}`;

    const activeState = this.isRecord(envelope.activeState) ? envelope.activeState : {};
    this.suppressDraftPatch = true;
    try {
      this.applyUiPreferences((activeState as ItemExplorerSharedState).ui);
      this.itemTags = this.normalizeTags((activeState as ItemExplorerSharedState).tags);
      this.metadataSettings = this.resolveMetadataSettings({
        metadataColumns: (activeState as ItemExplorerSharedState).metadataColumns,
      });
      this.columns = this.filterVisibleColumns(this.allColumns);
      this.itemOrder = Array.isArray((activeState as ItemExplorerSharedState).itemOrder)
        ? (activeState as ItemExplorerSharedState).itemOrder!.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [];
    } finally {
      this.suppressDraftPatch = false;
    }

    const previousPreviewTarget = this.selectedItem ? this.getEffectivePlayerTarget(this.selectedItem) : '';
    this.applyExplorerStateToItems();
    if (this.selectedItem) {
      this.syncPreviewTargetResolution(this.selectedItem);
      const nextPreviewTarget = this.getEffectivePlayerTarget(this.selectedItem);
      if (
        previousPreviewTarget !== nextPreviewTarget &&
        this.playerFrameReady &&
        this.definitionContent &&
        this.unit &&
        this.responseStateReady
      ) {
        this.startPlayerIfReady();
      }
    }

    if (envelope.status === 'DIRTY') {
      this.explorerUiStatus = 'DIRTY';
      return;
    }
    if (markSaved) {
      this.explorerUiStatus = 'SAVED';
      if (this.saveStatusResetTimeout) {
        clearTimeout(this.saveStatusResetTimeout);
      }
      this.saveStatusResetTimeout = setTimeout(() => {
        this.saveStatusResetTimeout = null;
        if (!this.hasPendingDraftChanges()) {
          this.explorerUiStatus = 'CLEAN';
        }
      }, 1800);
      return;
    }
    this.explorerUiStatus = 'CLEAN';
  }

  private applyExplorerStateToItems() {
    const activeState = this.latestExplorerState?.activeState;
    if (!activeState || this.items.length === 0) {
      return;
    }

    const itemProperties = this.isRecord(activeState.itemProperties)
      ? (activeState.itemProperties as Record<string, Record<string, unknown>>)
      : {};
    const stateTags = this.normalizeTags(activeState.tags);

    for (const item of this.items) {
      const keys = this.getItemStateKeys(item);
      const itemProps = this.getItemPropsForKeys(itemProperties, keys);

      const empiricalDifficultyRaw = itemProps?.['empiricalDifficulty'];
      if (empiricalDifficultyRaw === undefined || empiricalDifficultyRaw === null) {
        delete item.empiricalDifficulty;
      } else {
        const parsed = Number(empiricalDifficultyRaw);
        if (Number.isFinite(parsed)) {
          item.empiricalDifficulty = parsed;
        } else {
          delete item.empiricalDifficulty;
        }
      }

      const previewTargetId = String(itemProps?.[this.previewTargetItemPropertyKey] || '').trim();
      if (previewTargetId) {
        item.previewTargetId = previewTargetId;
      } else {
        delete item.previewTargetId;
      }

      if (itemProps?.[this.excludedItemPropertyKey] === true) {
        item.excluded = true;
      } else {
        delete item.excluded;
      }

      const tagsFromState = this.getTagsForKeys(stateTags, keys);
      if (tagsFromState.length) {
        item.tags = tagsFromState;
      } else if (Array.isArray(itemProps?.['tags'])) {
        item.tags = this.normalizeTagValues(itemProps['tags']);
      } else if (!Array.isArray(item.tags)) {
        item.tags = [];
      }
    }

    this.hydrateItemTagsFromItems();
    if (Object.keys(stateTags).length) {
      this.itemTags = stateTags;
    }

    if (!this.itemOrder.length) {
      this.itemOrder = this.items.map((item) => item.uuid);
    } else {
      const existing = new Set(this.items.map((item) => item.uuid));
      const filteredOrder = this.itemOrder.filter((entry) => existing.has(entry));
      const missing = this.items
        .map((item) => item.uuid)
        .filter((entry) => !filteredOrder.includes(entry));
      this.itemOrder = [...filteredOrder, ...missing];
    }

    this.hasEmpiricalDifficulty = this.items.some(
      (item: any) => item.empiricalDifficulty !== undefined && item.empiricalDifficulty !== null,
    );
    this.applyFilter(false);
  }

  private getItemStateKeys(item: ExplorerItem): string[] {
    const keys = new Set<string>();
    const resolvedItemId = item.itemId?.startsWith(`${item.unitId}_`)
      ? item.itemId
      : `${item.unitId}_${item.itemId}`;

    for (const candidate of [item.uuid, resolvedItemId, item.itemId]) {
      const key = String(candidate || '').trim();
      if (key) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }

  private getItemPropsForKeys(
    itemProperties: Record<string, Record<string, unknown>>,
    keys: string[],
  ): Record<string, unknown> | null {
    for (const key of keys) {
      if (this.isRecord(itemProperties[key])) {
        return itemProperties[key];
      }
    }
    return null;
  }

  private getTagsForKeys(tagsMap: Record<string, string[]>, keys: string[]): string[] {
    for (const key of keys) {
      const tags = tagsMap[key];
      if (Array.isArray(tags) && tags.length) {
        return this.normalizeTagValues(tags);
      }
    }
    return [];
  }

  private normalizeTagValues(values: unknown[]): string[] {
    return Array.from(
      new Set(
        values.map((value) => String(value || '').trim()).filter((value) => value.length > 0),
      ),
    );
  }

  hasPendingDraftChanges(): boolean {
    return (
      Boolean(this.pendingDraftPatch) ||
      this.latestExplorerState?.status === 'DIRTY' ||
      this.explorerUiStatus === 'DIRTY'
    );
  }

  openSavePreviewDialog() {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return;
    }
    this.rememberFocusBeforeOverlay();
    this.draftPreviewSummary = this.buildDraftPreviewSummary();
    this.showSavePreviewDialog = true;
  }

  cancelSavePreviewDialog() {
    this.showSavePreviewDialog = false;
    this.restoreFocusAfterOverlayClose();
  }

  confirmSaveExplorerDraft() {
    this.showSavePreviewDialog = false;
    void this.saveExplorerDraft(true);
  }

  openDiscardExplorerDraftDialog() {
    if (!this.canPublishExplorer || !this.hasPendingDraftChanges()) {
      return;
    }
    this.rememberFocusBeforeOverlay();
    this.showDiscardDraftDialog = true;
    this.discardDraftDialogBusy = false;
    this.discardDraftDialogError = '';
  }

  closeDiscardDraftDialog() {
    if (this.discardDraftDialogBusy) return;
    this.showDiscardDraftDialog = false;
    this.discardDraftDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  async confirmDiscardDraftDialog() {
    if (this.discardDraftDialogBusy) return;
    this.discardDraftDialogBusy = true;
    this.discardDraftDialogError = '';
    const discarded = await this.discardExplorerDraft(true);
    this.discardDraftDialogBusy = false;
    if (discarded) {
      this.closeDiscardDraftDialog();
      return;
    }
    this.discardDraftDialogError =
      this.lastDraftOperationError || 'Entwurfsänderungen konnten nicht verworfen werden.';
  }

  async saveExplorerDraft(force = false): Promise<boolean> {
    if (!this.canPublishExplorer) {
      return false;
    }
    if (!force) {
      this.openSavePreviewDialog();
      return false;
    }

    const flushed = await this.flushDraftPatch();
    if (!flushed) {
      return false;
    }

    this.lastDraftOperationError = '';
    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.saveItemExplorerDraft(this.acpId, this.explorerVersion),
      );
      this.applySharedExplorerEnvelope(envelope, true);
      this.reloadItems();
      this.lastDraftOperationError = '';
      if (!this.showLeaveWithChangesDialog) {
        this.restoreFocusAfterOverlayClose();
      }
      return true;
    } catch (error: any) {
      console.error('Failed to save draft', error);
      this.explorerUiStatus = 'ERROR';
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Speichern der Änderungen.',
      );
      if (error?.status === 409) {
        await this.loadSharedExplorerState();
      }
      return false;
    }
  }

  async discardExplorerDraft(skipConfirm = false): Promise<boolean> {
    if (!this.canPublishExplorer) {
      return false;
    }
    if (!skipConfirm) {
      this.openDiscardExplorerDraftDialog();
      return false;
    }

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }
    this.pendingDraftPatch = null;
    this.pendingDraftChangeType = 'UI_UPDATE';
    this.showSavePreviewDialog = false;
    this.lastDraftOperationError = '';

    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.discardItemExplorerDraft(this.acpId, this.explorerVersion),
      );
      this.applySharedExplorerEnvelope(envelope, true);
      this.reloadItems();
      this.lastDraftOperationError = '';
      if (!this.showLeaveWithChangesDialog) {
        this.restoreFocusAfterOverlayClose();
      }
      return true;
    } catch (error: any) {
      console.error('Failed to discard draft', error);
      this.explorerUiStatus = 'ERROR';
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Verwerfen der Änderungen.',
      );
      if (error?.status === 409) {
        await this.loadSharedExplorerState();
      }
      return false;
    }
  }

  private extractDraftErrorMessage(error: any, fallback: string): string {
    if (error?.status === 409) {
      return 'Konflikt erkannt: Der Explorer wurde zwischenzeitlich geändert. Status wurde neu geladen.';
    }
    const message = String(error?.error?.message || '');
    return message || fallback;
  }

  showHistory() {
    this.rememberFocusBeforeOverlay();
    this.showHistoryOverlay = true;
    this.historyLoading = true;
    this.historyError = '';
    this.api.getItemExplorerChanges(this.acpId, 300).subscribe({
      next: (entries) => {
        this.historyEntries = entries || [];
        this.historyLoading = false;
      },
      error: (error) => {
        console.error('Failed to load history', error);
        this.historyLoading = false;
        this.historyError = 'Änderungsverlauf konnte nicht geladen werden.';
      },
    });
  }

  openCodingOverlay() {
    this.rememberFocusBeforeOverlay();
    this.showOverlay = 'coding';
  }

  closeCodingOverlay() {
    if (this.showOverlay !== 'coding') {
      return;
    }
    this.showOverlay = null;
    this.restoreFocusAfterOverlayClose();
  }

  openColumnManager() {
    this.rememberFocusBeforeOverlay();
    this.showColumnManager = true;
  }

  closeColumnManager() {
    if (!this.showColumnManager) {
      return;
    }
    this.showColumnManager = false;
    this.restoreFocusAfterOverlayClose();
  }

  closeSaveConfirmDialog() {
    if (this.confirmDialogState !== 'idle') {
      return;
    }
    this.showSaveConfirmDialog = false;
    this.confirmDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  closeDeleteConfirmDialog() {
    if (this.confirmDialogState !== 'idle') {
      return;
    }
    this.showDeleteConfirmDialog = false;
    this.confirmDialogError = '';
    this.restoreFocusAfterOverlayClose();
  }

  closeRawDataOverlay() {
    if (!this.showRawDataOverlay) {
      return;
    }
    this.showRawDataOverlay = false;
    this.restoreFocusAfterOverlayClose();
  }

  closeHistoryOverlay() {
    if (!this.showHistoryOverlay) {
      return;
    }
    this.showHistoryOverlay = false;
    this.restoreFocusAfterOverlayClose();
  }

  getItemRowId(item: ExplorerItem): string {
    const rawId = item.uuid || `${item.unitId}_${item.itemId}`;
    return `item-explorer-row-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  exportHistoryCsv() {
    if (!this.filteredHistoryEntries.length) {
      return;
    }

    const escapeCsv = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Zeit', 'Nutzer', 'Rolle', 'Aktion', 'Draft-Version', 'Published-Version', 'Diff'],
      ...this.filteredHistoryEntries.map((entry) => [
        new Date(entry.createdAt).toISOString(),
        entry.actorUsername || '',
        entry.actorRole || '',
        entry.changeType || '',
        entry.draftVersion ?? '',
        entry.publishedVersion ?? '',
        JSON.stringify(entry.diff || {}),
      ]),
    ];

    const content = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(';')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `item-explorer-history-${this.acpId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private buildDraftPreviewSummary(): Array<{ label: string; detail: string }> {
    const draft = this.latestExplorerState?.draftState;
    const published = this.latestExplorerState?.publishedState;
    if (!draft || !published) {
      return [];
    }

    const summary: Array<{ label: string; detail: string }> = [];

    if (JSON.stringify(draft.ui || {}) !== JSON.stringify(published.ui || {})) {
      summary.push({
        label: 'Filter/Sortierung',
        detail: 'Globale Filter-, Sortier- oder Spaltenfilter-Einstellungen wurden geändert.',
      });
    }
    if (
      JSON.stringify(draft.metadataColumns || {}) !==
      JSON.stringify(published.metadataColumns || {})
    ) {
      summary.push({
        label: 'Metadaten-Spalten',
        detail: 'Sichtbarkeit oder Reihenfolge der Metadaten-Spalten wurde angepasst.',
      });
    }
    if (JSON.stringify(draft.itemOrder || []) !== JSON.stringify(published.itemOrder || [])) {
      summary.push({
        label: 'Item-Reihenfolge',
        detail: `Manuelle Reihenfolge mit ${Array.isArray(draft.itemOrder) ? draft.itemOrder.length : 0} Positionen wurde geändert.`,
      });
    }
    if (JSON.stringify(draft.tags || {}) !== JSON.stringify(published.tags || {})) {
      summary.push({
        label: 'Tags',
        detail: 'Tag-Zuordnungen für Items wurden verändert.',
      });
    }
    if (
      JSON.stringify(draft.itemProperties || {}) !== JSON.stringify(published.itemProperties || {})
    ) {
      const draftCount = this.isRecord(draft.itemProperties)
        ? Object.keys(draft.itemProperties).length
        : 0;
      const publishedCount = this.isRecord(published.itemProperties)
        ? Object.keys(published.itemProperties).length
        : 0;
      summary.push({
        label: 'Item-Werte',
        detail: `Item-Eigenschaften (z.B. empirische Schwierigkeit, Vorschauziele oder Ausschlüsse) geändert: ${publishedCount} → ${draftCount} Einträge.`,
      });
    }

    return summary;
  }

  private selectFilteredItemAt(index: number, shouldScroll = false) {
    if (this.filteredItems.length === 0) {
      this.clearSelectedItem();
      return;
    }

    const targetIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
    this.selectItem(this.filteredItems[targetIndex], targetIndex);
    if (shouldScroll) {
      this.scrollActiveRowIntoView();
    }
  }

  private getKeyboardNavigationIndex(delta: number): number {
    const currentIndex = this.getSelectedFilteredIndex();
    if (currentIndex === -1) {
      return delta < 0 ? this.filteredItems.length - 1 : 0;
    }
    return currentIndex + delta;
  }

  private getSelectedFilteredIndex(): number {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredItems.length) {
      const itemAtIndex = this.filteredItems[this.selectedIndex];
      if (itemAtIndex?.uuid === this.selectedItem?.uuid) {
        return this.selectedIndex;
      }
    }

    if (!this.selectedItem) {
      return -1;
    }

    return this.filteredItems.findIndex((item) => item.uuid === this.selectedItem?.uuid);
  }

  private scrollActiveRowIntoView() {
    setTimeout(() => {
      const row = this.tableScroll?.nativeElement.querySelector('tr.active') as HTMLElement | null;
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  }

  private syncSelectionAfterListMutation() {
    if (this.filteredItems.length === 0) {
      this.clearSelectedItem();
      return;
    }

    if (!this.selectedItem) {
      this.selectedIndex = -1;
      return;
    }

    const selectedIndex = this.filteredItems.findIndex(
      (item) => item.uuid === this.selectedItem?.uuid,
    );
    if (selectedIndex >= 0) {
      this.selectItem(this.filteredItems[selectedIndex], selectedIndex);
      return;
    }

    this.selectFilteredItemAt(0);
  }

  private clearSelectedItem() {
    if (!this.selectedItem && this.selectedIndex === -1) {
      return;
    }

    this.selectedItem = null;
    this.selectedIndex = -1;
    this.currentUnitMetadata = [];
    this.currentCodingScheme = null;
    this.currentCodingSchemeAsText = null;
    this.currentResponseData = null;
    this.hasResponseState = false;
    this.isFallbackState = false;
    this.previewUnavailableReason = '';
    this.selectedPreviewTargetId = '';
    this.customPreviewTargetDraft = '';
    this.syncPreviewTargetResolution(null);
    this.resetPlayer();
  }

  private focusGlobalFilter() {
    const input = this.globalFilterInput?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }

  private rememberFocusBeforeOverlay() {
    if (
      this.hasModalOverlay() ||
      typeof document === 'undefined' ||
      typeof HTMLElement === 'undefined'
    ) {
      return;
    }
    const activeElement = document.activeElement;
    this.overlayReturnFocus = activeElement instanceof HTMLElement ? activeElement : null;
  }

  private restoreFocusAfterOverlayClose() {
    if (this.hasModalOverlay()) {
      return;
    }

    const fallbackTarget =
      this.tableScroll?.nativeElement || this.globalFilterInput?.nativeElement || null;
    const target =
      this.overlayReturnFocus && this.overlayReturnFocus.isConnected
        ? this.overlayReturnFocus
        : fallbackTarget;
    this.overlayReturnFocus = null;

    if (!target) {
      return;
    }

    setTimeout(() => {
      target.focus({ preventScroll: true });
    }, 0);
  }

  private hasModalOverlay(): boolean {
    return (
      this.showOverlay === 'coding' ||
      this.showUploadReport ||
      this.showErrorDialog ||
      this.showColumnManager ||
      this.showSaveConfirmDialog ||
      this.showDeleteConfirmDialog ||
      this.showRawDataOverlay ||
      this.showHistoryOverlay ||
      this.showSavePreviewDialog ||
      this.showDiscardDraftDialog ||
      this.showClearEmpiricalDifficultiesDialog ||
      this.showLeaveWithChangesDialog
    );
  }

  private closeTopmostOverlay(): boolean {
    if (this.showLeaveWithChangesDialog) {
      this.stayOnPage();
      return true;
    }
    if (this.showClearEmpiricalDifficultiesDialog) {
      this.closeClearEmpiricalDifficultiesDialog();
      return true;
    }
    if (this.showDiscardDraftDialog) {
      this.closeDiscardDraftDialog();
      return true;
    }
    if (this.showSavePreviewDialog) {
      this.cancelSavePreviewDialog();
      return true;
    }
    if (this.showDeleteConfirmDialog) {
      this.closeDeleteConfirmDialog();
      return true;
    }
    if (this.showSaveConfirmDialog) {
      this.closeSaveConfirmDialog();
      return true;
    }
    if (this.showHistoryOverlay) {
      this.closeHistoryOverlay();
      return true;
    }
    if (this.showRawDataOverlay) {
      this.closeRawDataOverlay();
      return true;
    }
    if (this.showColumnManager) {
      this.closeColumnManager();
      return true;
    }
    if (this.showErrorDialog) {
      this.showErrorDialog = false;
      this.restoreFocusAfterOverlayClose();
      return true;
    }
    if (this.showUploadReport) {
      this.showUploadReport = false;
      this.restoreFocusAfterOverlayClose();
      return true;
    }
    if (this.showOverlay === 'coding') {
      this.closeCodingOverlay();
      return true;
    }
    if (this.showMetadataDrawer) {
      this.showMetadataDrawer = false;
      return true;
    }
    return false;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  private queueDraftPatch(
    changeType: string,
    patch: Record<string, unknown>,
    flushImmediately = false,
  ) {
    if (!this.canEditExplorer || this.suppressDraftPatch) {
      return;
    }

    this.pendingDraftPatch = this.mergeDraftPatches(this.pendingDraftPatch, patch);
    this.pendingDraftChangeType = changeType;
    this.explorerUiStatus = 'DIRTY';

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }

    if (flushImmediately) {
      void this.flushDraftPatch();
      return;
    }

    this.draftPatchTimeout = setTimeout(() => {
      this.draftPatchTimeout = null;
      void this.flushDraftPatch();
    }, this.draftPatchDebounceMs);
  }

  private mergeDraftPatches(
    current: Record<string, unknown> | null,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(current || {}) };
    for (const [key, value] of Object.entries(incoming || {})) {
      if (key === 'ui' && this.isRecord(value) && this.isRecord(merged['ui'])) {
        merged['ui'] = {
          ...merged['ui'],
          ...value,
        };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  private async flushDraftPatch(): Promise<boolean> {
    if (!this.canEditExplorer || !this.pendingDraftPatch) {
      return true;
    }

    if (this.draftPatchTimeout) {
      clearTimeout(this.draftPatchTimeout);
      this.draftPatchTimeout = null;
    }

    const patch = this.pendingDraftPatch;
    const changeType = this.pendingDraftChangeType;
    this.pendingDraftPatch = null;
    this.pendingDraftChangeType = 'UI_UPDATE';

    this.explorerUiStatus = 'SAVING';
    try {
      const envelope = await firstValueFrom(
        this.api.patchItemExplorerDraft(this.acpId, {
          changeType,
          patch: patch as ItemExplorerSharedState,
          baseVersion: this.explorerVersion,
        }),
      );
      this.applySharedExplorerEnvelope(envelope);
      return true;
    } catch (error: any) {
      console.error('Failed to patch draft', error);
      this.explorerUiStatus = 'ERROR';
      if (error?.status === 409) {
        this.lastDraftOperationError =
          'Konflikt beim Aktualisieren des Entwurfs. Der Explorer wurde neu geladen.';
        await this.loadSharedExplorerState();
        return false;
      }
      this.lastDraftOperationError = this.extractDraftErrorMessage(
        error,
        'Fehler beim Aktualisieren des Entwurfs.',
      );
      this.pendingDraftPatch = this.mergeDraftPatches(this.pendingDraftPatch, patch);
      this.pendingDraftChangeType = changeType;
      return false;
    }
  }

  private normalizeTags(rawTags: unknown): Record<string, string[]> {
    if (!this.isRecord(rawTags)) {
      return {};
    }

    const tags: Record<string, string[]> = {};
    for (const [itemId, values] of Object.entries(rawTags)) {
      const normalizedItemId = String(itemId || '').trim();
      if (!normalizedItemId || !Array.isArray(values)) continue;

      const normalizedValues = Array.from(
        new Set(
          values.map((value) => String(value || '').trim()).filter((value) => value.length > 0),
        ),
      );

      if (normalizedValues.length) {
        tags[normalizedItemId] = normalizedValues;
      }
    }

    return tags;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
