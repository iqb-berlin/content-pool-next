import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { CommentDialogComponent } from '../comment-dialog/comment-dialog.component';

@Component({
  selector: 'app-unit-view',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent, FormsModule, CommentDialogComponent, CommonModule],
  template: `
    @if (unit) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="unit-header">
        <h1>{{ unit.name }}</h1>
        <div class="unit-actions">
          @if (showMetadataToggle) {
            <button class="btn btn-outline btn-sm" (click)="togglePanel()">
              {{ panelVisible ? 'Zusatzdaten ausblenden' : 'Zusatzdaten anzeigen' }}
            </button>
          }
          @if (showMetadataToggle && panelVisible) {
            <select class="btn btn-outline btn-sm panel-mode-select" [(ngModel)]="panelMode" [disabled]="isNarrowLayout">
              <option value="split">Panel: Split</option>
              <option value="overlay">Panel: Overlay</option>
            </select>
          }
          @if (showCommentBtn) {
            <button class="btn btn-outline btn-sm" (click)="openComment()">💬 Kommentar</button>
          }
          @if (showDownloadBtn) {
            <button class="btn btn-outline btn-sm" (click)="downloadUnit()">⬇️ Download</button>
          }
          <select class="btn btn-outline btn-sm" [(ngModel)]="printMode" (change)="onPrintModeChange()">
            <option value="off">Print: Aus</option>
            <option value="on">Print: Ein</option>
            <option value="on-with-ids">Print: Ein + IDs</option>
          </select>
        </div>
      </div>

      <div class="unit-layout" [class.with-panel]="panelVisible && resolvedPanelMode === 'split'">
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
                <p>Für diese Aufgabe wurde kein Verona-Player gefunden.</p>
              </div>
            }
          </div>

          @if (totalPages > 1 && printMode === 'off') {
            <div class="page-nav">
              <button class="btn btn-outline" [disabled]="currentPage <= 1" (click)="navigateToPage(currentPage - 1)">← Vorherige Seite</button>
              <span class="page-info">Seite {{ currentPage }} / {{ totalPages }}</span>
              <button class="btn btn-outline" [disabled]="currentPage >= totalPages" (click)="navigateToPage(currentPage + 1)">Nächste Seite →</button>
            </div>
          }

          @if (panelVisible && resolvedPanelMode === 'overlay') {
            <div class="panel-overlay-backdrop" (click)="closeOverlayPanel()">
              <div class="meta-panel card overlay" (click)="$event.stopPropagation()">
                <div class="overlay-header">
                  <strong>Zusatzdaten</strong>
                  <button class="btn btn-outline btn-sm" (click)="togglePanel()">✕</button>
                </div>
                <ng-container [ngTemplateOutlet]="panelContent"></ng-container>
              </div>
            </div>
          }
        </div>

        @if (panelVisible && resolvedPanelMode === 'split') {
          <div class="meta-panel card split">
            <ng-container [ngTemplateOutlet]="panelContent"></ng-container>
          </div>
        }
      </div>

      <ng-template #panelContent>
        <div class="panel-tabs">
          @if (featureConfig.showMetadata) {
            <button class="tab" [class.active]="activeTab === 'metadata'" (click)="activeTab = 'metadata'">Metadaten</button>
          }
          @if (featureConfig.showCodingScheme) {
            <button class="tab" [class.active]="activeTab === 'coding'" (click)="activeTab = 'coding'">Kodierschema</button>
          }
          @if (featureConfig.showRichText) {
            <button class="tab" [class.active]="activeTab === 'richtext'" (click)="activeTab = 'richtext'">RichText</button>
          }
        </div>

        <div class="panel-content">
          @if (activeTab === 'metadata') {
            <dl class="meta-dl">
              <dt>ID</dt><dd><code>{{ unit.id }}</code></dd>
              @if (unit.lang) { <dt>Sprache</dt><dd>{{ unit.lang }}</dd> }
              @if (unit.description) { <dt>Beschreibung</dt><dd>{{ unit.description }}</dd> }
            </dl>
            @if (unit.items && unit.items.length) {
              <h4>Items ({{ unit.items.length }})</h4>
              <div class="items-list">
                @for (item of unit.items; track item.id) {
                  <a [routerLink]="['/view', acpId, 'item', item.id]" class="item-badge">{{ item.name || item.id }}</a>
                }
              </div>
            }
          }

          @if (activeTab === 'coding') {
            <div class="coding-content">
              @if (unit.codingScheme) {
                <div [innerHTML]="unit.codingScheme"></div>
              } @else {
                <p class="help-text">Kein Kodierschema verfügbar.</p>
              }
            </div>
          }

          @if (activeTab === 'richtext') {
            <div class="richtext-content">
              @if (unit.richText) {
                <div [innerHTML]="unit.richText"></div>
              } @else {
                <p class="help-text">Keine Zusatztexte verfügbar.</p>
              }
            </div>
          }
        </div>

        @if (unit.dependencies && unit.dependencies.length) {
          <div class="deps-section">
            <h4>Abhängigkeiten</h4>
            @for (dep of unit.dependencies; track dep.fileId) {
              <div class="dep-item">
                <span class="badge badge-info">{{ dep.type }}</span>
                <a [href]="api.appendAuthToken(dep.downloadUrl)" target="_blank">{{ dep.originalName }}</a>
              </div>
            }
          </div>
        }
      </ng-template>
    } @else {
      <div class="empty-state"><h3>Lade Aufgabe...</h3></div>
    }

    <app-comment-dialog
      [open]="commentOpen"
      [targetType]="'UNIT'"
      [targetId]="unitId"
      (submitted)="onCommentSubmitted($event)"
      (closed)="commentOpen = false">
    </app-comment-dialog>
  `,
  styles: [`
    .unit-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .unit-header h1 { margin-bottom: 0; }
    .unit-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .panel-mode-select { min-width: 150px; }

    .unit-layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .unit-layout.with-panel { grid-template-columns: 1fr 380px; }

    .player-area { position: relative; }
    .player-container { padding: 0; overflow: auto; min-height: 600px; }
    .player-container.print-mode { display: block; overflow: visible; flex: none; height: auto; min-height: 1000px; border: none; }
    .player-iframe {
      width: 100%; min-height: 550px; border: none;
      display: block;
    }
    .player-iframe.print-mode { min-height: 1000px; height: auto; }

    .page-nav {
      display: flex; align-items: center; justify-content: center;
      gap: 16px; margin-top: 12px;
    }
    .page-info {
      font-size: 0.9rem; font-weight: 500;
      color: var(--color-text-secondary);
    }

    .meta-panel { max-height: calc(100vh - 180px); overflow-y: auto; }
    .meta-panel.split { max-height: calc(100vh - 180px); }

    .panel-overlay-backdrop {
      position: absolute;
      inset: 0;
      border-radius: var(--radius);
      background: rgba(15, 23, 42, 0.18);
      display: flex;
      justify-content: flex-end;
      z-index: 25;
    }
    .meta-panel.overlay {
      width: min(420px, 100%);
      height: 100%;
      max-height: none;
      margin: 0;
      border-radius: 0 var(--radius) var(--radius) 0;
      border-left: 1px solid var(--color-border);
    }
    .overlay-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: -24px -24px 12px;
      padding: 16px 24px 8px;
      border-bottom: 1px solid var(--color-border);
      background: #fff;
      position: sticky;
      top: -24px;
      z-index: 2;
    }

    .panel-tabs {
      display: flex; gap: 0; border-bottom: 1px solid var(--color-border);
      margin: -24px -24px 16px; padding: 0 24px;
    }
    .tab {
      background: none; border: none; padding: 10px 16px;
      font-size: 0.85rem; font-weight: 500; cursor: pointer;
      color: var(--color-text-secondary); border-bottom: 2px solid transparent;
      font-family: inherit; transition: all 0.15s;
    }
    .tab:hover { color: var(--color-text); }
    .tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

    .meta-dl {
      display: grid; grid-template-columns: auto 1fr;
      gap: 8px 20px; font-size: 0.9rem;
    }
    .meta-dl dt { font-weight: 600; color: var(--color-text-secondary); }
    .meta-dl dd { margin: 0; }

    h4 { font-size: 0.95rem; margin: 16px 0 8px; }
    .items-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .item-badge {
      display: inline-block; padding: 4px 10px;
      background: var(--color-bg); border-radius: 4px;
      font-size: 0.8rem; text-decoration: none; color: var(--color-primary-light);
      transition: background 0.15s;
    }
    .item-badge:hover { background: rgba(41,128,185,0.1); text-decoration: none; }

    .deps-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-border); }
    .dep-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.85rem; }

    .coding-content, .richtext-content { font-size: 0.9rem; }
    .coding-content :first-child, .richtext-content :first-child { margin-top: 0; }
    .help-text { color: var(--color-text-secondary); font-size: 0.85rem; }

    @media (max-width: 1100px) {
      .unit-layout.with-panel { grid-template-columns: 1fr; }
      .panel-mode-select { opacity: 0.7; }
      .meta-panel.overlay {
        width: 100%;
        border-radius: var(--radius);
        border-left: none;
      }
      .overlay-header {
        position: static;
        margin-top: -24px;
      }
    }

    @media (max-width: 900px) {
      .unit-header { flex-direction: column; gap: 12px; align-items: flex-start; }
    }
  `]
})
export class UnitViewComponent implements OnInit, OnDestroy {
  @ViewChild('playerFrame') playerFrame!: ElementRef<HTMLIFrameElement>;

  acpId = '';
  unitId = '';
  unit: UnitViewData | null = null;
  playerSrcDoc: any = null;
  breadcrumbs: BreadcrumbItem[] = [];
  playerHeight = '100%';
  printMode: 'off' | 'on' | 'on-with-ids' = 'off';

  // Page navigation
  currentPage = 1;
  totalPages = 1;

  // Panel state
  panelVisible = false;
  panelMode: 'split' | 'overlay' = 'split';
  activeTab: 'metadata' | 'coding' | 'richtext' = 'metadata';
  isNarrowLayout = false;

  // Feature config
  featureConfig: any = {};
  showMetadataToggle = false;
  showCommentBtn = false;
  showDownloadBtn = false;
  commentOpen = false;

  private definitionContent: string | null = null;
  private playerFrameReady = false;
  private unitLoadToken = 0;
  private startSessionCounter = 0;

  private messageHandler = this.onPlayerMessage.bind(this);
  private resizeHandler = this.onWindowResize.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private sanitizer: DomSanitizer,
  ) {}

  get resolvedPanelMode(): 'split' | 'overlay' {
    return this.isNarrowLayout ? 'overlay' : this.panelMode;
  }

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.unitId = this.route.snapshot.paramMap.get('unitId') || '';

    this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('message', this.messageHandler);

    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      this.featureConfig = data?.featureConfig || {};
      this.showMetadataToggle = !!(this.featureConfig.showMetadata || this.featureConfig.showCodingScheme || this.featureConfig.showRichText);

      const commentTargets = Array.isArray(this.featureConfig.commentTargets)
        ? this.featureConfig.commentTargets
        : [];
      this.showCommentBtn = !!(this.featureConfig.enableCommenting && commentTargets.includes('UNIT'));
      this.showDownloadBtn = !!this.featureConfig.allowUnitDownload;

      if (this.featureConfig.showMetadata) this.activeTab = 'metadata';
      else if (this.featureConfig.showCodingScheme) this.activeTab = 'coding';
      else if (this.featureConfig.showRichText) this.activeTab = 'richtext';
    });

    this.api.getViewUnit(this.acpId, this.unitId).subscribe(u => {
      this.unit = u;
      this.breadcrumbs = [
        { label: 'Assessment Content Pool', route: ['/'] },
        { label: 'ACP', route: ['/view', this.acpId] },
        { label: u.name },
      ];

      u.dependencies = (u.dependencies || []).map(d => ({
        ...d,
        downloadUrl: this.api.appendAuthToken(d.downloadUrl)
      }));

      this.currentPage = 1;
      this.totalPages = 1;
      this.playerFrameReady = false;
      this.definitionContent = null;

      const token = ++this.unitLoadToken;
      this.loadPlayerSource(u.dependencies || [], token);
      this.loadDefinitionSource(u.dependencies || [], token);
    });
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;
    this.playerFrameReady = true;
    this.startPlayerIfReady();
  }

  onPrintModeChange() {
    const src = this.playerSrcDoc;
    if (!src) return;
    this.playerFrameReady = false;
    this.playerSrcDoc = null;
    setTimeout(() => {
      this.playerSrcDoc = src;
    }, 50);
  }

  private onPlayerMessage(event: MessageEvent) {
    const frameWindow = this.playerFrame?.nativeElement?.contentWindow;
    if (frameWindow && event.source !== frameWindow) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'vopStateChangedNotification': {
        if (Array.isArray(msg.playerState?.validPages) && msg.playerState.validPages.length > 0) {
          this.totalPages = msg.playerState.validPages.length;
        }
        if (typeof msg.playerState?.currentPage === 'number') {
          this.currentPage = this.clampPage(msg.playerState.currentPage + 1);
        } else {
          this.currentPage = this.clampPage(this.currentPage);
        }
        break;
      }

      case 'vopPageNavigationCommand': {
        if (typeof msg.target === 'number') {
          this.currentPage = this.clampPage(msg.target + 1);
        }
        break;
      }

      case 'vopResizeNotification': {
        if (typeof msg.height === 'number') {
          this.playerHeight = `${msg.height}px`;
        }
        break;
      }
    }
  }

  private sendToPlayer(msg: any) {
    this.playerFrame?.nativeElement?.contentWindow?.postMessage(msg, '*');
  }

  navigateToPage(page: number) {
    if (this.printMode !== 'off') return;
    if (!this.playerFrameReady) return;

    const target = Math.trunc(page);
    if (target < 1 || target > this.totalPages) return;

    this.currentPage = target;
    this.sendToPlayer({
      type: 'vopPageNavigationCommand',
      target: target - 1,
    });
  }

  togglePanel() {
    if (!this.showMetadataToggle) return;
    this.panelVisible = !this.panelVisible;
  }

  closeOverlayPanel() {
    if (this.resolvedPanelMode === 'overlay') {
      this.panelVisible = false;
    }
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

  downloadUnit() {
    const url = `/api/acp/${this.acpId}/files?unitId=${this.unitId}&format=zip`;
    window.open(this.api.appendAuthToken(url), '_blank');
  }

  private findDependency(types: string[]): any | undefined {
    const typeSet = new Set(types.map(t => t.toLowerCase()));
    return this.unit?.dependencies?.find(d => typeSet.has((d.type || '').toLowerCase()));
  }

  private loadPlayerSource(dependencies: any[], token: number) {
    const playerDep = dependencies.find((d: any) => {
      const type = String(d?.type || '').toLowerCase();
      return type === 'player';
    });

    if (!playerDep?.downloadUrl) {
      this.playerSrcDoc = null;
      return;
    }

    fetch(playerDep.downloadUrl)
      .then(res => res.text())
      .then(html => {
        if (token !== this.unitLoadToken) return;
        this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(html);
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.playerSrcDoc = null;
      });
  }

  private loadDefinitionSource(dependencies: any[], token: number) {
    const definitionDep = dependencies.find((d: any) => {
      const type = String(d?.type || '').toLowerCase();
      return type === 'unit_definition' || type === 'unitdefinition' || type === 'definition';
    });

    if (!definitionDep?.downloadUrl) {
      this.definitionContent = null;
      return;
    }

    fetch(definitionDep.downloadUrl)
      .then(res => res.text())
      .then(definition => {
        if (token !== this.unitLoadToken) return;
        this.definitionContent = definition;
        this.startPlayerIfReady();
      })
      .catch(() => {
        if (token !== this.unitLoadToken) return;
        this.definitionContent = null;
      });
  }

  private startPlayerIfReady() {
    if (!this.playerFrameReady || !this.definitionContent || !this.unit) return;

    this.startSessionCounter += 1;
    this.sendToPlayer({
      type: 'vopStartCommand',
      sessionId: `review-${this.unitId}-${this.startSessionCounter}`,
      unitDefinition: this.definitionContent,
      unitState: { dataParts: {} },
      playerConfig: {
        stateReportPolicy: 'none',
        pagingMode: this.printMode !== 'off' ? 'concat-scroll' : 'buttons',
        printMode: this.printMode,
        logPolicy: 'disabled',
        enabledNavigationTargets: ['next', 'previous', 'first', 'last', 'end'],
      },
    });

    this.currentPage = 1;
    this.totalPages = 1;
    this.applyPrintModeLayout();
  }

  private applyPrintModeLayout() {
    if (this.printMode === 'off') {
      this.playerHeight = '100%';
      this.stopAutoResize();
      return;
    }

    this.playerHeight = '2000px';
    this.startAutoResize();
  }

  private clampPage(page: number): number {
    const max = Math.max(this.totalPages, 1);
    if (page < 1) return 1;
    if (page > max) return max;
    return page;
  }

  private onWindowResize() {
    this.isNarrowLayout = window.innerWidth <= 1100;
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
