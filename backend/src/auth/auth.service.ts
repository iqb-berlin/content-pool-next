import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, AcpCredential, AcpAccessConfig } from '../database/entities';

export interface JwtPayload {
  sub: string;
  username: string;
  isAppAdmin: boolean;
  type: 'user' | 'credential' | 'oidc';
  authType?: 'local' | 'oidc';
  acpId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AcpCredential)
    private readonly credentialRepository: Repository<AcpCredential>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    
    // Admin users must use OIDC
    if (user.isAppAdmin) {
      throw new UnauthorizedException('Admin users must login via OIDC');
    }
    
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      isAppAdmin: user.isAppAdmin,
      type: 'user',
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isAppAdmin: user.isAppAdmin,
      },
    };
  }

  async credentialLogin(acpId: string, username: string, password: string) {
    // Find active access config for this ACP with credentials
    const accessConfig = await this.accessConfigRepository.findOne({
      where: { acpId, accessModel: 'CREDENTIALS_LIST' as any },
    });

    if (!accessConfig) {
      throw new UnauthorizedException('No credential-based access configured for this ACP');
    }

    // Check time validity
    const now = new Date();
    console.log('Login check:', {
      now: now.toISOString(),
      validFrom: accessConfig.validFrom?.toISOString(),
      validUntil: accessConfig.validUntil?.toISOString(),
      nowLessThanValidFrom: accessConfig.validFrom ? now < accessConfig.validFrom : null,
      nowGreaterThanValidUntil: accessConfig.validUntil ? now > accessConfig.validUntil : null,
    });
    if (accessConfig.validFrom && now < accessConfig.validFrom) {
      throw new UnauthorizedException('Access period has not started yet');
    }
    if (accessConfig.validUntil && now > accessConfig.validUntil) {
      throw new UnauthorizedException('Access period has expired');
    }

    // Find credential
    const credential = await this.credentialRepository.findOne({
      where: { accessConfigId: accessConfig.id, username },
    });

    if (!credential) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, credential.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: credential.id,
      username: credential.username,
      isAppAdmin: false,
      type: 'credential',
      acpId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      acpId,
      username: credential.username,
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['acpRoles', 'acpRoles.acp'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAppAdmin: user.isAppAdmin,
      acpRoles: user.acpRoles.map((role) => ({
        acpId: role.acpId,
        acpName: role.acp?.name,
        role: role.role,
      })),
    };
  }

  async generateTokenForOidcUser(userInfo: any) {
    const payload: JwtPayload = {
      sub: userInfo.sub,
      username: userInfo.username,
      isAppAdmin: userInfo.isAppAdmin,
      type: 'oidc',
      authType: 'oidc',
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: userInfo.sub,
        username: userInfo.username,
        displayName: userInfo.displayName || userInfo.username,
        isAppAdmin: userInfo.isAppAdmin,
      },
    };
  }

  async linkOidcAccount(userId: string, oidcSub: string) {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if OIDC sub is already linked to another user
    const existingUser = await this.userRepository.findOne({ where: { oidcSub } });
    if (existingUser && existingUser.id !== userId) {
      throw new UnauthorizedException('OIDC account already linked to another user');
    }

    // Update user with OIDC sub
    user.oidcSub = oidcSub;
    await this.userRepository.save(user);

    return {
      message: 'OIDC account linked successfully',
      user: {
        id: user.id,
        username: user.username,
        oidcSub: user.oidcSub,
      },
    };
  }

  async logout(userId: string) {
    // Audit logging - in production, this could write to a database
    console.log(`[AUDIT] User ${userId} logged out at ${new Date().toISOString()}`);

    return {
      message: 'Logout recorded',
      userId,
      timestamp: new Date().toISOString(),
    };
  }
}
