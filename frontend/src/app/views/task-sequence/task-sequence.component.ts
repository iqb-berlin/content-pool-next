import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { FeatureConfig, TaskSequence } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { ItemCommentThreadComponent } from '../comment-thread/item-comment-thread.component';
import { UnitViewComponent } from '../unit-view/unit-view.component';

@Component({
  selector: 'app-task-sequence',
  standalone: true,
  imports: [BreadcrumbComponent, ItemCommentThreadComponent, UnitViewComponent],
  template: `
    @if (sequence) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="seq-header">
        <h1>{{ sequence.name || sequence.id }}</h1>
        <div class="seq-actions">
          @if (showDownloadBtn) {
            <button
              class="btn btn-outline btn-sm"
              (click)="downloadSequence()"
              [disabled]="!hasUnits"
            >
              ⬇️ Download
            </button>
          }
        </div>
      </div>

      @if (showCommentBtn) {
        <app-item-comment-thread
          [acpId]="acpId"
          [targetType]="'BOOKLET'"
          [bookletId]="sequenceId"
          [enabled]="showCommentBtn"
        />
      }

      <div
        #reviewWorkspace
        class="review-workspace"
        [class.fullscreen-fallback]="isFallbackFullscreen"
      >
        <!-- Navigation bar -->
        <div class="nav-bar">
          <div class="sequence-navigation">
            <button class="btn btn-primary" [disabled]="!canGoPrev" (click)="prev()">
              ← Zurück
            </button>
            @if (hasUnits && currentUnit) {
              <span class="nav-info">
                Aufgabe {{ currentIndex + 1 }} / {{ sequence.units.length }}:
                <strong>{{ currentUnit.name || currentUnit.id }}</strong>
                @if (currentUnit.blockPath?.length) {
                  <small> · {{ currentUnit.blockPath?.join(' / ') }}</small>
                }
              </span>
            } @else {
              <span class="nav-info"><strong>Keine Aufgabe in dieser Aufgabenfolge</strong></span>
            }
            <button class="btn btn-primary" [disabled]="!canGoNext" (click)="next()">
              Weiter →
            </button>
          </div>
          <div class="workspace-actions">
            @if (showUnitListBtn) {
              <button
                class="btn btn-outline btn-sm btn-state"
                (click)="toggleUnitList()"
                [attr.aria-expanded]="unitListOpen"
                aria-controls="task-sequence-unit-list"
              >
                📋 Aufgabenliste
              </button>
            }
            <button class="btn btn-outline btn-sm" (click)="toggleFullscreen()">
              {{ isFullscreen ? 'Vollbild beenden' : '⛶ Vollbild' }}
            </button>
          </div>
        </div>

        <!-- Current unit review -->
        @if (hasUnits && currentUnit) {
          <div class="unit-embed card">
            <app-unit-view
              [acpId]="acpId"
              [unitId]="currentUnit.id"
              [embedded]="true"
              [reviewMode]="isBookletReview"
              [featureConfigOverride]="featureConfig"
            />
          </div>
        } @else {
          <div class="unit-embed card">
            <div class="embed-body">
              <p class="help-text">
                Diese Aufgabenfolge enthält aktuell keine referenzierten Aufgaben.
              </p>
            </div>
          </div>
        }

        <!-- Unit list popup -->
        @if (unitListOpen && hasUnits) {
          <div class="popup-overlay" (click)="unitListOpen = false">
            <div id="task-sequence-unit-list" class="popup card" (click)="$event.stopPropagation()">
              <div class="popup-header">
                <h3>Aufgaben in dieser Folge</h3>
                <button class="btn btn-outline btn-sm" (click)="unitListOpen = false">✕</button>
              </div>
              @for (unit of sequence.units; track unit.occurrenceId || $index; let i = $index) {
                <button
                  class="unit-list-item"
                  [class.active]="i === currentIndex"
                  [attr.aria-current]="i === currentIndex ? 'step' : null"
                  (click)="jumpTo(i)"
                >
                  <span class="unit-num">{{ i + 1 }}</span>
                  <span>
                    @if (unit.blockPath?.length) {
                      <small>{{ unit.blockPath?.join(' / ') }} · </small>
                    }
                    {{ unit.name || unit.id }}
                    @if (unit.alias) {
                      ({{ unit.alias }})
                    }
                  </span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state"><h3>Lade Aufgabenfolge...</h3></div>
    }
  `,
  styles: [
    `
      .seq-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .seq-header h1 {
        margin-bottom: 0;
      }
      .seq-actions {
        display: flex;
        gap: 8px;
      }

      .nav-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--color-bg);
        border-radius: var(--radius);
        margin-bottom: 16px;
      }
      .sequence-navigation,
      .workspace-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .sequence-navigation {
        flex: 1;
        justify-content: center;
      }
      .nav-info {
        font-size: 0.95rem;
        color: var(--color-text-secondary);
      }

      .unit-embed {
        padding: 16px;
      }
      .review-workspace:fullscreen,
      .review-workspace.fullscreen-fallback {
        overflow: auto;
        padding: 16px;
        background: var(--color-bg);
      }
      .review-workspace.fullscreen-fallback {
        position: fixed;
        inset: 0;
        z-index: 2000;
      }
      .review-workspace:fullscreen .nav-bar,
      .review-workspace.fullscreen-fallback .nav-bar {
        position: sticky;
        top: 0;
        z-index: 20;
        box-shadow: var(--shadow);
      }
      .popup-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      .popup {
        width: 100%;
        max-width: 420px;
        max-height: 70vh;
        overflow-y: auto;
      }
      .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .unit-list-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: none;
        font-family: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        border-radius: 6px;
        text-align: left;
        transition: background 0.15s;
      }
      .unit-list-item:hover {
        background: var(--color-bg);
      }
      .unit-list-item.active {
        background: rgba(41, 128, 185, 0.1);
        font-weight: 600;
      }
      .unit-num {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--color-bg);
        font-weight: 600;
        font-size: 0.8rem;
      }
      .unit-list-item.active .unit-num {
        background: var(--color-primary);
        color: white;
      }

      @media (max-width: 768px) {
        .seq-header {
          flex-direction: column;
          gap: 12px;
          align-items: flex-start;
        }
        .nav-bar {
          flex-direction: column;
          gap: 12px;
        }
        .sequence-navigation {
          flex-wrap: wrap;
        }
        .workspace-actions {
          width: 100%;
          justify-content: center;
        }
      }
    `,
  ],
})
export class TaskSequenceComponent implements OnInit, OnDestroy {
  @ViewChild('reviewWorkspace') reviewWorkspace?: ElementRef<HTMLElement>;

  acpId = '';
  sequenceId = '';
  sequenceKind?: 'booklet';
  sequence: TaskSequence | null = null;
  currentIndex = 0;
  breadcrumbs: BreadcrumbItem[] = [];

  unitListOpen = false;
  showCommentBtn = false;
  showDownloadBtn = false;
  showUnitListBtn = true;
  featureConfig: FeatureConfig | null = null;
  isFullscreen = false;
  isFallbackFullscreen = false;

  private readonly fullscreenChangeHandler = () => {
    this.isFullscreen =
      this.isFallbackFullscreen ||
      document.fullscreenElement === this.reviewWorkspace?.nativeElement;
    this.changeDetector.markForCheck();
  };
  private readonly fullscreenKeyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.isFallbackFullscreen) this.closeFallbackFullscreen();
  };

  constructor(
    @Inject(ActivatedRoute) private route: ActivatedRoute,
    @Inject(ApiService) private api: ApiService,
    @Inject(ChangeDetectorRef) private changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
    document.addEventListener('keydown', this.fullscreenKeyHandler);
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.sequenceId = this.route.snapshot.paramMap.get('sequenceId') || '';
    this.sequenceKind =
      this.route.snapshot.queryParamMap?.get('kind') === 'booklet' ? 'booklet' : undefined;

    this.api.getAcpStartPage(this.acpId).subscribe((data) => {
      const fc: FeatureConfig = data?.featureConfig || {};
      this.featureConfig = fc;
      const commentTargets = Array.isArray(fc.commentTargets) ? fc.commentTargets : [];
      this.showCommentBtn = !!(
        this.sequenceKind === 'booklet' &&
        fc.enableCommenting &&
        commentTargets.includes('BOOKLET')
      );
      this.showDownloadBtn = !!fc.allowUnitDownload;
      this.showUnitListBtn = this.isBookletReview || fc.enableSequenceNavigation !== false;
    });

    this.api.getViewSequence(this.acpId, this.sequenceId, this.sequenceKind).subscribe((s) => {
      this.sequence = this.normalizeSequence(s);
      this.currentIndex = 0;
      this.unitListOpen = false;
      this.breadcrumbs = [
        { label: 'Assessment Content Pool', route: ['/'] },
        { label: 'ACP', route: ['/view', this.acpId] },
        { label: this.sequence.name || 'Aufgabenfolge' },
      ];
    });
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
    document.removeEventListener('keydown', this.fullscreenKeyHandler);
  }

  get hasUnits(): boolean {
    return !!this.sequence?.units?.length;
  }

  get isBookletReview(): boolean {
    return this.sequenceKind === 'booklet';
  }

  get currentUnit(): TaskSequence['units'][number] | null {
    if (!this.sequence?.units?.length) return null;
    return this.sequence.units[this.currentIndex] || null;
  }

  get canGoPrev(): boolean {
    return this.hasUnits && this.currentIndex > 0;
  }

  get canGoNext(): boolean {
    return this.hasUnits && !!this.sequence && this.currentIndex < this.sequence.units.length - 1;
  }

  prev() {
    if (!this.canGoPrev) return;
    this.currentIndex -= 1;
  }

  next() {
    if (!this.canGoNext) return;
    this.currentIndex += 1;
  }

  jumpTo(index: number) {
    if (!this.sequence?.units?.length) return;
    const max = this.sequence.units.length - 1;
    if (index < 0 || index > max) return;
    this.currentIndex = index;
    this.unitListOpen = false;
  }

  toggleUnitList() {
    if (!this.hasUnits) return;
    this.unitListOpen = !this.unitListOpen;
  }

  async toggleFullscreen() {
    const workspace = this.reviewWorkspace?.nativeElement;
    if (!workspace) return;
    if (this.isFallbackFullscreen) {
      this.closeFallbackFullscreen();
      return;
    }
    try {
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      else await workspace.requestFullscreen();
    } catch {
      this.isFallbackFullscreen = true;
      this.isFullscreen = true;
      this.changeDetector.markForCheck();
    }
  }

  private closeFallbackFullscreen() {
    this.isFallbackFullscreen = false;
    this.isFullscreen = false;
    this.changeDetector.markForCheck();
  }

  downloadSequence() {
    if (!this.hasUnits) return;
    // Download all units in the sequence as ZIP
    const url = `/api/acp/${this.acpId}/files?sequenceId=${encodeURIComponent(this.sequenceId)}&format=zip${this.sequenceKind === 'booklet' ? '&kind=booklet' : ''}`;
    window.open(this.api.appendAuthToken(url), '_blank');
  }

  private normalizeSequence(raw: TaskSequence | null | undefined): TaskSequence {
    const units = (Array.isArray(raw?.units) ? raw.units : [])
      .filter((unit: any) => typeof unit?.id === 'string' && unit.id.trim().length > 0)
      .map((unit: any) => ({
        id: unit.id.trim(),
        occurrenceId: unit.occurrenceId,
        alias: unit.alias,
        blockPath: unit.blockPath,
        name:
          typeof unit?.name === 'string' && unit.name.trim().length > 0
            ? unit.name
            : unit.id.trim(),
      }));

    return {
      id: raw?.id || this.sequenceId,
      name: raw?.name || raw?.id || this.sequenceId,
      units,
    };
  }
}
