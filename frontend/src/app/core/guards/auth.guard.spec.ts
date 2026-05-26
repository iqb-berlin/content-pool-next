import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BehaviorSubject, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { authGuard, adminGuard, acpManagerGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { AccessService } from '../services/access.service';
import { UserProfile } from '../models/api.models';

async function resolveGuardResult(result: unknown): Promise<unknown> {
  if (isObservable(result)) {
    return firstValueFrom(result as any);
  }
  return result;
}

function createUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    username: 'admin',
    isAppAdmin: true,
    acpRoles: [],
    ...overrides,
  };
}

describe('Auth Guards', () => {
  let currentUserSubject: BehaviorSubject<UserProfile | null>;
  let authMock: {
    isLoggedIn: boolean;
    isAdmin: boolean;
    currentUser: UserProfile | null;
    currentUser$: BehaviorSubject<UserProfile | null>;
    loadProfile: ReturnType<typeof vi.fn>;
  };
  let apiMock: {
    getAcp: ReturnType<typeof vi.fn>;
  };
  let accessMock: {
    createAccessUrlTree: ReturnType<typeof vi.fn>;
  };
  let injector: Injector;

  beforeEach(() => {
    currentUserSubject = new BehaviorSubject<UserProfile | null>(null);
    authMock = {
      isLoggedIn: false,
      isAdmin: false,
      currentUser: null,
      currentUser$: currentUserSubject,
      loadProfile: vi.fn(),
    };

    apiMock = {
      getAcp: vi.fn().mockReturnValue(of({ id: 'acp-1' })),
    };

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

  it('authGuard allows logged-in users', async () => {
    authMock.isLoggedIn = true;

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () => authGuard({} as any, { url: '/acps' } as any)),
    );

    expect(result).toBe(true);
    expect(accessMock.createAccessUrlTree).not.toHaveBeenCalled();
  });

  it('authGuard redirects anonymous users to access page', async () => {
    const result = await resolveGuardResult(
      runInInjectionContext(injector, () => authGuard({} as any, { url: '/acps' } as any)),
    );

    expect(accessMock.createAccessUrlTree).toHaveBeenCalledWith('login_required', {
      nextUrl: '/acps',
    });
    expect(result).toEqual({
      reason: 'login_required',
      options: { nextUrl: '/acps' },
    });
  });

  it('adminGuard redirects non-admin logged-in users with insufficient_rights', async () => {
    const user = createUser({ isAppAdmin: false });
    authMock.isLoggedIn = true;
    authMock.isAdmin = false;
    authMock.currentUser = user;
    currentUserSubject.next(user);

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () => adminGuard({} as any, { url: '/admin/users' } as any)),
    );

    expect(accessMock.createAccessUrlTree).toHaveBeenCalledWith('insufficient_rights', {
      context: 'admin',
      nextUrl: '/admin/users',
    });
    expect(result).toEqual({
      reason: 'insufficient_rights',
      options: { context: 'admin', nextUrl: '/admin/users' },
    });
  });

  it('adminGuard allows admins from the loaded profile', async () => {
    const user = createUser({ isAppAdmin: true });
    authMock.isLoggedIn = true;
    authMock.currentUser = user;
    currentUserSubject.next(user);

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () => adminGuard({} as any, { url: '/admin/users' } as any)),
    );

    expect(result).toBe(true);
    expect(accessMock.createAccessUrlTree).not.toHaveBeenCalled();
  });

  it('adminGuard waits for profile loading before deciding admin access', async () => {
    authMock.isLoggedIn = true;

    const guardResult = runInInjectionContext(injector, () =>
      adminGuard({} as any, { url: '/admin/application-tokens' } as any),
    );
    const resolved = resolveGuardResult(guardResult);
    currentUserSubject.next(createUser({ isAppAdmin: true }));

    expect(await resolved).toBe(true);
    expect(authMock.loadProfile).toHaveBeenCalledTimes(1);
    expect(accessMock.createAccessUrlTree).not.toHaveBeenCalled();
  });

  it('adminGuard redirects to login when profile loading invalidates the session', async () => {
    authMock.isLoggedIn = true;

    const guardResult = runInInjectionContext(injector, () =>
      adminGuard({} as any, { url: '/admin/application-tokens' } as any),
    );
    const resolved = resolveGuardResult(guardResult);
    authMock.isLoggedIn = false;
    currentUserSubject.next(null);

    expect(await resolved).toEqual({
      reason: 'login_required',
      options: { context: 'admin', nextUrl: '/admin/application-tokens' },
    });
    expect(accessMock.createAccessUrlTree).toHaveBeenCalledWith('login_required', {
      context: 'admin',
      nextUrl: '/admin/application-tokens',
    });
  });

  it('acpManagerGuard allows admins without ACP check', async () => {
    authMock.isLoggedIn = true;
    authMock.isAdmin = true;

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () =>
        acpManagerGuard(
          { paramMap: { get: () => 'acp-1' } } as any,
          { url: '/manage/acp-1' } as any,
        ),
      ),
    );

    expect(result).toBe(true);
    expect(apiMock.getAcp).not.toHaveBeenCalled();
  });

  it('acpManagerGuard validates ACP access for non-admin users', async () => {
    authMock.isLoggedIn = true;
    authMock.isAdmin = false;
    apiMock.getAcp.mockReturnValue(of({ id: 'acp-1' }));

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () =>
        acpManagerGuard(
          { paramMap: { get: () => 'acp-1' } } as any,
          { url: '/manage/acp-1' } as any,
        ),
      ),
    );

    expect(apiMock.getAcp).toHaveBeenCalledWith('acp-1');
    expect(result).toBe(true);
  });

  it('acpManagerGuard redirects forbidden manager access', async () => {
    authMock.isLoggedIn = true;
    authMock.isAdmin = false;
    apiMock.getAcp.mockReturnValue(throwError(() => ({ status: 403 })));

    const result = await resolveGuardResult(
      runInInjectionContext(injector, () =>
        acpManagerGuard(
          { paramMap: { get: () => 'acp-1' } } as any,
          { url: '/manage/acp-1' } as any,
        ),
      ),
    );

    expect(accessMock.createAccessUrlTree).toHaveBeenCalledWith('insufficient_rights', {
      context: 'manage',
      acpId: 'acp-1',
      nextUrl: '/manage/acp-1',
    });
    expect(result).toEqual({
      reason: 'insufficient_rights',
      options: { context: 'manage', acpId: 'acp-1', nextUrl: '/manage/acp-1' },
    });
  });
});
