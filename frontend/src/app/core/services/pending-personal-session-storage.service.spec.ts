import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingPersonalSessionStorageService } from './pending-personal-session-storage.service';

function createJwt(sub: string, type = 'user', acpId = ''): string {
  const payload = btoa(
    JSON.stringify({
      sub,
      type,
      acpId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

describe('PendingPersonalSessionStorageService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses its in-memory copy when session storage is unavailable', () => {
    sessionStorage.setItem('pending', '{"value":"old"}');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    const service = new PendingPersonalSessionStorageService();

    service.set('pending', '{"value":1}');

    expect(service.get('pending')).toBe('{"value":1}');
    service.remove('pending');
    expect(service.get('pending')).toBeNull();
  });

  it('removes snapshots owned by another activated identity', () => {
    const service = new PendingPersonalSessionStorageService();
    const userAIdentity = service.resolveIdentityFromToken(createJwt('user-a'));
    const userBToken = createJwt('user-b');
    const userBIdentity = service.resolveIdentityFromToken(userBToken);
    const userAKey = 'cp_item_explorer_pending_personal:acp-a';
    const userBKey = 'cp_item_explorer_pending_personal:acp-b';
    service.set(userAKey, JSON.stringify({ identity: userAIdentity, updates: [] }));
    service.set(userBKey, JSON.stringify({ identity: userBIdentity, updates: [] }));

    service.activateIdentityFromToken(userBToken);

    expect(service.get(userAKey)).toBeNull();
    expect(service.get(userBKey)).not.toBeNull();
  });

  it('keeps a local-user snapshot when the same user activates an OIDC session', () => {
    const service = new PendingPersonalSessionStorageService();
    const localUserToken = createJwt('user-a', 'user');
    const oidcUserToken = createJwt('user-a', 'oidc');
    const snapshotKey = 'cp_item_explorer_pending_personal:acp-a';
    service.set(
      snapshotKey,
      JSON.stringify({
        identity: service.resolveIdentityFromToken(localUserToken),
        updates: [],
      }),
    );

    service.activateIdentityFromToken(oidcUserToken);

    expect(service.get(snapshotKey)).not.toBeNull();
    expect(service.resolveIdentityFromToken(localUserToken)).toBe(
      service.resolveIdentityFromToken(oidcUserToken),
    );
  });

  it('removes a local-user snapshot when a different OIDC user activates', () => {
    const service = new PendingPersonalSessionStorageService();
    const localUserToken = createJwt('user-a', 'user');
    const oidcUserToken = createJwt('user-b', 'oidc');
    const snapshotKey = 'cp_item_explorer_pending_personal:acp-a';
    service.set(
      snapshotKey,
      JSON.stringify({
        identity: service.resolveIdentityFromToken(localUserToken),
        updates: [],
      }),
    );

    service.activateIdentityFromToken(oidcUserToken);

    expect(service.get(snapshotKey)).toBeNull();
  });

  it('keeps credential identities separated by ACP', () => {
    const service = new PendingPersonalSessionStorageService();

    expect(
      service.resolveIdentityFromToken(createJwt('credential-1', 'credential', 'acp-a')),
    ).not.toBe(service.resolveIdentityFromToken(createJwt('credential-1', 'credential', 'acp-b')));
  });
});
