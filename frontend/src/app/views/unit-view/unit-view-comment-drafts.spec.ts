import { provideZonelessChangeDetection, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import threadTemplate from '../comment-thread/item-comment-thread.component.html?raw';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UnitViewComponent } from './unit-view.component';
import { ItemCommentThreadComponent } from '../comment-thread/item-comment-thread.component';

// Use the real child: a stub cannot detect draft loss when Angular destroys the view.
describe('Unit review comment drafts', () => {
  let fixture: ComponentFixture<UnitViewComponent>;
  const currentUser$ = new BehaviorSubject(null);
  let token: string | null;
  const session = (sub: string) =>
    `header.${btoa(JSON.stringify({ sub, type: 'oidc' }))}.signature`;
  const thread = () =>
    fixture.debugElement.query(By.directive(ItemCommentThreadComponent))?.componentInstance as
      | ItemCommentThreadComponent
      | undefined;
  const detect = () => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };
  const root = {
    id: 'root',
    commentText: 'Original',
    version: 1,
    createdAt: '2026-09-01T12:00:00Z',
    canEdit: true,
  };
  const api = {
    getViewUnit: vi.fn(),
    getReviewCommentThread: vi.fn(),
    updateItemComment: vi.fn(),
  };

  beforeEach(async () => {
    token = session('user-1');
    api.getViewUnit.mockImplementation((_acpId: string, unitId: string) =>
      of({ id: unitId, name: unitId, items: [], dependencies: [] }),
    );
    api.getReviewCommentThread.mockImplementation((_acpId: string, target: unknown) =>
      of({
        revision: '1',
        target,
        comments: [root],
        visibilityMode: 'GROUP',
        groups: [
          { id: 'G1', name: 'Gruppe 1' },
          { id: 'G2', name: 'Gruppe 2' },
        ],
        defaultGroupId: 'G1',
      }),
    );
    api.updateItemComment.mockReturnValue(of({}));
    (ItemCommentThreadComponent as any).ctorParameters = () => [{ type: ApiService }];
    await ɵresolveComponentResources(async (url: string) =>
      url.endsWith('.html') ? threadTemplate : '',
    );
    await TestBed.configureTestingModule({
      imports: [UnitViewComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser$, getToken: () => token } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '' } } } },
        { provide: ApiService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UnitViewComponent);
    fixture.componentRef.setInput('acpId', 'A');
    fixture.componentRef.setInput('unitId', 'U');
    fixture.componentRef.setInput('bookletId', 'B');
    fixture.componentRef.setInput('embedded', true);
    fixture.componentRef.setInput('reviewMode', true);
    fixture.componentRef.setInput('featureConfigOverride', {
      enableCommenting: true,
      commentTargets: ['UNIT', 'BOOKLET'],
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  function enterDrafts() {
    thread()!.newCommentText = 'Neuer Kommentar';
    thread()!.selectedGroupId = 'G2';
    thread()!.startReply('root');
    thread()!.setReplyText('root', 'Antwortentwurf');
    thread()!.startEdit(root as any);
    thread()!.editText = 'Bearbeitungsentwurf';
    detect();
  }

  function expectDrafts() {
    expect(thread()!.newCommentText).toBe('Neuer Kommentar');
    expect(thread()!.selectedGroupId).toBe('G2');
    expect(thread()!.replyingTo).toBe('root');
    expect(thread()!.replyText('root')).toBe('Antwortentwurf');
    expect(thread()!.editingCommentId).toBe('root');
    expect(thread()!.editText).toBe('Bearbeitungsentwurf');
  }

  it.each(['tab', 'collapse'] as const)(
    'preserves all drafts and their group through %s changes',
    (change) => {
      enterDrafts();
      const original = thread();
      if (change === 'tab') fixture.componentInstance.activeTab = 'coding';
      else fixture.componentInstance.reviewPanelCollapsed = true;
      detect();
      expect(thread()).toBeUndefined();
      if (change === 'tab') fixture.componentInstance.activeTab = 'comments';
      else fixture.componentInstance.reviewPanelCollapsed = false;
      detect();
      expect(thread()).not.toBe(original);
      expectDrafts();
    },
  );

  it('keeps unit and booklet drafts separate when switching comment scope', () => {
    enterDrafts();
    fixture.componentInstance.commentScope = 'booklet';
    detect();
    expect(thread()!.newCommentText).toBe('');
    expect(thread()!.editText).toBe('');
    thread()!.newCommentText = 'Testheftentwurf';
    fixture.componentInstance.commentScope = 'unit';
    detect();
    expectDrafts();
    fixture.componentInstance.commentScope = 'booklet';
    detect();
    expect(thread()!.newCommentText).toBe('Testheftentwurf');
  });

  it('preserves drafts across asynchronous unit loads and isolates package identities', () => {
    enterDrafts();
    const response = new Subject<any>();
    api.getViewUnit.mockReturnValueOnce(response);
    fixture.componentRef.setInput('unitId', 'V');
    detect();
    expect(thread()).toBeUndefined();
    response.next({ id: 'V', name: 'V', items: [], dependencies: [] });
    detect();
    expect(thread()!.newCommentText).toBe('');
    thread()!.newCommentText = 'Andere Unit';
    fixture.componentRef.setInput('unitId', 'U');
    detect();
    expectDrafts();
    fixture.componentRef.setInput('acpId', 'OTHER');
    detect();
    expect(thread()!.newCommentText).toBe('');
    fixture.componentRef.setInput('acpId', 'A');
    detect();
    expectDrafts();
  });

  it('keeps the original edit version after remount and clears only successfully saved drafts', () => {
    enterDrafts();
    fixture.componentInstance.activeTab = 'coding';
    detect();
    api.getReviewCommentThread.mockReturnValue(
      of({
        revision: '2',
        target: { targetType: 'UNIT', unitId: 'U' },
        comments: [{ ...root, version: 2, commentText: 'Concurrent edit' }],
        visibilityMode: 'SHARED',
      }),
    );
    fixture.componentInstance.activeTab = 'comments';
    detect();
    thread()!.saveEdit(thread()!.threadGroups[0].root!);
    expect(api.updateItemComment).toHaveBeenCalledWith('A', 'root', {
      commentText: 'Bearbeitungsentwurf',
      version: 1,
    });
    expect(thread()!.editText).toBe('');
    expect(thread()!.newCommentText).toBe('Neuer Kommentar');
    expect(thread()!.replyText('root')).toBe('Antwortentwurf');
  });

  it.each([null, session('user-2')])(
    'clears hidden drafts when the session changes',
    (nextToken) => {
      enterDrafts();
      fixture.componentInstance.activeTab = 'coding';
      detect();
      token = nextToken;
      currentUser$.next(null);
      fixture.componentInstance.activeTab = 'comments';
      detect();
      expect(thread()!.newCommentText).toBe('');
      expect(thread()!.replyText('root')).toBe('');
      expect(thread()!.editText).toBe('');
      expect(thread()!.replyingTo).toBeNull();
    },
  );

  it('retains drafts when the same identity refreshes its profile', () => {
    enterDrafts();
    currentUser$.next(null);
    detect();
    expectDrafts();
  });
});
