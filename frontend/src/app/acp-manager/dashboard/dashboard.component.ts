import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Acp } from '../../core/models/api.models';
import { AcpManagerContextComponent } from '../shared/acp-manager-context.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, JsonPipe, AcpManagerContextComponent, ConfirmDialogComponent],
  template: `
    @if (acp) {
      <app-acp-manager-context />

      <div class="page-header">
        <div class="header-main">
          @if (editingName) {
            <input
              [(ngModel)]="editName"
              (keyup.enter)="saveName()"
              (keyup.escape)="cancelEditName()"
              class="input-lg"
            />
            <button class="btn btn-primary btn-sm" (click)="saveName()">Speichern</button>
            <button class="btn btn-outline btn-sm" (click)="cancelEditName()">Abbrechen</button>
          } @else {
            <h1>{{ acp.name }}</h1>
            @if (canEditName) {
              <button class="btn btn-sm btn-link" (click)="startEditName()" title="Umbenennen">
                ✏️
              </button>
            }
          }
        </div>
      </div>

      @if (error) {
        <div class="alert alert-error">{{ error }}</div>
      }
      @if (indexSuccessMessage) {
        <div class="alert alert-success">{{ indexSuccessMessage }}</div>
      }

      <div class="grid">
        <a [routerLink]="['/manage', acp.id, 'files']" class="card link-card">
          <h3>📁 Dateien</h3>
          <p>Dateien hochladen, herunterladen und validieren</p>
        </a>
        <a [routerLink]="['/manage', acp.id, 'snapshots']" class="card link-card">
          <h3>📸 Snapshots</h3>
          <p>Versionierung und Wiederherstellung</p>
        </a>
        <a [routerLink]="['/manage', acp.id, 'access']" class="card link-card">
          <h3>🔐 Zugriffskonfiguration</h3>
          <p>Zugriffsrechte und Features konfigurieren</p>
        </a>
        <a [routerLink]="['/view', acp.id]" class="card link-card">
          <h3>👁️ Vorschau</h3>
          <p>Read-Only-Ansicht des ACP</p>
        </a>
      </div>

      <div class="card">
        <h3>ACP-Index</h3>
        <div class="toolbar">
          <button class="btn btn-outline" (click)="showIndex = !showIndex">
            {{ showIndex ? 'Verbergen' : 'Anzeigen' }}
          </button>
          <a [href]="api.getIndexExportUrl(acp.id)" class="btn btn-outline" target="_blank"
            >Exportieren</a
          >
          <label class="btn btn-accent">
            Importieren
            <input type="file" accept=".json" (change)="importIndex($event)" hidden />
          </label>
          <button class="btn btn-danger" (click)="openDeleteIndexDialog()">Index löschen</button>
        </div>
        @if (showIndex) {
          <pre class="json-view">{{ acp.acpIndex | json }}</pre>
        }
      </div>

      <div class="card">
        <h3>Rollenzuweisungen</h3>
        @for (role of roles; track role.id) {
          <div class="role-item">
            <span
              >{{ role.user?.displayName || role.user?.username }} —
              <strong>{{ role.role }}</strong></span
            >
            <button class="btn btn-sm btn-danger" (click)="removeRole(role.userId)">
              Entfernen
            </button>
          </div>
        }
        <div class="toolbar" style="margin-top:12px">
          <select [(ngModel)]="selectedUserId" class="form-select">
            @for (u of allUsers; track u.id) {
              <option [value]="u.id">{{ u.displayName || u.username }}</option>
            }
          </select>
          <select [(ngModel)]="selectedRole" class="form-select">
            <option value="ACP_MANAGER">ACP-Manager</option>
            <option value="READ_ONLY">Nur Lesen</option>
          </select>
          <button class="btn btn-primary btn-sm" (click)="assignRole()">Zuweisen</button>
        </div>
      </div>

      <app-confirm-dialog
        [open]="showDeleteIndexDialog"
        title="ACP-Index löschen"
        message="Der aktuelle ACP-Index wird auf den Standardzustand zurückgesetzt."
        [details]="[
          'Diese Aktion betrifft den gesamten Index (inkl. Struktur und Metadaten).',
          'Dateien bleiben erhalten, können aber im Index fehlen, bis erneut synchronisiert/importiert wird.',
        ]"
        [error]="deleteIndexError"
        [busy]="deletingIndex"
        busyLabel="Index wird gelöscht..."
        confirmLabel="Index löschen"
        confirmVariant="danger"
        (confirmed)="confirmDeleteIndex()"
        (cancelled)="closeDeleteIndexDialog()"
      />
    }
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .header-main {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .link-card {
        text-decoration: none;
        color: inherit;
        transition:
          transform 0.15s,
          box-shadow 0.15s;
        cursor: pointer;
      }
      .link-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        text-decoration: none;
      }
      .link-card p {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin-top: 4px;
      }
      .json-view {
        background: var(--color-bg);
        padding: 16px;
        border-radius: var(--radius);
        overflow-x: auto;
        font-size: 0.8rem;
        max-height: 400px;
        margin-top: 12px;
      }
      .role-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--color-border);
      }
      .form-select {
        padding: 6px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  acp: Acp | null = null;
  roles: any[] = [];
  allUsers: any[] = [];
  showIndex = false;
  selectedUserId = '';
  selectedRole = 'ACP_MANAGER';
  myRole: string | null = null;
  editingName = false;
  editName = '';
  error = '';
  indexSuccessMessage = '';
  showDeleteIndexDialog = false;
  deletingIndex = false;
  deleteIndexError = '';

  get canEditName(): boolean {
    return this.auth.isAdmin || this.myRole === 'ACP_MANAGER';
  }

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('acpId')!;
    this.api.getAcp(id).subscribe((acp) => (this.acp = acp));
    this.api.getAcpRoles(id).subscribe((roles) => {
      this.roles = roles;
      const myId = this.auth.currentUser?.id;
      const myAssignment = roles.find((r) => r.userId === myId);
      this.myRole = myAssignment ? myAssignment.role : null;
    });
    this.api.getAssignableUsers(id).subscribe((users) => {
      this.allUsers = users;
      if (users.length) this.selectedUserId = users[0].id;
    });
  }

  exportIndex() {
    // Replaced by direct link via getIndexExportUrl
  }

  importIndex(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.acp) return;
    this.indexSuccessMessage = '';
    this.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        this.api.importAcpIndex(this.acp!.id, data).subscribe({
          next: (idx) => {
            this.acp!.acpIndex = idx;
            this.error = '';
            this.indexSuccessMessage = 'ACP-Index wurde importiert.';
          },
        });
      } catch {
        this.error = 'Ungültige JSON-Datei';
      }
    };
    reader.readAsText(file);
  }

  openDeleteIndexDialog() {
    this.showDeleteIndexDialog = true;
    this.deleteIndexError = '';
  }

  closeDeleteIndexDialog() {
    if (this.deletingIndex) return;
    this.showDeleteIndexDialog = false;
    this.deleteIndexError = '';
  }

  confirmDeleteIndex() {
    if (!this.acp || this.deletingIndex) return;
    this.deletingIndex = true;
    this.deleteIndexError = '';
    this.indexSuccessMessage = '';

    this.api.deleteAcpIndex(this.acp.id).subscribe({
      next: (idx) => {
        this.acp!.acpIndex = idx;
        this.indexSuccessMessage = 'ACP-Index wurde auf den Standardzustand zurückgesetzt.';
        this.deletingIndex = false;
        this.showDeleteIndexDialog = false;
      },
      error: (err) => {
        this.deletingIndex = false;
        this.deleteIndexError = err?.error?.message || 'Fehler beim Löschen des ACP-Index.';
      },
    });
  }

  assignRole() {
    if (!this.acp || !this.selectedUserId) return;
    this.error = '';
    this.api
      .assignAcpRole(this.acp.id, { userId: this.selectedUserId, role: this.selectedRole })
      .subscribe({
        next: () => this.api.getAcpRoles(this.acp!.id).subscribe((r) => (this.roles = r)),
        error: (err) =>
          (this.error = this.mapRoleError(err, 'Die Rolle konnte nicht zugewiesen werden.')),
      });
  }

  removeRole(userId: string) {
    if (!this.acp) return;
    this.error = '';
    this.api.removeAcpRole(this.acp.id, userId).subscribe({
      next: () => this.api.getAcpRoles(this.acp!.id).subscribe((r) => (this.roles = r)),
      error: (err) =>
        (this.error = this.mapRoleError(err, 'Die Rolle konnte nicht entfernt werden.')),
    });
  }

  startEditName() {
    if (!this.acp) return;
    this.editName = this.acp.name;
    this.editingName = true;
  }

  cancelEditName() {
    this.editingName = false;
    this.editName = '';
  }

  saveName() {
    if (!this.acp || !this.editName.trim()) return;
    this.api.updateAcp(this.acp.id, { name: this.editName.trim() }).subscribe({
      next: (acp) => {
        this.acp = acp;
        this.editingName = false;
      },
      error: (err) => (this.error = err.error?.message || 'Fehler beim Speichern'),
    });
  }

  private mapRoleError(err: any, fallback: string): string {
    const message = err?.error?.message || '';

    if (
      typeof message === 'string' &&
      message.includes('At least one ACP_MANAGER must remain assigned')
    ) {
      return 'Mindestens ein ACP-Manager muss zugewiesen bleiben. Bitte zuerst einer anderen Person die Manager-Rolle geben.';
    }

    if (
      typeof message === 'string' &&
      message.includes('Only Application Admins can remove ACP_MANAGER role')
    ) {
      return 'Nur App-Admins dürfen ACP-Manager-Rollen entfernen.';
    }

    if (
      typeof message === 'string' &&
      message.includes('Only Application Admins can assign ACP_MANAGER role')
    ) {
      return 'Nur App-Admins dürfen ACP-Manager-Rollen zuweisen.';
    }

    return message || fallback;
  }
}
