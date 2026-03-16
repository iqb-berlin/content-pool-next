import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AcpSnapshot } from '../../core/models/api.models';

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
                <button class="btn btn-sm btn-outline" (click)="restore(snap)">Wiederherstellen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!snapshots.length) {
        <div class="empty-state"><h3>Noch keine Snapshots vorhanden</h3></div>
      }
    </div>
  `
})
export class SnapshotsComponent implements OnInit {
  acpId = '';
  snapshots: AcpSnapshot[] = [];
  showCreate = false;
  changelog = '';

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

  restore(snap: AcpSnapshot) {
    if (confirm(`Version v${snap.versionNumber} wiederherstellen?`)) {
      this.api.restoreSnapshot(this.acpId, snap.id).subscribe(() => {
        alert('ACP-Index wurde wiederhergestellt.');
      });
    }
  }
}
