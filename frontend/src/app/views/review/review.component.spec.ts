import { describe, expect, it, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { ReviewComponent } from './review.component';

function setup() {
  const api = {
    getCapabilities: vi.fn().mockReturnValue(of({ canManageReview: true, canReview: true })),
    getReview: vi.fn().mockReturnValue(of({ booklets: [] })),
    getVisibleReviewComments: vi.fn().mockReturnValue(of([])),
    getReviewConfig: vi.fn(),
    getReviewMembers: vi.fn().mockReturnValue(of([])),
    configureReview: vi.fn(),
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
