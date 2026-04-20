import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';
import { acpViewGuard } from './acp-view.guard';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { AccessService } from '../services/access.service';

describe('acpViewGuard', () => {
  let authMock: { isLoggedIn: boolean };
  let apiMock: { getAcpStartPage: ReturnType<typeof vi.fn> };
  let accessMock: { createAccessUrlTree: ReturnType<typeof vi.fn> };
  let injector: Injector;

  beforeEach(() => {
    authMock = { isLoggedIn: false };
    apiMock = { getAcpStartPage: vi.fn().mockReturnValue(of({ id: 'acp-1' })) };
    accessMock = {
      createAccessUrlTree: vi.fn((reason: string, options: any) => ({ reason, options })),
    };

    injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ApiService, useValue: apiMock },
        { provide: AccessService, useValue: accessMock },
      ],
    });
  });

  it('allows logged-in users immediately', async () => {
    authMock.isLoggedIn = true;

    const result = await firstValueFrom(
      runInInjectionContext(injector, () =>
        acpViewGuard(
          { paramMap: { get: () => 'acp-1' } } as any,
          { url: '/view/acp-1' } as any,
        ) as any,
      ),
    );

    expect(result).toBe(true);
    expect(apiMock.getAcpStartPage).not.toHaveBeenCalled();
  });

  it('checks ACP visibility for anonymous users', async () => {
    const result = await firstValueFrom(
      runInInjectionContext(injector, () =>
        acpViewGuard(
          { paramMap: { get: () => 'acp-1' } } as any,
          { url: '/view/acp-1' } as any,
        ) as any,
      ),
    );

    expect(apiMock.getAcpStartPage).toHaveBeenCalledWith('acp-1');
    expect(result).toBe(true);
  });

  it('redirects unauthorized anonymous users to login-required access page', async () => {
    apiMock.getAcpStartPage.mockReturnValue(throwError(() => ({ status: 403 })));

    const result = await firstValueFrom(
      runInInjectionContext(injector, () =>
        acpViewGuard(
          { paramMap: { get: () => 'acp-2' } } as any,
          { url: '/view/acp-2/units' } as any,
        ) as any,
      ),
    );

    expect(accessMock.createAccessUrlTree).toHaveBeenCalledWith('login_required', {
      context: 'view',
      acpId: 'acp-2',
      nextUrl: '/view/acp-2/units',
    });
    expect(result).toEqual({
      reason: 'login_required',
      options: { context: 'view', acpId: 'acp-2', nextUrl: '/view/acp-2/units' },
    });
  });
});
