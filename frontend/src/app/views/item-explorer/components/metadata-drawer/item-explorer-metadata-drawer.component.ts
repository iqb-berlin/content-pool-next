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
  width = 560;
  private resizeStart: { x: number; width: number } | null = null;

  startResize(event: PointerEvent): void {
    this.resizeStart = { x: event.clientX, width: this.width };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  resize(event: PointerEvent): void {
    if (!this.resizeStart) return;
    this.width = Math.min(
      window.innerWidth,
      Math.max(320, this.resizeStart.width + this.resizeStart.x - event.clientX),
    );
  }

  stopResize(): void {
    this.resizeStart = null;
  }

  resizeWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.width = Math.min(
      window.innerWidth,
      Math.max(320, this.width + (event.key === 'ArrowLeft' ? 40 : -40)),
    );
  }

  readonly vm: ItemExplorerMetadataDrawerViewModel;

  constructor(@Inject(ItemExplorerFacade) facade: ItemExplorerFacade) {
    this.vm = facade.metadataDrawerViewModel;
  }
}
