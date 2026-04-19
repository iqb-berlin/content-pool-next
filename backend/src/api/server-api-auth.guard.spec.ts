import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServerApiAuthGuard } from './server-api-auth.guard';
import { SERVER_API_SCOPES_KEY } from './server-api-scopes.decorator';

describe('ServerApiAuthGuard', () => {
  let guard: ServerApiAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let authService: { validateToken: jest.Mock; hasScopes: jest.Mock };

  const createContext = (req: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => function handler() {},
      getClass: () => class TestClass {},
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    authService = {
      validateToken: jest.fn(),
      hasScopes: jest.fn(),
    };

    guard = new ServerApiAuthGuard(reflector as unknown as Reflector, authService as any);
  });

  it('rejects when token is missing', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('rejects when token is invalid', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    authService.validateToken.mockReturnValue(null);

    expect(() => guard.canActivate(createContext({ headers: { 'x-server-token': 'abc' } }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when required scopes are missing', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === SERVER_API_SCOPES_KEY ? ['files.write'] : [],
    );
    authService.validateToken.mockReturnValue({ id: 'client-1', scopes: ['files.read'] });
    authService.hasScopes.mockReturnValue(false);

    expect(() =>
      guard.canActivate(createContext({ headers: { authorization: 'Bearer token-1' } })),
    ).toThrow(ForbiddenException);
  });

  it('accepts x-server-token and enriches request with client identity', () => {
    const req: any = {
      headers: { 'x-server-token': '  token-a  ' },
    };

    reflector.getAllAndOverride.mockReturnValue(['acp.read']);
    authService.validateToken.mockReturnValue({ id: 'client-a', scopes: ['acp.read'] });
    authService.hasScopes.mockReturnValue(true);

    expect(guard.canActivate(createContext(req))).toBe(true);
    expect(authService.validateToken).toHaveBeenCalledWith('token-a');
    expect(req.serverApiClient).toEqual({
      id: 'client-a',
      scopes: ['acp.read'],
    });
  });

  it('accepts x-integration-token as fallback header', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    authService.validateToken.mockReturnValue({ id: 'client-b', scopes: [] });
    authService.hasScopes.mockReturnValue(true);

    const req: any = { headers: { 'x-integration-token': 'integration-token' } };
    expect(guard.canActivate(createContext(req))).toBe(true);
    expect(authService.validateToken).toHaveBeenCalledWith('integration-token');
  });
});
