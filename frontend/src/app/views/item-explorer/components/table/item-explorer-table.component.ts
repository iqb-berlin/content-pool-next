import { Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerTableViewModel } from '../../item-explorer.view-models';
import { ItemExplorerCollectionsComponent } from '../collections/item-explorer-collections.component';
import { ItemExplorerTableDomPort } from '../../item-explorer.dom-ports';

@Component({
  selector: 'app-item-explorer-table',
  standalone: true,
  imports: [CommonModule, FormsModule, ItemExplorerCollectionsComponent],
  templateUrl: './item-explorer-table.component.html',
  styleUrl: './item-explorer-table.component.css',
})
export class ItemExplorerTableComponent implements OnDestroy, ItemExplorerTableDomPort {
  private filterInput?: ElementRef<HTMLInputElement>;
  private scrollContainer?: ElementRef<HTMLDivElement>;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  readonly vm: ItemExplorerTableViewModel;

  @ViewChild('globalFilterInput')
  set globalFilterInput(value: ElementRef<HTMLInputElement> | undefined) {
    this.filterInput = value;
  }

  @ViewChild('tableScroll')
  set tableScroll(value: ElementRef<HTMLDivElement> | undefined) {
    this.scrollContainer = value;
  }

  constructor(@Inject(ItemExplorerFacade) private readonly feature: ItemExplorerFacade) {
    this.vm = feature.tableViewModel;
    feature.registerTableDom(this);
  }

  ngOnDestroy(): void {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.feature.unregisterTableDom(this);
  }

  focusFilter(): void {
    const input = this.filterInput?.nativeElement;
    input?.focus();
    input?.select();
  }

  onTableKeydown(event: KeyboardEvent): void {
    if (this.isEditableTarget(event.target)) return;
    this.vm.onTableKeydown(event);
  }

  focusFallback(): void {
    const target = this.scrollContainer?.nativeElement || this.filterInput?.nativeElement;
    if (!target) return;
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      target.focus({ preventScroll: true });
    }, 0);
  }

  scrollToSelection(): void {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;
      const row = this.scrollContainer?.nativeElement.querySelector('tr.active');
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    );
  }
}
