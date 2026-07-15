import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerHistoryDialogViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-history-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-history-dialog.component.html',
  styleUrl: './item-explorer-history-dialog.component.css',
})
export class ItemExplorerHistoryDialogComponent {
  readonly vm: ItemExplorerHistoryDialogViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.historyDialogViewModel;
  }
}
