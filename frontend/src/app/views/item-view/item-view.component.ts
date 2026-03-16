import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';

@Component({
  selector: 'app-item-view',
  standalone: true,
  imports: [RouterLink, MetadataPanelComponent],
  template: `
    @if (unit && item) {
      <div class="page-header">
        <h1>Item: {{ item.name || item.id }}</h1>
        <a [routerLink]="['/view', acpId, 'items']" class="btn btn-outline">← Zur Item-Liste</a>
      </div>

      <div class="item-layout">
        <div class="player-area card">
          <h3>Aufgabe: {{ unit.name }}</h3>
          @if (playerUrl) {
            <iframe [src]="playerUrl" class="player-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
          } @else {
            <div class="empty-state">
              <h3>Kein Player verfügbar</h3>
            </div>
          }
          <div class="item-highlight">
            <span class="badge badge-info">Item hervorgehoben: {{ item.name || item.id }}</span>
          </div>
        </div>

        <div class="meta-area">
          <app-metadata-panel [unit]="unit" [highlightItemId]="itemId"></app-metadata-panel>
        </div>
      </div>
    } @else if (!loading) {
      <div class="empty-state"><h3>Item nicht gefunden</h3></div>
    }
  `,
  styles: [`
    .item-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .player-iframe { width: 100%; min-height: 500px; border: 1px solid var(--color-border); border-radius: var(--radius); }
    .item-highlight { padding: 12px; background: rgba(41,128,185,0.08); border-radius: var(--radius); margin-top: 12px; }
    @media (max-width: 768px) { .item-layout { grid-template-columns: 1fr; } }
  `]
})
export class ItemViewComponent implements OnInit {
  acpId = '';
  itemId = '';
  unit: UnitViewData | null = null;
  item: any = null;
  playerUrl: any = null;
  loading = true;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.itemId = this.route.snapshot.paramMap.get('itemId') || '';

    this.api.getViewItems(this.acpId).subscribe(items => {
      this.item = items.find((i: any) => i.itemId === this.itemId);
      if (this.item) {
        this.api.getViewUnit(this.acpId, this.item.unitId).subscribe(u => {
          this.unit = u;
          const player = u.dependencies?.find(d => d.type === 'PLAYER' || d.type === 'player');
          if (player) this.playerUrl = player.downloadUrl;
          this.loading = false;
        });
      } else {
        this.loading = false;
      }
    });
  }
}
