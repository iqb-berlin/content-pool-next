import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerUploadDialogsViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-upload-dialogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-upload-dialogs.component.html',
  styleUrl: './item-explorer-upload-dialogs.component.css',
})
export class ItemExplorerUploadDialogsComponent {
  readonly vm: ItemExplorerUploadDialogsViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.uploadDialogsViewModel;
  }
}
