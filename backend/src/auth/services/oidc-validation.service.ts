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
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: issuerUrl!,
        audience: clientId!,
      });

      console.log('OIDC Validation - Token verified. Payload sub:', payload.sub);
      console.log('OIDC Validation - Token issuer:', payload.iss);
      console.log('OIDC Validation - Token audience:', payload.aud);

      const sub = payload.sub;
      const email = payload.email as string | undefined;
      const name = payload.name as string | undefined;
      const preferredUsername = payload.preferred_username as string | undefined;
      
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
          isAppAdmin: false,
        });
        
        await this.userRepository.save(user);
        console.log('OIDC Validation - Created new user:', user.id, user.username);
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
