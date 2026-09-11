import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

interface ReviewMember {
  kind: 'user' | 'credential';
  id: string;
  label?: string;
}
interface ReviewGroup {
  id?: string;
  name: string;
  archived: boolean;
  members: ReviewMember[];
}
interface ReviewConfig {
  enableReview: boolean;
  visibilityMode: 'PRIVATE' | 'SHARED' | 'GROUP';
  configVersion: number;
  groups: ReviewGroup[];
}

@Component({
  standalone: true,
  imports: [RouterLink, FormsModule],
  selector: 'app-review',
  styles: [
    `
      :host {
        display: block;
      }
      fieldset {
        min-width: 0;
        margin: 1.25rem 0;
        padding: 1rem;
        border: 1px solid #d6dfe5;
        border-radius: 0.5rem;
      }
      fieldset fieldset {
        background: #fff;
      }
      legend {
        padding: 0 0.4rem;
        font-weight: 600;
      }
      label {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0.3rem 0.75rem 0.3rem 0;
      }
      input:not([type='checkbox']),
      select {
        max-width: 100%;
        padding: 0.5rem 0.65rem;
        border: 1px solid #b9c6d0;
        border-radius: 0.3rem;
        font: inherit;
        background: #fff;
        color: #243b4d;
      }
      input[type='checkbox'] {
        width: 1rem;
        height: 1rem;
      }
      .btn {
        margin: 0.25rem 0.35rem 0.25rem 0;
      }
      .member-list {
        max-height: 14rem;
        overflow-y: auto;
        margin-top: 0.5rem;
      }
      .member-list label {
        display: flex;
      }
      .comment-overview {
        max-height: 60vh;
        overflow-y: auto;
      }
      p {
        margin: 0.65rem 0;
      }
      @media (max-width: 600px) {
        fieldset {
          padding: 0.7rem;
        }
      }
    `,
  ],
  template: `<h1>Review</h1>
    <a [routerLink]="['/view', acpId]">Zur ACP-Übersicht</a>
    @if (error) {
      <p role="alert">{{ error }}</p>
    }
    @if (access?.canManageReview && config) {
      <fieldset [disabled]="busy">
        <legend>Review konfigurieren</legend>
        <label
          ><input type="checkbox" [(ngModel)]="config.enableReview" /> Review für diesen ACP
          aktivieren</label
        >
        <p>
          <label
            >Kommentarsicht
            <select [(ngModel)]="config.visibilityMode">
              <option value="PRIVATE">Privat – nur eigene Kommentare</option>
              <option value="SHARED">Geteilt – alle Review-Teilnehmenden</option>
              <option value="GROUP">Innerhalb von Review-Gruppen teilen</option>
            </select>
          </label>
        </p>
        <p>Review-Verantwortliche sehen alle Kommentare. Gruppen vergeben keine Zugangsrechte.</p>
        @for (group of config.groups; track $index) {
          <fieldset>
            <legend>{{ group.name || 'Neue Review-Gruppe' }}</legend>
            <label>Name <input [(ngModel)]="group.name" maxlength="120" /></label>
            <label><input type="checkbox" [(ngModel)]="group.archived" /> Archiviert</label>
            <div class="member-list">
              @for (member of members; track member.kind + member.id) {
                <label
                  ><input
                    type="checkbox"
                    [checked]="hasMember(group, member)"
                    (change)="toggleMember(group, member)"
                  />
                  {{ member.label }} ·
                  {{ member.kind === 'user' ? 'Nutzerkonto' : 'ACP-Zugang' }}</label
                >
              }
            </div>
          </fieldset>
        }
        <button class="btn btn-outline" (click)="addGroup()">Review-Gruppe hinzufügen</button>
        <p>
          Beim Gruppenwechsel bleiben vorhandene Kommentare in ihrer bisherigen Gruppe. Archivierte
          Gruppen bleiben für Verantwortliche erhalten.
        </p>
        <button class="btn btn-primary" (click)="configure()">
          Review-Konfiguration speichern
        </button>
        <button class="btn btn-outline" (click)="loadConfig()">Konfiguration neu laden</button>
        @if (saved) {
          <span role="status">Gespeichert</span>
        }
      </fieldset>
    }
    @if (access?.canReview) {
      <h2>Kommentare</h2>
      <button class="btn btn-outline" (click)="loadComments()">Kommentare aktualisieren</button>
      <button class="btn btn-outline" (click)="exportComments('csv')">
        Eigene Kommentare (CSV)
      </button>
      <button class="btn btn-outline" (click)="exportComments('xlsx')">
        Eigene Kommentare (XLSX)
      </button>
      <button class="btn btn-outline" (click)="exportComments()">
        {{
          access?.canManageReview
            ? 'Gesamtexport (alle Gruppen, XLSX)'
            : 'Sichtbare Kommentare exportieren (XLSX)'
        }}
      </button>
      @if (access?.canManageReview && config) {
        <label
          >Gruppe filtern
          <select [(ngModel)]="groupFilter">
            <option value="">Alle Gruppen</option>
            <option value="ungrouped">Ohne Gruppe</option>
            @for (group of config.groups; track group.id) {
              <option [value]="group.id">{{ group.name }}</option>
            }
          </select>
        </label>
      }
      @if (commentsError) {
        <p role="alert">{{ commentsError }}</p>
      }
      <div class="comment-overview" role="region" aria-label="Sichtbare Kommentare" tabindex="0">
        @for (comment of filteredComments; track comment.id) {
          <article class="card">
            <strong>{{ comment.targetType }} · {{ comment.targetId }}</strong>
            <span> · {{ comment.groupName || 'Ohne Gruppe' }} · {{ comment.authorLabel }}</span>
            <p style="white-space: pre-wrap">{{ comment.commentText }}</p>
          </article>
        } @empty {
          <p>Keine Kommentare vorhanden.</p>
        }
      </div>
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
export class ReviewComponent implements OnInit, OnDestroy {
  acpId = '';
  access: any;
  manifest: any;
  error = '';
  busy = false;
  saved = false;
  config: ReviewConfig | null = null;
  private savedMode = 'PRIVATE';
  members: ReviewMember[] = [];
  comments: any[] = [];
  commentsError = '';
  groupFilter = '';
  private requests = new Subscription();
  private commentsRequest: Subscription | null = null;
  private poll?: ReturnType<typeof setInterval>;
  constructor(
    @Inject(ActivatedRoute) private route: ActivatedRoute,
    @Inject(ApiService) private api: ApiService,
  ) {}
  ngOnInit() {
    this.acpId = this.route.snapshot.paramMap.get('acpId') || '';
    this.load();
    this.poll = setInterval(() => {
      if (this.access?.canReview) this.loadComments();
    }, 8000);
  }
  ngOnDestroy() {
    clearInterval(this.poll);
    this.requests.unsubscribe();
    this.commentsRequest?.unsubscribe();
  }
  load(reloadConfig = true) {
    this.requests.add(
      this.api.getCapabilities(this.acpId).subscribe({
        next: (access) => {
          this.access = access;
          if (access.canManageReview && reloadConfig) this.loadConfig();
          if (access.canReview) {
            this.requests.add(
              this.api.getReview(this.acpId).subscribe({
                next: (data) => (this.manifest = data),
                error: () => (this.error = 'Review konnte nicht geladen werden.'),
              }),
            );
            this.loadComments();
          } else {
            this.error = 'Review ist deaktiviert oder nicht zugänglich.';
            this.comments = [];
          }
        },
        error: () => (this.error = 'Kein Zugriff auf diesen ACP.'),
      }),
    );
  }
  loadConfig() {
    this.requests.add(
      this.api.getReviewConfig(this.acpId).subscribe({
        next: (config) => {
          this.config = config;
          this.savedMode = config.visibilityMode;
        },
        error: () => (this.error = 'Konfiguration konnte nicht geladen werden.'),
      }),
    );
    this.requests.add(
      this.api.getReviewMembers(this.acpId).subscribe({
        next: (members) => (this.members = members),
        error: () => (this.error = 'Gruppenmitglieder konnten nicht geladen werden.'),
      }),
    );
  }
  get filteredComments() {
    return this.comments.filter(
      (comment) =>
        !this.groupFilter ||
        (this.groupFilter === 'ungrouped'
          ? !comment.groupId
          : comment.groupId === this.groupFilter),
    );
  }
  hasMember(group: ReviewGroup, member: ReviewMember) {
    return group.members.some((entry) => entry.id === member.id && entry.kind === member.kind);
  }
  toggleMember(group: ReviewGroup, member: ReviewMember) {
    if (this.hasMember(group, member))
      group.members = group.members.filter(
        (entry) => entry.id !== member.id || entry.kind !== member.kind,
      );
    else group.members.push({ kind: member.kind, id: member.id });
  }
  addGroup() {
    this.config?.groups.push({ name: '', archived: false, members: [] });
  }
  loadComments() {
    if (this.commentsRequest && !this.commentsRequest.closed) return;
    this.commentsRequest = this.api.getVisibleReviewComments(this.acpId).subscribe({
      next: (comments) => {
        this.comments = comments;
        this.commentsError = '';
      },
      error: () => {
        this.comments = [];
        this.commentsError = 'Kommentare konnten nicht geladen werden.';
      },
    });
  }
  configure() {
    if (!this.config || this.busy) return;
    const sharing = this.config.visibilityMode === 'SHARED' && this.savedMode !== 'SHARED';
    if (
      sharing &&
      !window.confirm(
        'Alle bereits vorhandenen Kommentare, auch aus Review-Gruppen, werden für sämtliche berechtigten Review-Teilnehmenden sichtbar. Wirklich freigeben?',
      )
    )
      return;
    this.busy = true;
    this.saved = false;
    this.error = '';
    this.requests.add(
      this.api
        .configureReview(this.acpId, { ...this.config, confirmExistingComments: sharing })
        .subscribe({
          next: (config) => {
            this.config = config;
            this.savedMode = config.visibilityMode;
            this.busy = false;
            this.saved = true;
            this.load(false);
          },
          error: (error) => {
            this.busy = false;
            this.error = error?.error?.message || 'Konfiguration konnte nicht gespeichert werden.';
          },
        }),
    );
  }
  exportComments(format?: 'csv' | 'xlsx') {
    this.commentsError = '';
    const personal = format !== undefined;
    const download =
      format === 'csv'
        ? this.api.exportMyReviewCommentsCsv(this.acpId)
        : format === 'xlsx'
          ? this.api.exportMyReviewCommentsXlsx(this.acpId)
          : this.api.exportVisibleReviewComments(this.acpId);
    this.requests.add(
      download.subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `review-${this.acpId}${personal ? '-mine' : ''}.${format || 'xlsx'}`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: () => (this.commentsError = 'Export konnte nicht erstellt werden.'),
      }),
    );
  }
}
