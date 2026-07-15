import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerColumnManagerDialogViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-column-manager-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-column-manager-dialog.component.html',
  styleUrl: './item-explorer-column-manager-dialog.component.css',
})
export class ItemExplorerColumnManagerDialogComponent {
  readonly vm: ItemExplorerColumnManagerDialogViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.columnManagerDialogViewModel;
  }
}
