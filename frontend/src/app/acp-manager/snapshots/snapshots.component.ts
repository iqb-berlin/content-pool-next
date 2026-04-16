import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AcpSnapshot, SnapshotCurrentDiff } from '../../core/models/api.models';

@Component({
  selector: 'app-snapshots',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page-header">
      <h1>Snapshots</h1>
      <button class="btn btn-primary" (click)="showCreate = !showCreate">+ Snapshot erstellen</button>
    </div>

    @if (showCreate) {
      <div class="card">
        <div class="form-group">
          <label>Changelog</label>
          <textarea [(ngModel)]="changelog" rows="3" placeholder="Änderungen beschreiben..."></textarea>
        </div>
        <div class="toolbar">
          <button class="btn btn-primary" (click)="create()">Erstellen</button>
          <button class="btn btn-outline" (click)="showCreate = false">Abbrechen</button>
        </div>
      </div>
    }

    <div class="card">
      <table class="table">
        <thead>
          <tr><th>Version</th><th>Erstellt</th><th>Changelog</th><th>Aktionen</th></tr>
        </thead>
        <tbody>
          @for (snap of snapshots; track snap.id) {
            <tr>
              <td><strong>v{{ snap.versionNumber }}</strong></td>
              <td>{{ snap.createdAt | date:'dd.MM.yyyy HH:mm' }}</td>
              <td>{{ snap.changelog || '–' }}</td>
              <td>
                <button class="btn btn-sm btn-outline" (click)="previewDiff(snap)">
                  {{ loadingDiffSnapshotId === snap.id ? 'Lade…' : 'Diff zum aktuellen Stand' }}
                </button>
                <button class="btn btn-sm btn-outline" (click)="restore(snap)">Wiederherstellen</button>
                <button class="btn btn-sm btn-danger" (click)="deleteSnapshot(snap)">Löschen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!snapshots.length) {
        <div class="empty-state"><h3>Noch keine Snapshots vorhanden</h3></div>
      }
    </div>

    @if (diffPreview) {
      <div class="card">
        <h3>Diff-Vorschau zu Version v{{ diffPreviewSnapshotVersion }}</h3>
        <p><strong>ACP-Index geändert:</strong> {{ diffPreview.indexChanged ? 'Ja' : 'Nein' }}</p>
        <p><strong>Unverändert:</strong> {{ diffPreview.unchanged }} Dateien</p>

        <div class="form-group">
          <label>Neu im aktuellen Stand</label>
          <div>{{ diffPreview.added.length ? diffPreview.added.join(', ') : 'Keine' }}</div>
        </div>
        <div class="form-group">
          <label>Fehlen im aktuellen Stand</label>
          <div>{{ diffPreview.removed.length ? diffPreview.removed.join(', ') : 'Keine' }}</div>
        </div>
        <div class="form-group">
          <label>Inhaltlich geändert</label>
          <div>{{ diffPreview.modified.length ? diffPreview.modified.join(', ') : 'Keine' }}</div>
        </div>
      </div>
    }

    @if (diffError) {
      <div class="card">
        <p style="color:#b00020;"><strong>Diff konnte nicht geladen werden:</strong> {{ diffError }}</p>
      </div>
    }
  `
})
export class SnapshotsComponent implements OnInit {
  acpId = '';
  snapshots: AcpSnapshot[] = [];
  showCreate = false;
  changelog = '';
  diffPreview: SnapshotCurrentDiff | null = null;
  diffPreviewSnapshotVersion: number | null = null;
  diffError = '';
  loadingDiffSnapshotId: string | null = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.parent?.snapshot.paramMap.get('acpId') || '';
    this.load();
  }

  load() {
    this.api.getSnapshots(this.acpId).subscribe(s => this.snapshots = s);
  }

  create() {
    this.api.createSnapshot(this.acpId, this.changelog).subscribe({
      next: () => { this.showCreate = false; this.changelog = ''; this.load(); }
    });
  }

  previewDiff(snap: AcpSnapshot) {
    this.loadingDiffSnapshotId = snap.id;
    this.diffError = '';
    this.api.getSnapshotCurrentDiff(this.acpId, snap.id).subscribe({
      next: (diff) => {
        this.diffPreview = diff;
        this.diffPreviewSnapshotVersion = snap.versionNumber;
        this.loadingDiffSnapshotId = null;
      },
      error: (err) => {
        this.diffPreview = null;
        this.diffPreviewSnapshotVersion = null;
        this.diffError = err?.error?.message || 'Unbekannter Fehler';
        this.loadingDiffSnapshotId = null;
      },
    });
  }

  restore(snap: AcpSnapshot) {
    if (confirm(`Version v${snap.versionNumber} wiederherstellen?`)) {
      this.api.restoreSnapshot(this.acpId, snap.id).subscribe(() => {
        alert('ACP-Index wurde wiederhergestellt.');
        this.load();
      });
    }
  }

  deleteSnapshot(snap: AcpSnapshot) {
    if (!confirm(`Snapshot v${snap.versionNumber} wirklich löschen?`)) {
      return;
    }

    this.api.deleteSnapshot(this.acpId, snap.id).subscribe({
      next: () => {
        if (this.diffPreview?.snapshotId === snap.id) {
          this.diffPreview = null;
          this.diffPreviewSnapshotVersion = null;
          this.diffError = '';
        }
        this.load();
      },
      error: (err) => {
        const message = err?.error?.message || 'Unbekannter Fehler';
        this.diffError = message;
      },
    });
  }
}
