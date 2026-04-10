import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Acp } from '../../core/models/api.models';

@Component({
  selector: 'app-acp-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Assessment Content Packages</h1>
      <button class="btn btn-primary" (click)="showCreate = !showCreate">+ ACP anlegen</button>
    </div>

    @if (showCreate) {
      <div class="card">
        <h3>Neues ACP anlegen</h3>
        <form (ngSubmit)="createAcp()">
          <div class="form-group">
            <label>Package-ID</label>
            <input [(ngModel)]="newAcp.packageId" name="packageId" required placeholder="z.B. vera-2026-math">
          </div>
          <div class="form-group">
            <label>Name</label>
            <input [(ngModel)]="newAcp.name" name="name" required>
          </div>
          <div class="form-group">
            <label>Beschreibung</label>
            <textarea [(ngModel)]="newAcp.description" name="description" rows="2"></textarea>
          </div>
          <div class="toolbar">
            <button type="submit" class="btn btn-primary">Anlegen</button>
            <button type="button" class="btn btn-outline" (click)="showCreate = false">Abbrechen</button>
          </div>
        </form>
      </div>
    }

    @if (error) { <div class="alert alert-error">{{ error }}</div> }

    <div class="card">
      <table class="table">
        <thead>
          <tr><th>Package-ID</th><th>Name</th><th>Beschreibung</th><th>Aktionen</th></tr>
        </thead>
        <tbody>
          @for (acp of acps; track acp.id) {
            <tr>
              <td><code>{{ acp.packageId }}</code></td>
              <td>
                @if (editingId === acp.id) {
                  <input [(ngModel)]="editName" (keyup.enter)="saveRename(acp)" (keyup.escape)="cancelRename()" class="input-sm">
                  <button class="btn btn-sm btn-primary" (click)="saveRename(acp)" style="margin-left:4px">Speichern</button>
                  <button class="btn btn-sm btn-outline" (click)="cancelRename()" style="margin-left:4px">Abbrechen</button>
                } @else {
                  {{ acp.name }}
                  <button class="btn btn-sm btn-link" (click)="startRename(acp)" style="margin-left:8px" title="Umbenennen">✏️</button>
                }
              </td>
              <td>{{ acp.description || '–' }}</td>
              <td>
                <a [routerLink]="['/manage', acp.id]" class="btn btn-sm btn-outline">Verwalten</a>
                <button class="btn btn-sm btn-danger" (click)="deleteAcp(acp)" style="margin-left:8px">Löschen</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!acps.length) {
        <div class="empty-state"><h3>Keine ACPs vorhanden</h3></div>
      }
    </div>
  `
})
export class AcpListComponent implements OnInit {
  acps: Acp[] = [];
  showCreate = false;
  error = '';
  newAcp = { packageId: '', name: '', description: '' };
  editingId: string | null = null;
  editName = '';

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.api.getAcps().subscribe({
      next: acps => this.acps = acps,
      error: err => this.error = err.error?.message || 'Fehler beim Laden'
    });
  }

  createAcp() {
    this.api.createAcp(this.newAcp).subscribe({
      next: () => { this.showCreate = false; this.newAcp = { packageId: '', name: '', description: '' }; this.load(); },
      error: err => this.error = err.error?.message || 'Fehler beim Anlegen'
    });
  }

  deleteAcp(acp: Acp) {
    if (confirm(`ACP "${acp.name}" wirklich löschen?`)) {
      this.api.deleteAcp(acp.id).subscribe({ next: () => this.load() });
    }
  }

  startRename(acp: Acp) {
    this.editingId = acp.id;
    this.editName = acp.name;
  }

  cancelRename() {
    this.editingId = null;
    this.editName = '';
  }

  saveRename(acp: Acp) {
    if (!this.editName.trim()) {
      this.error = 'Name darf nicht leer sein';
      return;
    }
    this.api.updateAcp(acp.id, { name: this.editName.trim() }).subscribe({
      next: () => { this.editingId = null; this.editName = ''; this.load(); },
      error: err => this.error = err.error?.message || 'Fehler beim Umbenennen'
    });
  }
}
