import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { AccessService } from '../services/access.service';

describe('authInterceptor', () => {
  let token: string | null;
  let authMock: {
    getToken: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
  };
  let accessMock: {
    redirectToAccess: ReturnType<typeof vi.fn>;
  };
  let injector: Injector;

  beforeEach(() => {
    token = 'token-1';
    authMock = {
      getToken: vi.fn(() => token),
      clearSession: vi.fn(() => {
        token = null;
      }),
    };
    accessMock = {
      redirectToAccess: vi.fn().mockResolvedValue(true),
    };

    injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: AccessService, useValue: accessMock },
      ],
    });
  });

  it('adds bearer token header when token exists', async () => {
    const req = new HttpRequest('GET', '/api/view/acp/acp-1');
    const next = vi.fn((forwardedReq: HttpRequest<unknown>) => {
      expect(forwardedReq.headers.get('Authorization')).toBe('Bearer token-1');
      return of(new HttpResponse({ status: 200, body: {} }));
    });

    await firstValueFrom(runInInjectionContext(injector, () => authInterceptor(req, next as any)));

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('redirects to session_expired on 401 for protected requests', async () => {
    const req = new HttpRequest('GET', '/api/view/acp/acp-1');
    const next = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));

    await expect(
      firstValueFrom(runInInjectionContext(injector, () => authInterceptor(req, next as any))),
    ).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(authMock.clearSession).toHaveBeenCalledTimes(1);
    expect(accessMock.redirectToAccess).toHaveBeenCalledWith(
      'session_expired',
      expect.objectContaining({
        replaceUrl: true,
      }),
    );
  });

  it('does not redirect for inline login errors', async () => {
    const req = new HttpRequest('POST', '/api/auth/login');
    const next = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));

    await expect(
      firstValueFrom(runInInjectionContext(injector, () => authInterceptor(req, next as any))),
    ).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(authMock.clearSession).not.toHaveBeenCalled();
    expect(accessMock.redirectToAccess).not.toHaveBeenCalled();
  });

  it('maps feature-disabled 403 errors to feature_disabled access reason', async () => {
    const req = new HttpRequest('GET', '/api/view/acp/acp-1/units/u1');
    const next = vi.fn(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { message: 'Unit view is not enabled for this ACP' },
          }),
      ),
    );

    await expect(
      firstValueFrom(runInInjectionContext(injector, () => authInterceptor(req, next as any))),
    ).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(accessMock.redirectToAccess).toHaveBeenCalledWith(
      'feature_disabled',
      expect.objectContaining({
        replaceUrl: true,
      }),
    );
  });
});
