import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { TaskSequenceComponent } from './task-sequence.component';

vi.mock('../comment-thread/item-comment-thread.component', async () => {
  const { Component } = await import('@angular/core');
  class ItemCommentThreadStub {}
  Component({
    selector: 'app-item-comment-thread',
    standalone: true,
    template: '',
    inputs: ['acpId', 'targetType', 'bookletId', 'enabled'],
  })(ItemCommentThreadStub);
  return { ItemCommentThreadComponent: ItemCommentThreadStub };
});

vi.mock('../unit-view/unit-view.component', async () => {
  const { Component } = await import('@angular/core');
  class UnitViewStub {
    acpId = '';
    unitId = '';
    bookletId = '';
    embedded = false;
    reviewMode = false;
    featureConfigOverride: unknown = null;
  }
  Component({
    selector: 'app-unit-view',
    standalone: true,
    template:
      '<div class="unit-review-stub" [attr.data-unit-id]="unitId" [attr.data-booklet-id]="bookletId" [attr.data-review-mode]="reviewMode">{{ unitId }}</div>',
    inputs: ['acpId', 'unitId', 'bookletId', 'embedded', 'reviewMode', 'featureConfigOverride'],
  })(UnitViewStub);
  return { UnitViewComponent: UnitViewStub };
});

describe('Booklet navigation', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders block paths and selects repeated unit occurrences independently', async () => {
    await TestBed.configureTestingModule({
      imports: [TaskSequenceComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: false,
            isAdmin: false,
            currentUser$: of(null),
            hasAcpRole: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'acpId' ? 'acp-1' : 'booklet-1') },
              queryParamMap: { get: () => 'booklet' },
            },
          },
        },
        {
          provide: ApiService,
          useValue: {
            appendAuthToken: vi.fn((url: string) => url),
            getAcpStartPage: vi.fn().mockReturnValue(
              of({
                featureConfig: {
                  enableSequenceNavigation: false,
                  enableCommenting: true,
                  commentTargets: ['BOOKLET', 'UNIT'],
                },
              }),
            ),
            getViewSequence: vi.fn().mockReturnValue(
              of({
                id: 'booklet-1',
                name: 'Review-Booklet',
                units: [
                  {
                    id: 'u1',
                    name: 'Aufgabe 1',
                    occurrenceId: 'first',
                    alias: 'A',
                    blockPath: ['Mathematik'],
                  },
                  {
                    id: 'u1',
                    name: 'Aufgabe 1 erneut',
                    occurrenceId: 'second',
                    alias: 'B',
                    blockPath: ['Mathematik', 'Geometrie'],
                  },
                  {
                    id: 'u2',
                    name: 'Aufgabe 2',
                    occurrenceId: 'third',
                    blockPath: ['Mathematik', 'Zahlen'],
                  },
                ],
              }),
            ),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TaskSequenceComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(TestBed.inject(ApiService).getViewSequence).toHaveBeenCalledWith(
      'acp-1',
      'booklet-1',
      'booklet',
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    component.downloadSequence();
    expect(open).toHaveBeenCalledWith(
      '/api/acp/acp-1/files?sequenceId=booklet-1&format=zip&kind=booklet',
      '_blank',
    );
    open.mockRestore();
    component.toggleUnitList();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.unit-list-item',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(3);
    expect(buttons[1].textContent).toContain('Mathematik / Geometrie');
    expect(buttons[1].textContent).toContain('(B)');
    buttons[1].click();
    fixture.detectChanges();
    expect(component.currentUnit?.occurrenceId).toBe('second');
    expect(component.currentUnit?.id).toBe('u1');
    expect(fixture.nativeElement.querySelector('.nav-info').textContent).toContain(
      'Mathematik / Geometrie',
    );
    expect(component.canGoNext).toBe(true);
    const embeddedUnit = fixture.nativeElement.querySelector('.unit-review-stub') as HTMLElement;
    expect(embeddedUnit.dataset['unitId']).toBe('u1');
    expect(embeddedUnit.dataset['bookletId']).toBe('booklet-1');
    expect(embeddedUnit.dataset['reviewMode']).toBe('true');
    expect(component.showUnitListBtn).toBe(true);
    expect(fixture.nativeElement.querySelector('.seq-header')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Vollansicht');
    expect(fixture.nativeElement.textContent).toContain('Vollbild');

    const workspace = fixture.nativeElement.querySelector('.review-workspace') as HTMLElement;
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(workspace, 'requestFullscreen', { value: requestFullscreen });
    await component.toggleFullscreen();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    requestFullscreen.mockRejectedValueOnce(new Error('fullscreen blocked'));
    await component.toggleFullscreen();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.isFallbackFullscreen).toBe(true);
    expect(component.isFullscreen).toBe(true);
    expect(workspace.classList.contains('fullscreen-fallback')).toBe(true);
    await component.toggleFullscreen();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.isFullscreen).toBe(false);

    component.next();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.currentUnit?.id).toBe('u2');
    expect(component.canGoNext).toBe(false);
    expect(
      (fixture.nativeElement.querySelector('.unit-review-stub') as HTMLElement).dataset['unitId'],
    ).toBe('u2');

    component.prev();
    expect(component.currentUnit?.occurrenceId).toBe('second');
    component.prev();
    expect(component.currentUnit?.occurrenceId).toBe('first');
  });
});
