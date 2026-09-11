import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ReviewComponent } from './review.component';

function setup() {
  const api = {
    getCapabilities: vi.fn().mockReturnValue(of({ canManageReview: true, canReview: true })),
    getReview: vi.fn().mockReturnValue(of({ booklets: [] })),
    getVisibleReviewComments: vi.fn().mockReturnValue(of([])),
    getReviewConfig: vi.fn(),
    getReviewMembers: vi.fn().mockReturnValue(of([])),
    configureReview: vi.fn(),
    exportMyReviewCommentsCsv: vi.fn().mockReturnValue(new Subject()),
    exportMyReviewCommentsXlsx: vi.fn().mockReturnValue(new Subject()),
    exportVisibleReviewComments: vi.fn().mockReturnValue(new Subject()),
  };
  const component = new ReviewComponent(
    { snapshot: { paramMap: { get: () => 'acp' } } } as any,
    api as any,
  );
  component.acpId = 'acp';
  component.config = {
    enableReview: true,
    visibilityMode: 'PRIVATE',
    configVersion: 1,
    groups: [],
  };
  return { component, api };
}

describe('Review configuration', () => {
  it('keeps both personal formats separate from the manager export', () => {
    const { component, api } = setup();
    component.access = { canManageReview: true, canReview: true } as any;
    component.exportComments('csv');
    expect(api.exportMyReviewCommentsCsv).toHaveBeenCalledWith('acp');
    component.exportComments('xlsx');
    expect(api.exportMyReviewCommentsXlsx).toHaveBeenCalledWith('acp');
    expect(api.exportVisibleReviewComments).not.toHaveBeenCalled();
    component.exportComments();
    expect(api.exportVisibleReviewComments).toHaveBeenCalledWith('acp');
    component.ngOnDestroy();
  });

  it('reports personal export errors and clears them on retry', () => {
    const { component, api } = setup();
    api.exportMyReviewCommentsCsv.mockReturnValue(throwError(() => new Error('offline')));
    component.exportComments('csv');
    expect(component.commentsError).toBe('Export konnte nicht erstellt werden.');
    component.exportComments('xlsx');
    expect(component.commentsError).toBe('');
    component.ngOnDestroy();
  });

  it('leaves private visibility unchanged when sharing is not confirmed', () => {
    const { component, api } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.config!.visibilityMode = 'SHARED';
    component.configure();
    expect(api.configureReview).not.toHaveBeenCalled();
    component.ngOnDestroy();
    vi.restoreAllMocks();
  });

  it('does not refetch configuration after save and overwrite the next unsaved choice', () => {
    const { component, api } = setup();
    const saved = new Subject<any>();
    api.configureReview.mockReturnValue(saved);
    component.configure();
    saved.next({ enableReview: true, visibilityMode: 'PRIVATE', configVersion: 2, groups: [] });
    component.config!.visibilityMode = 'GROUP';
    expect(api.getReviewConfig).not.toHaveBeenCalled();
    expect(component.config!.visibilityMode).toBe('GROUP');
    expect(component.config!.configVersion).toBe(2);
    component.ngOnDestroy();
  });

  it('preserves edited group membership when saving reports a conflict', () => {
    const { component, api } = setup();
    const saved = new Subject<any>();
    api.configureReview.mockReturnValue(saved);
    component.config!.groups.push({
      name: 'Fachgruppe',
      archived: false,
      members: [{ id: 'u', kind: 'user' }],
    });
    component.configure();
    saved.error({ status: 409, error: { message: 'Bitte neu laden' } });
    expect(component.config!.groups[0].members).toEqual([{ id: 'u', kind: 'user' }]);
    expect(component.error).toBe('Bitte neu laden');
    expect(component.busy).toBe(false);
    component.ngOnDestroy();
  });
});
