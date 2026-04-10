import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface OidcUserInfo {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

@Injectable()
export class OidcValidationService {
  private jwksUrl: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    if (issuerUrl) {
      this.jwksUrl = `${issuerUrl}/protocol/openid-connect/certs`;
    }
  }

  async validateIdToken(idToken: string): Promise<any> {
    if (!this.jwksUrl) {
      throw new UnauthorizedException('OIDC not configured');
    }

    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID');
    
    console.log('OIDC Validation - JWKS URL:', this.jwksUrl);
    console.log('OIDC Validation - Expected Issuer:', issuerUrl);
    console.log('OIDC Validation - Expected Audience:', clientId);

    try {
      const JWKS = createRemoteJWKSet(new URL(this.jwksUrl));
      // For Access Tokens, audience is 'account', not the client_id
      // We validate issuer and check azp (authorized party) instead
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: issuerUrl!,
        // Do not validate audience for access tokens (aud is 'account')
      });

      // Verify the token was issued for our client (check azp for access tokens)
      const authorizedParty = payload.azp as string;
      if (authorizedParty !== clientId) {
        throw new UnauthorizedException(`Invalid token: azp ${authorizedParty} does not match expected client ${clientId}`);
      }

      console.log('OIDC Validation - Token verified. Payload sub:', payload.sub);
      console.log('OIDC Validation - Token issuer:', payload.iss);
      console.log('OIDC Validation - Token audience:', payload.aud);
      console.log('OIDC Validation - Token azp:', authorizedParty);

      const sub = payload.sub;
      const email = payload.email as string | undefined;
      const name = payload.name as string | undefined;
      const preferredUsername = payload.preferred_username as string | undefined;
      
      // Extract Keycloak roles from token
      const realmRoles = (payload.realm_access as any)?.roles || [];
      const resourceAccess = payload.resource_access as any;
      const clientRoles = clientId && resourceAccess?.[clientId]?.roles ? resourceAccess[clientId].roles : [];
      const isKeycloakAdmin = realmRoles.includes('admin') || clientRoles.includes('admin');
      
      console.log('OIDC Validation - Realm roles:', realmRoles);
      console.log('OIDC Validation - Client roles:', clientRoles);
      console.log('OIDC Validation - Is Keycloak admin:', isKeycloakAdmin);
      
      if (!sub) {
        throw new UnauthorizedException('Invalid OIDC token: missing sub claim');
      }

      // Find user by OIDC sub
      let user = await this.userRepository.findOne({
        where: { oidcSub: sub },
        relations: ['acpRoles', 'acpRoles.acp'],
      });

      console.log('OIDC Validation - Looking for user with oidcSub:', sub);
      console.log('OIDC Validation - User found:', user ? 'YES' : 'NO');

      // Auto-create user if not found
      if (!user) {
        console.log('OIDC Validation - Auto-creating new user for OIDC sub:', sub);
        
        // Generate username from available claims
        const baseUsername = preferredUsername || email?.split('@')[0] || `oidc_${sub.substring(0, 8)}`;
        let username = baseUsername;
        let counter = 1;
        
        // Ensure username is unique
        while (await this.userRepository.findOne({ where: { username } })) {
          username = `${baseUsername}_${counter}`;
          counter++;
        }
        
        user = this.userRepository.create({
          username,
          displayName: name || preferredUsername || username,
          oidcSub: sub,
          passwordHash: '', // No password needed for OIDC users
          isAppAdmin: isKeycloakAdmin,
        });
        
        await this.userRepository.save(user);
        console.log('OIDC Validation - Created new user:', user.id, user.username);
      } else {
        // Update admin status if Keycloak roles have changed
        if (user.isAppAdmin !== isKeycloakAdmin) {
          user.isAppAdmin = isKeycloakAdmin;
          await this.userRepository.save(user);
          console.log('OIDC Validation - Updated user admin status:', user.id, 'isAppAdmin:', isKeycloakAdmin);
        }
      }

      return {
        sub: user.id,
        username: user.username,
        isAppAdmin: user.isAppAdmin,
        type: 'oidc',
        authType: 'oidc',
        oidcSub: sub,
        acpRoles: user.acpRoles.map(role => ({
          acpId: role.acpId,
          acpName: role.acp?.name,
          role: role.role,
        })),
      };
    } catch (error) {
      console.error('OIDC Validation Error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(`Invalid OIDC token: ${error.message}`);
    }
  }

  isOidcEnabled(): boolean {
    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID');
    return !!(issuerUrl && clientId);
  }
}
