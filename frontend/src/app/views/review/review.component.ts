import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  selector: 'app-review',
  template: `<h1>Review</h1>
    <a [routerLink]="['/view', acpId]">Zur ACP-Übersicht</a>
    @if (error) {
      <p role="alert">{{ error }}</p>
    }
    @if (access?.canManageReview) {
      <p>
        <label
          ><input
            type="checkbox"
            [checked]="access.enableReview"
            [disabled]="busy"
            (change)="configure($any($event.target).checked)"
          />
          Review für diesen ACP aktivieren</label
        >
      </p>
    }
    @if (access?.canManageReview) {
      <button class="btn btn-outline" (click)="loadComments()">
        Alle Kommentare anzeigen / aktualisieren
      </button>
      @if (commentsError) {
        <p role="alert">{{ commentsError }}</p>
      }
      @if (comments) {
        @for (comment of comments; track comment.id) {
          <article class="card">
            <strong>{{ comment.targetType }} · {{ comment.targetId }}</strong>
            @if (comment.legacyReadOnly) {
              <span class="badge badge-info">Legacy · schreibgeschützt</span>
            }
            <p style="white-space: pre-wrap">{{ comment.commentText }}</p>
          </article>
        } @empty {
          <p>Keine Kommentare vorhanden.</p>
        }
      }
    }
    @if (manifest) {
      @for (booklet of manifest.booklets; track $index) {
        <section class="card">
          <h2>{{ booklet.name || booklet.id }}</h2>
          <a
            [routerLink]="['/view', acpId, 'sequence', booklet.id]"
            [queryParams]="{ kind: 'booklet' }"
            >Booklet öffnen</a
          >
          <ul>
            @for (unit of booklet.units; track unit.occurrenceId) {
              <li>
                <a [routerLink]="['/view', acpId, 'unit', unit.id]">{{ unit.name || unit.id }}</a>
                @if (unit.blockPath.length) {
                  <small> · {{ unit.blockPath.join(' / ') }}</small>
                }
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p>Dieser ACP enthält noch keine Booklets.</p>
      }
    }`,
})
export class ReviewComponent implements OnInit {
  acpId = '';
  access: any;
  manifest: any;
  error = '';
  busy = false;
  constructor(
    @Inject(ActivatedRoute) private route: ActivatedRoute,
    @Inject(ApiService) private api: ApiService,
  ) {}
  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.load();
  }
  load() {
    this.error = '';
    this.manifest = null;
    this.api.getCapabilities(this.acpId).subscribe({
      next: (access) => {
        this.access = access;
        if (access.canReview)
          this.api.getReview(this.acpId).subscribe({
            next: (data) => (this.manifest = data),
            error: () => (this.error = 'Review konnte nicht geladen werden.'),
          });
        else
          this.error = access.canManageReview ? 'Review ist deaktiviert.' : 'Kein Review-Zugriff.';
      },
      error: () => (this.error = 'Kein Zugriff auf diesen ACP.'),
    });
  }
  comments: any[] | null = null;
  commentsError = '';
  loadComments() {
    this.commentsError = '';
    this.api.getComments(this.acpId).subscribe({
      next: (comments) => (this.comments = comments),
      error: () => {
        this.comments = null;
        this.commentsError = 'Kommentare konnten nicht geladen werden.';
      },
    });
  }
  configure(enabled: boolean) {
    this.busy = true;
    this.api.configureReview(this.acpId, enabled).subscribe({
      next: () => {
        this.busy = false;
        this.load();
      },
      error: () => {
        this.busy = false;
        this.error = 'Review-Konfiguration konnte nicht gespeichert werden.';
      },
    });
  }
}
