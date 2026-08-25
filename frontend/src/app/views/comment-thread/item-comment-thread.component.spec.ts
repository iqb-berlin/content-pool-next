import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ItemCommentThreadComponent } from './item-comment-thread.component';

function createComponent() {
  const api = {
    getItemCommentThread: vi
      .fn()
      .mockReturnValue(of({ revision: '1', visibilityMode: 'SHARED', comments: [] })),
    createItemComment: vi.fn().mockReturnValue(of({ id: 'created' })),
    updateItemComment: vi.fn().mockReturnValue(of({ id: 'updated' })),
    deleteItemComment: vi.fn().mockReturnValue(of({ success: true })),
  } as any;
  const component = new ItemCommentThreadComponent(api);
  component.acpId = 'acp-1';
  component.unitId = 'unit-1';
  component.itemId = 'item-1';
  component.enabled = true;
  return { component, api };
}

describe('ItemCommentThreadComponent', () => {
  it('loads only the selected item and ignores a superseded response', () => {
    const { component, api } = createComponent();
    const first = new Subject<any>();
    const second = new Subject<any>();
    api.getItemCommentThread.mockReturnValueOnce(first).mockReturnValueOnce(second);

    component.loadThread();
    component.itemId = 'item-2';
    component.loadThread();
    expect(first.observed).toBe(false);
    first.next({ revision: 'old', visibilityMode: 'SHARED', comments: [{ id: 'old' }] });
    second.next({ revision: 'new', visibilityMode: 'SHARED', comments: [{ id: 'new' }] });

    expect(component.snapshot?.revision).toBe('new');
    expect(api.getItemCommentThread).toHaveBeenNthCalledWith(1, 'acp-1', 'unit-1', 'item-1');
    expect(api.getItemCommentThread).toHaveBeenNthCalledWith(2, 'acp-1', 'unit-1', 'item-2');
    component.ngOnDestroy();
  });

  it('replaces the previous snapshot on target changes without reloading on open', () => {
    const { component, api } = createComponent();
    const response = new Subject<any>();
    component.snapshot = { revision: 'old', visibilityMode: 'SHARED', comments: [] };
    api.getItemCommentThread.mockReturnValue(response);
    component.itemId = 'item-2';

    component.ngOnChanges({ itemId: {} as any });

    expect(component.snapshot).toBeNull();
    response.next({ revision: 'new', visibilityMode: 'SHARED', comments: [] });
    expect(component.snapshot?.revision).toBe('new');
    expect(api.getItemCommentThread).toHaveBeenCalledTimes(1);
    component.toggleOpen();
    expect(api.getItemCommentThread).toHaveBeenCalledTimes(1);
  });

  it('groups replies below roots and keeps orphaned own replies visible', () => {
    const { component } = createComponent();
    component.snapshot = {
      revision: '1',
      visibilityMode: 'PRIVATE',
      comments: [
        { id: 'root', parentCommentId: null, createdAt: '2026-01-01T10:00:00Z' },
        { id: 'reply', parentCommentId: 'root', createdAt: '2026-01-01T11:00:00Z' },
        { id: 'orphan', parentCommentId: 'hidden', createdAt: '2026-01-01T12:00:00Z' },
      ] as any,
    };

    expect(component.threadGroups).toEqual([
      expect.objectContaining({
        id: 'hidden',
        root: null,
        replies: [expect.objectContaining({ id: 'orphan' })],
      }),
      expect.objectContaining({
        id: 'root',
        root: expect.objectContaining({ id: 'root' }),
        replies: [expect.objectContaining({ id: 'reply' })],
      }),
    ]);
  });

  it('keeps drafts per item and creates a reply for the selected target', () => {
    const { component, api } = createComponent();
    component.newCommentText = 'Entwurf 1';
    component.itemId = 'item-2';
    component.newCommentText = 'Entwurf 2';
    component.itemId = 'item-1';
    expect(component.newCommentText).toBe('Entwurf 1');

    component.setReplyText('root-1', 'Antwort');
    component.submitComment('root-1');
    expect(api.createItemComment).toHaveBeenCalledWith('acp-1', {
      unitId: 'unit-1',
      itemId: 'item-1',
      commentText: 'Antwort',
      parentCommentId: 'root-1',
    });
  });

  it('reports a version conflict and reloads the thread', () => {
    const { component, api } = createComponent();
    api.updateItemComment.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Konflikt' } })),
    );
    const loadSpy = vi.spyOn(component, 'loadThread');
    component.editText = 'Neue Fassung';

    component.saveEdit({ id: 'c-1', version: 2 } as any);

    expect(component.error).toBe('Konflikt');
    expect(loadSpy).toHaveBeenCalled();
  });

  it('does not clear or reload the newly selected item after an older save completes', () => {
    const { component, api } = createComponent();
    const save = new Subject<any>();
    api.createItemComment.mockReturnValue(save);
    component.newCommentText = 'Entwurf für Item 1';

    component.submitComment();
    component.itemId = 'item-2';
    component.newCommentText = 'Entwurf für Item 2';
    const loadSpy = vi.spyOn(component, 'loadThread');
    save.next({ id: 'created' });
    save.complete();

    expect(component.newCommentText).toBe('Entwurf für Item 2');
    expect(loadSpy).not.toHaveBeenCalled();
    component.itemId = 'item-1';
    expect(component.newCommentText).toBe('');
  });

  it('marks every versioned edit even when timestamps are less than a second apart', () => {
    const { component } = createComponent();
    expect(
      component.wasEdited({
        version: 2,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.100Z',
      } as any),
    ).toBe(true);
    expect(
      component.wasEdited({
        version: 1,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:05.000Z',
      } as any),
    ).toBe(false);
  });
});
