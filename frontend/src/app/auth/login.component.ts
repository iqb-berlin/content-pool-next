import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { OidcConfig } from '../core/models/api.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-wrapper">
      <div class="card login-card">
        <h1>Anmelden</h1>
        <p class="subtitle">IQB ContentPool</p>
        @if (error) { <div class="alert alert-error">{{ error }}</div> }
        
        @if (oidcConfig?.enabled) {
          <button type="button" class="btn btn-secondary oidc-btn" (click)="loginWithOidc()" [disabled]
="loading">
            <span class="oidc-icon">🔐</span> Mit Keycloak anmelden
          </button>
          <div class="divider"><span>oder</span></div>
        }
        
        <form (ngSubmit)="onSubmit()">
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
  `]
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  loading = false;
  error = '';
  oidcConfig: OidcConfig | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Check for error from query params
    this.route.queryParams.subscribe(params => {
      if (params['error']) {
        this.error = params['error'];
      }
    });

    // Load OIDC configuration
    this.auth.getOidcConfig().subscribe({
      next: (config) => {
        this.oidcConfig = config;
      },
      error: () => {
        this.oidcConfig = { enabled: false, issuerUrl: null, clientId: null, redirectUri: '', scope: '' };
      }
    });
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
