import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { LoginResponse, CredentialLoginResponse, UserProfile, OidcConfig } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = '/api/auth';
  private tokenKey = 'cp_token';
  private currentUserSubject = new BehaviorSubject<UserProfile | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    if (this.getToken()) {
      this.loadProfile();
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

  handleOidcCallback(idToken: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API}/oidc-callback`, { idToken }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.accessToken);
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

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.currentUserSubject.next(null);
  }

  loadProfile(): void {
    this.http.get<UserProfile>(`${this.API}/profile`).subscribe({
      next: profile => this.currentUserSubject.next(profile),
      error: () => this.logout()
    });
  }

  hasAcpRole(acpId: string, role: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    if (user.isAppAdmin) return true;
    return user.acpRoles.some(r => r.acpId === acpId && r.role === role);
  }
}
