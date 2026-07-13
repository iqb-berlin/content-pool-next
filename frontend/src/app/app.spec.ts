import { describe, expect, it, vi } from 'vitest';
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
});
