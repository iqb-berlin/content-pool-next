import { Component } from '@angular/core';

/**
 * Simple loading spinner for async operations.
 */
@Component({
  selector: 'app-loading',
  standalone: true,
  template: `
    <div class="loading-container">
      <div class="spinner"></div>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .loading-container { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px; }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary-light);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class LoadingComponent {}
