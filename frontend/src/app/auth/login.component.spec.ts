import { convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function createComponent() {
    const queryParamMap = new Subject<ReturnType<typeof convertToParamMap>>();
    const auth = {
      initiateOidcLogin: vi.fn().mockResolvedValue(undefined),
    };
    const component = new LoginComponent(auth as any, { queryParamMap } as any);
    component.ngOnInit();
    return { component, auth, queryParamMap };
  }

  it('starts Keycloak automatically and preserves a safe target', async () => {
    const { auth, queryParamMap } = createComponent();

    queryParamMap.next(convertToParamMap({ next: '/admin/users' }));

    await vi.waitFor(() => {
      expect(auth.initiateOidcLogin).toHaveBeenCalledWith('/admin/users');
    });
  });

  it('drops external redirect targets', async () => {
    const { auth, queryParamMap } = createComponent();

    queryParamMap.next(convertToParamMap({ next: '//evil.example/path' }));

    await vi.waitFor(() => {
      expect(auth.initiateOidcLogin).toHaveBeenCalledWith(undefined);
    });
  });

  it('shows callback errors without starting another redirect', () => {
    const { component, auth, queryParamMap } = createComponent();

    queryParamMap.next(convertToParamMap({ error: 'Anmeldung abgebrochen' }));

    expect(component.error).toBe('Anmeldung abgebrochen');
    expect(auth.initiateOidcLogin).not.toHaveBeenCalled();
  });

  it('preserves the stored target when retrying after a callback error', async () => {
    const { component, auth, queryParamMap } = createComponent();
    sessionStorage.setItem('oidc_redirect_url', '/admin/users');

    queryParamMap.next(convertToParamMap({ error: 'Anmeldung abgebrochen' }));
    await component.startLogin();

    expect(auth.initiateOidcLogin).toHaveBeenCalledWith('/admin/users');
  });

  it('shows startup errors and retries on demand', async () => {
    const { component, auth, queryParamMap } = createComponent();
    auth.initiateOidcLogin
      .mockRejectedValueOnce(new Error('Keycloak ist nicht verfügbar'))
      .mockResolvedValueOnce(undefined);

    queryParamMap.next(convertToParamMap({}));
    await vi.waitFor(() => expect(component.error).toBe('Keycloak ist nicht verfügbar'));

    await component.startLogin();

    expect(auth.initiateOidcLogin).toHaveBeenCalledTimes(2);
    expect(component.error).toBe('');
  });
});
