import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-oidc-callback',
  standalone: true,
  template: `<div class="callback-container">
    <p>Verarbeitung der Anmeldung...</p>
  </div>`,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
  `]
})
export class OidcCallbackComponent implements OnInit {
  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      // Debug: Log the full URL to understand what Keycloak sent
      console.log('OIDC Callback URL:', window.location.href);
      console.log('Hash:', window.location.hash);
      console.log('Search:', window.location.search);

      let idToken: string | null = null;
      let accessToken: string | null = null;

      // Try to extract tokens from URL fragment first (implicit flow)
      const hash = window.location.hash;
      if (hash && hash.includes('id_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        idToken = params.get('id_token');
        accessToken = params.get('access_token');
        console.log('Found id_token and access_token in hash/fragment');
      }

      // If not found, try query parameters (some Keycloak configs use this)
      if (!idToken) {
        const searchParams = new URLSearchParams(window.location.search);
        idToken = searchParams.get('id_token');
        if (idToken) {
          console.log('Found id_token in query parameters');
        }
      }

      // Check for authorization code (Authorization Code Flow)
      const searchParams = new URLSearchParams(window.location.search);
      const authCode = searchParams.get('code');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (error) {
        console.error('Keycloak returned error:', error, errorDescription);
        this.router.navigate(['/login'], {
          queryParams: { error: `OIDC Fehler: ${errorDescription || error}` }
        });
        return;
      }

      if (authCode) {
        console.log('Found authorization code - this requires backend token exchange (not implemented)');
        console.log('Please configure Keycloak with Implicit Flow (response_type=id_token token)');
        this.router.navigate(['/login'], {
          queryParams: { error: 'Authorization Code Flow wird nicht unterstützt. Bitte Implicit Flow in Keycloak aktivieren.' }
        });
        return;
      }

      if (idToken && accessToken) {
        console.log('Processing OIDC login with access_token (contains roles)...');
        
        // DEBUG: Decode and log access token payload to verify roles
        try {
          const payloadBase64 = accessToken.split('.')[1];
          const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson);
          console.log('=== ACCESS TOKEN DEBUG ===');
          console.log('Token payload:', payload);
          console.log('realm_access:', payload.realm_access);
          console.log('resource_access:', payload.resource_access);
          console.log('Roles in token:', {
            realmRoles: payload.realm_access?.roles || [],
            clientRoles: payload.resource_access || {}
          });
          console.log('========================');
        } catch (e) {
          console.error('Failed to decode token for debug:', e);
        }
        
        // Send access_token to backend (contains roles), id_token for logout
        await this.auth.handleOidcCallback(accessToken, idToken).toPromise();

        // Check for stored redirect URL
        const redirectUrl = sessionStorage.getItem('oidc_redirect_url') || '/';
        sessionStorage.removeItem('oidc_redirect_url');
        this.router.navigate([redirectUrl]);
        return;
      }

      // If we get here, something went wrong
      console.error('OIDC callback failed: No id_token or code found in URL');
      this.router.navigate(['/login'], {
        queryParams: { error: 'OIDC Authentifizierung fehlgeschlagen: Kein Token erhalten' }
      });
    } catch (error) {
      console.error('OIDC callback error:', error);
      this.router.navigate(['/login'], {
        queryParams: { error: 'OIDC Authentifizierung fehlgeschlagen' }
      });
    }
  }
}
