import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AcpFile,
  UploadValidationSummary,
  UnitFileValidationResult,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AcpManagerContextComponent } from '../shared/acp-manager-context.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';

type UploadConflictDecision = 'replace' | 'skip';

interface UploadConflictEntry {
  selectedIndex: number;
  incoming: File;
  existing: AcpFile;
  decision?: UploadConflictDecision;
}

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [AcpManagerContextComponent, ConfirmDialogComponent],
  template: `
    <app-acp-manager-context />

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
          <button class="btn btn-danger" (click)="openDeleteAllFilesDialog()">🗑 Alle löschen</button>
        }
      </div>
    </div>

    @if (uploading) {
      <div class="alert alert-success">
        Dateien werden hochgeladen ({{ uploadProgress }})...
      </div>
    }

    @if (uploadError) {
      <div class="alert alert-danger">
        {{ uploadError }}
      </div>
    }

    @if (lastConflictSummary) {
      <div class="alert alert-info">
        Konfliktprüfung: {{ lastConflictSummary.conflicts }} doppelte Datei(en) erkannt,
        {{ lastConflictSummary.replaced }} ersetzt,
        {{ lastConflictSummary.skipped }} übersprungen.
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

    @if (lastValidationSummary) {
      <div class="alert" [class.alert-success]="lastValidationSummary.invalidFiles === 0" [class.alert-warning]="lastValidationSummary.invalidFiles > 0">
        Auto-Validierung: {{ lastValidationSummary.validFiles }} von {{ lastValidationSummary.totalFiles }} Datei(en) ohne Fehler.
        @if (lastValidationSummary.invalidFiles > 0) {
          <span> {{ lastValidationSummary.invalidFiles }} Datei(en) enthalten Fehler.</span>
        }
        <div style="margin-top:6px">
          ACP-Semantik: {{ lastValidationSummary.semanticValid ? 'OK' : 'Fehler/Warnungen vorhanden' }}
          ({{ lastValidationSummary.semanticIssueCount }} Issue(s))
        </div>
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

                  @if (file.validationResult.issues.length) {
                    <div class="file-validation-issues">
                      @for (issue of file.validationResult.issues; track issueTrack(issue, $index)) {
                        <div
                          class="file-validation-issue"
                          [class.issue-error]="issue.severity === 'error'"
                          [class.issue-warning]="issue.severity === 'warning'"
                          [class.issue-info]="issue.severity === 'info'">
                          <span class="issue-tag">{{ issue.severity.toUpperCase() }}</span>
                          <span>{{ issue.message }}</span>
                        </div>
                      }
                    </div>
                  }
                } @else {
                  <span class="badge badge-warning">Nicht geprüft</span>
                }
              </td>
              <td>
                <a [href]="getDownloadUrl(file)" class="btn btn-sm btn-outline" target="_blank">⬇ Download</a>
                <button class="btn btn-sm btn-danger" (click)="openDeleteFileDialog(file)" style="margin-left:8px">Löschen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!files.length) {
        <div class="empty-state"><h3>Keine Dateien vorhanden</h3></div>
      }
    </div>

    <app-confirm-dialog
      [open]="deleteDialogOpen"
      [title]="deleteDialogTitle"
      [message]="deleteDialogMessage"
      [details]="deleteDialogDetails"
      [error]="deleteDialogError"
      [busy]="deleteDialogBusy"
      busyLabel="Lösche..."
      [confirmLabel]="deleteDialogConfirmLabel"
      confirmVariant="danger"
      (confirmed)="confirmDeleteDialog()"
      (cancelled)="closeDeleteDialog()" />

    @if (conflictDialogOpen) {
      <div class="overlay-backdrop" (click)="cancelConflictDialog()">
        <div class="overlay-dialog card" (click)="$event.stopPropagation()">
          <h3 style="margin-top: 0">Dateikonflikte beim Upload</h3>
          <p>
            Für bereits vorhandene Dateinamen bitte pro Datei entscheiden,
            ob die vorhandene Datei ersetzt oder der Upload übersprungen wird.
          </p>

          <div class="conflict-toolbar">
            <button class="btn btn-outline btn-sm" (click)="applyDecisionToAll('replace')">Alle ersetzen</button>
            <button class="btn btn-outline btn-sm" (click)="applyDecisionToAll('skip')">Alle überspringen</button>
          </div>

          <div class="conflict-list">
            @for (entry of conflictEntries; track conflictTrack(entry, $index); let i = $index) {
              <div class="conflict-row">
                <div class="conflict-name"><strong>{{ entry.incoming.name }}</strong></div>
                <div class="conflict-meta">
                  Neu: {{ formatSize(entry.incoming.size) }} | Vorhanden: {{ formatSize(entry.existing.fileSize) }}
                </div>
                <div class="conflict-actions">
                  <button
                    class="btn btn-sm"
                    [class.btn-primary]="entry.decision === 'replace'"
                    [class.btn-outline]="entry.decision !== 'replace'"
                    (click)="setConflictDecision(i, 'replace')">
                    Ersetzen
                  </button>
                  <button
                    class="btn btn-sm"
                    [class.btn-primary]="entry.decision === 'skip'"
                    [class.btn-outline]="entry.decision !== 'skip'"
                    (click)="setConflictDecision(i, 'skip')">
                    Überspringen
                  </button>
                </div>
              </div>
            }
          </div>

          <div class="dialog-actions">
            <button class="btn btn-outline" (click)="cancelConflictDialog()">Abbrechen</button>
            <button class="btn btn-primary" [disabled]="!canConfirmConflictDialog()" (click)="confirmConflictDialog()">
              Upload starten
            </button>
          </div>
        </div>
      </div>
    }
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
    .file-validation-issues { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; min-width: 320px; }
    .file-validation-issue { display: flex; gap: 6px; align-items: flex-start; font-size: 0.75rem; color: var(--color-text-secondary); }
    .file-validation-issue .issue-tag {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 56px; padding: 1px 6px; border-radius: 4px; font-weight: 700;
      background: var(--color-bg); color: var(--color-text-secondary);
    }
    .file-validation-issue.issue-error .issue-tag { background: rgba(231,76,60,0.15); color: #a93226; }
    .file-validation-issue.issue-warning .issue-tag { background: rgba(243,156,18,0.18); color: #9c640c; }
    .file-validation-issue.issue-info .issue-tag { background: rgba(52,152,219,0.16); color: #1f618d; }

    .overlay-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 16px;
    }

    .overlay-dialog {
      width: min(780px, 100%);
      max-height: 85vh;
      overflow: auto;
    }

    .conflict-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .conflict-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }

    .conflict-row {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 10px;
      background: var(--color-bg-soft, #f8f9fb);
    }

    .conflict-name {
      margin-bottom: 4px;
    }

    .conflict-meta {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      margin-bottom: 8px;
    }

    .conflict-actions {
      display: flex;
      gap: 8px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `]
})
export class FilesComponent implements OnInit {
  acpId = '';
  files: AcpFile[] = [];
  uploading = false;
  uploadProgress = '';
  uploadError: string | null = null;
  validating = false;
  validationResults: UnitFileValidationResult[] = [];
  lastSyncReport: any = null;
  lastValidationSummary: UploadValidationSummary | null = null;
  lastConflictSummary: { conflicts: number; replaced: number; skipped: number } | null = null;

  conflictDialogOpen = false;
  conflictEntries: UploadConflictEntry[] = [];
  private conflictDialogResolver: ((value: UploadConflictEntry[] | null) => void) | null = null;
  deleteDialogOpen = false;
  deleteDialogMode: 'single' | 'all' = 'single';
  deleteDialogTarget: AcpFile | null = null;
  deleteDialogBusy = false;
  deleteDialogError = '';

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.load();
  }

  load() {
    this.api.getFiles(this.acpId).subscribe((f) => (this.files = f));
  }

  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const selectedFiles = Array.from(input.files);
    this.uploadError = null;
    this.lastSyncReport = null;
    this.lastValidationSummary = null;
    this.lastConflictSummary = null;

    const conflicts = this.findUploadConflicts(selectedFiles);
    const decisions = new Map<number, UploadConflictDecision>();

    if (conflicts.length) {
      const resolvedConflicts = await this.openConflictDialog(conflicts);
      if (!resolvedConflicts) {
        input.value = '';
        return;
      }

      for (const conflict of resolvedConflicts) {
        if (!conflict.decision) {
          input.value = '';
          return;
        }
        decisions.set(conflict.selectedIndex, conflict.decision);
      }
    }

    const nonConflictingFiles: File[] = [];
    const replacementFiles: File[] = [];
    let skippedCount = 0;

    selectedFiles.forEach((file, index) => {
      const decision = decisions.get(index);
      if (!decision) {
        nonConflictingFiles.push(file);
        return;
      }

      if (decision === 'replace') {
        replacementFiles.push(file);
      } else {
        skippedCount += 1;
      }
    });

    if (conflicts.length) {
      this.lastConflictSummary = {
        conflicts: conflicts.length,
        replaced: replacementFiles.length,
        skipped: skippedCount,
      };
    }

    const totalToUpload = nonConflictingFiles.length + replacementFiles.length;
    if (totalToUpload === 0) {
      input.value = '';
      return;
    }

    this.uploading = true;
    const chunkSize = 50;
    const mergedWarnings = new Set<string>();
    const aggregateReport = {
      unitsAdded: 0,
      unitsUpdated: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      warnings: [] as string[],
    };
    let latestValidationSummary: UploadValidationSummary | null = null;
    let processed = 0;

    const uploadInChunks = async (
      batchFiles: File[],
      strategy?: 'overwrite',
    ): Promise<void> => {
      for (let i = 0; i < batchFiles.length; i += chunkSize) {
        const chunk = batchFiles.slice(i, i + chunkSize);
        this.uploadProgress = `${processed + chunk.length} von ${totalToUpload}`;

        const fd = new FormData();
        for (const file of chunk) {
          fd.append('files', file);
        }

        const uploadResult = await firstValueFrom(
          this.api.uploadFiles(
            this.acpId,
            fd,
            strategy ? { conflictStrategy: strategy } : undefined,
          ),
        );

        processed += chunk.length;

        if (uploadResult?.syncReport) {
          aggregateReport.unitsAdded += uploadResult.syncReport.unitsAdded || 0;
          aggregateReport.unitsUpdated += uploadResult.syncReport.unitsUpdated || 0;
          aggregateReport.itemsAdded += uploadResult.syncReport.itemsAdded || 0;
          aggregateReport.itemsUpdated += uploadResult.syncReport.itemsUpdated || 0;
          for (const warning of uploadResult.syncReport.warnings || []) {
            mergedWarnings.add(warning);
          }
        }
        if (uploadResult?.validationSummary) {
          latestValidationSummary = uploadResult.validationSummary;
        }
      }
    };

    try {
      await uploadInChunks(nonConflictingFiles);
      await uploadInChunks(replacementFiles, 'overwrite');

      aggregateReport.warnings = Array.from(mergedWarnings);
      this.lastSyncReport = aggregateReport;
      this.lastValidationSummary = latestValidationSummary;
      this.load();
      this.validateFiles();
    } catch (err) {
      this.uploadError = this.getUploadErrorMessage(err);
      console.error('Upload Error:', err);
    } finally {
      this.uploading = false;
      this.uploadProgress = '';
      input.value = '';
    }
  }

  validateFiles() {
    this.validating = true;
    this.api.validateUnitFiles(this.acpId).subscribe({
      next: ({ unitResults, validationSummary }) => {
        this.validationResults = unitResults;
        this.lastValidationSummary = validationSummary;
        this.load();
        this.validating = false;
      },
      error: () => {
        this.validating = false;
      },
    });
  }

  get deleteDialogTitle(): string {
    return this.deleteDialogMode === 'single' ? 'Datei löschen' : 'Alle Dateien löschen';
  }

  get deleteDialogMessage(): string {
    if (this.deleteDialogMode === 'single') {
      const name = this.deleteDialogTarget?.originalName || 'diese Datei';
      return `Soll "${name}" wirklich gelöscht werden?`;
    }
    return 'Sollen wirklich alle Dateien dieses ACP gelöscht werden?';
  }

  get deleteDialogDetails(): string[] {
    if (this.deleteDialogMode === 'single') {
      return ['Die Datei wird dauerhaft entfernt.'];
    }
    return [
      `${this.files.length} Datei(en) werden dauerhaft entfernt.`,
      'Validierungsergebnisse und abhängige Dateiverweise können dadurch ungültig werden.',
    ];
  }

  get deleteDialogConfirmLabel(): string {
    return this.deleteDialogMode === 'single' ? 'Datei löschen' : 'Alle löschen';
  }

  openDeleteFileDialog(file: AcpFile) {
    this.deleteDialogMode = 'single';
    this.deleteDialogTarget = file;
    this.deleteDialogError = '';
    this.deleteDialogBusy = false;
    this.deleteDialogOpen = true;
  }

  openDeleteAllFilesDialog() {
    this.deleteDialogMode = 'all';
    this.deleteDialogTarget = null;
    this.deleteDialogError = '';
    this.deleteDialogBusy = false;
    this.deleteDialogOpen = true;
  }

  closeDeleteDialog() {
    if (this.deleteDialogBusy) return;
    this.deleteDialogOpen = false;
    this.deleteDialogTarget = null;
    this.deleteDialogError = '';
  }

  confirmDeleteDialog() {
    if (this.deleteDialogBusy) return;
    this.deleteDialogBusy = true;
    this.deleteDialogError = '';

    if (this.deleteDialogMode === 'single') {
      if (!this.deleteDialogTarget) {
        this.deleteDialogBusy = false;
        this.deleteDialogError = 'Keine Datei ausgewählt.';
        return;
      }
      this.api.deleteFile(this.acpId, this.deleteDialogTarget.id).subscribe({
        next: () => {
          this.deleteDialogBusy = false;
          this.deleteDialogOpen = false;
          this.deleteDialogTarget = null;
          this.load();
        },
        error: (err) => {
          this.deleteDialogBusy = false;
          this.deleteDialogError = err?.error?.message || 'Fehler beim Löschen der Datei.';
        },
      });
      return;
    }

    this.api.deleteAllFiles(this.acpId).subscribe({
      next: () => {
        this.deleteDialogBusy = false;
        this.deleteDialogOpen = false;
        this.validationResults = [];
        this.load();
      },
      error: (err) => {
        this.deleteDialogBusy = false;
        this.deleteDialogError = err?.error?.message || 'Fehler beim Löschen der Dateien.';
      },
    });
  }

  getDownloadUrl(file: AcpFile): string {
    return this.api.getFileDownloadUrl(this.acpId, file.id);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  issueTrack(issue: any, index: number): string {
    return `${issue?.severity || 'unknown'}-${issue?.message || ''}-${issue?.path || ''}-${index}`;
  }

  conflictTrack(entry: UploadConflictEntry, index: number): string {
    return `${entry.selectedIndex}-${this.normalizeFileName(entry.incoming.name)}-${index}`;
  }

  setConflictDecision(index: number, decision: UploadConflictDecision) {
    this.conflictEntries = this.conflictEntries.map((entry, currentIndex) => {
      if (currentIndex !== index) {
        return entry;
      }
      return { ...entry, decision };
    });
  }

  applyDecisionToAll(decision: UploadConflictDecision) {
    this.conflictEntries = this.conflictEntries.map((entry) => ({
      ...entry,
      decision,
    }));
  }

  canConfirmConflictDialog(): boolean {
    return this.conflictEntries.every((entry) => !!entry.decision);
  }

  cancelConflictDialog() {
    this.closeConflictDialog(null);
  }

  confirmConflictDialog() {
    if (!this.canConfirmConflictDialog()) {
      return;
    }
    this.closeConflictDialog(this.conflictEntries);
  }

  private openConflictDialog(
    conflicts: UploadConflictEntry[],
  ): Promise<UploadConflictEntry[] | null> {
    this.conflictEntries = conflicts.map((entry) => ({ ...entry, decision: undefined }));
    this.conflictDialogOpen = true;

    return new Promise((resolve) => {
      this.conflictDialogResolver = resolve;
    });
  }

  private closeConflictDialog(result: UploadConflictEntry[] | null) {
    const resolver = this.conflictDialogResolver;
    this.conflictDialogResolver = null;
    this.conflictDialogOpen = false;

    const payload = result ? result.map((entry) => ({ ...entry })) : null;
    this.conflictEntries = [];
    resolver?.(payload);
  }

  private findUploadConflicts(selectedFiles: File[]): UploadConflictEntry[] {
    const existingByName = new Map<string, AcpFile[]>();

    for (const file of this.files) {
      const key = this.normalizeFileName(file.originalName);
      if (!key) {
        continue;
      }
      const bucket = existingByName.get(key) || [];
      bucket.push(file);
      existingByName.set(key, bucket);
    }

    const conflicts: UploadConflictEntry[] = [];

    selectedFiles.forEach((incoming, selectedIndex) => {
      const key = this.normalizeFileName(incoming.name);
      const existingMatch = key ? existingByName.get(key)?.[0] : undefined;

      if (existingMatch) {
        conflicts.push({
          selectedIndex,
          incoming,
          existing: existingMatch,
        });
      }
    });

    return conflicts;
  }

  private normalizeFileName(fileName: string): string {
    return String(fileName || '').trim().toLowerCase();
  }

  private getUploadErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const conflicts = Array.isArray(error.error?.conflicts)
        ? error.error.conflicts.filter((entry: unknown) => typeof entry === 'string')
        : [];

      if (error.status === 409) {
        if (conflicts.length) {
          return `Konflikt erkannt: ${conflicts.join(', ')}. Bitte für diese Dateien "Ersetzen" oder "Überspringen" wählen und erneut hochladen.`;
        }
        return 'Konflikt erkannt. Bitte prüfen, ob bestehende Dateien ersetzt oder übersprungen werden sollen.';
      }

      if (typeof error.error?.message === 'string') {
        return error.error.message;
      }
    }

    return 'Upload fehlgeschlagen. Bitte erneut versuchen.';
  }
}
