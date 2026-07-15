import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerResponseStateDialogsViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-response-state-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-response-state-dialogs.component.html',
  styleUrl: './item-explorer-response-state-dialogs.component.css',
})
export class ItemExplorerResponseStateDialogsComponent {
  readonly vm: ItemExplorerResponseStateDialogsViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.responseStateDialogsViewModel;
  }
}
