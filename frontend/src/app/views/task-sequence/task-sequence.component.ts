import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TaskSequence } from '../../core/models/api.models';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb.component';
import { CommentDialogComponent } from '../comment-dialog/comment-dialog.component';

@Component({
  selector: 'app-task-sequence',
  standalone: true,
  imports: [RouterLink, BreadcrumbComponent, CommentDialogComponent],
  template: `
    @if (sequence) {
      <app-breadcrumb [items]="breadcrumbs" />

      <div class="seq-header">
        <h1>{{ sequence.name || sequence.id }}</h1>
        <div class="seq-actions">
          @if (showUnitListBtn) {
            <button class="btn btn-outline btn-sm" (click)="toggleUnitList()">📋 Aufgabenliste</button>
          }
          @if (showCommentBtn) {
            <button class="btn btn-outline btn-sm" (click)="openComment()">💬 Kommentar</button>
          }
          @if (showDownloadBtn) {
            <button class="btn btn-outline btn-sm" (click)="downloadSequence()" [disabled]="!hasUnits">⬇️ Download</button>
          }
        </div>
      </div>

      <!-- Navigation bar -->
      <div class="nav-bar">
        <button class="btn btn-primary" [disabled]="!canGoPrev" (click)="prev()">← Zurück</button>
        @if (hasUnits && currentUnit) {
          <span class="nav-info">
            Aufgabe {{ currentIndex + 1 }} / {{ sequence.units.length }}:
            <strong>{{ currentUnit.name || currentUnit.id }}</strong>
          </span>
        } @else {
          <span class="nav-info"><strong>Keine Unit in dieser Aufgabenfolge</strong></span>
        }
        <button class="btn btn-primary" [disabled]="!canGoNext" (click)="next()">Weiter →</button>
      </div>

      <!-- Current unit → navigate to unit view -->
      @if (hasUnits && currentUnit) {
        <div class="unit-embed card">
          <div class="embed-header">
            <h3>{{ currentUnit.name || currentUnit.id }}</h3>
            <a [routerLink]="['/view', acpId, 'unit', currentUnit.id]" class="btn btn-sm btn-outline">
              Vollansicht ↗
            </a>
          </div>
          <div class="embed-body">
            <p class="help-text">
              Klicken Sie auf "Vollansicht" um die Aufgabe im Verona-Player anzuzeigen, oder nutzen Sie die Navigationspfeile um durch die Aufgabenfolge zu blättern.
            </p>
            <a [routerLink]="['/view', acpId, 'unit', currentUnit.id]" class="btn btn-primary" style="margin-top: 12px">
              📝 Aufgabe {{ currentUnit.name || currentUnit.id }} öffnen
            </a>
          </div>
        </div>
      } @else {
        <div class="unit-embed card">
          <div class="embed-body">
            <p class="help-text">Diese Aufgabenfolge enthält aktuell keine referenzierten Units.</p>
          </div>
        </div>
      }

      <!-- Unit list popup -->
      @if (unitListOpen && hasUnits) {
        <div class="popup-overlay" (click)="unitListOpen = false">
          <div class="popup card" (click)="$event.stopPropagation()">
            <div class="popup-header">
              <h3>Aufgaben in dieser Folge</h3>
              <button class="btn btn-outline btn-sm" (click)="unitListOpen = false">✕</button>
            </div>
            @for (unit of sequence.units; track unit.id; let i = $index) {
              <button class="unit-list-item" [class.active]="i === currentIndex" (click)="jumpTo(i)">
                <span class="unit-num">{{ i + 1 }}</span>
                <span>{{ unit.name || unit.id }}</span>
              </button>
            }
          </div>
        </div>
      }
    } @else {
      <div class="empty-state"><h3>Lade Aufgabenfolge...</h3></div>
    }

    <!-- Comment dialog -->
    <app-comment-dialog
      [open]="commentOpen"
      [targetType]="'TASK_SEQUENCE'"
      [targetId]="sequenceId"
      (submitted)="onCommentSubmitted($event)"
      (closed)="commentOpen = false">
    </app-comment-dialog>
  `,
  styles: [`
    .seq-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .seq-header h1 { margin-bottom: 0; }
    .seq-actions { display: flex; gap: 8px; }

    .nav-bar {
      display: flex; justify-content: center; align-items: center;
      gap: 20px; padding: 16px; background: var(--color-bg);
      border-radius: var(--radius); margin-bottom: 16px;
    }
    .nav-info { font-size: 0.95rem; color: var(--color-text-secondary); }

    .unit-embed { }
    .embed-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px;
    }
    .embed-body { padding: 24px; text-align: center; }
    .help-text { color: var(--color-text-secondary); font-size: 0.9rem; }

    .popup-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      display: flex; justify-content: center; align-items: center;
      z-index: 1000;
    }
    .popup { width: 100%; max-width: 420px; max-height: 70vh; overflow-y: auto; }
    .popup-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px;
    }
    .unit-list-item {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 10px 12px; border: none; background: none;
      font-family: inherit; font-size: 0.9rem; cursor: pointer;
      border-radius: 6px; text-align: left; transition: background 0.15s;
    }
    .unit-list-item:hover { background: var(--color-bg); }
    .unit-list-item.active { background: rgba(41,128,185,0.1); font-weight: 600; }
    .unit-num {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--color-bg); font-weight: 600; font-size: 0.8rem;
    }
    .unit-list-item.active .unit-num { background: var(--color-primary); color: white; }

    @media (max-width: 768px) {
      .seq-header { flex-direction: column; gap: 12px; align-items: flex-start; }
      .nav-bar { flex-direction: column; gap: 12px; }
    }
  `]
})
export class TaskSequenceComponent implements OnInit {
  acpId = '';
  sequenceId = '';
  sequence: TaskSequence | null = null;
  currentIndex = 0;
  breadcrumbs: BreadcrumbItem[] = [];

  unitListOpen = false;
  commentOpen = false;
  showCommentBtn = false;
  showDownloadBtn = false;
  showUnitListBtn = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
  ) {}

  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.sequenceId = this.route.snapshot.paramMap.get('sequenceId') || '';

    this.api.getAcpStartPage(this.acpId).subscribe(data => {
      const fc = data?.featureConfig || {};
      const commentTargets = Array.isArray(fc.commentTargets) ? fc.commentTargets : [];
      this.showCommentBtn = !!(fc.enableCommenting && commentTargets.includes('TASK_SEQUENCE'));
      this.showDownloadBtn = !!fc.allowUnitDownload;
      this.showUnitListBtn = fc.enableSequenceNavigation !== false;
    });

    this.api.getViewSequence(this.acpId, this.sequenceId).subscribe(s => {
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

  get hasUnits(): boolean {
    return !!(this.sequence?.units?.length);
  }

  get currentUnit(): { id: string; name: string } | null {
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

  openComment() {
    this.commentOpen = true;
  }

  onCommentSubmitted(event: { targetType: string; targetId: string; commentText: string }) {
    this.api.createComment(this.acpId, event).subscribe({
      next: () => { this.commentOpen = false; },
    });
  }

  downloadSequence() {
    if (!this.hasUnits) return;
    // Download all units in the sequence as ZIP
    const url = `/api/acp/${this.acpId}/files?sequenceId=${this.sequenceId}&format=zip`;
    window.open(this.api.appendAuthToken(url), '_blank');
  }

  private normalizeSequence(raw: TaskSequence | null | undefined): TaskSequence {
    const units = (Array.isArray(raw?.units) ? raw.units : [])
      .filter((unit: any) => typeof unit?.id === 'string' && unit.id.trim().length > 0)
      .map((unit: any) => ({
        id: unit.id.trim(),
        name: typeof unit?.name === 'string' && unit.name.trim().length > 0
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
