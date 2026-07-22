import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { AppComponent } from './app';

describe('AppComponent', () => {
  it('logs out only after guarded navigation succeeds', async () => {
    const calls: string[] = [];
    const auth = {
      logout: vi.fn(() => calls.push('logout')),
    };
    const router = {
      navigate: vi.fn(async () => {
        calls.push('navigate');
        return true;
      }),
    };
    const component = new AppComponent(auth as any, router as any, {} as any);

    await component.logout();

    expect(calls).toEqual(['navigate', 'logout']);
  });

  it('keeps the session when guarded navigation is cancelled', async () => {
    const auth = { logout: vi.fn() };
    const router = { navigate: vi.fn().mockResolvedValue(false) };
    const component = new AppComponent(auth as any, router as any, {} as any);

    await component.logout();

    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('marks different frontend and backend build times as a version mismatch', () => {
    const auth = {
      initFromStorage: vi.fn(),
      restoreOidcSessionOnResume: vi.fn(),
    };
    const api = {
      getPublicSettings: vi.fn(() => of({ theme: {}, language: 'de' })),
      getBackendVersion: vi.fn(() =>
        of({ version: '0.2.0', commit: 'abc', builtAt: '2026-07-22T10:00:00Z' }),
      ),
      getFrontendVersion: vi.fn(() =>
        of({ version: '0.2.0', commit: 'abc', builtAt: '2026-07-22T10:00:01Z' }),
      ),
    };
    const component = new AppComponent(auth as any, {} as any, api as any);

    component.ngOnInit();

    expect(component.versionMismatch).toBe(true);
    expect(component.versionTitle).toContain('Versionskonflikt');
    component.ngOnDestroy();
  });
});
