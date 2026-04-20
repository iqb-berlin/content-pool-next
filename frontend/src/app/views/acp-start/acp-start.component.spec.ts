import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
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
  it('shows manager return breadcrumb and action for ACP managers', () => {
    const route = createRouteStub();
    const api = createApiStub();
    const auth = {
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
});
