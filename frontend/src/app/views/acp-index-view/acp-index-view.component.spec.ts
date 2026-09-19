import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AcpIndexViewComponent } from './acp-index-view.component';

const manager = { acpRoles: [{ acpId: 'acp-1', role: 'ACP_MANAGER' }] };

function setup(allowFileDownload = false) {
  const currentUser$ = new BehaviorSubject<any>(null);
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: { currentUser$ } }],
  });
  const api = {
    getViewIndex: vi.fn(() => of({ definitionId: 'booklet.xml' })),
    getAcpStartPage: vi.fn(() => of({ featureConfig: { allowFileDownload } })),
    getFiles: vi.fn(() => of([{ id: 'file-1', originalName: 'booklet.xml' }])),
  };
  const component = TestBed.runInInjectionContext(
    () =>
      new AcpIndexViewComponent(
        { snapshot: { paramMap: { get: () => 'acp-1' } } } as any,
        api as any,
      ),
  );
  component.ngOnInit();
  return { component, api, currentUser$ };
}

afterEach(() => TestBed.resetTestingModule());

it.each([manager, { isAppAdmin: true }])(
  'loads file actions when a privileged profile arrives late: %j',
  (profile) => {
    const { component, api, currentUser$ } = setup();
    expect(component.loading).toBe(false);
    expect(component.rootNodes[0].actions).toEqual([]);
    expect(api.getFiles).not.toHaveBeenCalled();
    currentUser$.next(profile);
    expect(api.getFiles).toHaveBeenCalledWith('acp-1');
    expect(component.rootNodes[0].actions.some((action) => action.kind === 'file-view')).toBe(true);
  },
);

it('does not request disabled file listings for readers or managers of another ACP', () => {
  const { api, currentUser$ } = setup();
  currentUser$.next({ acpRoles: [{ acpId: 'acp-1', role: 'READ_ONLY' }] });
  currentUser$.next({ acpRoles: [{ acpId: 'other', role: 'ACP_MANAGER' }] });
  expect(api.getFiles).not.toHaveBeenCalled();
});

it('loads public downloads immediately without reloading for profile refreshes', () => {
  const { api, currentUser$ } = setup(true);
  expect(api.getFiles).toHaveBeenCalledTimes(1);
  currentUser$.next(manager);
  currentUser$.next({ ...manager });
  expect(api.getFiles).toHaveBeenCalledTimes(1);
});

it('removes file actions when manager access is lost', () => {
  const { component, currentUser$ } = setup();
  currentUser$.next(manager);
  expect(component.rootNodes[0].actions).toHaveLength(1);
  currentUser$.next(null);
  expect(component.rootNodes[0].actions).toEqual([]);
});

it('keeps the index available when the optional file request fails', () => {
  const { component, api, currentUser$ } = setup();
  api.getFiles.mockImplementation(() => throwError(() => new Error('unavailable')));
  currentUser$.next(manager);
  expect(component.loading).toBe(false);
  expect(component.error).toBe('');
  expect(component.rootNodes[0].actions).toEqual([]);
});

it('stops reacting to profiles when destroyed', () => {
  const { api, currentUser$ } = setup();
  TestBed.resetTestingModule();
  currentUser$.next(manager);
  expect(api.getFiles).not.toHaveBeenCalled();
});
