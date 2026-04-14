import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { AuthContext, OidcConfig } from '../core/models/api.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="login-wrapper">
      <div class="card login-card">
        <h1>{{ getTitle() }}</h1>
        <p class="subtitle">{{ getSubtitle() }}</p>

        @if (error) {
          <div class="alert alert-error">{{ error }}</div>
        }

        @if (message) {
          <div class="alert alert-success">{{ message }}</div>
        }

        @if (loading) {
          <div class="loading">Lade...</div>
        }

        @if (!loading && authContext) {
          <!-- OIDC Button: Show for admin context or when OIDC is enabled and not acp-only -->
          @if (showOidcButton()) {
            <button type="button" class="btn btn-secondary oidc-btn" (click)="loginWithOidc()" [disabled]="loading">
              <span class="oidc-icon">🔐</span> Mit Keycloak anmelden
            </button>
          }

          <!-- Local Login Form: Show for credentials access or default when OIDC disabled -->
          @if (showLocalForm()) {
            @if (showOidcButton()) {
              <div class="divider"><span>oder</span></div>
            }

            <form>
              <div class="form-group">
                <label for="username">Benutzername</label>
                <input id="username" [(ngModel)]="username" name="username" required autofocus>
              </div>
              <div class="form-group">
                <label for="password">Kennwort</label>
                <input id="password" type="password" [(ngModel)]="password" name="password" required>
              </div>
              <button type="submit" class="btn btn-primary" style="width:100%" [disabled]="loading">
                {{ loading ? 'Anmelden...' : 'Anmelden' }}
              </button>
            </form>
          }

          <!-- No methods available -->
          @if (authContext.allowedMethods.length === 0) {
            <div class="alert alert-error">
              {{ authContext.message }}
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .login-card { width: 100%; max-width: 400px; }
    .subtitle { color: var(--color-text-secondary); margin-bottom: 24px; }
    .oidc-btn { width: 100%; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .oidc-icon { font-size: 1.2em; }
    .divider { text-align: center; margin: 16px 0; position: relative; }
    .divider::before, .divider::after { content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: var(--color-border); }
    .divider::before { left: 0; }
    .divider::after { right: 0; }
    .divider span { color: var(--color-text-secondary); font-size: 0.85rem; padding: 0 8px; background: white; }
    .loading { text-align: center; padding: 20px; color: var(--color-text-secondary); }
    .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 12px; border-radius: 4px; margin-bottom: 16px; }
  `]
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  loading = false;
  error = '';
  message = '';
  authContext: AuthContext | null = null;
  oidcConfig: OidcConfig | null = null;
  forType: 'admin' | 'acp' | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Get context from query params
    this.route.queryParams.subscribe(params => {
      if (params['error']) {
        this.error = params['error'];
      }
      if (params['message']) {
        this.message = params['message'];
      }

      const forParam = params['for'];
      if (forParam === 'admin' || forParam === 'acp') {
        this.forType = forParam;
      }

      // Load auth context
      this.loadAuthContext();
    });
  }

  private loadAuthContext() {
    this.loading = true;

    this.auth.getAuthContext(this.forType).subscribe({
      next: (context) => {
        this.authContext = context;
        this.loading = false;
      },
      error: () => {
        this.authContext = {
          allowedMethods: ['credentials'],
          oidcEnabled: false,
          message: 'Bitte wählen Sie eine Anmeldemethode'
        };
        this.loading = false;
      }
    });

    // Also load OIDC config for display
    this.auth.getOidcConfig().subscribe({
      next: (config) => {
        this.oidcConfig = config;
      },
      error: () => {
        this.oidcConfig = { enabled: false, issuerUrl: null, clientId: null, redirectUri: '', scope: '' };
      }
    });
  }

  getTitle(): string {
    switch (this.forType) {
      case 'admin': return 'Admin-Anmeldung';
      case 'acp': return 'ACP-Zugang';
      default: return 'Anmelden';
    }
  }

  getSubtitle(): string {
    switch (this.forType) {
      case 'admin': return 'IQB ContentPool - Administration';
      case 'acp': return 'Geschützter ACP-Zugang';
      default: return 'IQB ContentPool';
    }
  }

  showOidcButton(): boolean {
    if (!this.authContext) return false;
    return this.authContext.allowedMethods.includes('oidc');
  }

  showLocalForm(): boolean {
    if (!this.authContext) return false;
    return this.authContext.allowedMethods.includes('credentials');
  }

  loginWithOidc() {
    this.auth.initiateOidcLogin();
  }

  onSubmit() {
    this.loading = true;
    this.error = '';
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.router.navigate(['/']);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Anmeldung fehlgeschlagen';
        this.loading = false;
      }
    });
  }
}
