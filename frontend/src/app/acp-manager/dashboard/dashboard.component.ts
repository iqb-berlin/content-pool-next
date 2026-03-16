import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Acp } from '../../core/models/api.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, JsonPipe],
  template: `
    @if (acp) {
      <div class="page-header">
        <div class="header-main">
          <h1>{{ acp.name }}</h1>
          <span class="badge badge-info">{{ acp.packageId }}</span>
          @if (myRole) {
            <span class="badge badge-success" style="margin-left:8px">{{ myRoleLabel }}</span>
          }
        </div>
      </div>

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
          <a [href]="api.getIndexExportUrl(acp.id)" class="btn btn-outline" target="_blank">Exportieren</a>
          <label class="btn btn-accent">
            Importieren
            <input type="file" accept=".json" (change)="importIndex($event)" hidden>
          </label>
        </div>
        @if (showIndex) {
          <pre class="json-view">{{ acp.acpIndex | json }}</pre>
        }
      </div>

      <div class="card">
        <h3>Rollenzuweisungen</h3>
        @for (role of roles; track role.id) {
          <div class="role-item">
            <span>{{ role.user?.displayName || role.user?.username }} — <strong>{{ role.role }}</strong></span>
            <button class="btn btn-sm btn-danger" (click)="removeRole(role.userId)">Entfernen</button>
          </div>
        }
        <div class="toolbar" style="margin-top:12px">
          <select [(ngModel)]="selectedUserId" class="form-select">
            @for (u of allUsers; track u.id) { <option [value]="u.id">{{ u.displayName || u.username }}</option> }
          </select>
          <select [(ngModel)]="selectedRole" class="form-select">
            <option value="ACP_MANAGER">ACP-Manager</option>
            <option value="READ_ONLY">Nur Lesen</option>
          </select>
          <button class="btn btn-primary btn-sm" (click)="assignRole()">Zuweisen</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .header-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .link-card { text-decoration: none; color: inherit; transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
    .link-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.12); text-decoration: none; }
    .link-card p { color: var(--color-text-secondary); font-size: 0.85rem; margin-top: 4px; }
    .json-view { background: var(--color-bg); padding: 16px; border-radius: var(--radius); overflow-x: auto; font-size: 0.8rem; max-height: 400px; margin-top: 12px; }
    .role-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border); }
    .form-select { padding: 6px 10px; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.85rem; }
  `]
})
export class DashboardComponent implements OnInit {
  acp: Acp | null = null;
  roles: any[] = [];
  allUsers: any[] = [];
  showIndex = false;
  selectedUserId = '';
  selectedRole = 'ACP_MANAGER';
  myRole: string | null = null;

  get myRoleLabel(): string {
    switch (this.myRole) {
      case 'ACP_MANAGER': return 'Manager';
      case 'READ_ONLY': return 'Gast';
      default: return 'Zugriff gewährt';
    }
  }

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('acpId')!;
    this.api.getAcp(id).subscribe(acp => this.acp = acp);
    this.api.getAcpRoles(id).subscribe(roles => {
      this.roles = roles;
      const myId = this.auth.currentUser?.id;
      const myAssignment = roles.find(r => r.userId === myId);
      this.myRole = myAssignment ? myAssignment.role : null;
    });
    this.api.getUsers().subscribe(users => {
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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        this.api.importAcpIndex(this.acp!.id, data).subscribe({
          next: idx => { this.acp!.acpIndex = idx; }
        });
      } catch { alert('Ungültige JSON-Datei'); }
    };
    reader.readAsText(file);
  }

  assignRole() {
    if (!this.acp || !this.selectedUserId) return;
    this.api.assignAcpRole(this.acp.id, { userId: this.selectedUserId, role: this.selectedRole })
      .subscribe(() => this.api.getAcpRoles(this.acp!.id).subscribe(r => this.roles = r));
  }

  removeRole(userId: string) {
    if (!this.acp) return;
    this.api.removeAcpRole(this.acp.id, userId)
      .subscribe(() => this.api.getAcpRoles(this.acp!.id).subscribe(r => this.roles = r));
  }
}
