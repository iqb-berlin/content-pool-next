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
        <a [routerLink]="['/manage', acp.id, 'application-tokens']" class="card link-card">
          <h3>Applikationstoken</h3>
          <p>Tokens für externe Anwendungen auf dieses ACP begrenzen</p>
        </a>
        <a [routerLink]="['/view', acp.id]" class="card link-card">
          <h3>👁️ Vorschau</h3>
          <p>Read-Only-Ansicht des ACP</p>
        </a>
      </div>

      <div class="card">
        <h3>ACP-Index</h3>
        <div class="toolbar">
          <button
            class="btn btn-outline btn-state"
            (click)="showIndex = !showIndex"
            [attr.aria-expanded]="showIndex"
            aria-controls="acp-index-content"
          >
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
          <pre id="acp-index-content" class="json-view">{{ acp.acpIndex | json }}</pre>
        }
      </div>

      <section class="card roles-card" aria-labelledby="roles-heading">
        <h3 id="roles-heading">Rollenzuweisungen</h3>
        @if (roleError) {
          <p class="alert alert-error" role="alert">{{ roleError }}</p>
        }
        @if (roleStatus) {
          <p class="role-status" role="status">{{ roleStatus }}</p>
        }
        <div class="roles-table-scroll">
          <table class="roles-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Rolle</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              @for (role of roles; track role.id) {
                <tr>
                  <th scope="row" class="person-name">
                    {{ role.user?.displayName || role.user?.username || role.userId }}
                  </th>
                  <td>
                    <select
                      class="form-select"
                      [ngModel]="roleEdits[role.userId] ?? role.role"
                      (ngModelChange)="roleEdits[role.userId] = $event"
                      [attr.aria-label]="
                        'Rolle für ' +
                        (role.user?.displayName || role.user?.username || role.userId)
                      "
                      [disabled]="roleBusy"
                    >
                      <option value="ACP_MANAGER" [disabled]="!canAssignManager">
                        ACP-Manager
                      </option>
                      <option value="READ_ONLY">Nur Lesen</option>
                    </select>
                  </td>
                  <td>
                    <div class="role-actions">
                      <button
                        class="btn btn-primary btn-sm"
                        (click)="saveRole(role.userId)"
                        [disabled]="
                          roleBusy ||
                          !roleEdits[role.userId] ||
                          roleEdits[role.userId] === role.role
                        "
                      >
                        Speichern
                      </button>
                      <button
                        class="btn btn-outline btn-sm"
                        (click)="removeRole(role.userId)"
                        [disabled]="roleBusy || (role.role === 'ACP_MANAGER' && !canAssignManager)"
                      >
                        Entfernen
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3">Noch keine Personen zugewiesen.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="add-person">
          <h4>Person hinzufügen</h4>
          @if (availableUsers.length) {
            <div class="add-person-fields">
              <div class="add-person-field">
                <label for="new-role-person">Person</label>
                <select
                  id="new-role-person"
                  [(ngModel)]="selectedUserId"
                  class="form-select"
                  [disabled]="roleBusy"
                >
                  <option value="">Person auswählen …</option>
                  @for (u of availableUsers; track u.id) {
                    <option [value]="u.id">{{ u.displayName || u.username }}</option>
                  }
                </select>
              </div>
              <div class="add-person-field">
                <label for="new-role-value">Rolle</label>
                <select
                  id="new-role-value"
                  [(ngModel)]="selectedRole"
                  class="form-select"
                  [disabled]="roleBusy"
                >
                  <option value="ACP_MANAGER" [disabled]="!canAssignManager">ACP-Manager</option>
                  <option value="READ_ONLY">Nur Lesen</option>
                </select>
              </div>
              <button
                class="btn btn-primary btn-sm"
                (click)="assignRole()"
                [disabled]="roleBusy || !selectedUserId"
              >
                Hinzufügen
              </button>
            </div>
          } @else {
            <p>Alle verfügbaren Personen sind bereits zugewiesen.</p>
          }
        </div>
      </section>

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
      .roles-table-scroll {
        overflow-x: auto;
      }
      .roles-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .roles-table th,
      .roles-table td {
        padding: 12px 8px;
        border-bottom: 1px solid var(--color-border);
        text-align: left;
      }
      .roles-table thead th {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .roles-table th:nth-child(2) {
        width: 180px;
      }
      .roles-table th:nth-child(3) {
        width: 210px;
      }
      .person-name {
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .role-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .roles-table select {
        width: 100%;
      }
      .add-person {
        margin-top: 20px;
      }
      .add-person h4 {
        margin-bottom: 12px;
      }
      .add-person-fields {
        display: flex;
        align-items: end;
        gap: 12px;
        flex-wrap: wrap;
      }
      .add-person-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.85rem;
      }
      .role-status {
        color: var(--color-text-secondary);
        margin: 12px 0;
      }
      @media (max-width: 650px) {
        .roles-table {
          min-width: 520px;
        }
        .add-person-field {
          width: 100%;
        }
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
  selectedRole = 'READ_ONLY';
  roleEdits: Record<string, string> = {};
  roleBusy = false;
  roleError = '';
  roleStatus = '';

  get canAssignManager(): boolean {
    return this.auth.isAdmin;
  }

  get availableUsers(): any[] {
    return this.allUsers.filter((user) => !this.roles.some((role) => role.userId === user.id));
  }
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
    if (
      !this.selectedUserId ||
      !this.availableUsers.some((user) => user.id === this.selectedUserId)
    )
      return;
    this.persistRole(this.selectedUserId, this.selectedRole);
  }

  saveRole(userId: string) {
    const assignment = this.roles.find((role) => role.userId === userId);
    const nextRole = this.roleEdits[userId];
    if (!assignment || !nextRole || nextRole === assignment.role) return;
    this.persistRole(userId, nextRole);
  }

  private persistRole(userId: string, role: string) {
    if (!this.acp || this.roleBusy) return;
    this.roleBusy = true;
    this.roleError = '';
    this.roleStatus = '';
    this.api.assignAcpRole(this.acp.id, { userId, role }).subscribe({
      next: (saved) => {
        const existing = this.roles.find((entry) => entry.userId === userId);
        const updated = {
          ...existing,
          ...saved,
          userId,
          role,
          user: existing?.user || this.allUsers.find((user) => user.id === userId),
        };
        this.roles = existing
          ? this.roles.map((entry) => (entry.userId === userId ? updated : entry))
          : [...this.roles, updated];
        delete this.roleEdits[userId];
        if (this.selectedUserId === userId) this.selectedUserId = '';
        if (this.auth.currentUser?.id === userId) this.myRole = role;
        this.roleBusy = false;
        this.roleStatus = existing ? 'Rolle gespeichert.' : 'Person hinzugefügt.';
      },
      error: (err) => {
        this.roleBusy = false;
        this.roleError = this.mapRoleError(err, 'Die Rolle konnte nicht gespeichert werden.');
      },
    });
  }

  removeRole(userId: string) {
    if (!this.acp || this.roleBusy) return;
    this.roleBusy = true;
    this.roleError = '';
    this.roleStatus = '';
    this.api.removeAcpRole(this.acp.id, userId).subscribe({
      next: () => {
        this.roles = this.roles.filter((role) => role.userId !== userId);
        delete this.roleEdits[userId];
        if (this.auth.currentUser?.id === userId) this.myRole = null;
        this.roleBusy = false;
        this.roleStatus = 'Rollenzuweisung entfernt.';
      },
      error: (err) => {
        this.roleBusy = false;
        this.roleError = this.mapRoleError(err, 'Die Rolle konnte nicht entfernt werden.');
      },
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
