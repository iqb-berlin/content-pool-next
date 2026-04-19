import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OidcAuthGuard } from './oidc-auth.guard';

describe('OidcAuthGuard', () => {
  let guard: OidcAuthGuard;

  const createContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new OidcAuthGuard();
  });

  it('returns false when JWT validation fails', async () => {
    const spy = jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(false);

    await expect(guard.canActivate(createContext({ authType: 'oidc' }))).resolves.toBe(false);

    spy.mockRestore();
  });

  it('throws when authenticated user is not OIDC-based', async () => {
    const spy = jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);

    await expect(
      guard.canActivate(createContext({ authType: 'credential' })),
    ).rejects.toThrow(ForbiddenException);

    spy.mockRestore();
  });

  it('allows OIDC-authenticated users', async () => {
    const spy = jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);

    await expect(guard.canActivate(createContext({ authType: 'oidc' }))).resolves.toBe(true);

    spy.mockRestore();
  });
});
