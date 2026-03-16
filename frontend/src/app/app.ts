import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="app-header">
      <a routerLink="/" class="logo">IQB ContentPool</a>
      <nav>
        @if (auth.isLoggedIn && auth.isAdmin) {
          <a routerLink="/admin/users">Nutzer</a>
          <a routerLink="/admin/acp">ACPs</a>
          <a routerLink="/admin/settings">Einstellungen</a>
        }
        @if (auth.isLoggedIn) {
          <span class="user-info">{{ auth.currentUser?.displayName || auth.currentUser?.username }}</span>
          <button class="btn-logout" (click)="logout()">Abmelden</button>
        } @else {
          <a routerLink="/login">Anmelden</a>
        }
      </nav>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .app-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; height: 56px;
      background: var(--color-primary); color: white;
    }
    .logo { color: white; text-decoration: none; font-size: 1.25rem; font-weight: 600; }
    nav { display: flex; align-items: center; gap: 16px; }
    nav a { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 0.9rem; }
    nav a:hover { color: white; }
    .user-info { font-size: 0.85rem; opacity: 0.8; }
    .btn-logout {
      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
      color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;
    }
    .btn-logout:hover { background: rgba(255,255,255,0.25); }
    .app-main { flex: 1; padding: 24px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
  `]
})
export class AppComponent {
  constructor(public auth: AuthService, private router: Router) {}
  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
