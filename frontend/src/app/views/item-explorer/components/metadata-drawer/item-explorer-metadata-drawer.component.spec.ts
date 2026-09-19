import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemExplorerMetadataDrawerComponent } from './item-explorer-metadata-drawer.component';
import { ItemExplorerFacade } from '../../item-explorer.facade';

describe('ItemExplorerMetadataDrawerComponent resizing', () => {
  afterEach(() => vi.restoreAllMocks());

  function drawer(viewportWidth: number) {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(viewportWidth);
    return new ItemExplorerMetadataDrawerComponent({
      metadataDrawerViewModel: {},
    } as ItemExplorerFacade);
  }

  it('shrinks from the visible width on the first keypress after a viewport reduction', () => {
    const component = drawer(390);
    component.width = 640;
    component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.width).toBe(350);
    expect(component.visibleWidth).toBe(350);
  });

  it('starts dragging from the visible width instead of the hidden requested width', () => {
    const component = drawer(390);
    component.startResize({
      clientX: 0,
      pointerId: 1,
      currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    component.resize({ clientX: 40 } as PointerEvent);
    expect(component.width).toBe(350);
    component.stopResize();
    component.resize({ clientX: 100 } as PointerEvent);
    expect(component.width).toBe(350);
  });

  it.each([280, 390, 1440])('respects both resize limits in a %ipx viewport', (viewport) => {
    const component = drawer(viewport);
    for (let i = 0; i < 40; i++) {
      component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    }
    expect(component.width).toBe(Math.min(320, viewport));
    for (let i = 0; i < 40; i++) {
      component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    }
    expect(component.width).toBe(viewport);
  });
});
