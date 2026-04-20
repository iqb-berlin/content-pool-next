import { AuthConfig } from 'angular-oauth2-oidc';

export function createAuthConfig(
  issuerUrl: string,
  clientId: string,
  redirectUri: string,
): AuthConfig {
  return {
    issuer: issuerUrl,
    redirectUri: redirectUri,
    clientId: clientId,
    responseType: 'code',
    scope: 'openid profile email',
    showDebugInformation: false,
    requireHttps: true,
    strictDiscoveryDocumentValidation: true,
    skipIssuerCheck: false,
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
