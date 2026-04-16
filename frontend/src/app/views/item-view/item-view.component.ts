import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { VoudService } from '../../core/services/voud.service';
import { UnitViewData } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { MetadataPanelComponent } from '../metadata-panel/metadata-panel.component';
import { CommentDialogComponent } from '../comment-dialog/comment-dialog.component';

@Component({
  selector: 'app-item-view',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent, MetadataPanelComponent, FormsModule, CommentDialogComponent],
  template: `
    @if (unit && item) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="item-header">
        <h1>Item: {{ item.name || item.id }}</h1>
        <div class="item-actions">
          <select class="btn btn-outline btn-sm" [(ngModel)]="printMode" (change)="onPrintModeChange()">
            <option value="off">Print: Aus</option>
            <option value="on">Print: Ein</option>
            <option value="on-with-ids">Print: Ein + IDs</option>
          </select>
          @if (showCommentBtn) {
            <button class="btn btn-outline btn-sm" (click)="openComment()">💬 Kommentar</button>
          }
          <a [routerLink]="['/view', acpId, 'items']" class="btn btn-outline btn-sm">← Zur Item-Liste</a>
        </div>
      </div>

      <div class="item-layout">
        <div class="player-area">
          <div class="player-container card" [class.print-mode]="printMode !== 'off'">
            @if (playerSrcDoc) {
              <iframe
                #playerFrame
                [srcdoc]="playerSrcDoc"
                class="player-iframe"
                [style.height]="playerHeight"
                [class.print-mode]="printMode !== 'off'"
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

    <app-comment-dialog
      [open]="commentOpen"
      [targetType]="'ITEM'"
      [targetId]="item?.itemId || item?.id || itemId"
      (submitted)="onCommentSubmitted($event)"
      (closed)="commentOpen = false">
    </app-comment-dialog>
  `,
  styles: [`
    .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .item-header h1 { margin-bottom: 0; }
    .item-actions { display: flex; gap: 8px; align-items: center; }
    .item-layout { display: grid; grid-template-columns: 1fr 380px; gap: 16px; }
    .player-container { padding: 0; overflow: auto; min-height: 600px; }
    .player-container.print-mode { display: block; overflow: visible; flex: none; height: auto; min-height: 1000px; border: none; }
    .player-iframe { width: 100%; min-height: 550px; border: none; display: block; }
    .player-iframe.print-mode { min-height: 1000px; height: auto; }
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
  playerHeight = '100%';
  printMode: 'off' | 'on' | 'on-with-ids' = 'off';
  showCommentBtn = false;
  commentOpen = false;

  private messageHandler = this.onPlayerMessage.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private sanitizer: DomSanitizer,
    private voudService: VoudService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.itemId = this.route.snapshot.paramMap.get('itemId') || '';

    window.addEventListener('message', this.messageHandler);

    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      const fc = data?.featureConfig || {};
      this.showCommentBtn = !!(fc.enableCommenting && fc.commentTargets?.includes('ITEM'));
    });

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

  ngOnDestroy() {
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;

    const definitionDep = this.unit.dependencies?.find(d =>
      d.type === 'UNIT_DEFINITION' || d.type === 'unitDefinition' || d.type === 'definition'
    );

    if (definitionDep) {
      fetch(definitionDep.downloadUrl)
        .then(res => res.text())
        .then(definition => {
          const startPage = this.voudService.getStartPage(definition, this.item?.variableId || '');
          this.sendToPlayer({
            type: 'vopStartCommand',
            sessionId: `review-item-${this.itemId}`,
            unitDefinition: definition,
            unitState: { dataParts: {} },
            playerConfig: {
              stateReportPolicy: 'none',
              pagingMode: this.printMode !== 'off' ? 'concat-scroll' : 'buttons',
              printMode: this.printMode,
              logPolicy: 'disabled',
              startPage: startPage !== undefined ? startPage.toString() : undefined,
              enabledNavigationTargets: ['next', 'previous', 'first', 'last', 'end']
            },
          });
          if (this.printMode === 'off') {
            this.playerHeight = '100%';
            this.stopAutoResize();
          } else {
            this.playerHeight = '2000px';
            this.startAutoResize();
          }
        });
    }
  }

  onPrintModeChange() {
    const src = this.playerSrcDoc;
    this.playerSrcDoc = null;
    setTimeout(() => {
      this.playerSrcDoc = src;
    }, 50);
  }

  private onPlayerMessage(event: MessageEvent) {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'vopResizeNotification':
        if (msg.height !== undefined) {
          this.playerHeight = `${msg.height}px`;
        }
        break;
    }
  }

  private sendToPlayer(msg: any) {
    this.playerFrame?.nativeElement?.contentWindow?.postMessage(msg, '*');
  }

  openComment() {
    this.commentOpen = true;
  }

  onCommentSubmitted(event: { targetType: string; targetId: string; commentText: string }) {
    this.api.createComment(this.acpId, event).subscribe({
      next: () => {
        this.commentOpen = false;
      },
    });
  }

  private startAutoResize() {
    this.stopAutoResize();
    this.autoResizeInterval = setInterval(() => {
      try {
        const frame = this.playerFrame?.nativeElement;
        const doc = frame?.contentDocument || frame?.contentWindow?.document;
        if (doc && doc.body) {
          const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 600);
          if (height > 0 && this.playerHeight !== `${height}px`) {
            this.playerHeight = `${height}px`;
          }
        }
      } catch (e) {
        // Fallback for cross-origin or other errors
      }
    }, 500);
  }

  private stopAutoResize() {
    if (this.autoResizeInterval) {
      clearInterval(this.autoResizeInterval);
      this.autoResizeInterval = null;
    }
  }
}
