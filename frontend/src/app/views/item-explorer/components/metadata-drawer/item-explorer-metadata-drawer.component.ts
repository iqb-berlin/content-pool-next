import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerMetadataDrawerViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-metadata-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-metadata-drawer.component.html',
  styleUrl: './item-explorer-metadata-drawer.component.css',
})
export class ItemExplorerMetadataDrawerComponent {
  readonly vm: ItemExplorerMetadataDrawerViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.metadataDrawerViewModel;
  }
}
