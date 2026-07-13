import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AccessModel, Credential } from '../../core/models/api.models';
import { AcpManagerContextComponent } from '../shared/acp-manager-context.component';

@Component({
  selector: 'app-access-config',
  standalone: true,
  imports: [FormsModule, AcpManagerContextComponent],
  template: `
    <app-acp-manager-context />

    <div class="page-header"><h1>Zugriffskonfiguration</h1></div>

    <!-- Access Model -->
    <div class="card">
      <h3>Zugriffsmodell</h3>
      <p class="help-text">
        Optionen 1 bis 3 schließen einander als Basismodell aus. Option 4 kann zusätzlich gewählt
        werden.
      </p>

      <div class="radio-group">
        <label class="radio-option" [class.active]="accessModel === 'PRIVATE'">
          <input
            type="radio"
            name="accessModel"
            value="PRIVATE"
            [(ngModel)]="accessModel"
            (ngModelChange)="onAccessModelChange()"
          />
          <div>
            <strong>1. Privat</strong>
            <span class="radio-desc"
              >Nur App-Admins und Personen mit zugewiesener ACP-Rolle haben Zugriff</span
            >
          </div>
        </label>
        <label class="radio-option" [class.active]="accessModel === 'PUBLIC'">
          <input
            type="radio"
            name="accessModel"
            value="PUBLIC"
            [(ngModel)]="accessModel"
            (ngModelChange)="onAccessModelChange()"
          />
          <div>
            <strong>2. Öffentlich (Public)</strong>
            <span class="radio-desc">Jede Person hat ohne Anmeldung Zugriff</span>
          </div>
        </label>
        <label class="radio-option" [class.active]="accessModel === 'CREDENTIALS_LIST'">
          <input
            type="radio"
            name="accessModel"
            value="CREDENTIALS_LIST"
            [(ngModel)]="accessModel"
            (ngModelChange)="onAccessModelChange()"
          />
          <div>
            <strong>3. Zugangsliste</strong>
            <span class="radio-desc"
              >Benutzername/Kennwort-Paare, zeitlich begrenzt (max. 3 Monate)</span
            >
          </div>
        </label>
      </div>

      <label class="feature-toggle" style="margin-top:12px">
        <input type="checkbox" [(ngModel)]="allowRegistered" />
        <span><strong>4. Registrierte Nutzer</strong> — zusätzlich zu oben</span>
      </label>

      @if (allowRegistered) {
        <div class="sub-section">
          <p class="help-text">
            Zusätzlich zu {{ getBaseAccessLabel() }} erhalten auch registrierte Nutzer mit einer
            zugewiesenen ACP-Rolle Zugriff.
          </p>
        </div>
      }

      @if (accessModel === 'PRIVATE' && !allowRegistered) {
        <div class="sub-section">
          <p class="help-text" style="margin-bottom: 0;">
            Neue ACPs starten standardmäßig in diesem Zustand. Das ACP erscheint nicht auf der
            Landing-Page und ist nicht anonym erreichbar.
          </p>
        </div>
      }

      <!-- Credentials section -->
      @if (accessModel === 'CREDENTIALS_LIST') {
        <div class="sub-section">
          <div class="form-row">
            <div class="form-group">
              <label>Gültig von</label>
              <input type="datetime-local" [(ngModel)]="validFrom" />
            </div>
            <div class="form-group">
              <label>Gültig bis (max. 3 Monate)</label>
              <input type="datetime-local" [(ngModel)]="validUntil" />
            </div>
          </div>
          @if (dateError) {
            <div class="alert alert-error">{{ dateError }}</div>
          }

          <!-- Manual add form -->
          <div
            class="manual-add-form"
            style="margin-top: 16px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius);"
          >
            <h4 style="margin: 0 0 12px 0; font-size: 0.95rem;">
              Einzelnes Zugangsdatum hinzufügen
            </h4>
            <div class="form-row">
              <div class="form-group">
                <label>Benutzername</label>
                <input
                  type="text"
                  [(ngModel)]="newUsername"
                  placeholder="Benutzername"
                  maxlength="50"
                />
              </div>
              <div class="form-group">
                <label>Kennwort</label>
                <input
                  type="password"
                  [(ngModel)]="newPassword"
                  placeholder="Kennwort"
                  minlength="12"
                />
              </div>
            </div>
            @if (addError) {
              <div class="alert alert-error" style="margin-top: 8px;">{{ addError }}</div>
            }
            <button
              class="btn btn-accent"
              style="margin-top: 8px;"
              (click)="addCredential()"
              [disabled]="
                !newUsername.trim() || !newPassword.trim() || !isStrongPassword(newPassword)
              "
            >
              Hinzufügen
            </button>
          </div>

          <!-- CSV Upload with mode selection -->
          <div
            style="margin-top: 16px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius);"
          >
            <h4 style="margin: 0 0 12px 0; font-size: 0.95rem;">CSV-Import</h4>
            <div class="form-group" style="margin-bottom: 12px;">
              <label>Import-Modus</label>
              <select
                [(ngModel)]="csvMode"
                style="width: 100%; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius);"
              >
                <option value="replace">Liste ersetzen (bestehende löschen)</option>
                <option value="append">Nur neue hinzufügen (Duplikate überspringen)</option>
                <option value="upsert">
                  Aktualisieren (bestehende Passwörter ändern, neue hinzufügen)
                </option>
              </select>
              <span class="help-text" style="margin-top: 4px;">
                {{
                  csvMode === 'replace'
                    ? 'Alle bestehenden Zugangsdaten werden gelöscht und durch die CSV ersetzt.'
                    : csvMode === 'append'
                      ? 'Nur neue Benutzernamen werden hinzugefügt. Bereits existierende werden übersprungen.'
                      : 'Bereits existierende Benutzernamen werden mit neuen Passwörtern aktualisiert. Neue werden hinzugefügt.'
                }}
              </span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
              <label class="btn btn-accent">
                CSV hochladen
                <input type="file" accept=".csv" (change)="previewCSV($event)" hidden />
              </label>
              <span class="help-text">Format: Benutzername, Kennwort pro Zeile</span>
            </div>
          </div>

          <!-- CSV Preview Modal -->
          @if (csvPreview) {
            <div
              class="csv-preview"
              style="margin-top: 16px; padding: 16px; background: var(--color-bg); border-radius: var(--radius); border: 1px solid var(--color-border);"
            >
              <h4 style="margin: 0 0 12px 0;">Vorschau: {{ csvPreview.filename }}</h4>
              <div
                style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; font-size: 0.9rem;"
              >
                <div
                  class="preview-stat"
                  style="text-align: center; padding: 8px; background: white; border-radius: var(--radius);"
                >
                  <div style="font-size: 1.5rem; font-weight: 600; color: var(--color-primary);">
                    {{ csvPreview.total }}
                  </div>
                  <div style="color: var(--color-text-secondary); font-size: 0.8rem;">
                    Gesamt in CSV
                  </div>
                </div>
                <div
                  class="preview-stat"
                  style="text-align: center; padding: 8px; background: rgba(46, 204, 113, 0.1); border-radius: var(--radius);"
                >
                  <div style="font-size: 1.5rem; font-weight: 600; color: var(--color-success);">
                    {{ csvPreview.toAdd }}
                  </div>
                  <div style="color: var(--color-text-secondary); font-size: 0.8rem;">
                    Neu hinzufügen
                  </div>
                </div>
                <div
                  class="preview-stat"
                  style="text-align: center; padding: 8px; background: rgba(241, 196, 15, 0.1); border-radius: var(--radius);"
                >
                  <div style="font-size: 1.5rem; font-weight: 600; color: #f39c12;">
                    {{ csvPreview.toUpdate }}
                  </div>
                  <div style="color: var(--color-text-secondary); font-size: 0.8rem;">
                    Aktualisieren
                  </div>
                </div>
                <div
                  class="preview-stat"
                  style="text-align: center; padding: 8px; background: rgba(149, 165, 166, 0.1); border-radius: var(--radius);"
                >
                  <div
                    style="font-size: 1.5rem; font-weight: 600; color: var(--color-text-secondary);"
                  >
                    {{ csvPreview.toSkip }}
                  </div>
                  <div style="color: var(--color-text-secondary); font-size: 0.8rem;">
                    Überspringen
                  </div>
                </div>
              </div>
              @if (csvPreview.duplicates.length > 0) {
                <div class="alert alert-warning" style="margin-bottom: 12px;">
                  <strong>Warnung:</strong> {{ csvPreview.duplicates.length }} Duplikate im CSV
                  gefunden: {{ csvPreview.duplicates.join(', ') }}
                </div>
              }
              @if (csvPreview.conflicts.length > 0) {
                <div class="alert alert-warning" style="margin-bottom: 12px;">
                  <strong>Bereits existierend:</strong> {{ csvPreview.conflicts.join(', ') }}
                </div>
              }
              <div style="display: flex; gap: 12px;">
                <button class="btn btn-primary" (click)="confirmCSVUpload()">Importieren</button>
                <button class="btn btn-outline" (click)="cancelCSVPreview()">Abbrechen</button>
              </div>
            </div>
          }

          @if (credentialCount > 0 || credentials.length > 0) {
            <div class="alert alert-success" style="margin-top:12px">
              {{ credentialCount || credentials.length }} Zugangsdaten vorhanden.
            </div>
          }

          <!-- Credentials list with edit -->
          @if (credentials.length > 0) {
            <div class="credentials-list" style="margin-top:16px">
              <table class="credentials-table">
                <thead>
                  <tr>
                    <th>Benutzername</th>
                    <th style="width: 120px">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  @for (cred of credentials; track cred.id) {
                    <tr>
                      <td>{{ cred.username }}</td>
                      <td>
                        <button
                          class="btn btn-outline btn-sm"
                          (click)="openEditDialog(cred)"
                          style="margin-right: 4px;"
                        >
                          Bearbeiten
                        </button>
                        <button class="btn btn-outline btn-sm" (click)="deleteCredential(cred.id)">
                          Löschen
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <button class="btn btn-primary" style="margin-top:16px" (click)="saveAccess()">
        Zugriffsmodell speichern
      </button>
      @if (accessSaved) {
        <span class="save-indicator">✓ Gespeichert</span>
      }
    </div>

    <!-- Feature Configuration -->
    <div class="card">
      <h3>Feature-Konfiguration</h3>
      <p class="help-text">Steuert, welche Funktionen im Nur-Lese-Zugriff verfügbar sind.</p>

      <!-- Downloads -->
      <div class="feature-section">
        <h4>⬇️ Downloads</h4>
        @for (feat of downloadFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]" />
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Unit View -->
      <div class="feature-section">
        <h4>📝 Aufgaben-Ansicht</h4>
        @for (feat of unitViewFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]" />
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Navigation -->
      <div class="feature-section">
        <h4>🧭 Navigation</h4>
        @for (feat of navFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]" />
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Commenting -->
      <div class="feature-section">
        <h4>💬 Kommentare</h4>
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig['enableCommenting']" />
          <span>Kommentare aktivieren</span>
        </label>
        @if (featureConfig['enableCommenting']) {
          <div class="indent-section">
            <label class="help-text">Kommentierbare Elemente:</label>
            <label class="feature-toggle">
              <input
                type="checkbox"
                [checked]="commentTargets.includes('UNIT')"
                (change)="toggleCommentTarget('UNIT')"
              />
              <span>Aufgaben (Units)</span>
            </label>
            <label class="feature-toggle">
              <input
                type="checkbox"
                [checked]="commentTargets.includes('ITEM')"
                (change)="toggleCommentTarget('ITEM')"
              />
              <span>Items</span>
            </label>
            <label class="feature-toggle">
              <input
                type="checkbox"
                [checked]="commentTargets.includes('TASK_SEQUENCE')"
                (change)="toggleCommentTarget('TASK_SEQUENCE')"
              />
              <span>Aufgabenfolgen</span>
            </label>
          </div>
        }
      </div>

      <!-- Item List -->
      <div class="feature-section">
        <h4>📊 Item-Liste</h4>
        @for (feat of itemFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]" />
            <span>{{ feat.label }}</span>
          </label>
        }
        <div class="indent-section">
          <label class="help-text" for="item-sub-id-label">Bezeichnung der Sub-ID-Spalte</label>
          <input
            id="item-sub-id-label"
            class="tag-input"
            type="text"
            [(ngModel)]="featureConfig[itemSubIdLabelKey]"
            placeholder="Sub-ID"
          />
          <span class="help-text">
            Die zweite Spalte einer Itemschwierigkeits-CSV wird als Sub-ID/Kategorie/Stufe
            verwendet.
          </span>
          <label class="help-text" style="margin-top: 10px;">Labels der Ausprägungen</label>
          <div class="tags-editor">
            @for (entry of itemSubIdLabelEntries; track $index) {
              <div class="tag-add">
                <input
                  class="tag-input"
                  type="text"
                  [(ngModel)]="entry.value"
                  placeholder="Wert, z. B. 1"
                />
                <input
                  class="tag-input"
                  type="text"
                  [(ngModel)]="entry.label"
                  placeholder="Label, z. B. teilweise richtig"
                />
                <button class="tag-remove" type="button" (click)="removeItemSubIdLabel($index)">
                  ✕
                </button>
              </div>
            }
            <button class="btn btn-outline btn-sm" type="button" (click)="addItemSubIdLabel()">
              + Ausprägung
            </button>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig[showAudioVideoCodingVariablesKey]" />
          <span>Kodierungsvariablen mit "audio"/"video" im Namen anzeigen</span>
        </label>
        <label class="feature-toggle">
          <input
            type="checkbox"
            [(ngModel)]="featureConfig[enableItemExplorerConditionalVisibilityKey]"
          />
          <span>Bedingte Sichtbarkeit im Item-Explorer-Player anwenden</span>
        </label>
        <label class="feature-toggle">
          <input
            type="checkbox"
            [(ngModel)]="featureConfig[showOnlyItemsWithEmpiricalDifficultyKey]"
          />
          <span>Im Item-Explorer nur Items mit Itemschwierigkeit anzeigen</span>
        </label>
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig[enablePlayerFocusHighlightKey]" />
          <span>Item im Player hervorheben (Explorer + Item-Ansicht)</span>
        </label>
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig[showItemExplorerPlayerTargetInfoKey]" />
          <span>
            Zusätzliche Player-Zuordnungsinfos im Item-Explorer anzeigen (für Manager/Admins)
          </span>
        </label>

        @if (featureConfig['enableItemListTags']) {
          <div class="indent-section">
            <label class="help-text">Verfügbare Tags:</label>
            <div class="tags-editor">
              @for (tag of availableTags; track $index) {
                <div class="tag-item">
                  <span class="badge badge-info">{{ tag }}</span>
                  <button class="tag-remove" (click)="removeTag($index)">✕</button>
                </div>
              }
              <div class="tag-add">
                <input
                  type="text"
                  [(ngModel)]="newTag"
                  placeholder="Neuer Tag..."
                  (keyup.enter)="addTag()"
                  class="tag-input"
                />
                <button
                  class="btn btn-outline btn-sm"
                  (click)="addTag()"
                  [disabled]="!newTag.trim()"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        }

        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig[enablePersonalItemDataKey]" />
          <span>Persönliche Arbeitsdaten im Item-Explorer aktivieren</span>
        </label>
        @if (featureConfig[enablePersonalItemDataKey]) {
          <div class="indent-section personal-data-config">
            <label class="help-text" for="personal-item-category-label">
              Bezeichnung der Kategorie
            </label>
            <input
              id="personal-item-category-label"
              class="tag-input"
              type="text"
              [(ngModel)]="featureConfig[personalItemCategoryLabelKey]"
              placeholder="Kompetenzstufe"
            />

            <label class="help-text" style="margin-top: 10px;">Mögliche Kategorien</label>
            <div class="tags-editor">
              @for (value of personalItemCategoryValues; track $index) {
                <div class="tag-add">
                  <input
                    class="tag-input"
                    type="text"
                    [(ngModel)]="personalItemCategoryValues[$index]"
                    placeholder="z. B. Stufe I"
                  />
                  <button
                    class="tag-remove"
                    type="button"
                    (click)="removePersonalItemCategoryValue($index)"
                  >
                    ✕
                  </button>
                </div>
              }
              <button
                class="btn btn-outline btn-sm"
                type="button"
                (click)="addPersonalItemCategoryValue()"
              >
                + Kategorie
              </button>
            </div>

            <label class="help-text" for="personal-item-tag-label" style="margin-top: 10px;">
              Bezeichnung der Markierungen
            </label>
            <input
              id="personal-item-tag-label"
              class="tag-input"
              type="text"
              [(ngModel)]="featureConfig[personalItemTagLabelKey]"
              placeholder="Markierungen"
            />

            <label class="help-text" style="margin-top: 10px;">Markierungen und Farben</label>
            <div class="tags-editor">
              @for (tag of personalItemTags; track $index) {
                <div class="tag-add personal-tag-config-row">
                  <input
                    class="tag-color-input"
                    type="color"
                    [(ngModel)]="tag.color"
                    [attr.aria-label]="'Farbe für ' + (tag.label || 'Markierung')"
                  />
                  <input
                    class="tag-input"
                    type="text"
                    [(ngModel)]="tag.label"
                    placeholder="z. B. Rückfrage"
                  />
                  <button class="tag-remove" type="button" (click)="removePersonalItemTag($index)">
                    ✕
                  </button>
                </div>
              }
              <button class="btn btn-outline btn-sm" type="button" (click)="addPersonalItemTag()">
                + Markierung
              </button>
            </div>
            <span class="help-text">
              Kategorien, Markierungen und Notizen sind immer persönlich und werden nicht im
              ACP-Entwurf veröffentlicht.
            </span>
          </div>
        }

        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig['persistUserPreferences']" />
          <span>Nutzer-Einstellungen speichern (nur bei Anmeldung)</span>
        </label>
      </div>

      <button class="btn btn-primary" style="margin-top:16px" (click)="saveFeatures()">
        Features speichern
      </button>
      @if (featuresSaved) {
        <span class="save-indicator">✓ Gespeichert</span>
      }
      <!-- Edit Dialog -->
      @if (editingCredential) {
        <div class="dialog-overlay" (click)="closeEditDialog()">
          <div class="dialog-content card" (click)="$event.stopPropagation()">
            <div class="dialog-header">
              <h3>Zugangsdatum bearbeiten</h3>
              <button class="btn btn-outline btn-sm" (click)="closeEditDialog()">✕</button>
            </div>
            <div class="dialog-body">
              <div class="form-group">
                <label>Benutzername</label>
                <input type="text" [(ngModel)]="editUsername" maxlength="50" />
              </div>
              <div class="form-group" style="margin-top: 12px;">
                <label>
                  <input type="checkbox" [(ngModel)]="editChangePassword" /> Kennwort ändern
                </label>
              </div>
              @if (editChangePassword) {
                <div class="form-group" style="margin-top: 8px;">
                  <label
                    >Neues Kennwort (mind. 12 Zeichen, Groß-/Kleinbuchstabe, Zahl,
                    Sonderzeichen)</label
                  >
                  <input
                    type="password"
                    [(ngModel)]="editPassword"
                    minlength="12"
                    placeholder="Neues Kennwort"
                  />
                </div>
              }
              @if (editError) {
                <div class="alert alert-error" style="margin-top: 12px;">{{ editError }}</div>
              }
            </div>
            <div
              class="dialog-footer"
              style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;"
            >
              <button class="btn btn-outline" (click)="closeEditDialog()">Abbrechen</button>
              <button
                class="btn btn-primary"
                (click)="saveEdit()"
                [disabled]="editChangePassword && !isStrongPassword(editPassword)"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .help-text {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        display: block;
        margin-bottom: 8px;
      }
      .radio-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 12px 0;
      }
      .radio-option {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 16px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        cursor: pointer;
        transition: all 0.15s;
      }
      .radio-option:hover {
        border-color: var(--color-primary-light);
      }
      .radio-option.active {
        border-color: var(--color-primary);
        background: rgba(26, 82, 118, 0.03);
      }
      .radio-option input {
        margin-top: 3px;
      }
      .radio-option strong {
        display: block;
        font-size: 0.95rem;
      }
      .radio-desc {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }
      .sub-section {
        margin-top: 16px;
        padding: 16px;
        background: var(--color-bg);
        border-radius: var(--radius);
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .feature-section {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
      }
      .feature-section:first-of-type {
        border-top: none;
      }
      .feature-section h4 {
        font-size: 0.95rem;
        margin-bottom: 8px;
      }
      .feature-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        cursor: pointer;
        font-size: 0.9rem;
      }
      .feature-toggle input[type='checkbox'] {
        width: 18px;
        height: 18px;
        accent-color: var(--color-primary);
      }

      .indent-section {
        margin-left: 26px;
        padding: 8px 0;
      }
      .tags-editor {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin: 8px 0;
      }
      .personal-data-config {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      .personal-data-config > .tag-input,
      .personal-data-config > .tags-editor {
        width: 100%;
      }
      .personal-tag-config-row {
        align-items: center;
      }
      .tag-color-input {
        width: 42px;
        height: 32px;
        padding: 2px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        background: var(--color-surface);
      }
      .tag-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .tag-remove {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.7rem;
        color: var(--color-text-secondary);
        padding: 2px;
      }
      .tag-remove:hover {
        color: var(--color-danger);
      }
      .tag-add {
        display: flex;
        gap: 4px;
      }
      .tag-input {
        width: 120px;
        padding: 4px 8px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.85rem;
      }

      .save-indicator {
        margin-left: 12px;
        color: var(--color-success);
        font-size: 0.85rem;
        font-weight: 500;
      }
      .credentials-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      .credentials-table th,
      .credentials-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      .credentials-table th {
        font-weight: 600;
        color: var(--color-text-secondary);
        font-size: 0.85rem;
      }
      .credentials-table tr:hover {
        background: rgba(0, 0, 0, 0.02);
      }
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 24px;
      }
      .dialog-content {
        max-width: 400px;
        width: 100%;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .dialog-header h3 {
        margin: 0;
      }
    `,
  ],
})
export class AccessConfigComponent implements OnInit {
  private readonly strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
  private readonly strongPasswordHint =
    'Kennwort muss mindestens 12 Zeichen lang sein und Groß-/Kleinbuchstaben, Zahl und Sonderzeichen enthalten.';
  readonly showAudioVideoCodingVariablesKey = 'showAudioVideoCodingVariables';
  readonly enableItemExplorerConditionalVisibilityKey = 'enableItemExplorerConditionalVisibility';
  readonly showOnlyItemsWithEmpiricalDifficultyKey = 'showOnlyItemsWithEmpiricalDifficulty';
  readonly enablePlayerFocusHighlightKey = 'enablePlayerFocusHighlight';
  readonly showItemExplorerPlayerTargetInfoKey = 'showItemExplorerPlayerTargetInfo';
  readonly itemSubIdLabelKey = 'itemSubIdLabel';
  readonly itemSubIdLabelsKey = 'itemSubIdLabels';
  readonly enablePersonalItemDataKey = 'enablePersonalItemData';
  readonly personalItemCategoryLabelKey = 'personalItemCategoryLabel';
  readonly personalItemCategoryValuesKey = 'personalItemCategoryValues';
  readonly personalItemTagLabelKey = 'personalItemTagLabel';
  readonly personalItemTagsKey = 'personalItemTags';

  acpId = '';
  accessModel: AccessModel = 'PRIVATE';
  allowRegistered = false;
  validFrom = '';
  validUntil = '';
  private readonly DATETIME_LOCAL_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  credentialCount = 0;
  dateError = '';
  featureConfig: Record<string, any> = {};
  commentTargets: string[] = [];
  availableTags: string[] = [];
  newTag = '';
  itemSubIdLabelEntries: Array<{ value: string; label: string }> = [];
  personalItemCategoryValues: string[] = [];
  personalItemTags: Array<{ label: string; color: string }> = [];
  accessSaved = false;
  featuresSaved = false;
  credentials: Credential[] = [];

  // Manual add form
  newUsername = '';
  newPassword = '';
  addError = '';

  // CSV upload
  csvMode: 'replace' | 'append' | 'upsert' = 'replace';
  csvPreview: {
    filename: string;
    total: number;
    toAdd: number;
    toUpdate: number;
    toSkip: number;
    duplicates: string[];
    conflicts: string[];
    credentials: any[];
  } | null = null;
  pendingCSVUpload: any[] = [];

  // Edit dialog
  editingCredential: Credential | null = null;
  editUsername = '';
  editChangePassword = false;
  editPassword = '';
  editError = '';

  downloadFlags = [
    { key: 'allowIndexDownload', label: 'ACP-Index Download erlauben' },
    { key: 'allowUnitDownload', label: 'Unit-Download erlauben (ZIP)' },
    { key: 'allowFileDownload', label: 'Andere Dateien Download erlauben' },
  ];

  unitViewFlags = [
    { key: 'enableUnitView', label: 'Unit-Ansicht (Verona Player) aktivieren' },
    { key: 'showMetadata', label: 'Metadaten anzeigen' },
    { key: 'showRichText', label: 'RichText-Inhalte anzeigen' },
    { key: 'showCodingScheme', label: 'Kodierschema anzeigen' },
  ];

  navFlags = [
    { key: 'enableUnitListNavigation', label: 'Navigation über Unit-Liste' },
    { key: 'enableSequenceNavigation', label: 'Aufgabenfolgen aus Testheften generieren' },
  ];

  itemFlags = [
    { key: 'enableItemList', label: 'Item-Liste aktivieren' },
    { key: 'enableItemClick', label: 'Item-Klick → Navigation zur Aufgabe' },
    { key: 'enableItemListFilter', label: 'Item-Liste filtern erlauben' },
    { key: 'enableItemListSort', label: 'Item-Liste sortieren erlauben' },
    { key: 'enableItemListTags', label: 'Item-Tagging erlauben' },
  ];

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.loadConfig();
    this.loadCredentials();
  }

  private toDateTimeLocalString(isoDateString: string | undefined): string {
    if (!isoDateString) return '';
    // Parse the UTC date from backend and convert to local datetime-local format
    const utcDate = new Date(isoDateString);
    if (isNaN(utcDate.getTime())) return '';
    console.log('Loading date from backend:', { isoDateString, utcDate: utcDate.toString() });

    // Convert UTC to local time components
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');

    const result = `${year}-${month}-${day}T${hours}:${minutes}`;
    console.log('Converted to local:', { result });
    return result;
  }

  private getNowDateTimeLocal(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private dateTimeLocalToIso(dateTimeLocal: string): string {
    // Parse datetime-local format (YYYY-MM-DDTHH:mm) as local time and convert to UTC
    const [datePart, timePart] = dateTimeLocal.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);

    // Create date in local time (months are 0-indexed in JS)
    const localDate = new Date(year, month - 1, day, hours, minutes);

    // Convert to UTC ISO string
    const result = localDate.toISOString();
    console.log('Saving date:', { input: dateTimeLocal, localDate: localDate.toString(), result });
    return result;
  }

  loadConfig() {
    this.api.getAccessConfig(this.acpId).subscribe({
      next: (config) => {
        this.accessModel = config.accessModel;
        this.allowRegistered = config.allowRegistered || false;
        this.featureConfig = config.featureConfig || {};
        this.applyFeatureConfigDefaults();
        this.validFrom = this.toDateTimeLocalString(config.validFrom);
        this.validUntil = this.toDateTimeLocalString(config.validUntil);
        this.commentTargets = (this.featureConfig['commentTargets'] as string[]) || [];
        this.availableTags = (this.featureConfig['availableTags'] as string[]) || [];
        this.itemSubIdLabelEntries = Object.entries(
          (this.featureConfig[this.itemSubIdLabelsKey] as Record<string, string>) || {},
        ).map(([value, label]) => ({ value, label }));
        this.personalItemCategoryValues = Array.isArray(
          this.featureConfig[this.personalItemCategoryValuesKey],
        )
          ? [...this.featureConfig[this.personalItemCategoryValuesKey]]
          : [];
        this.personalItemTags = Array.isArray(this.featureConfig[this.personalItemTagsKey])
          ? this.featureConfig[this.personalItemTagsKey].map((tag: any) => ({
              label: String(tag?.label || ''),
              color: /^#[0-9a-f]{6}$/i.test(String(tag?.color || ''))
                ? String(tag.color)
                : '#3498db',
            }))
          : [];
      },
    });
  }

  loadCredentials() {
    this.api.getCredentials(this.acpId).subscribe({
      next: (creds) => {
        this.credentials = creds;
      },
      error: () => {
        this.credentials = [];
      },
    });
  }

  onAccessModelChange() {
    // Enforce mutual exclusion between the three base access models.
    this.dateError = '';
    // Auto-fill validFrom with current time when switching to CREDENTIALS_LIST
    if (this.accessModel === 'CREDENTIALS_LIST' && !this.validFrom) {
      this.validFrom = this.getNowDateTimeLocal();
    }
  }

  getBaseAccessLabel(): string {
    if (this.accessModel === 'PUBLIC') return 'der öffentlichen Freigabe';
    if (this.accessModel === 'CREDENTIALS_LIST') return 'der Zugangsliste';
    return 'dem privaten Zugriff';
  }

  validateDates(): boolean {
    if (this.accessModel !== 'CREDENTIALS_LIST') return true;
    if (!this.validFrom || !this.validUntil) {
      this.dateError = 'Start- und Enddatum sind erforderlich.';
      return false;
    }
    const from = new Date(this.validFrom);
    const until = new Date(this.validUntil);
    const now = new Date();
    // Allow starting from now (not strictly future)
    const nowMinusOneMinute = new Date(now.getTime() - 60000);
    if (from < nowMinusOneMinute) {
      this.dateError = 'Startdatum darf nicht in der Vergangenheit liegen.';
      return false;
    }
    const maxEnd = new Date(from);
    maxEnd.setMonth(maxEnd.getMonth() + 3);
    if (until > maxEnd) {
      this.dateError = 'Maximaler Zeitraum: 3 Monate.';
      return false;
    }
    if (until <= from) {
      this.dateError = 'Enddatum muss nach dem Startdatum liegen.';
      return false;
    }
    this.dateError = '';
    return true;
  }

  saveAccess() {
    if (!this.validateDates()) return;
    const data: any = {
      accessModel: this.accessModel,
      allowRegistered: this.allowRegistered,
    };
    if (this.accessModel === 'CREDENTIALS_LIST') {
      data.validFrom = this.dateTimeLocalToIso(this.validFrom);
      data.validUntil = this.dateTimeLocalToIso(this.validUntil);
    }
    this.api.updateAccessConfig(this.acpId, data).subscribe({
      next: () => {
        this.accessSaved = true;
        setTimeout(() => (this.accessSaved = false), 3000);
      },
    });
  }

  saveFeatures() {
    this.applyFeatureConfigDefaults();
    this.featureConfig[this.itemSubIdLabelsKey] = Object.fromEntries(
      this.itemSubIdLabelEntries
        .map((entry) => ({ value: entry.value.trim(), label: entry.label.trim() }))
        .filter((entry) => entry.value && entry.label)
        .map((entry) => [entry.value, entry.label]),
    );
    this.featureConfig[this.personalItemCategoryValuesKey] = Array.from(
      new Set(this.personalItemCategoryValues.map((value) => value.trim()).filter(Boolean)),
    );
    this.featureConfig[this.personalItemTagsKey] = this.personalItemTags
      .map((tag) => ({ label: tag.label.trim(), color: tag.color }))
      .filter((tag) => tag.label);
    this.featureConfig['commentTargets'] = this.commentTargets;
    this.featureConfig['availableTags'] = this.availableTags;
    const data: any = {
      accessModel: this.accessModel,
      allowRegistered: this.allowRegistered,
      featureConfig: this.featureConfig,
    };
    if (this.accessModel === 'CREDENTIALS_LIST' && this.validFrom && this.validUntil) {
      data.validFrom = this.dateTimeLocalToIso(this.validFrom);
      data.validUntil = this.dateTimeLocalToIso(this.validUntil);
    }
    this.api.updateAccessConfig(this.acpId, data).subscribe({
      next: () => {
        this.featuresSaved = true;
        setTimeout(() => (this.featuresSaved = false), 3000);
      },
    });
  }

  private applyFeatureConfigDefaults() {
    const itemSubIdLabel = String(this.featureConfig[this.itemSubIdLabelKey] || '').trim();
    this.featureConfig[this.itemSubIdLabelKey] = itemSubIdLabel || 'Sub-ID';
    this.featureConfig[this.enablePersonalItemDataKey] =
      this.featureConfig[this.enablePersonalItemDataKey] === true;
    const personalCategoryLabel = String(
      this.featureConfig[this.personalItemCategoryLabelKey] || '',
    ).trim();
    this.featureConfig[this.personalItemCategoryLabelKey] =
      personalCategoryLabel || 'Kompetenzstufe';
    const personalTagLabel = String(this.featureConfig[this.personalItemTagLabelKey] || '').trim();
    this.featureConfig[this.personalItemTagLabelKey] = personalTagLabel || 'Markierungen';

    const showAudioVideoCodingVariables = this.featureConfig[this.showAudioVideoCodingVariablesKey];
    this.featureConfig[this.showAudioVideoCodingVariablesKey] =
      showAudioVideoCodingVariables !== false;

    const enablePlayerFocusHighlight = this.featureConfig[this.enablePlayerFocusHighlightKey];
    this.featureConfig[this.enablePlayerFocusHighlightKey] = enablePlayerFocusHighlight === true;

    const showItemExplorerPlayerTargetInfo =
      this.featureConfig[this.showItemExplorerPlayerTargetInfoKey];
    this.featureConfig[this.showItemExplorerPlayerTargetInfoKey] =
      showItemExplorerPlayerTargetInfo !== false;
  }

  toggleCommentTarget(target: string) {
    const idx = this.commentTargets.indexOf(target);
    if (idx >= 0) {
      this.commentTargets.splice(idx, 1);
    } else {
      this.commentTargets.push(target);
    }
  }

  addPersonalItemCategoryValue() {
    this.personalItemCategoryValues.push('');
  }

  removePersonalItemCategoryValue(index: number) {
    this.personalItemCategoryValues.splice(index, 1);
  }

  addPersonalItemTag() {
    this.personalItemTags.push({ label: '', color: '#3498db' });
  }

  removePersonalItemTag(index: number) {
    this.personalItemTags.splice(index, 1);
  }

  addTag() {
    const tag = this.newTag.trim();
    if (tag && !this.availableTags.includes(tag)) {
      this.availableTags.push(tag);
      this.newTag = '';
    }
  }

  removeTag(index: number) {
    this.availableTags.splice(index, 1);
  }

  addItemSubIdLabel() {
    this.itemSubIdLabelEntries.push({ value: '', label: '' });
  }

  removeItemSubIdLabel(index: number) {
    this.itemSubIdLabelEntries.splice(index, 1);
  }

  // Manual credential management
  addCredential() {
    this.addError = '';
    const username = this.newUsername.trim();
    const password = this.newPassword.trim();

    if (!username || !password) {
      this.addError = 'Benutzername und Kennwort sind erforderlich.';
      return;
    }
    if (!this.isStrongPassword(password)) {
      this.addError = this.strongPasswordHint;
      return;
    }
    if (this.credentials.some((c) => c.username === username)) {
      this.addError = 'Benutzername existiert bereits.';
      return;
    }

    this.api.createCredential(this.acpId, username, password).subscribe({
      next: (cred) => {
        this.credentials.push(cred);
        this.newUsername = '';
        this.newPassword = '';
        this.credentialCount = this.credentials.length;
      },
      error: (err) => {
        this.addError = err.error?.message || 'Fehler beim Hinzufügen.';
      },
    });
  }

  // CSV Upload with preview
  previewCSV(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const lines = (reader.result as string).split('\n').filter((l) => l.trim());
      const parsed = lines
        .map((line) => {
          const [username, password] = line.split(',').map((s) => s.trim());
          return { username, password };
        })
        .filter((c) => c.username && c.password);

      // Check for duplicates within CSV
      const seenInCSV = new Set<string>();
      const duplicates: string[] = [];
      for (const cred of parsed) {
        if (seenInCSV.has(cred.username)) {
          if (!duplicates.includes(cred.username)) {
            duplicates.push(cred.username);
          }
        } else {
          seenInCSV.add(cred.username);
        }
      }

      // Calculate what will happen based on mode
      let toAdd = 0;
      let toUpdate = 0;
      let toSkip = 0;
      const conflicts: string[] = [];

      for (const cred of parsed) {
        if (duplicates.includes(cred.username)) continue;

        const existing = this.credentials.find((c) => c.username === cred.username);

        if (this.csvMode === 'replace') {
          toAdd++;
        } else if (this.csvMode === 'append') {
          if (existing) {
            toSkip++;
            conflicts.push(cred.username);
          } else {
            toAdd++;
          }
        } else if (this.csvMode === 'upsert') {
          if (existing) {
            toUpdate++;
            conflicts.push(cred.username);
          } else {
            toAdd++;
          }
        }
      }

      this.csvPreview = {
        filename: file.name,
        total: parsed.length,
        toAdd,
        toUpdate,
        toSkip,
        duplicates,
        conflicts: [...new Set(conflicts)],
        credentials: parsed,
      };
      this.pendingCSVUpload = parsed;
    };
    reader.readAsText(file);
    // Reset file input
    (event.target as HTMLInputElement).value = '';
  }

  cancelCSVPreview() {
    this.csvPreview = null;
    this.pendingCSVUpload = [];
  }

  confirmCSVUpload() {
    if (!this.csvPreview || this.pendingCSVUpload.length === 0) return;

    const validCreds = this.pendingCSVUpload.filter(
      (c) => !this.csvPreview!.duplicates.includes(c.username),
    );

    this.api.uploadCredentials(this.acpId, validCreds, this.csvMode).subscribe({
      next: (res: any) => {
        this.csvPreview = null;
        this.pendingCSVUpload = [];
        this.credentialCount =
          res.added +
          this.credentials.length -
          (this.csvMode === 'replace' ? this.credentials.length : 0);
        this.loadCredentials();

        // Show success message
        const msg = `Importiert: ${res.added} hinzugefügt${res.updated > 0 ? ', ' + res.updated + ' aktualisiert' : ''}${res.skipped > 0 ? ', ' + res.skipped + ' übersprungen' : ''}`;
        alert(msg);
      },
      error: (err) => {
        alert('Fehler beim Import: ' + (err.error?.message || 'Unbekannter Fehler'));
      },
    });
  }

  // Edit dialog
  openEditDialog(cred: Credential) {
    this.editingCredential = cred;
    this.editUsername = cred.username;
    this.editChangePassword = false;
    this.editPassword = '';
    this.editError = '';
  }

  closeEditDialog() {
    this.editingCredential = null;
    this.editUsername = '';
    this.editChangePassword = false;
    this.editPassword = '';
    this.editError = '';
  }

  saveEdit() {
    if (!this.editingCredential) return;

    this.editError = '';
    const username = this.editUsername.trim();

    if (!username) {
      this.editError = 'Benutzername ist erforderlich.';
      return;
    }

    // Check for duplicate username (if changed)
    if (username !== this.editingCredential.username) {
      if (
        this.credentials.some((c) => c.username === username && c.id !== this.editingCredential!.id)
      ) {
        this.editError = 'Benutzername existiert bereits.';
        return;
      }
    }

    const data: { username?: string; password?: string } = {};
    if (username !== this.editingCredential.username) {
      data.username = username;
    }
    if (this.editChangePassword) {
      if (!this.isStrongPassword(this.editPassword)) {
        this.editError = this.strongPasswordHint;
        return;
      }
      data.password = this.editPassword;
    }

    if (Object.keys(data).length === 0) {
      this.closeEditDialog();
      return;
    }

    this.api.updateCredential(this.acpId, this.editingCredential.id, data).subscribe({
      next: (updated) => {
        const idx = this.credentials.findIndex((c) => c.id === updated.id);
        if (idx >= 0) {
          this.credentials[idx] = updated;
        }
        this.closeEditDialog();
      },
      error: (err) => {
        this.editError = err.error?.message || 'Fehler beim Speichern.';
      },
    });
  }

  // Legacy method - kept for backwards compatibility but not used
  uploadCSV(event: Event) {
    // This method is replaced by previewCSV + confirmCSVUpload flow
    this.previewCSV(event);
  }

  deleteCredential(credentialId: string) {
    if (!confirm('Soll dieses Zugangsdatum wirklich gelöscht werden?')) return;
    this.api.deleteCredential(this.acpId, credentialId).subscribe({
      next: () => {
        this.credentials = this.credentials.filter((c) => c.id !== credentialId);
      },
      error: () => {
        alert('Fehler beim Löschen des Zugangsdatums');
      },
    });
  }

  isStrongPassword(password: string): boolean {
    return this.strongPasswordRegex.test(password || '');
  }
}
