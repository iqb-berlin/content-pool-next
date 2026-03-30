import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { User } from '../../core/models/api.models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-header">
      <h1>Nutzerverwaltung</h1>
      <button class="btn btn-primary" (click)="showCreate = !showCreate">+ Nutzer anlegen</button>
    </div>

    @if (showCreate) {
      <div class="card">
        <h3>Neuen Nutzer anlegen</h3>
        <form>
          <div class="form-group">
            <label>Benutzername</label>
            <input [(ngModel)]="newUser.username" name="username" required>
          </div>
          <div class="form-group">
            <label>Kennwort</label>
            <input type="password" [(ngModel)]="newUser.password" name="password" required>
          </div>
          <div class="form-group">
            <label>Anzeigename</label>
            <input [(ngModel)]="newUser.displayName" name="displayName">
          </div>
          <div class="toolbar">
            <button type="submit" class="btn btn-primary">Anlegen</button>
            <button type="button" class="btn btn-outline" (click)="showCreate = false">Abbrechen</button>
          </div>
        </form>
      </div>
    }

    @if (showOidcLink) {
      <div class="card">
        <h3>OIDC Account verknüpfen für {{ selectedUser?.username }}</h3>
        <form>
          <div class="form-group">
            <label>OIDC Sub (Keycloak User ID)</label>
            <input [(ngModel)]="oidcSub" name="oidcSub" placeholder="z.B. 200b726c-c834-4a0b-97b8-d44f3102c7e5"
                   required>
            <small class="form-text text-muted">
              Die OIDC Sub finden Sie in Keycloak unter: Users → [User] → ID field
            </small>
          </div>
          <div class="toolbar">
            <button type="submit" class="btn btn-primary">Verknüpfen</button>
            <button type="button" class="btn btn-outline" (click)="showOidcLink = false">Abbrechen</button>
          </div>
        </form>
      </div>
    }

    @if (error) {
      <div class="alert alert-error">{{ error }}</div>
    }

    <div class="card">
      <table class="table">
        <thead>
        <tr>
          <th>Benutzername</th>
          <th>Anzeigename</th>
          <th>Admin</th>
          <th>OIDC</th>
          <th>Aktionen</th>
        </tr>
        </thead>
        <tbody>
          @for (user of users; track user.id) {
            <tr>
              <td>{{ user.username }}</td>
              <td>{{ user.displayName || '–' }}</td>
              <td>
                <span class="badge" [class.badge-success]="user.isAppAdmin" [class.badge-info]="!user.isAppAdmin">
                  {{ user.isAppAdmin ? 'Admin' : 'Nutzer' }}
                </span>
              </td>
              <td>
                @if (user.oidcSub) {
                  <span class="badge badge-success" title="{{ user.oidcSub }}">✓ Verknüpft</span>
                } @else {
                  <span class="badge badge-warning">✗ Nicht verknüpft</span>
                }
              </td>
              <td>
                <button class="btn btn-sm btn-outline" (click)="toggleAdmin(user)">
                  {{ user.isAppAdmin ? 'Admin entziehen' : 'Zum Admin' }}
                </button>
                <button class="btn btn-sm btn-outline" (click)="showLinkForm(user)" style="margin-left:8px">
                  {{ user.oidcSub ? 'OIDC ändern' : 'OIDC verknüpfen' }}
                </button>
                <button class="btn btn-sm btn-danger" (click)="deleteUser(user)" style="margin-left:8px">Löschen
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!users.length) {
        <div class="empty-state"><h3>Keine Nutzer vorhanden</h3></div>
      }
    </div>
  `
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  showCreate = false;
  showOidcLink = false;
  error = '';
  newUser = { username: '', password: '', displayName: '' };
  selectedUser: User | null = null;
  oidcSub = '';

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.api.getUsers().subscribe({
      next: users => this.users = users,
      error: err => this.error = err.error?.message || 'Fehler beim Laden'
    });
  }

  createUser() {
    this.api.createUser(this.newUser).subscribe({
      next: () => { this.showCreate = false; this.newUser = { username: '', password: '', displayName: '' }; this.load(); },
      error: err => this.error = err.error?.message || 'Fehler beim Anlegen'
    });
  }

  toggleAdmin(user: User) {
    this.api.setAppAdmin(user.id, !user.isAppAdmin).subscribe({ next: () => this.load() });
  }

  deleteUser(user: User) {
    if (confirm(`Nutzer "${user.username}" wirklich löschen?`)) {
      this.api.deleteUser(user.id).subscribe({ next: () => this.load() });
    }
  }

  showLinkForm(user: User) {
    this.selectedUser = user;
    this.oidcSub = user.oidcSub || '';
    this.showOidcLink = true;
    this.showCreate = false;
  }

  linkOidc() {
    if (!this.selectedUser) return;

    this.api.linkOidcAccount(this.selectedUser.id, this.oidcSub).subscribe({
      next: () => {
        this.showOidcLink = false;
        this.selectedUser = null;
        this.oidcSub = '';
        this.load();
      },
      error: err => this.error = err.error?.message || 'Fehler beim Verknüpfen'
    });
  }
}
