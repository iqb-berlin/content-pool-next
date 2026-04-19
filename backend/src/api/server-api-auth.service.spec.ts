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

  it('ignores malformed JSON token config and still allows legacy fallback', () => {
    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === 'SERVER_API_TOKENS') {
          return '{broken-json';
        }
        if (key === 'SERVER_API_KEY') {
          return 'legacy-fallback-token';
        }
        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new ServerApiAuthService(config);

    expect(service.validateToken('legacy-fallback-token')).toEqual(
      expect.objectContaining({ id: 'legacy' }),
    );
  });

  it('filters invalid token entries, deduplicates scopes and applies defaults', () => {
    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === 'SERVER_API_TOKENS') {
          return JSON.stringify([
            null,
            { id: '', token: 'missing-id' },
            { id: 'missing-token', token: '' },
            { id: 'default-scope', token: 'token-a', scopes: [] },
            { id: 'custom-scope', token: 'token-b', scopes: ['files.read', 'files.read', '  files.write  '] },
          ]);
        }
        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new ServerApiAuthService(config);

    expect(service.validateToken('token-a')).toEqual(
      expect.objectContaining({
        id: 'default-scope',
        scopes: expect.arrayContaining(['acp.read', 'transfer.read', 'audit.read']),
      }),
    );
    expect(service.validateToken('token-b')).toEqual({
      id: 'custom-scope',
      scopes: ['files.read', 'files.write'],
    });
    expect(service.hasScopes(['x'], [])).toBe(true);
  });
});
