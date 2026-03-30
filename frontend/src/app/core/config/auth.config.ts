import { AuthConfig } from 'angular-oauth2-oidc';

export function createAuthConfig(issuerUrl: string, clientId: string, redirectUri: string): AuthConfig {
  return {
    issuer: issuerUrl,
    redirectUri: redirectUri,
    clientId: clientId,
    responseType: 'id_token token',
    scope: 'openid profile email',
    showDebugInformation: true,
    requireHttps: false, // Set to true in production
    strictDiscoveryDocumentValidation: false,
    skipIssuerCheck: true,
    oidc: true,
    useSilentRefresh: false,
  };
}

export interface OidcConfig {
  enabled: boolean;
  issuerUrl: string | null;
  clientId: string | null;
  redirectUri: string;
  scope: string;
}
