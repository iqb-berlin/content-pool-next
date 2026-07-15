import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerCodingDialogViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-coding-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-coding-dialog.component.html',
  styleUrl: './item-explorer-coding-dialog.component.css',
})
export class ItemExplorerCodingDialogComponent {
  readonly vm: ItemExplorerCodingDialogViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.codingDialogViewModel;
  }
}
