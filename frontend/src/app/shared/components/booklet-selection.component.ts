import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

export interface BookletSelectionItem {
  id: string;
  name?: string | null;
}

@Component({
  selector: 'app-booklet-selection',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="booklet-toolbar">
      <label>
        <span>Testhefte filtern</span>
        <input type="search" [(ngModel)]="searchQuery" placeholder="Bezeichnung oder Booklet-ID" />
      </label>
      @if (labelOptions.length > 1) {
        <label>
          <span>Bezeichnung</span>
          <select [(ngModel)]="selectedLabel">
            <option value="">Alle Bezeichnungen</option>
            @for (label of labelOptions; track label) {
              <option [value]="label">{{ label }}</option>
            }
          </select>
        </label>
      }
      <span class="result-count">{{ filteredCount }} von {{ booklets.length }} Testheften</span>
    </div>

    <ul class="booklet-list">
      @for (booklet of filteredBooklets; track booklet.id) {
        <li>
          <div class="booklet-identity">
            <span class="booklet-name">{{ displayName(booklet) }}</span>
            <code>{{ booklet.id }}</code>
          </div>
          <a
            [routerLink]="['/view', acpId, 'sequence', booklet.id]"
            [queryParams]="{ kind: 'booklet' }"
            >{{ actionLabel }}</a
          >
        </li>
      } @empty {
        <li class="empty-state">Keine Testhefte entsprechen dem Filter.</li>
      }
    </ul>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 16px;
      }
      .booklet-toolbar {
        display: flex;
        align-items: end;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 12px;
      }
      .booklet-toolbar label {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        min-width: min(100%, 320px);
        margin: 0;
        font-weight: 600;
      }
      .booklet-toolbar input,
      .booklet-toolbar select {
        width: 100%;
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font: inherit;
      }
      .result-count {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
      }
      .booklet-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
        gap: 0;
        margin: 0;
        padding: 0;
        list-style: none;
        border-top: 1px solid var(--color-border);
        border-left: 1px solid var(--color-border);
      }
      .booklet-list .empty-state {
        grid-column: 1 / -1;
        color: var(--color-text-secondary);
      }
      .booklet-list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        padding: 10px 12px;
        border-right: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
      }
      .booklet-identity {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .booklet-name {
        overflow: hidden;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .booklet-identity code {
        overflow-wrap: anywhere;
        color: var(--color-text-secondary);
        font-size: 0.78rem;
      }
      .booklet-list a {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      @media (max-width: 600px) {
        .booklet-toolbar label {
          min-width: 100%;
        }
        .booklet-list li {
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class BookletSelectionComponent {
  @Input({ required: true }) acpId = '';
  @Input() booklets: BookletSelectionItem[] = [];
  @Input() actionLabel = 'Prüfansicht öffnen';

  searchQuery = '';
  selectedLabel = '';

  get filteredBooklets(): BookletSelectionItem[] {
    const query = this.normalize(this.searchQuery);
    const label = this.normalize(this.selectedLabel);
    return [...this.booklets]
      .filter((item) => {
        const displayName = this.displayName(item);
        if (label && this.normalize(displayName) !== label) return false;
        if (!query) return true;
        return (
          this.normalize(displayName).includes(query) || this.normalize(item.id).includes(query)
        );
      })
      .sort((left, right) => left.id.localeCompare(right.id, 'de', { numeric: true }));
  }

  get filteredCount(): number {
    return this.filteredBooklets.length;
  }

  get labelOptions(): string[] {
    return Array.from(new Set(this.booklets.map((item) => this.displayName(item)))).sort(
      (left, right) => left.localeCompare(right, 'de', { numeric: true }),
    );
  }

  displayName(booklet: BookletSelectionItem): string {
    return booklet.name?.trim() || booklet.id;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('de');
  }
}
