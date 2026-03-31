import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { PublicAcp } from '../../core/models/api.models';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="landing">
      <!-- Hero -->
      <section class="hero">
        @if (logoUrl) {
          <img [src]="logoUrl" alt="Logo" class="hero-logo" />
        }
        <h1>IQB ContentPool</h1>
        <p class="hero-sub">Assessment Content Packages für Lernstandserhebungen</p>
      </section>

      <!-- Custom landing page content from admin settings -->
      @if (landingHtml) {
        <section class="custom-content card" [innerHTML]="landingHtml"></section>
      }

      <!-- ACP grid -->
      <section class="acp-section">
        <h2>Verfügbare Pakete</h2>
        <div class="acp-grid">
          @for (acp of acps; track acp.id) {
            <div class="card acp-card">
              <div class="acp-card-header">
                <span class="badge" [class.badge-success]="acp.accessModel === 'PUBLIC' || acp.accessModel === 'CREDENTIALS_LIST'" [class.badge-info]="acp.accessModel !== 'PUBLIC' && acp.accessModel !== 'CREDENTIALS_LIST'">
                  {{ acp.accessModel === 'PUBLIC' || acp.accessModel === 'CREDENTIALS_LIST' ? 'Öffentlich' : 'Zugangsdaten erforderlich' }}
                </span>
              </div>
              <h3>{{ acp.name }}</h3>
              <p class="desc">{{ acp.description || 'Keine Beschreibung verfügbar.' }}</p>
              <div class="card-footer">
                @if (acp.requiresLogin) {
                  <a [routerLink]="['/credential-login', acp.id]" class="btn btn-primary">
                    <span class="btn-icon">🔑</span> Anmelden
                  </a>
                } @else {
                  <a [routerLink]="['/view', acp.id]" class="btn btn-primary">
                    <span class="btn-icon">📦</span> Öffnen
                  </a>
                }
              </div>
            </div>
          }
        </div>
        @if (!acps.length) {
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>Keine öffentlichen Pakete verfügbar</h3>
            <p>Es wurden noch keine Assessment Content Packages veröffentlicht.</p>
          </div>
        }
      </section>

      <!-- Footer -->
      <footer class="landing-footer">
        <div class="footer-links">
          @if (imprintHtml) {
            <button class="footer-link" (click)="showLegalDialog('imprint')">Impressum</button>
          }
          @if (privacyHtml) {
            <button class="footer-link" (click)="showLegalDialog('privacy')">Datenschutz</button>
          }
          @if (accessibilityHtml) {
            <button class="footer-link" (click)="showLegalDialog('accessibility')">Barrierefreiheit</button>
          }
        </div>
        <p class="footer-credit">IQB · Humboldt-Universität zu Berlin</p>
      </footer>

      <!-- Legal dialog overlay -->
      @if (activeLegalDialog) {
        <div class="dialog-overlay" (click)="closeLegalDialog()">
          <div class="dialog-content card" (click)="$event.stopPropagation()">
            <div class="dialog-header">
              <h2>{{ activeLegalTitle }}</h2>
              <button class="btn btn-outline btn-sm" (click)="closeLegalDialog()">✕</button>
            </div>
            <div class="dialog-body" [innerHTML]="activeLegalContent"></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .landing {
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 56px - 48px);
    }

    /* Hero */
    .hero {
      text-align: center;
      padding: 56px 24px 40px;
      background: linear-gradient(135deg, rgba(26,82,118,0.06) 0%, rgba(41,128,185,0.08) 100%);
      border-radius: var(--radius);
      margin-bottom: 32px;
    }
    .hero-logo {
      height: 64px;
      margin-bottom: 16px;
      object-fit: contain;
    }
    .hero h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }
    .hero-sub {
      color: var(--color-text-secondary);
      font-size: 1.15rem;
      font-weight: 300;
    }

    /* Custom content */
    .custom-content {
      margin-bottom: 32px;
      line-height: 1.7;
    }

    /* ACP Section */
    .acp-section { flex: 1; }
    .acp-section h2 {
      font-size: 1.4rem;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .acp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
    }

    /* ACP Card */
    .acp-card {
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: 1px solid var(--color-border);
    }
    .acp-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.1);
    }
    .acp-card-header {
      margin-bottom: 12px;
    }
    .acp-card h3 {
      font-size: 1.15rem;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .desc {
      color: var(--color-text-secondary);
      font-size: 0.9rem;
      line-height: 1.5;
      flex: 1;
    }
    .card-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border);
    }
    .btn-icon { margin-right: 4px; }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: var(--color-text-secondary);
    }
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 16px;
    }
    .empty-state h3 {
      color: var(--color-text);
      margin-bottom: 8px;
    }
    .empty-state p {
      font-size: 0.95rem;
    }

    /* Footer */
    .landing-footer {
      margin-top: 48px;
      padding: 24px 0;
      border-top: 1px solid var(--color-border);
      text-align: center;
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-bottom: 12px;
    }
    .footer-link {
      background: none;
      border: none;
      color: var(--color-primary-light);
      cursor: pointer;
      font-size: 0.85rem;
      font-family: inherit;
      padding: 0;
    }
    .footer-link:hover {
      text-decoration: underline;
    }
    .footer-credit {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }

    /* Legal dialog */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
    }
    .dialog-content {
      max-width: 680px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .dialog-header h2 { margin-bottom: 0; }
    .dialog-body { line-height: 1.7; font-size: 0.95rem; }
  `]
})
export class LandingComponent implements OnInit {
  acps: PublicAcp[] = [];
  logoUrl: string | null = null;
  landingHtml: SafeHtml | null = null;
  imprintHtml: SafeHtml | null = null;
  privacyHtml: SafeHtml | null = null;
  accessibilityHtml: SafeHtml | null = null;

  activeLegalDialog: boolean = false;
  activeLegalTitle: string = '';
  activeLegalContent: SafeHtml | null = null;

  constructor(
    private api: ApiService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    forkJoin({
      settings: this.api.getPublicSettings(),
      acps: this.api.getPublicAcps(),
    }).subscribe(({ settings, acps }) => {
      this.acps = acps;
      this.logoUrl = settings.logoUrl;
      if (settings.landingPageHtml) {
        this.landingHtml = this.sanitizer.bypassSecurityTrustHtml(settings.landingPageHtml);
      }
      if (settings.imprintHtml) {
        this.imprintHtml = this.sanitizer.bypassSecurityTrustHtml(settings.imprintHtml);
      }
      if (settings.privacyHtml) {
        this.privacyHtml = this.sanitizer.bypassSecurityTrustHtml(settings.privacyHtml);
      }
      if (settings.accessibilityHtml) {
        this.accessibilityHtml = this.sanitizer.bypassSecurityTrustHtml(settings.accessibilityHtml);
      }
    });
  }

  showLegalDialog(type: 'imprint' | 'privacy' | 'accessibility') {
    const titles = { imprint: 'Impressum', privacy: 'Datenschutz', accessibility: 'Barrierefreiheit' };
    const contents = { imprint: this.imprintHtml, privacy: this.privacyHtml, accessibility: this.accessibilityHtml };
    this.activeLegalTitle = titles[type];
    this.activeLegalContent = contents[type];
    this.activeLegalDialog = true;
  }

  closeLegalDialog() {
    this.activeLegalDialog = false;
  }
}
