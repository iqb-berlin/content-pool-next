import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { Comment, CommentThreadSnapshot } from '../../core/models/api.models';

interface CommentThreadGroup {
  id: string;
  root: Comment | null;
  replies: Comment[];
}

@Component({
  selector: 'app-item-comment-thread',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-comment-thread.component.html',
  styleUrl: './item-comment-thread.component.css',
})
export class ItemCommentThreadComponent implements OnChanges, OnDestroy {
  @Input() acpId = '';
  @Input() unitId = '';
  @Input() itemId = '';
  @Input() enabled = false;
  @Input() refreshToken = 0;
  @Input() initiallyOpen = false;
  @Output() countChanged = new EventEmitter<{
    unitId: string;
    itemId: string;
    count: number;
    refreshToken: number;
  }>();

  open = false;
  loading = false;
  busy = false;
  error = '';
  snapshot: CommentThreadSnapshot | null = null;
  replyingTo: string | null = null;
  editingCommentId: string | null = null;
  editText = '';

  private requestToken = 0;
  private initialOpenConsumed = false;
  private threadRequest: Subscription | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly newDrafts = new Map<string, string>();
  private readonly replyDrafts = new Map<string, string>();
  private readonly expandedByTarget = new Map<string, Set<string>>();

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    const targetChanged =
      changes['acpId'] || changes['unitId'] || changes['itemId'] || changes['enabled'];
    if (targetChanged) {
      this.requestToken += 1;
      this.threadRequest?.unsubscribe();
      this.threadRequest = null;
      this.loading = false;
      this.snapshot = null;
      this.replyingTo = null;
      this.editingCommentId = null;
      this.error = '';
      if (this.initiallyOpen && !this.initialOpenConsumed) {
        this.open = true;
        this.initialOpenConsumed = true;
      }
      if (this.hasTarget) this.loadThread();
    } else if (changes['refreshToken'] && !changes['refreshToken'].firstChange && this.hasTarget) {
      this.loadThread();
    }
  }

  ngOnDestroy(): void {
    this.threadRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasTarget(): boolean {
    return Boolean(this.enabled && this.acpId && this.unitId && this.itemId);
  }

  get commentCount(): number {
    return (this.snapshot?.comments || []).filter((comment) => !comment.isDeleted).length;
  }

  get visibilityLabel(): string {
    return this.snapshot?.visibilityMode === 'SHARED' ? 'Geteilt' : 'Privat';
  }

  get newCommentText(): string {
    return this.newDrafts.get(this.targetKey) || '';
  }

  set newCommentText(value: string) {
    this.newDrafts.set(this.targetKey, value);
  }

  get threadGroups(): CommentThreadGroup[] {
    const comments = this.snapshot?.comments || [];
    const roots = comments.filter((comment) => !comment.parentCommentId);
    const repliesByParent = new Map<string, Comment[]>();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      const replies = repliesByParent.get(comment.parentCommentId) || [];
      replies.push(comment);
      repliesByParent.set(comment.parentCommentId, replies);
    }
    const groups: CommentThreadGroup[] = roots.map((root) => ({
      id: root.id,
      root,
      replies: repliesByParent.get(root.id) || [],
    }));
    const rootIds = new Set(roots.map((root) => root.id));
    for (const [parentId, replies] of repliesByParent) {
      if (!rootIds.has(parentId)) {
        groups.push({ id: parentId, root: null, replies });
      }
    }
    return groups.sort((left, right) => {
      const leftDate = left.root?.createdAt || left.replies[0]?.createdAt || '';
      const rightDate = right.root?.createdAt || right.replies[0]?.createdAt || '';
      return rightDate.localeCompare(leftDate) || left.id.localeCompare(right.id);
    });
  }

  toggleOpen(): void {
    this.open = !this.open;
    if (this.open && this.hasTarget && !this.loading && !this.snapshot) this.loadThread();
  }

  loadThread(preserveError = false): void {
    if (!this.hasTarget) return;
    this.threadRequest?.unsubscribe();
    const token = ++this.requestToken;
    const refreshToken = this.refreshToken;
    this.loading = true;
    this.threadRequest = this.api
      .getItemCommentThread(this.acpId, this.unitId, this.itemId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (snapshot) => {
          if (token !== this.requestToken) return;
          this.snapshot = snapshot;
          this.countChanged.emit({
            unitId: this.unitId,
            itemId: this.itemId,
            count: this.commentCount,
            refreshToken,
          });
          this.loading = false;
          this.threadRequest = null;
          if (!preserveError) this.error = '';
        },
        error: (error) => {
          if (token !== this.requestToken) return;
          this.loading = false;
          this.threadRequest = null;
          this.error = this.errorMessage(error, 'Kommentare konnten nicht geladen werden.');
        },
      });
  }

  submitComment(parentCommentId?: string): void {
    const targetKey = this.targetKey;
    const acpId = this.acpId;
    const unitId = this.unitId;
    const itemId = this.itemId;
    const replyDraftKey = parentCommentId ? this.replyDraftKey(parentCommentId, targetKey) : '';
    const text = parentCommentId ? this.replyDrafts.get(replyDraftKey) || '' : this.newCommentText;
    if (!text.trim() || this.busy) return;
    this.busy = true;
    this.api
      .createItemComment(acpId, {
        unitId,
        itemId,
        commentText: text.trim(),
        ...(parentCommentId ? { parentCommentId } : {}),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (parentCommentId) {
            this.replyDrafts.delete(replyDraftKey);
            this.expandedThreadsFor(targetKey).add(parentCommentId);
            if (targetKey === this.targetKey) this.replyingTo = null;
          } else {
            this.newDrafts.delete(targetKey);
          }
          this.busy = false;
          if (targetKey === this.targetKey) this.loadThread();
        },
        error: (error) => {
          this.busy = false;
          if (targetKey === this.targetKey) {
            this.error = this.errorMessage(error, 'Kommentar konnte nicht gespeichert werden.');
          }
        },
      });
  }

  startReply(rootId: string): void {
    this.replyingTo = this.replyingTo === rootId ? null : rootId;
  }

  replyText(rootId: string): string {
    return this.replyDrafts.get(this.replyDraftKey(rootId)) || '';
  }

  setReplyText(rootId: string, value: string): void {
    this.replyDrafts.set(this.replyDraftKey(rootId), value);
  }

  startEdit(comment: Comment): void {
    this.editingCommentId = comment.id;
    this.editText = comment.commentText;
  }

  cancelEdit(): void {
    this.editingCommentId = null;
    this.editText = '';
  }

  saveEdit(comment: Comment): void {
    if (!this.editText.trim() || this.busy || !comment.version) return;
    const targetKey = this.targetKey;
    this.busy = true;
    this.api
      .updateItemComment(this.acpId, comment.id, {
        commentText: this.editText.trim(),
        version: comment.version,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.busy = false;
          if (targetKey === this.targetKey) {
            this.cancelEdit();
            this.loadThread();
          }
        },
        error: (error) => {
          this.busy = false;
          if (targetKey === this.targetKey) {
            this.error = this.errorMessage(error, 'Kommentar konnte nicht geändert werden.');
            if (error?.status === 409) this.loadThread(true);
          }
        },
      });
  }

  deleteComment(comment: Comment): void {
    if (!comment.version || this.busy) return;
    if (!window.confirm('Diesen eigenen Kommentar wirklich löschen?')) return;
    const targetKey = this.targetKey;
    this.busy = true;
    this.api
      .deleteItemComment(this.acpId, comment.id, comment.version)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.busy = false;
          if (targetKey === this.targetKey) this.loadThread();
        },
        error: (error) => {
          this.busy = false;
          if (targetKey === this.targetKey) {
            this.error = this.errorMessage(error, 'Kommentar konnte nicht gelöscht werden.');
            if (error?.status === 409) this.loadThread(true);
          }
        },
      });
  }

  toggleReplies(threadId: string): void {
    const expanded = this.expandedThreads;
    if (expanded.has(threadId)) expanded.delete(threadId);
    else expanded.add(threadId);
  }

  repliesExpanded(threadId: string): boolean {
    return this.expandedThreads.has(threadId);
  }

  authorInitials(label?: string): string {
    const parts = String(label || '?')
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean);
    return (
      parts.length > 1
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`
        : parts[0]?.slice(0, 2) || '?'
    ).toUpperCase();
  }

  wasEdited(comment: Comment): boolean {
    return (comment.version ?? 1) > 1;
  }

  private get targetKey(): string {
    return `${this.acpId}\u0000${this.unitId}\u0000${this.itemId}`;
  }

  private get expandedThreads(): Set<string> {
    return this.expandedThreadsFor(this.targetKey);
  }

  private expandedThreadsFor(targetKey: string): Set<string> {
    let expanded = this.expandedByTarget.get(targetKey);
    if (!expanded) {
      expanded = new Set<string>();
      this.expandedByTarget.set(targetKey, expanded);
    }
    return expanded;
  }

  private replyDraftKey(rootId: string, targetKey = this.targetKey): string {
    return `${targetKey}\u0000${rootId}`;
  }

  private errorMessage(error: any, fallback: string): string {
    const message = error?.error?.message;
    if (Array.isArray(message)) return message.join(' ');
    return typeof message === 'string' && message.trim() ? message : fallback;
  }
}
