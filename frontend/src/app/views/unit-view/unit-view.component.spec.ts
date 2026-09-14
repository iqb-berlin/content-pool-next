import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/services/api.service';
import { UnitViewData } from '../../core/models/api.models';
import { UnitViewComponent } from './unit-view.component';

vi.mock('../comment-thread/item-comment-thread.component', async () => {
  const { Component } = await import('@angular/core');
  class ItemCommentThreadStub {
    acpId = '';
    targetType = '';
    unitId = '';
    enabled = false;
  }
  Component({
    selector: 'app-item-comment-thread',
    standalone: true,
    template:
      '<div class="comment-thread-stub" [attr.data-target-type]="targetType" [attr.data-unit-id]="unitId"></div>',
    inputs: ['acpId', 'targetType', 'unitId', 'enabled'],
  })(ItemCommentThreadStub);
  return { ItemCommentThreadComponent: ItemCommentThreadStub };
});

describe('UnitViewComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('renders changing booklet units inline with review metadata, coding and comments', async () => {
    const units: Record<string, UnitViewData> = {
      u1: {
        id: 'u1',
        name: 'Aufgabe 1',
        items: [{ id: 'item-1', name: 'Item 1' }],
        dependencies: [
          {
            type: 'CODING_SCHEME',
            fileId: 'coding-u1',
            originalName: 'u1.vocs',
            downloadUrl: '/coding-u1',
          },
        ],
      },
      u2: {
        id: 'u2',
        name: 'Aufgabe 2',
        items: [],
        dependencies: [],
        codingScheme: {
          variableCodings: [
            { id: 'VAR_2', label: 'Variable 2', sourceType: 'BASE', deriveSources: [] },
          ],
        },
      },
    };
    const unitResponses: Record<string, Subject<UnitViewData>> = {
      u1: new Subject<UnitViewData>(),
      u2: new Subject<UnitViewData>(),
    };
    const api = {
      appendAuthToken: vi.fn((url: string) => url),
      getAcpStartPage: vi.fn().mockReturnValue(of({ featureConfig: {} })),
      getViewUnit: vi.fn((_acpId: string, unitId: string) => unitResponses[unitId]),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          variableCodings: [
            { id: 'VAR_1', label: 'Variable 1', sourceType: 'BASE', deriveSources: [] },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await TestBed.configureTestingModule({
      imports: [UnitViewComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => '' },
            },
          },
        },
        { provide: ApiService, useValue: api },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UnitViewComponent);
    fixture.componentRef.setInput('acpId', 'acp-1');
    fixture.componentRef.setInput('unitId', 'u1');
    fixture.componentRef.setInput('embedded', true);
    fixture.componentRef.setInput('reviewMode', true);
    fixture.componentRef.setInput('featureConfigOverride', {
      enableCommenting: true,
      commentTargets: ['UNIT'],
      showMetadata: false,
      showCodingScheme: false,
    });
    fixture.detectChanges();
    unitResponses['u1'].next(units['u1']);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.codingSchemeAsText).toHaveLength(1));
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(api.getAcpStartPage).not.toHaveBeenCalled();
    expect(api.getViewUnit).toHaveBeenCalledWith('acp-1', 'u1');
    expect(fixture.nativeElement.querySelector('app-breadcrumb')).toBeNull();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Aufgabe 1');
    expect(component.showMetadata).toBe(true);
    expect(component.showCodingScheme).toBe(true);
    expect(component.showCommentBtn).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/coding-u1', {
      signal: expect.any(AbortSignal),
    });
    expect(
      (fixture.nativeElement.querySelector('.comment-thread-stub') as HTMLElement).dataset[
        'unitId'
      ],
    ).toBe('u1');

    component.togglePanel();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('.panel-tabs .tab') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(tabs).toEqual(['Metadaten', 'Kodierschema']);
    (fixture.nativeElement.querySelectorAll('.panel-tabs .tab')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.coding-variable').textContent).toContain(
      'Variable 1',
    );

    fixture.componentRef.setInput('unitId', 'u2');
    fixture.detectChanges();
    unitResponses['u2'].next(units['u2']);
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.codingSchemeAsText?.[0]?.label).toBe('Variable 2'),
    );
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(api.getViewUnit).toHaveBeenLastCalledWith('acp-1', 'u2');
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Aufgabe 2');
    expect(
      (fixture.nativeElement.querySelector('.comment-thread-stub') as HTMLElement).dataset[
        'unitId'
      ],
    ).toBe('u2');
  });
});
