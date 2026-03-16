import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PublicAcp } from '../../core/models/api.models';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="hero">
      <h1>IQB ContentPool</h1>
      <p class="hero-sub">Assessment Content Packages für Lernstandserhebungen</p>
    </div>

    <h2>Verfügbare Pakete</h2>
    <div class="acp-grid">
      @for (acp of acps; track acp.id) {
        <div class="card acp-card">
          <h3>{{ acp.name }}</h3>
          <p class="desc">{{ acp.description || 'Keine Beschreibung' }}</p>
          <div class="card-footer">
            <span class="badge" [class.badge-success]="acp.accessModel === 'PUBLIC'" [class.badge-info]="acp.accessModel !== 'PUBLIC'">
              {{ acp.accessModel === 'PUBLIC' ? 'Öffentlich' : 'Zugangsdaten erforderlich' }}
            </span>
            @if (acp.requiresLogin) {
              <a [routerLink]="['/credential-login', acp.id]" class="btn btn-sm btn-primary">Anmelden</a>
            } @else {
              <a [routerLink]="['/view', acp.id]" class="btn btn-sm btn-primary">Öffnen</a>
            }
          </div>
        </div>
      }
    </div>
    @if (!acps.length) {
      <div class="empty-state"><h3>Keine öffentlichen Pakete verfügbar</h3></div>
    }
  `,
  styles: [`
    .hero { text-align: center; padding: 48px 0 32px; }
    .hero h1 { font-size: 2.25rem; }
    .hero-sub { color: var(--color-text-secondary); font-size: 1.1rem; margin-top: 8px; }
    .acp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .acp-card { display: flex; flex-direction: column; }
    .desc { color: var(--color-text-secondary); font-size: 0.9rem; flex: 1; }
    .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
  `]
})
export class LandingComponent implements OnInit {
  acps: PublicAcp[] = [];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getPublicAcps().subscribe(acps => this.acps = acps);
  }
}
