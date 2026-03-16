import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AccessConfig } from '../../core/models/api.models';

@Component({
  selector: 'app-access-config',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-header"><h1>Zugriffskonfiguration</h1></div>

    <div class="card">
      <h3>Zugriffsmodell</h3>
      <div class="form-group">
        <label>Modell</label>
        <select [(ngModel)]="accessModel">
          <option value="PUBLIC">Öffentlich</option>
          <option value="REGISTERED">Registrierte Nutzer</option>
          <option value="CREDENTIALS_LIST">Zugangsliste</option>
        </select>
      </div>
      @if (accessModel === 'CREDENTIALS_LIST') {
        <div class="form-group">
          <label>Gültig von</label>
          <input type="datetime-local" [(ngModel)]="validFrom">
        </div>
        <div class="form-group">
          <label>Gültig bis (max. 3 Monate)</label>
          <input type="datetime-local" [(ngModel)]="validUntil">
        </div>
      }
      <button class="btn btn-primary" (click)="saveAccess()">Speichern</button>
    </div>

    @if (accessModel === 'CREDENTIALS_LIST') {
      <div class="card">
        <h3>Zugangsdaten hochladen</h3>
        <p style="color:var(--color-text-secondary);font-size:0.85rem;margin-bottom:12px">
          CSV-Datei mit Spalten: Benutzername, Kennwort
        </p>
        <label class="btn btn-accent">
          CSV hochladen
          <input type="file" accept=".csv" (change)="uploadCSV($event)" hidden>
        </label>
        @if (credentialCount > 0) {
          <div class="alert alert-success" style="margin-top:12px">{{ credentialCount }} Zugangsdaten hochgeladen.</div>
        }
      </div>
    }

    <div class="card">
      <h3>Feature-Konfiguration</h3>
      @for (feat of featureFlags; track feat.key) {
        <label class="feature-toggle">
          <input type="checkbox" [(ngModel)]="featureConfig[feat.key]">
          <span>{{ feat.label }}</span>
        </label>
      }
      <button class="btn btn-primary" style="margin-top:16px" (click)="saveFeatures()">Features speichern</button>
    </div>
  `,
  styles: [`
    .feature-toggle {
      display: flex; align-items: center; gap: 8px; padding: 6px 0;
      cursor: pointer; font-size: 0.9rem;
    }
    .feature-toggle input { width: 18px; height: 18px; }
  `]
})
export class AccessConfigComponent implements OnInit {
  acpId = '';
  accessModel = 'PUBLIC';
  validFrom = '';
  validUntil = '';
  credentialCount = 0;
  featureConfig: Record<string, any> = {};

  featureFlags = [
    { key: 'allowIndexDownload', label: 'ACP-Index Download erlauben' },
    { key: 'allowUnitDownload', label: 'Unit-Download erlauben' },
    { key: 'allowFileDownload', label: 'Datei-Download erlauben' },
    { key: 'enableUnitView', label: 'Unit-Ansicht (Verona Player) aktivieren' },
    { key: 'showMetadata', label: 'Metadaten anzeigen' },
    { key: 'showRichText', label: 'RichText anzeigen' },
    { key: 'showCodingScheme', label: 'Kodierschema anzeigen' },
    { key: 'enableUnitListNavigation', label: 'Unit-Listen-Navigation' },
    { key: 'enableSequenceNavigation', label: 'Aufgabenfolgen-Navigation' },
    { key: 'enableCommenting', label: 'Kommentare aktivieren' },
    { key: 'enableItemList', label: 'Item-Liste aktivieren' },
    { key: 'enableItemClick', label: 'Item-Klick-Navigation' },
    { key: 'enableItemListFilter', label: 'Item-Filter erlauben' },
    { key: 'enableItemListSort', label: 'Item-Sortierung erlauben' },
    { key: 'enableItemListTags', label: 'Item-Tagging erlauben' },
    { key: 'persistUserPreferences', label: 'Nutzer-Einstellungen speichern' },
  ];

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.api.getAccessConfig(this.acpId).subscribe({
      next: config => {
        if (config) {
          this.accessModel = config.accessModel;
          this.featureConfig = config.featureConfig || {};
          this.validFrom = config.validFrom || '';
          this.validUntil = config.validUntil || '';
        }
      }
    });
  }

  saveAccess() {
    const data: any = { accessModel: this.accessModel };
    if (this.accessModel === 'CREDENTIALS_LIST') {
      if (this.validFrom) data.validFrom = this.validFrom;
      if (this.validUntil) data.validUntil = this.validUntil;
    }
    this.api.updateAccessConfig(this.acpId, data).subscribe();
  }

  saveFeatures() {
    this.api.updateAccessConfig(this.acpId, {
      accessModel: this.accessModel,
      featureConfig: this.featureConfig
    }).subscribe();
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
