import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ApiService } from './core/services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="app-header">
      <div class="header-left">
        @if (logoUrl) {
          <a routerLink="/"><img [src]="logoUrl" alt="Logo" class="app-logo" /></a>
        }
        <a routerLink="/" class="logo">IQB ContentPool</a>
      </div>
      <nav>
        @if (auth.isLoggedIn && auth.isAdmin) {
          <a routerLink="/admin/users">Nutzer</a>
          <a routerLink="/admin/acp">ACPs</a>
          <a routerLink="/admin/settings">Einstellungen</a>
        }
        @if (auth.isLoggedIn) {
          <span class="user-info">{{ auth.currentUser?.displayName || auth.currentUser?.username }}</span>
          @if (auth.isOidcUser) {
            <button class="btn-change-password" (click)="changePassword()" title="Passwort ändern">🔒</button>
          }
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
      padding: 0 24px; height: 64px;
      background: var(--color-primary); color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .app-logo { height: 44px; width: auto; object-fit: contain; filter: drop-shadow(0 0 2px rgba(0,0,0,0.2)); }
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
    .btn-change-password {
      background: transparent; border: none;
      color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 1rem;
      opacity: 0.85;
    }
    .btn-change-password:hover { opacity: 1; background: rgba(255,255,255,0.15); }
    .app-main { flex: 1; padding: 24px; width: 100%; margin: 0 auto; box-sizing: border-box; }
  `]
})
export class AppComponent implements OnInit {
  logoUrl: string | null = 'assets/brandmark-violet.svg';

  constructor(
    public auth: AuthService,
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit() {
    this.api.getPublicSettings().subscribe(settings => {
      this.logoUrl = settings.logoUrl || 'assets/brandmark-violet.svg';
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  changePassword() {
    this.auth.changePassword();
  }
}
