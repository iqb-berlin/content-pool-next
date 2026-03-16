import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AccessConfig, FeatureConfig } from '../../core/models/api.models';

@Component({
  selector: 'app-access-config',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-header"><h1>Zugriffskonfiguration</h1></div>

    <!-- Access Model -->
    <div class="card">
      <h3>Zugriffsmodell</h3>
      <p class="help-text">Optionen 1 und 3 schließen einander aus. Option 2 kann zusätzlich gewählt werden.</p>

      <div class="radio-group">
        <label class="radio-option" [class.active]="accessModel === 'PUBLIC'">
          <input type="radio" name="accessModel" value="PUBLIC" [(ngModel)]="accessModel" (ngModelChange)="onAccessModelChange()">
          <div>
            <strong>1. Öffentlich (Public)</strong>
            <span class="radio-desc">Jede Person hat ohne Anmeldung Zugriff</span>
          </div>
        </label>
        <label class="radio-option" [class.active]="accessModel === 'CREDENTIALS_LIST'">
          <input type="radio" name="accessModel" value="CREDENTIALS_LIST" [(ngModel)]="accessModel" (ngModelChange)="onAccessModelChange()">
          <div>
            <strong>3. Zugangsliste</strong>
            <span class="radio-desc">Benutzername/Kennwort-Paare, zeitlich begrenzt (max. 3 Monate)</span>
          </div>
        </label>
      </div>

      <label class="feature-toggle" style="margin-top:12px">
        <input type="checkbox" [(ngModel)]="allowRegistered">
        <span><strong>2. Registrierte Nutzer</strong> — zusätzlich zu oben</span>
      </label>

      @if (allowRegistered) {
        <div class="sub-section">
          <p class="help-text">Nur Nutzer mit einer zugewiesenen Rolle (Gast, Reviewer, Manager) können auf dieses ACP zugreifen.</p>
        </div>
      }

      <!-- Credentials section -->
      @if (accessModel === 'CREDENTIALS_LIST') {
        <div class="sub-section">
          <div class="form-row">
            <div class="form-group">
              <label>Gültig von</label>
              <input type="datetime-local" [(ngModel)]="validFrom">
            </div>
            <div class="form-group">
              <label>Gültig bis (max. 3 Monate)</label>
              <input type="datetime-local" [(ngModel)]="validUntil">
            </div>
          </div>
          @if (dateError) {
            <div class="alert alert-error">{{ dateError }}</div>
          }
          <div style="margin-top: 12px">
            <label class="btn btn-accent">
              CSV hochladen
              <input type="file" accept=".csv" (change)="uploadCSV($event)" hidden>
            </label>
            <span class="help-text" style="margin-left:12px">CSV: Benutzername, Kennwort pro Zeile</span>
          </div>
          @if (credentialCount > 0) {
            <div class="alert alert-success" style="margin-top:12px">{{ credentialCount }} Zugangsdaten hochgeladen.</div>
          }
        </div>
      }

      <button class="btn btn-primary" style="margin-top:16px" (click)="saveAccess()">Zugriffsmodell speichern</button>
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
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]">
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Unit View -->
      <div class="feature-section">
        <h4>📝 Aufgaben-Ansicht</h4>
        @for (feat of unitViewFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]">
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Navigation -->
      <div class="feature-section">
        <h4>🧭 Navigation</h4>
        @for (feat of navFlags; track feat.key) {
          <label class="feature-toggle">
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]">
            <span>{{ feat.label }}</span>
          </label>
        }
      </div>

      <!-- Commenting -->
      <div class="feature-section">
        <h4>💬 Kommentare</h4>
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig['enableCommenting']">
          <span>Kommentare aktivieren</span>
        </label>
        @if (featureConfig['enableCommenting']) {
          <div class="indent-section">
            <label class="help-text">Kommentierbare Elemente:</label>
            <label class="feature-toggle">
              <input type="checkbox" [checked]="commentTargets.includes('UNIT')" (change)="toggleCommentTarget('UNIT')">
              <span>Aufgaben (Units)</span>
            </label>
            <label class="feature-toggle">
              <input type="checkbox" [checked]="commentTargets.includes('ITEM')" (change)="toggleCommentTarget('ITEM')">
              <span>Items</span>
            </label>
            <label class="feature-toggle">
              <input type="checkbox" [checked]="commentTargets.includes('TASK_SEQUENCE')" (change)="toggleCommentTarget('TASK_SEQUENCE')">
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
            <input type="checkbox" [(ngModel)]="featureConfig[feat.key]">
            <span>{{ feat.label }}</span>
          </label>
        }

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
                <input type="text" [(ngModel)]="newTag" placeholder="Neuer Tag..." (keyup.enter)="addTag()" class="tag-input">
                <button class="btn btn-outline btn-sm" (click)="addTag()" [disabled]="!newTag.trim()">+</button>
              </div>
            </div>
          </div>
        }

        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig['persistUserPreferences']">
          <span>Nutzer-Einstellungen speichern (nur bei Anmeldung)</span>
        </label>
      </div>

      <button class="btn btn-primary" style="margin-top:16px" (click)="saveFeatures()">Features speichern</button>
      @if (featuresSaved) {
        <span class="save-indicator">✓ Gespeichert</span>
      }
    </div>
  `,
  styles: [`
    .help-text { color: var(--color-text-secondary); font-size: 0.85rem; display: block; margin-bottom: 8px; }
    .radio-group { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
    .radio-option {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 16px; border: 1px solid var(--color-border);
      border-radius: var(--radius); cursor: pointer; transition: all 0.15s;
    }
    .radio-option:hover { border-color: var(--color-primary-light); }
    .radio-option.active { border-color: var(--color-primary); background: rgba(26,82,118,0.03); }
    .radio-option input { margin-top: 3px; }
    .radio-option strong { display: block; font-size: 0.95rem; }
    .radio-desc { font-size: 0.8rem; color: var(--color-text-secondary); }
    .sub-section { margin-top: 16px; padding: 16px; background: var(--color-bg); border-radius: var(--radius); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    .feature-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--color-border); }
    .feature-section:first-of-type { border-top: none; }
    .feature-section h4 { font-size: 0.95rem; margin-bottom: 8px; }
    .feature-toggle {
      display: flex; align-items: center; gap: 8px; padding: 5px 0;
      cursor: pointer; font-size: 0.9rem;
    }
    .feature-toggle input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--color-primary); }

    .indent-section { margin-left: 26px; padding: 8px 0; }
    .tags-editor { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
    .tag-item { display: flex; align-items: center; gap: 4px; }
    .tag-remove {
      background: none; border: none; cursor: pointer; font-size: 0.7rem;
      color: var(--color-text-secondary); padding: 2px;
    }
    .tag-remove:hover { color: var(--color-danger); }
    .tag-add { display: flex; gap: 4px; }
    .tag-input { width: 120px; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.85rem; }

    .save-indicator { margin-left: 12px; color: var(--color-success); font-size: 0.85rem; font-weight: 500; }
  `]
})
export class AccessConfigComponent implements OnInit {
  acpId = '';
  accessModel = 'PUBLIC';
  allowRegistered = false;
  validFrom = '';
  validUntil = '';
  credentialCount = 0;
  dateError = '';
  featureConfig: Record<string, any> = {};
  commentTargets: string[] = [];
  availableTags: string[] = [];
  newTag = '';
  accessSaved = false;
  featuresSaved = false;

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

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.api.getAccessConfig(this.acpId).subscribe({
      next: config => {
        if (config) {
          this.accessModel = config.accessModel;
          this.allowRegistered = config.allowRegistered || false;
          this.featureConfig = config.featureConfig || {};
          this.validFrom = config.validFrom || '';
          this.validUntil = config.validUntil || '';
          this.commentTargets = (this.featureConfig['commentTargets'] as string[]) || [];
          this.availableTags = (this.featureConfig['availableTags'] as string[]) || [];
        }
      }
    });
  }

  onAccessModelChange() {
    // Enforce mutual exclusion: PUBLIC and CREDENTIALS_LIST cannot coexist
    this.dateError = '';
  }

  validateDates(): boolean {
    if (this.accessModel !== 'CREDENTIALS_LIST') return true;
    if (!this.validFrom || !this.validUntil) {
      this.dateError = 'Start- und Enddatum sind erforderlich.';
      return false;
    }
    const from = new Date(this.validFrom);
    const until = new Date(this.validUntil);
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
      allowRegistered: this.allowRegistered
    };
    if (this.accessModel === 'CREDENTIALS_LIST') {
      data.validFrom = this.validFrom;
      data.validUntil = this.validUntil;
    }
    this.api.updateAccessConfig(this.acpId, data).subscribe({
      next: () => {
        this.accessSaved = true;
        setTimeout(() => this.accessSaved = false, 3000);
      }
    });
  }

  saveFeatures() {
    this.featureConfig['commentTargets'] = this.commentTargets;
    this.featureConfig['availableTags'] = this.availableTags;
    this.api.updateAccessConfig(this.acpId, {
      accessModel: this.accessModel,
      allowRegistered: this.allowRegistered,
      featureConfig: this.featureConfig
    }).subscribe({
      next: () => {
        this.featuresSaved = true;
        setTimeout(() => this.featuresSaved = false, 3000);
      }
    });
  }

  toggleCommentTarget(target: string) {
    const idx = this.commentTargets.indexOf(target);
    if (idx >= 0) {
      this.commentTargets.splice(idx, 1);
    } else {
      this.commentTargets.push(target);
    }
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

  uploadCSV(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = (reader.result as string).split('\n').filter(l => l.trim());
      const credentials = lines.map(line => {
        const [username, password] = line.split(',').map(s => s.trim());
        return { username, password };
      }).filter(c => c.username && c.password);
      this.api.uploadCredentials(this.acpId, credentials).subscribe({
        next: (res: any) => this.credentialCount = res.message ? credentials.length : 0
      });
    };
    reader.readAsText(file);
  }
}
