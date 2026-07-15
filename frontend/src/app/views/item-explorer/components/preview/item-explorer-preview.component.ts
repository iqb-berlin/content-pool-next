import { Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemExplorerFacade } from '../../item-explorer.facade';
import { ItemExplorerPreviewViewModel } from '../../item-explorer.view-models';
import { ItemExplorerPlayerDomPort } from '../../item-explorer.dom-ports';

@Component({
  selector: 'app-item-explorer-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-explorer-preview.component.html',
  styleUrl: './item-explorer-preview.component.css',
})
export class ItemExplorerPreviewComponent implements OnDestroy, ItemExplorerPlayerDomPort {
  private frame?: ElementRef<HTMLIFrameElement>;
  private autoResizeInterval: ReturnType<typeof setInterval> | null = null;
  readonly vm: ItemExplorerPreviewViewModel;
  private readonly messageHandler = (event: MessageEvent) => {
    const frameWindow = this.frame?.nativeElement.contentWindow;
    if (!frameWindow || event.source !== frameWindow) return;
    this.feature.handlePlayerMessage(event.data);
  };

  @ViewChild('playerFrame')
  set playerFrame(value: ElementRef<HTMLIFrameElement> | undefined) {
    this.frame = value;
    this.feature.playerFrameChanged(Boolean(value));
  }

  constructor(@Inject(ItemExplorerFacade) private readonly feature: ItemExplorerFacade) {
    this.vm = feature.previewViewModel;
    feature.registerPlayerDom(this);
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
    this.stopAutoResize();
    this.frame = undefined;
    this.feature.unregisterPlayerDom(this);
  }

  hasFrame(): boolean {
    return Boolean(this.frame?.nativeElement.contentWindow);
  }

  postMessage(message: unknown): void {
    this.frame?.nativeElement.contentWindow?.postMessage(message, '*');
  }

  focus(
    selectors: string[],
    textCandidates: Array<string | undefined>,
    highlight: boolean,
  ): boolean {
    const doc = this.getPlayerDocument();
    if (!doc?.body) return false;

    const selectorTarget = selectors
      .map((selector) => doc.querySelector<HTMLElement>(selector))
      .find((target): target is HTMLElement => Boolean(target));
    const target = selectorTarget || this.findElementByText(doc, textCandidates);
    if (!target) return false;

    doc
      .querySelectorAll('.cp-item-focus-highlight')
      .forEach((element) => element.classList.remove('cp-item-focus-highlight'));
    if (highlight) {
      this.ensureFocusStyle(doc);
      target.classList.add('cp-item-focus-highlight');
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    try {
      target.focus({ preventScroll: true });
    } catch {
      // Some embedded player elements are intentionally not focusable.
    }
    return true;
  }

  startAutoResize(onHeightChange: (height: number) => void): void {
    this.stopAutoResize();
    this.autoResizeInterval = setInterval(() => {
      try {
        const doc = this.getPlayerDocument();
        if (!doc?.body) return;
        const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 600);
        if (height > 0) onHeightChange(height);
      } catch {
        // Cross-origin player frames cannot be measured.
      }
    }, 500);
  }

  stopAutoResize(): void {
    if (!this.autoResizeInterval) return;
    clearInterval(this.autoResizeInterval);
    this.autoResizeInterval = null;
  }

  private getPlayerDocument(): Document | null {
    const frame = this.frame?.nativeElement;
    return frame?.contentDocument || frame?.contentWindow?.document || null;
  }

  private findElementByText(
    doc: Document,
    candidates: Array<string | undefined>,
  ): HTMLElement | null {
    const needles = candidates
      .map((value) => (value || '').trim().toLowerCase())
      .filter((value) => value.length > 1);
    if (!needles.length) return null;

    const nodes = Array.from(doc.querySelectorAll<HTMLElement>('label, span, div, p, li, button'));
    const maxScan = Math.min(nodes.length, 3000);
    for (let index = 0; index < maxScan; index += 1) {
      const node = nodes[index];
      const text = (node.textContent || '').trim().toLowerCase();
      if (text && needles.some((needle) => text === needle || text.includes(needle))) return node;
    }
    return null;
  }

  private ensureFocusStyle(doc: Document): void {
    if (doc.getElementById('cp-item-focus-style')) return;
    const style = doc.createElement('style');
    style.id = 'cp-item-focus-style';
    style.textContent = `
      .cp-item-focus-highlight {
        outline: 3px solid #e67e22 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.25) !important;
        border-radius: 4px !important;
        transition: box-shadow 0.2s ease;
      }
    `;
    doc.head?.appendChild(style);
  }
}
