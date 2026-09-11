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
  template: `<fieldset>
    <legend>Berechtigungen</legend>
    @for (option of options; track option.value) {
      <label
        ><input
          type="checkbox"
          [checked]="value.includes(option.value)"
          [disabled]="disabled"
          (change)="toggle(option.value, $any($event.target).checked)"
        />
        {{ option.label }}</label
      >
    }
    <small
      >Review-Verwaltung schließt Teilnahme nicht ein. Explorer-Bearbeitung umfasst Lesen.</small
    >
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
      small {
        display: block;
        margin-top: 8px;
      }
    `,
  ],
})
export class CapabilitiesComponent {
  @Input() value: string[] = [];
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string[]>();
  options = CAPABILITY_OPTIONS;
  toggle(value: string, checked: boolean) {
    this.valueChange.emit(checked ? [...this.value, value] : this.value.filter((v) => v !== value));
  }
}
