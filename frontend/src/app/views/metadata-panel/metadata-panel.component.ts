import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UnitViewData } from '../../core/models/api.models';

@Component({
  selector: 'app-metadata-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="panel card">
      <h3>Metadaten</h3>
      @if (unit) {
        <dl class="meta-grid">
          <dt>Unit-ID</dt><dd>{{ unit.id }}</dd>
          <dt>Name</dt><dd>{{ unit.name }}</dd>
          @if (unit.lang) { <dt>Sprache</dt><dd>{{ unit.lang }}</dd> }
          @if (unit.description) { <dt>Beschreibung</dt><dd>{{ unit.description }}</dd> }
        </dl>

        @if (unit.items && unit.items.length) {
          <h4>Items</h4>
          <div class="item-list">
            @for (item of unit.items; track item.id) {
              <div class="item-row" [class.highlighted]="item.id === highlightItemId">
                <span class="item-name">{{ item.name || item.id }}</span>
                @if (item.sourceVariable) {
                  <code class="source-var">{{ item.sourceVariable }}</code>
                }
              </div>
            }
          </div>
        }

        @if (codingScheme) {
          <h4>Kodierschema</h4>
          <pre class="json-view">{{ codingScheme | json }}</pre>
        }

        @if (unit.dependencies && unit.dependencies.length) {
          <h4>Abhängigkeiten</h4>
          @for (dep of unit.dependencies; track dep.fileId) {
            <div class="dep-item">
              <span class="badge badge-info">{{ dep.type }}</span>
              <a [href]="dep.downloadUrl" target="_blank">{{ dep.originalName }}</a>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .panel { max-height: 80vh; overflow-y: auto; }
    h4 { margin: 16px 0 8px; font-size: 0.95rem; font-weight: 600; color: var(--color-text-secondary); border-top: 1px solid var(--color-border); padding-top: 12px; }
    .meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 0.9rem; }
    dt { font-weight: 600; color: var(--color-text-secondary); }
    .item-list { display: flex; flex-direction: column; gap: 4px; }
    .item-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 4px; font-size: 0.85rem; }
    .item-row.highlighted { background: rgba(41,128,185,0.12); border-left: 3px solid var(--color-primary-light); }
    .source-var { font-size: 0.8rem; color: var(--color-text-secondary); }
    .json-view { background: var(--color-bg); padding: 12px; border-radius: var(--radius); font-size: 0.75rem; max-height: 200px; overflow: auto; }
    .dep-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.85rem; }
  `]
})
export class MetadataPanelComponent implements OnChanges {
  @Input() unit: UnitViewData | null = null;
  @Input() highlightItemId: string = '';
  codingScheme: any = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['unit'] && this.unit) {
      // Extract coding scheme from ACP-Index item metadata if available
      const highlighted = this.unit.items?.find((i: any) => i.id === this.highlightItemId);
      this.codingScheme = highlighted?.codingScheme || null;
    }
  }
}
