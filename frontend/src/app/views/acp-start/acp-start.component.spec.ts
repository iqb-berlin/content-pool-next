import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AcpStartComponent } from './acp-start.component';

function createRouteStub(acpId = 'acp-1') {
  return {
    snapshot: {
      paramMap: {
        get: vi.fn().mockReturnValue(acpId),
      },
    },
  };
}

function createApiStub() {
  return {
    getAcpStartPage: vi.fn().mockReturnValue(
      of({
        name: 'ACP 1',
        featureConfig: {},
        units: [],
        sequences: [],
      }),
    ),
    getMyComments: vi.fn().mockReturnValue(of([])),
  };
}

function createAuthStub(overrides: Record<string, unknown> = {}) {
  return {
    isLoggedIn: false,
    isAdmin: false,
    currentUser$: of(null),
    hasAcpRole: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

describe('AcpStartComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows manager return breadcrumb and action for ACP managers', () => {
    const route = createRouteStub();
    const api = createApiStub();
    const auth = createAuthStub({ hasAcpRole: vi.fn().mockReturnValue(true) });

    const component = new AcpStartComponent(route as any, api as any, auth as any);
    component.ngOnInit();

    expect(component.canManageAcp).toBe(true);
    expect(component.breadcrumbs).toEqual([
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'Verwaltung', route: ['/manage', 'acp-1'] },
      { label: 'ACP 1' },
    ]);
  });

  it('keeps public breadcrumbs for non-managers', () => {
    const route = createRouteStub();
    const api = createApiStub();
    const auth = createAuthStub();

    const component = new AcpStartComponent(route as any, api as any, auth as any);
    component.ngOnInit();

    expect(component.canManageAcp).toBe(false);
    expect(component.breadcrumbs).toEqual([
      { label: 'Assessment Content Pool', route: ['/'] },
      { label: 'ACP 1' },
    ]);
  });

  it('does not load my comments for anonymous users even when commenting is enabled', () => {
    const route = createRouteStub();
    const api = {
      ...createApiStub(),
      getAcpStartPage: vi.fn().mockReturnValue(
        of({
          name: 'ACP 1',
          featureConfig: { enableCommenting: true },
          units: [],
          sequences: [],
        }),
      ),
    };
    const auth = createAuthStub();

    const component = new AcpStartComponent(route as any, api as any, auth as any);
    component.ngOnInit();

    expect(api.getMyComments).not.toHaveBeenCalled();
  });

  it('loads my comments for logged-in users when commenting is enabled', () => {
    const route = createRouteStub();
    const api = {
      ...createApiStub(),
      getAcpStartPage: vi.fn().mockReturnValue(
        of({
          name: 'ACP 1',
          featureConfig: { enableCommenting: true },
          units: [],
          sequences: [],
        }),
      ),
    };
    const auth = createAuthStub({ isLoggedIn: true });

    const component = new AcpStartComponent(route as any, api as any, auth as any);
    component.ngOnInit();

    expect(api.getMyComments).toHaveBeenCalledWith('acp-1');
  });

  it('links item comments to the Item Explorer without rendering the generic dialog', async () => {
    const route = createRouteStub();
    const api = {
      ...createApiStub(),
      getAcpStartPage: vi.fn().mockReturnValue(
        of({
          name: 'ACP 1',
          featureConfig: { enableCommenting: true, commentTargets: ['ITEM'] },
          units: [],
          sequences: [],
        }),
      ),
      exportMyReviewCommentsCsv: vi.fn(),
      exportMyReviewCommentsXlsx: vi.fn(),
      exportAllReviewCommentsXlsx: vi.fn(),
      getMyComments: vi.fn().mockReturnValue(
        of([
          {
            id: 'comment-1',
            targetType: 'ITEM',
            unitId: 'unit-1',
            itemId: 'item-1',
            commentText: 'Prüfen',
          },
        ]),
      ),
    };
    const auth = createAuthStub({ isLoggedIn: true });

    await TestBed.configureTestingModule({
      imports: [AcpStartComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AcpStartComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const itemCommentLink = Array.from(element.querySelectorAll('a')).find((link) =>
      link.textContent?.includes('Item-Kommentare im Item-Explorer'),
    );
    const exportButtons = Array.from(element.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Meine Kommentare'),
    );

    expect(element.textContent).toContain(
      'Item-Kommentare werden direkt beim ausgewählten Item im Item-Explorer erfasst.',
    );
    expect(itemCommentLink?.getAttribute('href')).toBe('/view/acp-1/item-explorer');
    expect(exportButtons).toHaveLength(2);
    expect(element.textContent).toContain('1 von 1 eigenen Kommentaren');
    const deepLink = Array.from(element.querySelectorAll('a')).find((link) =>
      link.textContent?.includes('Öffnen'),
    );
    expect(deepLink?.getAttribute('href')).toBe(
      '/view/acp-1/item-explorer?unitId=unit-1&itemId=item-1&comments=open',
    );
    expect(element.textContent).not.toContain('Kommentar hinzufügen');
    expect(element.querySelector('app-comment-dialog')).toBeNull();
  });

  it('reveals the manager export after a delayed profile load', () => {
    const route = createRouteStub();
    const api = createApiStub();
    const currentUser$ = new BehaviorSubject<any>(null);
    let managerProfileLoaded = false;
    const auth = createAuthStub({
      isLoggedIn: true,
      currentUser$,
      hasAcpRole: vi.fn(() => managerProfileLoaded),
    });
    const component = new AcpStartComponent(route as any, api as any, auth as any);

    component.ngOnInit();
    expect(component.canExportAllComments).toBe(false);

    managerProfileLoaded = true;
    currentUser$.next({ acpRoles: [{ acpId: 'acp-1', role: 'ACP_MANAGER' }] });

    expect(component.canExportAllComments).toBe(true);
    expect(component.breadcrumbs).toContainEqual({
      label: 'Verwaltung',
      route: ['/manage', 'acp-1'],
    });
    component.ngOnDestroy();
  });
});
