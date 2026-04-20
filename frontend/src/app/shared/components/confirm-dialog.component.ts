import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Confirmation dialog for destructive actions.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (open) {
      <div class="overlay" (click)="onOverlayClick()">
        <div class="dialog card" (click)="$event.stopPropagation()">
          <h3>{{ title }}</h3>
          <p>{{ message }}</p>
          @if (details.length) {
            <ul class="dialog-details">
              @for (detail of details; track detail) {
                <li>{{ detail }}</li>
              }
            </ul>
          }
          @if (error) {
            <div class="dialog-error">{{ error }}</div>
          }
          <div class="dialog-actions">
            <button
              class="btn"
              [class.btn-danger]="confirmVariant === 'danger'"
              [class.btn-primary]="confirmVariant !== 'danger'"
              [disabled]="busy"
              (click)="confirm()"
            >
              {{ busy ? busyLabel : confirmLabel }}
            </button>
            <button class="btn btn-outline" [disabled]="busy" (click)="cancel()">
              {{ cancelLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      .dialog {
        width: 100%;
        max-width: 420px;
        animation: slideUp 0.2s ease;
      }
      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: none;
          opacity: 1;
        }
      }
      p {
        color: var(--color-text-secondary);
        margin-bottom: 16px;
      }
      .dialog-details {
        margin: -8px 0 16px;
        padding-left: 18px;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dialog-error {
        margin-bottom: 14px;
        padding: 8px 10px;
        border: 1px solid rgba(231, 76, 60, 0.35);
        background: rgba(231, 76, 60, 0.08);
        color: #922b21;
        border-radius: var(--radius);
        font-size: 0.86rem;
      }
      .dialog-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  @Input() open = false;
  @Input() title = 'Bestätigen';
  @Input() message = 'Sind Sie sicher?';
  @Input() details: string[] = [];
  @Input() error = '';
  @Input() confirmLabel = 'Bestätigen';
  @Input() cancelLabel = 'Abbrechen';
  @Input() confirmVariant: 'danger' | 'primary' = 'danger';
  @Input() busy = false;
  @Input() busyLabel = 'Bitte warten...';
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  confirm() {
    if (this.busy) return;
    this.confirmed.emit();
  }

  cancel() {
    if (this.busy) return;
    this.cancelled.emit();
  }

  onOverlayClick() {
    if (this.busy) return;
    this.cancel();
  }
}
