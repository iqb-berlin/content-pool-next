import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tag-manager',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="tag-manager">
      <div class="tag-list">
        @for (tag of tags; track tag) {
          <span class="tag" [class.active]="selectedTags.includes(tag)" (click)="toggleTag(tag)">
            {{ tag }}
            @if (selectedTags.includes(tag)) {
              <span class="tag-remove">×</span>
            }
          </span>
        }
      </div>
      @if (editable) {
        <div class="tag-input-row">
          <input
            class="tag-input"
            [(ngModel)]="newTag"
            placeholder="Neues Tag..."
            (keyup.enter)="addTag()"
          />
          <button class="btn btn-sm btn-primary" (click)="addTag()" [disabled]="!newTag.trim()">
            +
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .tag-manager {
        margin-top: 12px;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 0.8rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: all 0.15s;
        user-select: none;
      }
      .tag.active {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
      }
      .tag:hover {
        border-color: var(--color-primary-light);
      }
      .tag-remove {
        font-size: 1rem;
        line-height: 1;
        margin-left: 2px;
      }
      .tag-input-row {
        display: flex;
        gap: 6px;
      }
      .tag-input {
        padding: 4px 8px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.85rem;
        flex: 1;
      }
    `,
  ],
})
export class TagManagerComponent {
  @Input() tags: string[] = [];
  @Input() selectedTags: string[] = [];
  @Input() editable = false;
  @Output() tagsChanged = new EventEmitter<string[]>();
  @Output() selectionChanged = new EventEmitter<string[]>();

  newTag = '';

  toggleTag(tag: string) {
    const idx = this.selectedTags.indexOf(tag);
    if (idx >= 0) {
      this.selectedTags = this.selectedTags.filter((t) => t !== tag);
    } else {
      this.selectedTags = [...this.selectedTags, tag];
    }
    this.selectionChanged.emit(this.selectedTags);
  }

  addTag() {
    const tag = this.newTag.trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.tagsChanged.emit(this.tags);
    }
    this.newTag = '';
  }
}
