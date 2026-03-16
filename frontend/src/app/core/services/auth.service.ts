import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { LoginResponse, CredentialLoginResponse, UserProfile } from '../models/api.models';

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
