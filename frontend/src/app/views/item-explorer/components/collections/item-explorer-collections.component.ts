import { Component, DoCheck, ElementRef, HostListener, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerCollectionsViewModel } from '../../item-explorer.view-models';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog.component';

type CollectionEntry = ItemExplorerCollectionsViewModel['activeCollectionItems'][number];

@Component({
  selector: 'app-item-explorer-collections',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './item-explorer-collections.component.html',
  styleUrl: './item-explorer-collections.component.css',
})
export class ItemExplorerCollectionsComponent implements DoCheck {
  readonly vm: ItemExplorerCollectionsViewModel;
  readonly pageSize = 50;
  collectionFilterText = '';
  collectionPage = 1;
  selectedRowKeys = new Set<string>();
  showRemoveConfirmation = false;
  removeConfirmationError = '';

  @ViewChild('collectionDialog') private collectionDialog?: ElementRef<HTMLElement>;
  @ViewChild('collectionSearch') private collectionSearch?: ElementRef<HTMLInputElement>;
  @ViewChild('removeSelectedButton') private removeSelectedButton?: ElementRef<HTMLButtonElement>;

  private detailsTrigger: HTMLElement | null = null;
  private collectionIdSource: string | null = null;
  private filteredSource: readonly CollectionEntry[] | null = null;
  private filteredTerm = '';
  private filteredCache: readonly CollectionEntry[] = [];
  private pagedSource: readonly CollectionEntry[] | null = null;
  private pagedPage = 0;
  private pagedCache: readonly CollectionEntry[] = [];

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.collectionsViewModel;
  }

  ngDoCheck(): void {
    const collectionId = this.vm.activeItemCollection?.id || null;
    if (this.collectionIdSource === collectionId) return;
    this.collectionIdSource = collectionId;
    this.resetCollectionSelection();
    this.filteredSource = null;
    this.pagedSource = null;
  }

  get filteredCollectionItems(): readonly CollectionEntry[] {
    const source = this.vm.activeCollectionItems;
    const term = this.collectionFilterText.trim().toLocaleLowerCase();
    if (this.filteredSource !== source || this.filteredTerm !== term) {
      this.filteredSource = source;
      this.filteredTerm = term;
      this.filteredCache = term
        ? source.filter((entry) => {
            const item = entry.item;
            return [
              entry.rowKey,
              item?.unitLabel,
              item?.itemId,
              item?.subIdDisplay,
              item?.subId,
            ].some((value) => value?.toLocaleLowerCase().includes(term));
          })
        : source;
      this.pruneSelection(source);
      this.clampPage();
      this.pagedSource = null;
    }
    return this.filteredCache;
  }

  get collectionPageCount(): number {
    return Math.max(1, Math.ceil(this.filteredCollectionItems.length / this.pageSize));
  }

  get pagedCollectionItems(): readonly CollectionEntry[] {
    const filtered = this.filteredCollectionItems;
    if (this.pagedSource !== filtered || this.pagedPage !== this.collectionPage) {
      const start = (this.collectionPage - 1) * this.pageSize;
      this.pagedSource = filtered;
      this.pagedPage = this.collectionPage;
      this.pagedCache = filtered.slice(start, start + this.pageSize);
    }
    return this.pagedCache;
  }

  get selectedCount(): number {
    return this.selectedRowKeys.size;
  }

  get currentPageFullySelected(): boolean {
    const page = this.pagedCollectionItems;
    return page.length > 0 && page.every((entry) => this.selectedRowKeys.has(entry.rowKey));
  }

  get currentPagePartiallySelected(): boolean {
    const selectedOnPage = this.pagedCollectionItems.filter((entry) =>
      this.selectedRowKeys.has(entry.rowKey),
    ).length;
    return selectedOnPage > 0 && selectedOnPage < this.pagedCollectionItems.length;
  }

  openDetails(trigger: HTMLElement): void {
    this.detailsTrigger = trigger;
    this.resetDialogState();
    this.vm.openCollectionDialog();
    setTimeout(() => this.collectionSearch?.nativeElement.focus());
  }

  closeDetails(): void {
    if (this.vm.collectionBusy) return;
    this.vm.closeCollectionDialog();
    this.resetDialogState();
    setTimeout(() => this.detailsTrigger?.focus());
  }

  setCollectionFilterText(value: string): void {
    this.collectionFilterText = value;
    this.collectionPage = 1;
    this.selectedRowKeys.clear();
    this.filteredSource = null;
  }

  previousPage(): void {
    if (this.collectionPage > 1) this.collectionPage -= 1;
  }

  nextPage(): void {
    if (this.collectionPage < this.collectionPageCount) this.collectionPage += 1;
  }

  toggleRowSelection(rowKey: string, selected: boolean): void {
    if (selected) this.selectedRowKeys.add(rowKey);
    else this.selectedRowKeys.delete(rowKey);
  }

  toggleCurrentPage(selected: boolean): void {
    for (const entry of this.pagedCollectionItems) {
      if (selected) this.selectedRowKeys.add(entry.rowKey);
      else this.selectedRowKeys.delete(entry.rowKey);
    }
  }

  async removeOne(rowKey: string): Promise<void> {
    if (await this.vm.removeRowFromActiveCollection(rowKey)) {
      this.selectedRowKeys.delete(rowKey);
      this.filteredSource = null;
    }
  }

  openRemoveConfirmation(): void {
    if (!this.selectedCount || this.vm.collectionBusy) return;
    this.removeConfirmationError = '';
    this.showRemoveConfirmation = true;
    setTimeout(() => this.getConfirmationDialog()?.querySelector<HTMLElement>('button')?.focus());
  }

  cancelRemoveConfirmation(): void {
    if (this.vm.collectionBusy) return;
    this.showRemoveConfirmation = false;
    this.removeConfirmationError = '';
    setTimeout(() => this.removeSelectedButton?.nativeElement.focus());
  }

  async confirmRemoveSelected(): Promise<void> {
    const rowKeys = [...this.selectedRowKeys];
    this.removeConfirmationError = '';
    if (await this.vm.removeRowsFromActiveCollection(rowKeys)) {
      this.selectedRowKeys.clear();
      this.showRemoveConfirmation = false;
      this.filteredSource = null;
      setTimeout(() => this.collectionSearch?.nativeElement.focus());
    } else {
      this.removeConfirmationError =
        this.vm.collectionError || 'Die ausgewählten Einträge konnten nicht entfernt werden.';
    }
  }

  async deleteActiveCollection(): Promise<void> {
    await this.vm.deleteActiveCollection();
    if (!this.vm.showCollectionDialog) {
      this.resetDialogState();
      setTimeout(() => this.detailsTrigger?.focus());
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.vm.showCollectionDialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.showRemoveConfirmation) this.cancelRemoveConfirmation();
      else this.closeDetails();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = this.showRemoveConfirmation
      ? this.getConfirmationDialog()
      : this.collectionDialog?.nativeElement;
    if (!container) return;
    const focusable = this.getFocusableElements(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private resetDialogState(): void {
    this.collectionFilterText = '';
    this.collectionPage = 1;
    this.collectionIdSource = this.vm.activeItemCollection?.id || null;
    this.resetCollectionSelection();
    this.filteredSource = null;
    this.pagedSource = null;
  }

  private resetCollectionSelection(): void {
    this.selectedRowKeys.clear();
    this.showRemoveConfirmation = false;
    this.removeConfirmationError = '';
  }

  private clampPage(): void {
    const pageCount = Math.max(1, Math.ceil(this.filteredCache.length / this.pageSize));
    this.collectionPage = Math.min(Math.max(1, this.collectionPage), pageCount);
  }

  private pruneSelection(source: readonly CollectionEntry[]): void {
    const available = new Set(source.map((entry) => entry.rowKey));
    for (const rowKey of this.selectedRowKeys) {
      if (!available.has(rowKey)) this.selectedRowKeys.delete(rowKey);
    }
  }

  private getConfirmationDialog(): HTMLElement | null {
    return document.querySelector('.collection-remove-confirmation .dialog');
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('hidden'));
  }
}
