import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog.component';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerHeaderViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-header',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './item-explorer-header.component.html',
  styleUrl: './item-explorer-header.component.css',
})
export class ItemExplorerHeaderComponent {
  readonly vm: ItemExplorerHeaderViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.headerViewModel;
  }
}
