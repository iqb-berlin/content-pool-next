import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AcpFile } from '../../core/models/api.models';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-files',
  standalone: true,
  template: `
    <div class="page-header">
      <h1>Dateien</h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" (click)="validateFiles()" [disabled]="validating">
          {{ validating ? '⏳ Wird geprüft...' : '🔍 Dateien prüfen' }}
        </button>
        <label class="btn btn-primary">
          📤 Dateien hochladen
          <input type="file" multiple (change)="upload($event)" hidden>
        </label>
        @if (files.length) {
          <button class="btn btn-danger" (click)="deleteAllFiles()">🗑 Alle löschen</button>
        }
      </div>
    </div>

    @if (uploading) { 
      <div class="alert alert-success">
        Dateien werden hochgeladen ({{ uploadProgress }})...
      </div> 
    }

    @if (lastSyncReport) {
      <div class="alert alert-info">
        Index-Sync: {{ lastSyncReport.unitsAdded }} Units hinzugefügt, {{ lastSyncReport.unitsUpdated }} Units aktualisiert,
        {{ lastSyncReport.itemsAdded }} Items hinzugefügt, {{ lastSyncReport.itemsUpdated }} Items aktualisiert.
        @if (lastSyncReport.warnings?.length) {
          <div style="margin-top:6px">
            Warnungen:
            @for (warning of lastSyncReport.warnings; track warning) {
              <div>- {{ warning }}</div>
            }
          </div>
        }
      </div>
    }

    <!-- Validation Results -->
    @if (validationResults.length) {
      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-bottom:12px">Unit-Dateien Prüfung</h3>
        @for (result of validationResults; track result.unitId) {
          <div class="validation-unit" [class.valid]="result.valid" [class.invalid]="!result.valid">
            <div class="validation-header">
              <span class="badge" [class.badge-success]="result.valid" [class.badge-danger]="!result.valid">
                {{ result.valid ? '✓' : '✗' }}
              </span>
              <strong>{{ result.unitLabel }}</strong>
              <code>({{ result.unitId }})</code>
            </div>
            @if (!result.valid) {
              <div class="validation-details">
                @if (!result.files.definition.found) {
                  <span class="badge badge-danger">Fehlend: {{ result.files.definition.expected }}</span>
                }
                @if (!result.files.codingScheme.found) {
                  <span class="badge badge-warning">Fehlend: {{ result.files.codingScheme.expected }}</span>
                }
                @if (!result.files.metadata.found) {
                  <span class="badge badge-warning">Fehlend: {{ result.files.metadata.expected }}</span>
                }
                @if (!result.files.player.found) {
                  <span class="badge badge-danger">Fehlend: Player ({{ result.files.player.expected }})</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Dateiname</th>
            <th>Typ</th>
            <th>Größe</th>
            <th>Validierung</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          @for (file of files; track file.id) {
            <tr>
              <td>{{ file.originalName }}</td>
              <td>{{ file.fileType || '–' }}</td>
              <td>{{ formatSize(file.fileSize) }}</td>
              <td>
                @if (file.validationResult) {
                  <span class="badge" [class.badge-success]="file.validationResult.valid" [class.badge-danger]="!file.validationResult.valid">
                    {{ file.validationResult.valid ? 'OK' : 'Fehler' }}
                  </span>
                } @else {
                  <span class="badge badge-warning">Nicht geprüft</span>
                }
              </td>
              <td>
                <a [href]="getDownloadUrl(file)" class="btn btn-sm btn-outline" target="_blank">⬇ Download</a>
                <button class="btn btn-sm btn-danger" (click)="deleteFile(file)" style="margin-left:8px">Löschen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!files.length) {
        <div class="empty-state"><h3>Keine Dateien vorhanden</h3></div>
      }
    </div>
  `,
  styles: [`
    .validation-unit {
      padding: 8px 12px; margin-bottom: 6px;
      border-radius: var(--radius); border-left: 3px solid transparent;
    }
    .validation-unit.valid { border-left-color: var(--color-success); background: rgba(39,174,96,0.05); }
    .validation-unit.invalid { border-left-color: var(--color-danger); background: rgba(231,76,60,0.05); }
    .validation-header { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
    .validation-details { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; padding-left: 32px; }
  `]
})
export class FilesComponent implements OnInit {
  acpId = '';
  files: AcpFile[] = [];
  uploading = false;
  uploadProgress = '';
  validating = false;
  validationResults: any[] = [];
  lastSyncReport: any = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.load();
  }

  load() {
    this.api.getFiles(this.acpId).subscribe(f => this.files = f);
  }

  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    const filesArray = Array.from(input.files);
    this.uploading = true;
    this.lastSyncReport = null;
    const chunkSize = 50;
    const mergedWarnings = new Set<string>();
    const aggregateReport = {
      unitsAdded: 0,
      unitsUpdated: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      warnings: [] as string[],
    };
    
    try {
      for (let i = 0; i < filesArray.length; i += chunkSize) {
        const chunk = filesArray.slice(i, i + chunkSize);
        this.uploadProgress = `${Math.min(i + chunkSize, filesArray.length)} von ${filesArray.length}`;
        
        const fd = new FormData();
        for (const file of chunk) {
          fd.append('files', file);
        }
        
        const uploadResult = await firstValueFrom(this.api.uploadFiles(this.acpId, fd));
        if (uploadResult?.syncReport) {
          aggregateReport.unitsAdded += uploadResult.syncReport.unitsAdded || 0;
          aggregateReport.unitsUpdated += uploadResult.syncReport.unitsUpdated || 0;
          aggregateReport.itemsAdded += uploadResult.syncReport.itemsAdded || 0;
          aggregateReport.itemsUpdated += uploadResult.syncReport.itemsUpdated || 0;
          for (const warning of uploadResult.syncReport.warnings || []) {
            mergedWarnings.add(warning);
          }
        }
      }
      aggregateReport.warnings = Array.from(mergedWarnings);
      this.lastSyncReport = aggregateReport;
      this.load();
    } catch (err) {
      console.error('Upload Error:', err);
    } finally {
      this.uploading = false;
      this.uploadProgress = '';
      input.value = ''; // Reset the input to allow selecting the same files again if needed
    }
  }

  validateFiles() {
    this.validating = true;
    this.api.validateUnitFiles(this.acpId).subscribe({
      next: (results) => {
        this.validationResults = results;
        this.validating = false;
      },
      error: () => this.validating = false
    });
  }

  deleteFile(file: AcpFile) {
    if (confirm(`Datei "${file.originalName}" löschen?`)) {
      this.api.deleteFile(this.acpId, file.id).subscribe(() => this.load());
    }
  }

  deleteAllFiles() {
    if (confirm('Möchten Sie wirklich alle Dateien unwiderruflich löschen?')) {
      this.api.deleteAllFiles(this.acpId).subscribe(() => {
        this.load();
        this.validationResults = [];
      });
    }
  }

  getDownloadUrl(file: AcpFile): string {
    return this.api.getFileDownloadUrl(this.acpId, file.id);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
