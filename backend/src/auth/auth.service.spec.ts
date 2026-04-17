import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, AcpAccessConfig, AcpCredential, AccessModel } from '../database/entities';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: any;
  let accessConfigRepo: any;
  let credentialRepo: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    passwordHash: '',
    displayName: 'Test User',
    isAppAdmin: false,
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('password123', 12);

    userRepo = {
      findOne: jest.fn(),
    };
    accessConfigRepo = {
      findOne: jest.fn(),
    };
    credentialRepo = {
      findOne: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepo },
        { provide: getRepositoryToken(AcpCredential), useValue: credentialRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return token on valid credentials', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.login('testuser', 'password123');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.username).toBe('testuser');
    });

    it('should throw on invalid username', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.login('bad', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on wrong password', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      await expect(service.login('testuser', 'wrong')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('credentialLogin', () => {
    it('should return token for valid ACP credentials', async () => {
      const hashedPw = await bcrypt.hash('cred-pass', 12);
      const config = {
        id: 'config-1',
        acpId: 'acp-1',
        accessModel: AccessModel.CREDENTIALS_LIST,
        validFrom: null,
        validUntil: null,
        credentials: [{ username: 'creduser', passwordHash: hashedPw }],
      };
      accessConfigRepo.findOne.mockResolvedValue(config);
      credentialRepo.findOne.mockResolvedValue({
        username: 'creduser',
        passwordHash: hashedPw,
      });

      const result = await service.credentialLogin('acp-1', 'creduser', 'cred-pass');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.acpId).toBe('acp-1');
    });

    it('should throw when access config not found', async () => {
      accessConfigRepo.findOne.mockResolvedValue(null);
      await expect(service.credentialLogin('acp-1', 'u', 'p')).rejects.toThrow(UnauthorizedException);
    });

    it('should rate-limit repeated failed credential logins', async () => {
      const hashedPw = await bcrypt.hash('cred-pass', 12);
      accessConfigRepo.findOne.mockResolvedValue({
        id: 'config-1',
        acpId: 'acp-1',
        accessModel: AccessModel.CREDENTIALS_LIST,
        validFrom: null,
        validUntil: null,
      });
      credentialRepo.findOne.mockResolvedValue({
        username: 'creduser',
        passwordHash: hashedPw,
      });

      for (let i = 0; i < 5; i++) {
        await expect(service.credentialLogin('acp-1', 'creduser', 'wrong-password', '1.2.3.4')).rejects.toThrow(
          UnauthorizedException,
        );
      }

      await expect(service.credentialLogin('acp-1', 'creduser', 'wrong-password', '1.2.3.4')).rejects.toMatchObject(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
        },
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, acpRoles: [] });
      const result = await service.getProfile('user-1');
      expect(result.username).toBe('testuser');
    });

    it('should throw on unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getProfile('bad-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateTokenForOidcUser', () => {
    it('should include ACP roles in returned user payload', async () => {
      const result = await service.generateTokenForOidcUser({
        sub: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        isAppAdmin: false,
        acpRoles: [{ acpId: 'acp-1', role: 'ACP_MANAGER' }],
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        isAppAdmin: false,
        acpRoles: [{ acpId: 'acp-1', role: 'ACP_MANAGER' }],
      });
    });
  });
});
