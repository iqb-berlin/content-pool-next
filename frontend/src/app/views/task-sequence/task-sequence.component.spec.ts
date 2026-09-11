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
            getAcpStartPage: vi.fn().mockReturnValue(of({ featureConfig: {} })),
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
    expect(buttons.length).toBe(2);
    expect(buttons[1].textContent).toContain('Mathematik / Geometrie');
    expect(buttons[1].textContent).toContain('(B)');
    buttons[1].click();
    fixture.detectChanges();
    expect(component.currentUnit?.occurrenceId).toBe('second');
    expect(component.currentUnit?.id).toBe('u1');
    expect(fixture.nativeElement.querySelector('.nav-info').textContent).toContain(
      'Mathematik / Geometrie',
    );
    expect(component.canGoNext).toBe(false);
    component.prev();
    expect(component.currentUnit?.occurrenceId).toBe('first');
  });
});
