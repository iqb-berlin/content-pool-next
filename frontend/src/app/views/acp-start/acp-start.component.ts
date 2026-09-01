import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';

@Component({
  selector: 'app-acp-start',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent],
  template: `
    @if (data) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="acp-header">
        <div class="acp-header-main">
          <h1>{{ data.name }}</h1>
          @if (canManageAcp) {
            <a [routerLink]="['/manage', acpId]" class="btn btn-outline btn-sm">← Zur Verwaltung</a>
          }
        </div>
        @if (data.description) {
          <p class="desc">{{ data.description }}</p>
        }
      </div>

      <div class="sections-grid">
        <!-- ACP-Index — always available -->
        <a [routerLink]="['/view', acpId, 'index']" class="card section-card">
          <div class="section-icon">🗂️</div>
          <h3>ACP-Index</h3>
          <p>Paketstruktur interaktiv durchsuchen</p>
        </a>

        <!-- Units list — always available if units exist -->
        @if (data.units?.length && fc.enableUnitListNavigation !== false) {
          <a [routerLink]="['/view', acpId, 'units']" class="card section-card">
            <div class="section-icon">📝</div>
            <h3>Aufgaben</h3>
            <p>{{ data.units.length }} Aufgaben verfügbar</p>
          </a>
        }

        <!-- Task sequences — only if enableSequenceNavigation -->
        @if (data.sequences?.length && fc.enableSequenceNavigation !== false) {
          <div class="card section-card sequences-card">
            <div class="section-icon">📋</div>
            <h3>Aufgabenfolgen</h3>
            <div class="seq-list">
              @for (seq of data.sequences; track seq.id) {
                <a [routerLink]="['/view', acpId, 'sequence', seq.id]" class="seq-link">
                  {{ sequenceLabel(seq) }}
                </a>
              }
            </div>
          </div>
        }

        <!-- Item list — only if enableItemList -->
        @if (fc.enableItemList !== false) {
          <a [routerLink]="['/view', acpId, 'items']" class="card section-card">
            <div class="section-icon">📊</div>
            <h3>Item-Liste</h3>
            <p>Alle Items mit Metadaten anzeigen</p>
          </a>

          <a [routerLink]="['/view', acpId, 'item-explorer']" class="card section-card">
            <div class="section-icon">🔭</div>
            <h3>Item-Explorer</h3>
            <p>Items interaktiv durchsuchen und anzeigen</p>
          </a>
        }

        <!-- Downloads — only if any download flag is enabled -->
        @if (fc.allowIndexDownload || fc.allowUnitDownload || fc.allowFileDownload) {
          <div class="card section-card">
            <div class="section-icon">⬇️</div>
            <h3>Downloads</h3>
            <div class="download-links">
              @if (fc.allowIndexDownload) {
                <button class="btn btn-outline btn-sm" (click)="downloadIndex()">
                  ACP-Index (JSON)
                </button>
              }
              @if (fc.allowUnitDownload) {
                <span class="download-info">Unit-Download verfügbar in Aufgabenansicht</span>
              }
            </div>
          </div>
        }

        <!-- Commenting info -->
        @if (fc.enableCommenting) {
          <div class="card section-card">
            <div class="section-icon">💬</div>
            <h3>Kommentare</h3>
            @if (itemCommentsEnabled) {
              <p class="comment-context-hint">
                Item-Kommentare werden direkt beim ausgewählten Item im Item-Explorer erfasst.
              </p>
              <a
                [routerLink]="['/view', acpId, 'item-explorer']"
                class="btn btn-outline btn-sm item-comment-link"
              >
                Item-Kommentare im Item-Explorer
              </a>
            }
            @if (isLoggedIn) {
              <div class="comment-actions">
                <button
                  class="btn btn-outline btn-sm"
                  (click)="loadMyComments()"
                  [disabled]="commentsLoading"
                >
                  {{ commentsLoading ? 'Aktualisierung läuft …' : '↻ Aktualisieren' }}
                </button>
                <button class="btn btn-outline btn-sm" (click)="exportMyCommentsCsv()">
                  Meine Kommentare (CSV)
                </button>
                <button class="btn btn-outline btn-sm" (click)="exportMyCommentsXlsx()">
                  Meine Kommentare (XLSX)
                </button>
                @if (canExportAllComments) {
                  <button class="btn btn-outline btn-sm" (click)="exportAllCommentsXlsx()">
                    Alle Kommentare (XLSX)
                  </button>
                }
              </div>
              @if (commentsError) {
                <p class="comment-error" role="alert">{{ commentsError }}</p>
              }
              @if (myComments.length > 0) {
                <div class="my-comments">
                  <h4>
                    {{ Math.min(3, myComments.length) }} von {{ myComments.length }} eigenen
                    Kommentaren
                  </h4>
                  @for (c of myComments.slice(0, 3); track c.id) {
                    <div class="comment-summary">
                      <span class="badge badge-info">{{ c.targetType }}</span>
                      <span class="comment-text">{{ c.commentText }}</span>
                      @if (c.targetType === 'ITEM' && c.unitId && c.itemId) {
                        <a
                          [routerLink]="['/view', acpId, 'item-explorer']"
                          [queryParams]="{ unitId: c.unitId, itemId: c.itemId, comments: 'open' }"
                          class="comment-deep-link"
                        >
                          Öffnen
                        </a>
                      }
                    </div>
                  }
                </div>
              }
            } @else {
              <p class="download-info">Für Kommentare bitte anmelden.</p>
            }
          </div>
        }
      </div>
    } @else {
      <div class="empty-state">
        <h3>Lade ACP-Daten...</h3>
      </div>
    }
  `,
  styles: [
    `
      .acp-header {
        margin-bottom: 32px;
      }
      .acp-header-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .acp-header h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .desc {
        color: var(--color-text-secondary);
        font-size: 1.05rem;
        line-height: 1.6;
      }

      .sections-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
      }

      .section-card {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: inherit;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
        border: 1px solid var(--color-border);
      }
      a.section-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        text-decoration: none;
      }
      .section-icon {
        font-size: 2rem;
        margin-bottom: 12px;
      }
      .section-card h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .section-card p {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        line-height: 1.5;
      }

      .seq-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 8px;
      }
      .seq-link {
        display: block;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--color-primary-light);
        transition: background 0.15s;
      }
      .seq-link:hover {
        background: rgba(41, 128, 185, 0.06);
        text-decoration: none;
      }

      .download-links {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .download-info {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }

      .comment-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
      }
      .comment-context-hint {
        margin-bottom: 10px;
      }
      .item-comment-link {
        align-self: flex-start;
      }
      .my-comments {
        margin-top: 16px;
        border-top: 1px solid var(--color-border);
        padding-top: 12px;
      }
      .my-comments h4 {
        font-size: 0.85rem;
        margin-bottom: 8px;
        color: var(--color-text-secondary);
      }
      .comment-summary {
        font-size: 0.8rem;
        padding: 4px 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .comment-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .comment-error {
        color: var(--color-danger-text);
        font-size: 0.85rem;
      }
      .comment-deep-link {
        margin-left: auto;
        white-space: nowrap;
      }
    `,
  ],
})
export class AcpStartComponent implements OnInit, OnDestroy {
  acpId = '';
  data: any = null;
  fc: any = {}; // feature config
  breadcrumbs: BreadcrumbItem[] = [];
  canManageAcp = false;
  myComments: any[] = [];
  commentsLoading = false;
  commentsError = '';
  readonly Math = Math;
  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(ActivatedRoute) private route: ActivatedRoute,
    @Inject(ApiService) private api: ApiService,
    @Inject(AuthService) private auth: AuthService,
  ) {}

  get isLoggedIn(): boolean {
    return this.auth.isLoggedIn;
  }

  get itemCommentsEnabled(): boolean {
    if (!this.fc.enableCommenting) return false;
    const targets = Array.isArray(this.fc.commentTargets) ? this.fc.commentTargets : [];
    return targets.length === 0 || targets.includes('ITEM');
  }

  get canExportAllComments(): boolean {
    return this.canManageAcp || this.auth.isAdmin;
  }

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.updateManagerState();
    this.auth.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateManagerState();
    });

    this.api
      .getAcpStartPage(this.acpId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((d) => {
        this.data = d;
        this.fc = d?.featureConfig || {};
        this.updateBreadcrumbs();

        if (this.fc.enableCommenting && this.isLoggedIn) {
          this.loadMyComments();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMyComments() {
    this.commentsLoading = true;
    this.commentsError = '';
    this.api
      .getMyComments(this.acpId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (comments) => {
          this.myComments = comments;
          this.commentsLoading = false;
        },
        error: () => {
          this.commentsLoading = false;
          this.commentsError = 'Kommentare konnten nicht aktualisiert werden.';
        },
      });
  }

  exportMyCommentsCsv() {
    this.downloadCommentExport(
      this.api.exportMyReviewCommentsCsv(this.acpId),
      `comments-${this.acpId}-mine.csv`,
    );
  }

  exportMyCommentsXlsx() {
    this.downloadCommentExport(
      this.api.exportMyReviewCommentsXlsx(this.acpId),
      `comments-${this.acpId}-mine.xlsx`,
    );
  }

  exportAllCommentsXlsx() {
    if (!this.canExportAllComments) return;
    this.downloadCommentExport(
      this.api.exportAllReviewCommentsXlsx(this.acpId),
      `comments-${this.acpId}-all.xlsx`,
    );
  }

  downloadIndex() {
    window.open(this.api.getViewIndexExportUrl(this.acpId), '_blank');
  }

  sequenceLabel(sequence: any): string {
    const name = this.textValue(sequence?.name);
    if (name) return name;

    const instrumentName = this.textValue(sequence?.instrumentName);
    if (instrumentName) return instrumentName;

    return sequence?.id || '';
  }

  private textValue(value: any): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const de = value.find((entry: any) => entry && entry.lang === 'de');
      if (de?.value) return String(de.value);
      const first = value.find((entry: any) => entry && entry.value);
      if (first?.value) return String(first.value);
      return '';
    }
    if (value && typeof value === 'object') {
      if (typeof value.de === 'string') return value.de;
      if (typeof value.value === 'string') return value.value;
    }
    return '';
  }

  private downloadCommentExport(request: Observable<Blob>, fileName: string): void {
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob: Blob) => {
        if (!blob?.size) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.commentsError = 'Kommentare konnten nicht exportiert werden.';
      },
    });
  }

  private updateManagerState(): void {
    this.canManageAcp = this.auth.hasAcpRole(this.acpId, 'ACP_MANAGER');
    this.updateBreadcrumbs();
  }

  private updateBreadcrumbs(): void {
    if (!this.data) return;
    const managerCrumb: BreadcrumbItem[] = this.canManageAcp
      ? [{ label: 'Verwaltung', route: ['/manage', this.acpId] }]
      : [];
    this.breadcrumbs = [
      { label: 'Assessment Content Pool', route: ['/'] },
      ...managerCrumb,
      { label: this.data?.name || 'ACP' },
    ];
  }
}
