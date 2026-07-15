import { ElementRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemExplorerComponent } from './item-explorer.component';

function createFeature() {
  return {
    init: vi.fn(),
    registerShellDom: vi.fn(),
    unregisterShellDom: vi.fn(),
    handleBeforeUnload: vi.fn(),
    handleWindowKeydown: vi.fn(),
    handleFullscreenChange: vi.fn(),
    canDeactivate: vi.fn(() => true),
    isFullscreen: false,
    breadcrumbs: [],
  };
}

function createShell(acpId = 'acp-1') {
  const feature = createFeature();
  const component = new ItemExplorerComponent(
    { snapshot: { paramMap: { get: () => acpId } } } as any,
    feature as any,
  );
  return { component, feature };
}

describe('ItemExplorerComponent', () => {
  it('initializes and registers the route-scoped facade', () => {
    const { component, feature } = createShell('acp-42');

    component.ngOnInit();

    expect(feature.registerShellDom).toHaveBeenCalledWith(component);
    expect(feature.init).toHaveBeenCalledWith('acp-42');
  });

  it('delegates host events and route deactivation to the facade', () => {
    const { component, feature } = createShell();
    const beforeUnload = new Event('beforeunload') as BeforeUnloadEvent;
    const keydown = new KeyboardEvent('keydown', { key: 'x' });
    const result = Promise.resolve(false);
    feature.canDeactivate.mockReturnValue(result as any);

    component.handleBeforeUnload(beforeUnload);
    component.handleWindowKeydown(keydown);
    component.handleFullscreenChange();

    expect(feature.handleBeforeUnload).toHaveBeenCalledWith(beforeUnload);
    expect(feature.handleWindowKeydown).toHaveBeenCalledWith(keydown);
    expect(feature.handleFullscreenChange).toHaveBeenCalledOnce();
    expect(component.canDeactivate()).toBe(result);
  });

  it('owns fullscreen DOM operations', async () => {
    const { component } = createShell();
    const root = document.createElement('div');
    let fullscreenElement: Element | null = null;
    const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = root;
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
    });
    Object.defineProperty(root, 'requestFullscreen', { value: requestFullscreen });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    component.explorerRoot = new ElementRef(root);

    try {
      await expect(component.toggleFullscreen()).resolves.toBe(true);
      await expect(component.toggleFullscreen()).resolves.toBe(false);
      expect(requestFullscreen).toHaveBeenCalledOnce();
      expect(exitFullscreen).toHaveBeenCalledOnce();
    } finally {
      if (fullscreenDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', fullscreenDescriptor);
      } else {
        delete (document as any).fullscreenElement;
      }
      if (exitDescriptor) {
        Object.defineProperty(document, 'exitFullscreen', exitDescriptor);
      } else {
        delete (document as any).exitFullscreen;
      }
    }
  });

  it('unregisters its DOM port on destroy', () => {
    const { component, feature } = createShell();

    component.ngOnDestroy();

    expect(feature.unregisterShellDom).toHaveBeenCalledWith(component);
  });
});
