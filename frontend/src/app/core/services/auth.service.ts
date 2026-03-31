import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { LoginResponse, CredentialLoginResponse, UserProfile, OidcConfig, AuthContext } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = '/api/auth';
  private tokenKey = 'cp_token';
  private readonly OIDC_REDIRECT_KEY = 'oidc_redirect_url';
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
      sessionStorage.setItem('oidc_redirect_url', redirectUrl);
    }
    
    this.getOidcConfig().subscribe(config => {
      if (!config.enabled || !config.issuerUrl || !config.clientId) {
        console.error('OIDC not configured');
        return;
      }

      const authUrl = new URL(`${config.issuerUrl}/protocol/openid-connect/auth`);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'id_token token');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('nonce', this.generateNonce());
      
      window.location.href = authUrl.toString();
    });
  }

  handleOidcCallback(accessToken: string, idToken?: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/oidc-callback`, { idToken: accessToken }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.accessToken);
        localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
        if (idToken) {
          localStorage.setItem(this.ID_TOKEN_KEY, idToken);
        }
        localStorage.setItem(this.AUTH_TYPE_KEY, 'oidc');
        this.loadProfile();
      })
    );
  }

  private generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/login`, { username, password }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.accessToken);
        this.loadProfile();
      })
    );
  }

  credentialLogin(acpId: string, username: string, password: string): Observable<CredentialLoginResponse> {
    return this.http.post<CredentialLoginResponse>(`${this.API}/credential-login`, { acpId, username, password }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.accessToken);
      })
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
    this.getOidcConfig().subscribe(config => {
      if (!config.enabled || !config.issuerUrl || !config.clientId) return;
      
      const logoutUrl = new URL(`${config.issuerUrl}/protocol/openid-connect/logout`);
      logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin + '/login');
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
    this.currentUserSubject.next(null);

    if (broadcast && this.logoutChannel) {
      this.logoutChannel.postMessage('logout');
    }
  }

  loadProfile(): void {
    const authType = localStorage.getItem(this.AUTH_TYPE_KEY);
    const accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    
    // For OIDC users, sync roles first to ensure admin status is up-to-date
    if (authType === 'oidc' && accessToken) {
      this.syncOidcRoles(accessToken).subscribe({
        next: profile => this.currentUserSubject.next(profile),
        error: () => this.logout()
      });
    } else {
      this.http.get<UserProfile>(`${this.API}/profile`).subscribe({
        next: profile => this.currentUserSubject.next(profile),
        error: () => this.logout()
      });
    }
  }

  syncOidcRoles(accessToken: string): Observable<UserProfile> {
    return this.http.post<LoginResponse>(`${this.API}/sync-oidc-roles`, { idToken: accessToken }).pipe(
      tap(res => {
        // Store the new token with updated admin status
        localStorage.setItem(this.tokenKey, res.accessToken);
      }),
      map(res => res.user as UserProfile)
    );
  }

  hasAcpRole(acpId: string, role: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    if (user.isAppAdmin) return true;
    return user.acpRoles.some(r => r.acpId === acpId && r.role === role);
  }
}
