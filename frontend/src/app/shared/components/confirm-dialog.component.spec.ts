import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  it('emits confirmed when not busy', () => {
    const component = new ConfirmDialogComponent();
    const confirmedSpy = vi.fn();
    component.confirmed.subscribe(confirmedSpy);

    component.confirm();

    expect(confirmedSpy).toHaveBeenCalledTimes(1);
  });

  it('does not emit confirmed while busy', () => {
    const component = new ConfirmDialogComponent();
    const confirmedSpy = vi.fn();
    component.confirmed.subscribe(confirmedSpy);
    component.busy = true;

    component.confirm();

    expect(confirmedSpy).not.toHaveBeenCalled();
  });

  it('emits cancelled when not busy', () => {
    const component = new ConfirmDialogComponent();
    const cancelledSpy = vi.fn();
    component.cancelled.subscribe(cancelledSpy);

    component.cancel();

    expect(cancelledSpy).toHaveBeenCalledTimes(1);
  });

  it('does not emit cancelled while busy', () => {
    const component = new ConfirmDialogComponent();
    const cancelledSpy = vi.fn();
    component.cancelled.subscribe(cancelledSpy);
    component.busy = true;

    component.cancel();

    expect(cancelledSpy).not.toHaveBeenCalled();
  });

  it('delegates overlay click to cancel when not busy', () => {
    const component = new ConfirmDialogComponent();
    const cancelSpy = vi.spyOn(component, 'cancel');

    component.onOverlayClick();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores overlay click while busy', () => {
    const component = new ConfirmDialogComponent();
    const cancelSpy = vi.spyOn(component, 'cancel');
    component.busy = true;

    component.onOverlayClick();

    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
