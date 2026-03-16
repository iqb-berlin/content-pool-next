import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-comment-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (open) {
      <div class="overlay" (click)="close()">
        <div class="dialog card" (click)="$event.stopPropagation()">
          <h3>Kommentar hinzufügen</h3>
          <p class="target-info">
            <span class="badge badge-info">{{ targetType }}</span>
            <strong>{{ targetId }}</strong>
          </p>
          <div class="form-group">
            <label>Kommentar</label>
            <textarea [(ngModel)]="commentText" rows="4" placeholder="Ihr Kommentar..." autofocus></textarea>
          </div>
          @if (error) { <div class="alert alert-error">{{ error }}</div> }
          <div class="dialog-actions">
            <button class="btn btn-primary" [disabled]="!commentText.trim() || submitting" (click)="submit()">
              {{ submitting ? 'Wird gesendet...' : 'Absenden' }}
            </button>
            <button class="btn btn-outline" (click)="close()">Abbrechen</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 1000;
    }
    .dialog { width: 100%; max-width: 500px; animation: slideUp 0.2s ease; }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
    .target-info { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .dialog-actions { display: flex; gap: 12px; }
  `]
})
export class CommentDialogComponent {
  @Input() open = false;
  @Input() targetType: 'UNIT' | 'ITEM' | 'TASK_SEQUENCE' = 'UNIT';
  @Input() targetId = '';
  @Output() submitted = new EventEmitter<{ targetType: string; targetId: string; commentText: string }>();
  @Output() closed = new EventEmitter<void>();

  commentText = '';
  submitting = false;
  error = '';

  submit() {
    if (!this.commentText.trim()) return;
    this.submitting = true;
    this.submitted.emit({
      targetType: this.targetType,
      targetId: this.targetId,
      commentText: this.commentText.trim(),
    });
    // Parent component should handle the API call and reset
    setTimeout(() => {
      this.commentText = '';
      this.submitting = false;
    }, 500);
  }

  close() {
    this.commentText = '';
    this.error = '';
    this.closed.emit();
  }
}
