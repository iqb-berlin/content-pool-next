import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AcpAccessGuard } from './acp-access.guard';
import { AcpAccessConfig, AcpRole, AcpUserRole } from '../../database/entities';
import { User } from '../../database/entities/user.entity';

describe('AcpAccessGuard', () => {
  let guard: AcpAccessGuard;
  let acpUserRoleRepository: { findOne: jest.Mock };
  let accessConfigRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };

  const createContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    acpUserRoleRepository = {
      findOne: jest.fn(),
    };
    accessConfigRepository = {
      findOne: jest.fn(),
    };
    userRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpAccessGuard,
        {
          provide: getRepositoryToken(AcpUserRole),
          useValue: acpUserRoleRepository,
        },
        {
          provide: getRepositoryToken(AcpAccessConfig),
          useValue: accessConfigRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get(AcpAccessGuard);
  });

  it('allows OIDC users with ACP_MANAGER role for the requested ACP', async () => {
    accessConfigRepository.findOne.mockResolvedValue(null);
    acpUserRoleRepository.findOne.mockResolvedValue({
      role: AcpRole.ACP_MANAGER,
    });

    const request: any = {
      params: { acpId: 'acp-www' },
      user: {
        sub: 'julian-user-id',
        username: 'julian',
        isAppAdmin: false,
        type: 'oidc',
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(acpUserRoleRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'julian-user-id', acpId: 'acp-www' },
    });
    expect(request.acpAccessLevel).toBe('MANAGER');
  });

  it('prefers ACP role access over PUBLIC fallback for authenticated users', async () => {
    acpUserRoleRepository.findOne.mockResolvedValue({
      role: AcpRole.ACP_MANAGER,
    });
    accessConfigRepository.findOne.mockResolvedValue({
      id: 'public-config',
      acpId: 'acp-www',
      accessModel: 'PUBLIC',
    });

    const request: any = {
      params: { acpId: 'acp-www' },
      user: {
        sub: 'julian-user-id',
        username: 'julian',
        isAppAdmin: false,
        type: 'oidc',
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.acpAccessLevel).toBe('MANAGER');
    expect(accessConfigRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows anonymous access when ACP is PUBLIC', async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      id: 'public-config',
      acpId: 'acp-public',
      accessModel: 'PUBLIC',
    });

    const request: any = {
      params: { acpId: 'acp-public' },
      user: null,
      headers: {},
      query: {},
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.acpAccessLevel).toBe('PUBLIC');
  });
});
