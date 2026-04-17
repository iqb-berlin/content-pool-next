import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import type { LoginResponse, CredentialLoginResponse, UserProfile } from '../models/api.models';

describe('AuthService', () => {
  let service: AuthService;
  let httpClientMock: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let broadcastChannelMock: {
    postMessage: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent) => void) | null;
  };

  const mockUserProfile: UserProfile = {
    id: '1',
    username: 'testuser',
    displayName: 'Test User',
    isAppAdmin: true,
    acpRoles: []
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    
    broadcastChannelMock = {
      postMessage: vi.fn(),
      onmessage: null,
    };
    
    class BroadcastChannelMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = broadcastChannelMock.postMessage;
      constructor() {
        setTimeout(() => {
          broadcastChannelMock = this as any;
        }, 0);
      }
    }
    
    vi.stubGlobal('BroadcastChannel', BroadcastChannelMock);
    
    httpClientMock = {
      post: vi.fn().mockReturnValue(of({})),
      get: vi.fn().mockReturnValue(of(mockUserProfile))
    };
    service = new AuthService(httpClientMock as any);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getToken', () => {
    it('should return null when no token in localStorage', () => {
      expect(service.getToken()).toBeNull();
    });

    it('should return token from localStorage', () => {
      localStorage.setItem('cp_token', 'test-token');
      expect(service.getToken()).toBe('test-token');
    });
  });

  describe('isLoggedIn', () => {
    it('should return false when no token', () => {
      expect(service.isLoggedIn).toBe(false);
    });

    it('should return true when token exists', () => {
      localStorage.setItem('cp_token', 'test-token');
      expect(service.isLoggedIn).toBe(true);
    });
  });

  describe('isAdmin', () => {
    it('should return false when no user loaded', () => {
      expect(service.isAdmin).toBe(false);
    });
  });

  describe('hasManagedAcps', () => {
    it('should return false when no user loaded', () => {
      expect(service.hasManagedAcps).toBe(false);
    });

    it('should return true for app admin', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of({ ...mockUserProfile, isAppAdmin: true, acpRoles: [] }));
      service.loadProfile();

      expect(service.hasManagedAcps).toBe(true);
    });

    it('should return true when user manages at least one ACP', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of({
        ...mockUserProfile,
        isAppAdmin: false,
        acpRoles: [{ acpId: 'acp1', role: 'ACP_MANAGER' as const }]
      }));
      service.loadProfile();

      expect(service.hasManagedAcps).toBe(true);
    });

    it('should safely return false when acpRoles are missing', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of({
        ...mockUserProfile,
        isAppAdmin: false,
        acpRoles: undefined,
      }));
      service.loadProfile();

      expect(service.hasManagedAcps).toBe(false);
    });
  });

  describe('currentUser', () => {
    it('should return null when no user loaded', () => {
      expect(service.currentUser).toBeNull();
    });
  });

  describe('login', () => {
    it('should store token and load profile on successful login', () => {
      const loginResponse: LoginResponse = { accessToken: 'new-token', user: mockUserProfile };
      httpClientMock.post.mockReturnValue(of(loginResponse));

      service.login('testuser', 'password').subscribe(response => {
        expect(response).toEqual(loginResponse);
        expect(localStorage.getItem('cp_token')).toBe('new-token');
      });

      expect(httpClientMock.post).toHaveBeenCalledWith('/api/auth/login', { username: 'testuser', password: 'password' });
    });
  });

  describe('credentialLogin', () => {
    it('should store token on successful credential login', () => {
      const response: CredentialLoginResponse = { accessToken: 'cred-token', acpId: 'acp1', username: 'user' };
      httpClientMock.post.mockReturnValue(of(response));

      service.credentialLogin('acp1', 'user', 'pass').subscribe(res => {
        expect(res).toEqual(response);
        expect(localStorage.getItem('cp_token')).toBe('cred-token');
      });

      expect(httpClientMock.post).toHaveBeenCalledWith('/api/auth/credential-login', { acpId: 'acp1', username: 'user', password: 'pass' });
    });
  });

  describe('logout', () => {
    it('should remove token and clear user', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.post.mockReturnValue(of({}));
      
      service.logout();
      
      expect(localStorage.getItem('cp_token')).toBeNull();
    });

    it('should call backend logout endpoint', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.post.mockReturnValue(of({}));
      
      service.logout();
      
      expect(httpClientMock.post).toHaveBeenCalledWith('/api/auth/logout', {});
    });

    it('should clear OIDC redirect URL from sessionStorage', () => {
      localStorage.setItem('cp_token', 'test-token');
      sessionStorage.setItem('oidc_redirect_url', '/some-path');
      httpClientMock.post.mockReturnValue(of({}));
      
      service.logout();
      
      expect(sessionStorage.getItem('oidc_redirect_url')).toBeNull();
    });

    it('should broadcast logout to other tabs', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.post.mockReturnValue(of({}));
      
      service.logout();
      
      expect(broadcastChannelMock.postMessage).toHaveBeenCalledWith('logout');
    });
  });

  describe('loadProfile', () => {
    it('should load and set user profile', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of(mockUserProfile));

      service.loadProfile();

      expect(httpClientMock.get).toHaveBeenCalledWith('/api/auth/profile');
      expect(service.currentUser).toEqual(mockUserProfile);
      expect(service.isAdmin).toBe(true);
    });

    it('should logout on profile load error', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(throwError(() => new Error('Network error')));

      service.loadProfile();

      expect(httpClientMock.get).toHaveBeenCalledWith('/api/auth/profile');
      expect(localStorage.getItem('cp_token')).toBeNull();
    });
  });

  describe('hasAcpRole', () => {
    it('should return false when not logged in', () => {
      expect(service.hasAcpRole('acp1', 'admin')).toBe(false);
    });

    it('should return true for app admin', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of({ ...mockUserProfile, isAppAdmin: true, acpRoles: [] }));
      service.loadProfile();

      expect(service.hasAcpRole('acp1', 'any-role')).toBe(true);
    });

    it('should check specific ACP role', () => {
      localStorage.setItem('cp_token', 'test-token');
      httpClientMock.get.mockReturnValue(of({
        ...mockUserProfile,
        isAppAdmin: false,
        acpRoles: [{ acpId: 'acp1', role: 'ACP_MANAGER' as const }]
      }));
      service.loadProfile();

      expect(service.hasAcpRole('acp1', 'ACP_MANAGER')).toBe(true);
      expect(service.hasAcpRole('acp1', 'READ_ONLY')).toBe(false);
      expect(service.hasAcpRole('acp2', 'ACP_MANAGER')).toBe(false);
    });
  });
});
