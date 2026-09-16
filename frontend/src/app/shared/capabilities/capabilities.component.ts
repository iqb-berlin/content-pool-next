import { Component, Input, Output, EventEmitter } from '@angular/core';

export const CAPABILITY_OPTIONS = [
  { value: 'review:participate', label: 'Review: teilnehmen' },
  { value: 'review:manage', label: 'Review: verwalten' },
  { value: 'item-explorer:view', label: 'Item Explorer: lesen' },
  { value: 'item-explorer:edit', label: 'Item Explorer: bearbeiten' },
];

export function capabilityLabels(values: string[]): string {
  return (
    values
      .map((v) => CAPABILITY_OPTIONS.find((option) => option.value === v)?.label || v)
      .join(', ') || 'keine'
  );
}

@Component({
  selector: 'app-capabilities',
  standalone: true,
  template: `<fieldset [class.compact]="compact" [class.grouped]="group">
    <legend>
      {{
        group === 'review'
          ? 'Review'
          : group === 'item-explorer'
            ? 'Item Explorer'
            : 'Berechtigungen'
      }}
    </legend>
    <div class="capability-options">
      @for (option of options; track option.value) {
        <label
          ><input
            type="checkbox"
            [checked]="value.includes(option.value)"
            [disabled]="disabled"
            [attr.aria-label]="option.label"
            (change)="toggle(option.value, $any($event.target).checked)"
          />
          {{ group ? option.label.split(': ')[1] : option.label }}</label
        >
      }
    </div>
    @if (showHint) {
      <small
        >Review-Verwaltung schließt Teilnahme nicht ein. Explorer-Bearbeitung umfasst Lesen.</small
      >
    }
  </fieldset>`,
  styles: [
    `
      fieldset {
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 12px;
        margin: 8px 0;
      }
      label {
        display: block;
        margin: 6px 0;
      }
      fieldset.compact {
        padding: 8px 10px 10px;
        margin: 0;
      }
      fieldset.compact legend {
        color: var(--color-text-secondary);
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0 4px;
      }
      fieldset.compact .capability-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(150px, 1fr));
        gap: 6px 16px;
      }
      fieldset.compact label {
        margin: 0;
        white-space: nowrap;
      }
      fieldset.grouped {
        border: 0;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      fieldset.grouped legend {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      fieldset.grouped .capability-options {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      fieldset.grouped label {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
      }
      small {
        display: block;
        margin-top: 8px;
      }
      @media (max-width: 760px) {
        fieldset.compact .capability-options {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CapabilitiesComponent {
  @Input() value: string[] = [];
  @Input() disabled = false;
  @Input() compact = false;
  @Input() showHint = true;
  @Output() valueChange = new EventEmitter<string[]>();
  @Input() group: 'review' | 'item-explorer' | null = null;
  get options() {
    return this.group
      ? CAPABILITY_OPTIONS.filter((option) => option.value.startsWith(this.group + ':'))
      : CAPABILITY_OPTIONS;
  }
  toggle(value: string, checked: boolean) {
    this.valueChange.emit(checked ? [...this.value, value] : this.value.filter((v) => v !== value));
  }
}
