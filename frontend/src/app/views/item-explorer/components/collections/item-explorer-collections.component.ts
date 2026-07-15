import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerCollectionsViewModel } from '../../item-explorer.view-models';

@Component({
  selector: 'app-item-explorer-collections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-collections.component.html',
  styleUrl: './item-explorer-collections.component.css',
})
export class ItemExplorerCollectionsComponent {
  readonly vm: ItemExplorerCollectionsViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.collectionsViewModel;
  }
}
