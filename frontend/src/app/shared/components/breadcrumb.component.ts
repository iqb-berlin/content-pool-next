import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  route?: string[];
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      @for (item of items; track item.label; let last = $last) {
        @if (item.route && !last) {
          <a [routerLink]="item.route" class="breadcrumb-link">{{ item.label }}</a>
          <span class="breadcrumb-sep">›</span>
        } @else {
          <span class="breadcrumb-current">{{ item.label }}</span>
        }
      }
    </nav>
  `,
  styles: [
    `
      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        margin-bottom: 20px;
        color: var(--color-text-secondary);
      }
      .breadcrumb-link {
        color: var(--color-primary-light);
        text-decoration: none;
      }
      .breadcrumb-link:hover {
        text-decoration: underline;
      }
      .breadcrumb-sep {
        color: var(--color-text-secondary);
      }
      .breadcrumb-current {
        font-weight: 500;
        color: var(--color-text);
      }
    `,
  ],
})
export class BreadcrumbComponent {
  @Input() items: BreadcrumbItem[] = [];
}
