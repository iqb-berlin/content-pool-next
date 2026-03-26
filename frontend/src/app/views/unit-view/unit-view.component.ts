import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';

@Component({
  selector: 'app-unit-view',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent, FormsModule],
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

      <div class="unit-layout" [class.with-panel]="panelVisible">
        <!-- Player area -->
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

          <!-- Page navigation -->
          @if (totalPages > 1 && printMode === 'off') {
            <div class="page-nav">
              <button class="btn btn-outline" [disabled]="currentPage <= 1" (click)="navigateToPage(currentPage - 1)">← Vorherige Seite</button>
              <span class="page-info">Seite {{ currentPage }} / {{ totalPages }}</span>
              <button class="btn btn-outline" [disabled]="currentPage >= totalPages" (click)="navigateToPage(currentPage + 1)">Nächste Seite →</button>
            </div>
          }
        </div>

        <!-- Metadata panel (split view) -->
        @if (panelVisible) {
          <div class="meta-panel card">
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
          </div>
        }
      </div>
    } @else {
      <div class="empty-state"><h3>Lade Aufgabe...</h3></div>
    }
  `,
  styles: [`
    .unit-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .unit-header h1 { margin-bottom: 0; }
    .unit-actions { display: flex; gap: 8px; }

    .unit-layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .unit-layout.with-panel { grid-template-columns: 1fr 380px; }

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

    @media (max-width: 900px) {
      .unit-layout.with-panel { grid-template-columns: 1fr; }
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
  activeTab: 'metadata' | 'coding' | 'richtext' = 'metadata';

  // Feature config
  featureConfig: any = {};
  showMetadataToggle = false;
  showCommentBtn = false;
  showDownloadBtn = false;

  private messageHandler = this.onPlayerMessage.bind(this);
  private autoResizeInterval: any;

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.unitId = this.route.snapshot.paramMap.get('unitId') || '';
    window.addEventListener('message', this.messageHandler);

    // Load ACP feature config
    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      this.featureConfig = data?.featureConfig || {};
      this.showMetadataToggle = !!(this.featureConfig.showMetadata || this.featureConfig.showCodingScheme || this.featureConfig.showRichText);
      this.showCommentBtn = !!(this.featureConfig.enableCommenting && this.featureConfig.commentTargets?.includes('UNIT'));
      this.showDownloadBtn = !!this.featureConfig.allowUnitDownload;

      // Set default active tab based on what's available
      if (this.featureConfig.showMetadata) this.activeTab = 'metadata';
      else if (this.featureConfig.showCodingScheme) this.activeTab = 'coding';
      else if (this.featureConfig.showRichText) this.activeTab = 'richtext';
    });

    // Load unit data
    this.api.getViewUnit(this.acpId, this.unitId).subscribe(u => {
      this.unit = u;
      this.breadcrumbs = [
        { label: 'ContentPool', route: ['/'] },
        { label: 'ACP', route: ['/view', this.acpId] },
        { label: u.name },
      ];

      // Map dependency URLs with tokens
      u.dependencies = u.dependencies?.map(d => ({
        ...d,
        downloadUrl: this.api.appendAuthToken(d.downloadUrl)
      }));

      // Find player HTML file
      const playerDep = u.dependencies?.find(d =>
        d.type === 'PLAYER' || d.type === 'player'
      );
      if (playerDep) {
        fetch(playerDep.downloadUrl)
          .then(res => res.text())
          .then(html => {
            this.playerSrcDoc = this.sanitizer.bypassSecurityTrustHtml(html);
          });
      }
    });
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
  }

  onPlayerLoaded() {
    if (!this.unit || !this.playerFrame?.nativeElement?.contentWindow) return;

    // Find unit definition file
    const definitionDep = this.unit.dependencies?.find(d =>
      d.type === 'UNIT_DEFINITION' || d.type === 'unitDefinition' || d.type === 'definition'
    );

    if (definitionDep) {
      // Fetch unit definition and send to player
      fetch(definitionDep.downloadUrl)
        .then(res => res.text())
        .then(definition => {
          this.sendToPlayer({
            type: 'vopStartCommand',
            sessionId: `review-${this.unitId}`,
            unitDefinition: definition,
            unitState: { dataParts: {} },
            playerConfig: {
              stateReportPolicy: 'none',
              pagingMode: this.printMode !== 'off' ? 'concat-scroll' : 'buttons',
              printMode: this.printMode,
              logPolicy: 'disabled',
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
      case 'vopStateChangedNotification':
        if (msg.playerState?.currentPage !== undefined) {
          this.currentPage = msg.playerState.currentPage + 1;  // 0-indexed → 1-indexed
        }
        if (msg.playerState?.validPages !== undefined) {
          this.totalPages = msg.playerState.validPages.length || this.totalPages;
        }
        break;

      case 'vopPageNavigationCommand':
        if (msg.target !== undefined) {
          this.currentPage = msg.target + 1;
        }
        break;

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

  navigateToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.sendToPlayer({
      type: 'vopPageNavigationCommand',
      target: page - 1,  // 1-indexed → 0-indexed
    });
  }

  togglePanel() {
    this.panelVisible = !this.panelVisible;
  }

  openComment() {
    // TODO: Open comment dialog
    console.log('Open comment dialog for unit', this.unitId);
  }

  downloadUnit() {
    const url = `/api/acp/${this.acpId}/files?unitId=${this.unitId}&format=zip`;
    window.open(this.api.appendAuthToken(url), '_blank');
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
