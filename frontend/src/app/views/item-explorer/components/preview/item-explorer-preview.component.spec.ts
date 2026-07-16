import { ElementRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemExplorerPreviewComponent } from './item-explorer-preview.component';
import template from './item-explorer-preview.component.html?raw';

function createPreview() {
  const feature = {
    registerPlayerDom: vi.fn(),
    unregisterPlayerDom: vi.fn(),
    playerFrameChanged: vi.fn(),
    handlePlayerMessage: vi.fn(),
    previewViewModel: {},
  } as any;
  const component = new ItemExplorerPreviewComponent(feature);
  return { component, feature };
}

describe('ItemExplorerPreviewComponent', () => {
  it('names the scroll region, player frame and paging selector', () => {
    expect(template).toContain('aria-label="Item-Vorschau"');
    expect(template).toContain('[title]="\'Player-Vorschau für Item \' + vm.selectedItem.itemId"');
    expect(template).toContain('aria-label="Paging-Modus der Player-Vorschau"');
  });

  it('owns iframe messages and ignores messages from other windows', () => {
    const { component, feature } = createPreview();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const frame = new ElementRef(iframe);
    component.playerFrame = frame;
    const ownMessage = new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'vopResizeNotification', height: 900 },
    });
    const foreignMessage = new MessageEvent('message', {
      source: window,
      data: { type: 'vopResizeNotification', height: 1 },
    });

    window.dispatchEvent(ownMessage);
    window.dispatchEvent(foreignMessage);

    expect(feature.playerFrameChanged).toHaveBeenCalledWith(true);
    expect(feature.handlePlayerMessage).toHaveBeenCalledOnce();
    expect(feature.handlePlayerMessage).toHaveBeenCalledWith(ownMessage.data);
    expect(component.vm).toBe(feature.previewViewModel);

    component.playerFrame = undefined;
    expect(feature.playerFrameChanged).toHaveBeenLastCalledWith(false);
    component.ngOnDestroy();
    iframe.remove();
    expect(feature.unregisterPlayerDom).toHaveBeenCalledWith(component);
  });

  it('focuses and highlights targets inside the player document', () => {
    const { component } = createPreview();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const target = iframe.contentDocument!.createElement('button');
    target.id = 'target';
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView });
    Object.defineProperty(target, 'focus', { value: focus });
    iframe.contentDocument!.body.appendChild(target);
    component.playerFrame = new ElementRef(iframe);

    expect(component.focus(['#target'], [], true)).toBe(true);
    expect(target.classList.contains('cp-item-focus-highlight')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();

    component.ngOnDestroy();
    iframe.remove();
  });
});
