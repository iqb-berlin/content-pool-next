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

    try {
      const JWKS = createRemoteJWKSet(new URL(this.jwksUrl));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: this.configService.get<string>('OIDC_ISSUER_URL')!,
        audience: this.configService.get<string>('OIDC_CLIENT_ID')!,
      });

      const sub = payload.sub;
      
      if (!sub) {
        throw new UnauthorizedException('Invalid OIDC token: missing sub claim');
      }

      // Find user by OIDC sub
      const user = await this.userRepository.findOne({
        where: { oidcSub: sub },
        relations: ['acpRoles', 'acpRoles.acp'],
      });

      if (!user) {
        throw new UnauthorizedException('User not found. Please contact administrator to link your account.');
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
      throw new UnauthorizedException('Invalid OIDC token');
    }
  }

  isOidcEnabled(): boolean {
    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID');
    return !!(issuerUrl && clientId);
  }
}
