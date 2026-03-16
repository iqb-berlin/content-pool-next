import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Confirmation dialog for destructive actions.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (open) {
      <div class="overlay" (click)="cancel()">
        <div class="dialog card" (click)="$event.stopPropagation()">
          <h3>{{ title }}</h3>
          <p>{{ message }}</p>
          <div class="dialog-actions">
            <button class="btn btn-danger" (click)="confirm()">{{ confirmLabel }}</button>
            <button class="btn btn-outline" (click)="cancel()">Abbrechen</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center; z-index: 1000;
    }
    .dialog { width: 100%; max-width: 420px; animation: slideUp 0.2s ease; }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
    p { color: var(--color-text-secondary); margin-bottom: 16px; }
    .dialog-actions { display: flex; gap: 12px; }
  `]
})
export class ConfirmDialogComponent {
  @Input() open = false;
  @Input() title = 'Bestätigen';
  @Input() message = 'Sind Sie sicher?';
  @Input() confirmLabel = 'Bestätigen';
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  confirm() { this.confirmed.emit(); }
  cancel() { this.cancelled.emit(); }
}
