import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';

@Component({
  selector: 'app-unit-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (unit) {
      <div class="page-header">
        <h1>{{ unit.name }}</h1>
        <a [routerLink]="['/view', acpId, 'units']" class="btn btn-outline">← Zurück</a>
      </div>

      <div class="unit-layout">
        <div class="player-area card">
          <h3>Aufgabe</h3>
          @if (playerUrl) {
            <iframe [src]="playerUrl" class="player-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
          } @else {
            <div class="empty-state">
              <h3>Kein Player verfügbar</h3>
              <p>Für diese Aufgabe wurde kein Verona-Player gefunden.</p>
            </div>
          }
        </div>

        <div class="meta-area card">
          <h3>Metadaten</h3>
          <dl>
            <dt>ID</dt><dd>{{ unit.id }}</dd>
            @if (unit.lang) { <dt>Sprache</dt><dd>{{ unit.lang }}</dd> }
            @if (unit.description) { <dt>Beschreibung</dt><dd>{{ unit.description }}</dd> }
          </dl>

          @if (unit.items?.length) {
            <h3 style="margin-top:16px">Items</h3>
            @for (item of unit.items; track item.id) {
              <div class="item-badge">{{ item.name || item.id }}</div>
            }
          }

          @if (unit.dependencies?.length) {
            <h3 style="margin-top:16px">Abhängigkeiten</h3>
            @for (dep of unit.dependencies; track dep.fileId) {
              <div class="dep-item">
                <span class="badge badge-info">{{ dep.type }}</span>
                <a [href]="dep.downloadUrl" target="_blank">{{ dep.originalName }}</a>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .unit-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .player-iframe { width: 100%; min-height: 500px; border: 1px solid var(--color-border); border-radius: var(--radius); }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 0.9rem; }
    dt { font-weight: 600; color: var(--color-text-secondary); }
    .item-badge { display: inline-block; padding: 2px 8px; margin: 2px 4px; background: var(--color-bg); border-radius: 4px; font-size: 0.85rem; }
    .dep-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    @media (max-width: 768px) { .unit-layout { grid-template-columns: 1fr; } }
  `]
})
export class UnitViewComponent implements OnInit {
  acpId = '';
  unitId = '';
  unit: UnitViewData | null = null;
  playerUrl: any = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.unitId = this.route.snapshot.paramMap.get('unitId') || '';
    this.api.getViewUnit(this.acpId, this.unitId).subscribe(u => {
      this.unit = u;
      // Find player dependency
      const player = u.dependencies?.find(d => d.type === 'PLAYER' || d.type === 'player');
      if (player) {
        this.playerUrl = player.downloadUrl;
      }
    });
  }
}
