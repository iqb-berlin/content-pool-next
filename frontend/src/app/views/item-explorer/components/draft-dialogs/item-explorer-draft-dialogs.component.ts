import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerDraftDialogsViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-draft-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-draft-dialogs.component.html',
  styleUrl: './item-explorer-draft-dialogs.component.css',
})
export class ItemExplorerDraftDialogsComponent {
  readonly vm: ItemExplorerDraftDialogsViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.draftDialogsViewModel;
  }
}
