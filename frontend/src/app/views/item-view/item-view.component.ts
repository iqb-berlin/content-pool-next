import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';

@Component({
  selector: 'app-item-view',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent, MetadataPanelComponent],
  template: `
    @if (unit && item) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="item-header">
        <h1>Item: {{ item.name || item.id }}</h1>
        <div class="item-actions">
          <a [routerLink]="['/view', acpId, 'items']" class="btn btn-outline btn-sm">← Zur Item-Liste</a>
        </div>
      </div>

      <div class="item-layout">
        <div class="player-area">
          <div class="player-container card">
            @if (playerSrcDoc) {
              <iframe
                #playerFrame
                [srcdoc]="playerSrcDoc"
                class="player-iframe"
                sandbox="allow-scripts allow-same-origin allow-downloads"
                (load)="onPlayerLoaded()">
              </iframe>
            } @else {
              <div class="empty-state">
                <div style="font-size:2.5rem;margin-bottom:12px">🎮</div>
                <h3>Kein Player verfügbar</h3>
              </div>
            }
          </div>
          <div class="item-highlight-info card">
            <span class="badge badge-info">📍 Item-Position</span>
            <p>Dieses Item befindet sich in der Aufgabe <strong>{{ unit.name }}</strong>.</p>
          </div>
        </div>

        <div class="meta-area">
          <app-metadata-panel [unit]="unit" [highlightItemId]="item.id"></app-metadata-panel>
        </div>
      </div>
    } @else if (!loading) {
      <div class="empty-state"><h3>Item nicht gefunden</h3></div>
    }
  `,
  styles: [`
    .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .item-header h1 { margin-bottom: 0; }
    .item-layout { display: grid; grid-template-columns: 1fr 380px; gap: 16px; }
    .player-container { padding: 0; overflow: hidden; }
    .player-iframe { width: 100%; min-height: 550px; border: none; display: block; }
    .item-highlight-info { margin-top: 12px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
    .item-highlight-info p { margin: 0; font-size: 0.9rem; color: var(--color-text-secondary); }
    @media (max-width: 900px) {
      .item-layout { grid-template-columns: 1fr; }
      .item-header { flex-direction: column; gap: 12px; align-items: flex-start; }
    }
  `]
})
export class ItemViewComponent implements OnInit, OnDestroy {
  @ViewChild('playerFrame') playerFrame!: ElementRef<HTMLIFrameElement>;

  acpId = '';
  itemId = '';
  unit: UnitViewData | null = null;
  item: any = null;
  playerSrcDoc: any = null;
  breadcrumbs: BreadcrumbItem[] = [];
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.itemId = this.route.snapshot.paramMap.get('itemId') || '';

    this.api.getViewItems(this.acpId).subscribe(items => {
      this.item = items.find((i: any) => i.itemId === this.itemId || i.id === this.itemId);
      if (this.item) {
        this.api.getViewUnit(this.acpId, this.item.unitId).subscribe(u => {
          this.unit = u;
          this.breadcrumbs = [
            { label: 'ContentPool', route: ['/'] },
            { label: 'ACP', route: ['/view', this.acpId] },
            { label: 'Items', route: ['/view', this.acpId, 'items'] },
            { label: this.item.name || this.item.id },
          ];

          // Map dependency URLs with tokens
          u.dependencies = u.dependencies?.map(d => ({
            ...d,
            downloadUrl: this.api.appendAuthToken(d.downloadUrl)
          }));

          const playerDep = u.dependencies?.find(d => d.type === 'PLAYER' || d.type === 'player');
          if (playerDep) {
            fetch(playerDep.downloadUrl)
              .then(res => res.text())
              .then(html => {
                this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(html);
              });
          }
          this.loading = false;
        });
      } else {
        this.loading = false;
      }
    });
  }

  ngOnDestroy() {}

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;

    const definitionDep = this.unit.dependencies?.find(d =>
      d.type === 'UNIT_DEFINITION' || d.type === 'unitDefinition' || d.type === 'definition'
    );

    if (definitionDep) {
      fetch(definitionDep.downloadUrl)
        .then(res => res.text())
        .then(definition => {
          const startPage = this.getStartPage(definition, this.item?.variableId || '');
          this.sendToPlayer({
            type: 'vopStartCommand',
            sessionId: `review-item-${this.itemId}`,
            unitDefinition: definition,
            unitState: { dataParts: {} },
            playerConfig: {
              stateReportPolicy: 'none',
              pagingMode: 'buttons',
              logPolicy: 'disabled',
              startPage: startPage || undefined
            },
          });

          // If the item metadata specifies a page, we could navigate there.
          // For now, we rely on the player's default start.
          // In some players, we can pass "highlight" parameters.
        });
    }
  }

  private getStartPage(definition: string, variableId: string): string | undefined {
    if (!variableId) return undefined;
    try {
      const def = JSON.parse(definition);
      if (!def.pages || !Array.isArray(def.pages)) return undefined;

      const containsVar = (node: any): boolean => {
        if (!node || typeof node !== 'object') return false;
        if (node.id === variableId || node.alias === variableId) return true;
        for (const key of Object.keys(node)) {
          if (['value', 'visibilityRules'].includes(key)) continue;
          if (Array.isArray(node[key])) {
            if (node[key].some(containsVar)) return true;
          } else if (typeof node[key] === 'object') {
            if (containsVar(node[key])) return true;
          }
        }
        return false;
      };

      for (const page of def.pages) {
        if (containsVar(page)) return page.id;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  private sendToPlayer(msg: any) {
    this.playerFrame?.nativeElement?.contentWindow?.postMessage(msg, '*');
  }
}
