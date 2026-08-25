import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
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

describe('AcpStartComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows manager return breadcrumb and action for ACP managers', () => {
    const route = createRouteStub();
    const api = createApiStub();
    const auth = {
      isLoggedIn: false,
      hasAcpRole: vi.fn().mockReturnValue(true),
    };

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
    const auth = {
      isLoggedIn: false,
      hasAcpRole: vi.fn().mockReturnValue(false),
    };

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
    const auth = {
      isLoggedIn: false,
      hasAcpRole: vi.fn().mockReturnValue(false),
    };

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
    const auth = {
      isLoggedIn: true,
      hasAcpRole: vi.fn().mockReturnValue(false),
    };

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
      exportCommentsXlsx: vi.fn(),
    };
    const auth = {
      isLoggedIn: true,
      hasAcpRole: vi.fn().mockReturnValue(false),
    };

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
    const exportButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Kommentare exportieren (XLSX)'),
    );

    expect(element.textContent).toContain(
      'Item-Kommentare werden direkt beim ausgewählten Item im Item-Explorer erfasst.',
    );
    expect(itemCommentLink?.getAttribute('href')).toBe('/view/acp-1/item-explorer');
    expect(exportButton).toBeDefined();
    expect(element.textContent).not.toContain('Kommentar hinzufügen');
    expect(element.querySelector('app-comment-dialog')).toBeNull();
  });
});
