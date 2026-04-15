import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, map, switchMap, tap, throwError } from 'rxjs';
import { LoginResponse, CredentialLoginResponse, UserProfile, OidcConfig, AuthContext } from '../models/api.models';

interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = '/api/auth';
  private readonly tokenKey = 'cp_token';
  private readonly OIDC_REDIRECT_KEY = 'oidc_redirect_url';
  private readonly OIDC_STATE_KEY = 'oidc_state';
  private readonly OIDC_CODE_VERIFIER_KEY = 'oidc_code_verifier';
  private readonly ID_TOKEN_KEY = 'cp_oidc_id_token';
  private readonly ACCESS_TOKEN_KEY = 'cp_oidc_access_token';
  private readonly AUTH_TYPE_KEY = 'cp_auth_type';
  private logoutChannel: BroadcastChannel | null = null;
  private currentUserSubject = new BehaviorSubject<UserProfile | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initBroadcastChannel();
    if (this.getToken()) {
      this.loadProfile();
    }
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.logoutChannel = new BroadcastChannel('cp_logout');
      this.logoutChannel.onmessage = () => this.performLogout(false);
    }
  }

  get isLoggedIn(): boolean {
    return !!this.getToken();
  }

  get isAdmin(): boolean {
    return this.currentUserSubject.value?.isAppAdmin ?? false;
  }

  get isOidcUser(): boolean {
    return localStorage.getItem(this.AUTH_TYPE_KEY) === 'oidc';
  }

  get currentUser(): UserProfile | null {
    return this.currentUserSubject.value;
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getOidcConfig(): Observable<OidcConfig> {
    return this.http.get<OidcConfig>(`${this.API}/oidc-config`);
  }

  getAuthContext(type: 'admin' | 'acp' | null = null): Observable<AuthContext> {
    const params = type ? `?type=${type}` : '';
    return this.http.get<AuthContext>(`${this.API}/context${params}`);
  }

  initiateOidcLogin(redirectUrl?: string): void {
    if (redirectUrl) {
      sessionStorage.setItem(this.OIDC_REDIRECT_KEY, redirectUrl);
    }

    this.getOidcConfig().subscribe({
      next: async (config) => {
        if (!config.enabled || !config.issuerUrl || !config.clientId) {
          return;
        }

        try {
          await this.redirectToOidcAuthorization(config);
        } catch {
          // noop - callback page will show a user-visible error if flow fails
        }
      },
      error: () => {},
    });
  }

  handleOidcAuthorizationCode(code: string, state: string | null): Observable<LoginResponse> {
    const expectedState = sessionStorage.getItem(this.OIDC_STATE_KEY);
    const codeVerifier = sessionStorage.getItem(this.OIDC_CODE_VERIFIER_KEY);

    if (!state || !expectedState || state !== expectedState) {
      return throwError(() => new Error('Ungültiger OIDC-State'));
    }

    if (!codeVerifier) {
      return throwError(() => new Error('PKCE-Verifier fehlt'));
    }

    sessionStorage.removeItem(this.OIDC_STATE_KEY);
    sessionStorage.removeItem(this.OIDC_CODE_VERIFIER_KEY);

    return this.getOidcConfig().pipe(
      switchMap((config) => {
        if (!config.enabled || !config.issuerUrl || !config.clientId) {
          return throwError(() => new Error('OIDC ist nicht konfiguriert'));
        }

        const tokenUrl = `${config.issuerUrl}/protocol/openid-connect/token`;
        const body = new URLSearchParams();
        body.set('grant_type', 'authorization_code');
        body.set('code', code);
        body.set('redirect_uri', config.redirectUri);
        body.set('client_id', config.clientId);
        body.set('code_verifier', codeVerifier);

        const headers = new HttpHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        });

        return this.http.post<OidcTokenResponse>(tokenUrl, body.toString(), { headers });
      }),
      switchMap((tokenResponse) => {
        const idToken = tokenResponse.id_token;
        const accessToken = tokenResponse.access_token;
        const tokenForBackend = idToken || accessToken;

        if (!tokenForBackend) {
          return throwError(() => new Error('Kein Token aus OIDC-Antwort erhalten'));
        }

        return this.handleOidcCallback(tokenForBackend, accessToken, idToken);
      }),
    );
  }

  handleOidcCallback(idToken: string, accessToken?: string, originalIdToken?: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/oidc-callback`, { idToken }).pipe(
      tap((res) => {
        localStorage.setItem(this.tokenKey, res.accessToken);
        if (accessToken) {
          localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
        }
        localStorage.setItem(this.ID_TOKEN_KEY, originalIdToken || idToken);
        localStorage.setItem(this.AUTH_TYPE_KEY, 'oidc');
        this.loadProfile();
      }),
    );
  }

  changePassword(): void {
    const authType = localStorage.getItem(this.AUTH_TYPE_KEY);
    if (authType !== 'oidc') {
      return;
    }

    this.getOidcConfig().subscribe({
      next: async (config) => {
        if (!config.enabled || !config.issuerUrl || !config.clientId) {
          return;
        }

        sessionStorage.setItem(this.OIDC_REDIRECT_KEY, window.location.pathname + window.location.search);

        try {
          await this.redirectToOidcAuthorization(config, {
            kc_action: 'UPDATE_PASSWORD',
          });
        } catch {
          // noop
        }
      },
      error: () => {},
    });
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.tokenKey, res.accessToken);
        this.loadProfile();
      }),
    );
  }

  credentialLogin(acpId: string, username: string, password: string): Observable<CredentialLoginResponse> {
    return this.http.post<CredentialLoginResponse>(`${this.API}/credential-login`, { acpId, username, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.tokenKey, res.accessToken);
      }),
    );
  }

  logout(broadcast = true): void {
    const idToken = localStorage.getItem(this.ID_TOKEN_KEY);
    const authType = localStorage.getItem(this.AUTH_TYPE_KEY);
    const wasOidc = authType === 'oidc';

    this.http.post(`${this.API}/logout`, {}).subscribe({
      error: () => {},
    });

    if (wasOidc) {
      this.redirectToKeycloakLogout(idToken);
    }

    this.performLogout(broadcast);
  }

  private redirectToKeycloakLogout(idToken: string | null): void {
    this.getOidcConfig().subscribe((config) => {
      if (!config.enabled || !config.issuerUrl || !config.clientId) return;

      const logoutUrl = new URL(`${config.issuerUrl}/protocol/openid-connect/logout`);
      logoutUrl.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/login`);
      logoutUrl.searchParams.set('client_id', config.clientId);
      if (idToken) {
        logoutUrl.searchParams.set('id_token_hint', idToken);
      }

      window.location.href = logoutUrl.toString();
    });
  }

  private performLogout(broadcast = true): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.ID_TOKEN_KEY);
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.AUTH_TYPE_KEY);
    sessionStorage.removeItem(this.OIDC_REDIRECT_KEY);
    sessionStorage.removeItem(this.OIDC_STATE_KEY);
    sessionStorage.removeItem(this.OIDC_CODE_VERIFIER_KEY);
    this.currentUserSubject.next(null);

    if (broadcast && this.logoutChannel) {
      this.logoutChannel.postMessage('logout');
    }
  }

  loadProfile(): void {
    const authType = localStorage.getItem(this.AUTH_TYPE_KEY);
    const idToken = localStorage.getItem(this.ID_TOKEN_KEY);

    if (authType === 'oidc' && idToken) {
      this.syncOidcRoles(idToken).subscribe({
        next: (profile) => this.currentUserSubject.next(profile),
        error: () => this.logout(),
      });
    } else {
      this.http.get<UserProfile>(`${this.API}/profile`).subscribe({
        next: (profile) => this.currentUserSubject.next(profile),
        error: () => this.logout(),
      });
    }
  }

  syncOidcRoles(idToken: string): Observable<UserProfile> {
    return this.http.post<LoginResponse>(`${this.API}/sync-oidc-roles`, { idToken }).pipe(
      tap((res) => {
        localStorage.setItem(this.tokenKey, res.accessToken);
      }),
      map((res) => res.user as UserProfile),
    );
  }

  hasAcpRole(acpId: string, role: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    if (user.isAppAdmin) return true;
    return user.acpRoles.some((r) => r.acpId === acpId && r.role === role);
  }

  private async redirectToOidcAuthorization(
    config: OidcConfig,
    extraParams: Record<string, string> = {},
  ): Promise<void> {
    const state = this.generateRandomValue(32);
    const nonce = this.generateRandomValue(32);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    sessionStorage.setItem(this.OIDC_STATE_KEY, state);
    sessionStorage.setItem(this.OIDC_CODE_VERIFIER_KEY, codeVerifier);

    const authUrl = new URL(`${config.issuerUrl}/protocol/openid-connect/auth`);
    authUrl.searchParams.set('client_id', config.clientId || '');
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    Object.entries(extraParams).forEach(([key, value]) => {
      authUrl.searchParams.set(key, value);
    });

    window.location.href = authUrl.toString();
  }

  private generateCodeVerifier(): string {
    return this.generateRandomValue(48);
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  private generateRandomValue(size: number): string {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return this.base64UrlEncode(bytes);
  }

  private base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
