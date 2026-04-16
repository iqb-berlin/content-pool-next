import { ConfigService } from '@nestjs/config';
import { ServerApiAuthService } from './server-api-auth.service';

describe('ServerApiAuthService', () => {
  it('parses clients from SERVER_API_TOKENS JSON and validates token', () => {
    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === 'SERVER_API_TOKENS') {
          return JSON.stringify([
            {
              id: 'studio',
              token: 'token-studio',
              scopes: ['transfer.read', 'files.read'],
            },
          ]);
        }

        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new ServerApiAuthService(config);
    const client = service.validateToken('token-studio');

    expect(client).toEqual({
      id: 'studio',
      scopes: ['transfer.read', 'files.read'],
    });
    expect(service.hasScopes(client?.scopes || [], ['files.read'])).toBe(true);
    expect(service.hasScopes(client?.scopes || [], ['files.write'])).toBe(false);
  });

  it('falls back to SERVER_API_KEY with full scopes', () => {
    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === 'SERVER_API_TOKENS') {
          return '';
        }
        if (key === 'SERVER_API_KEY') {
          return 'legacy-token';
        }
        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new ServerApiAuthService(config);
    const client = service.validateToken('legacy-token');

    expect(client?.id).toBe('legacy');
    expect(client?.scopes.length).toBeGreaterThan(0);
    expect(service.validateToken('wrong')).toBeNull();
  });
});
