import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let configService: { get: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('secret-key'),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    strategy = new JwtStrategy(configService as unknown as ConfigService, userRepository as any);
  });

  it('returns credential payload without DB lookup', async () => {
    const payload: any = {
      sub: 'cred-1',
      username: 'reader',
      type: 'credential',
      authType: 'credential',
      acpId: 'acp-1',
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      sub: 'cred-1',
      username: 'reader',
      isAppAdmin: false,
      type: 'credential',
      authType: 'credential',
      acpId: 'acp-1',
      acpRoles: [],
    });
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns null when regular user does not exist', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await strategy.validate({
      sub: 'user-1',
      username: 'julian',
      type: 'oidc',
      authType: 'oidc',
      acpId: undefined,
    } as any);

    expect(result).toBeNull();
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      relations: ['acpRoles', 'acpRoles.acp'],
    });
  });

  it('maps DB roles for regular users', async () => {
    userRepository.findOne.mockResolvedValue({
      isAppAdmin: true,
      acpRoles: [
        {
          acpId: 'acp-1',
          role: 'ACP_MANAGER',
          acp: { name: 'Demo ACP' },
        },
      ],
    });

    const result = await strategy.validate({
      sub: 'user-1',
      username: 'julian',
      type: 'oidc',
      authType: 'oidc',
      acpId: 'acp-1',
    } as any);

    expect(result).toEqual({
      sub: 'user-1',
      username: 'julian',
      isAppAdmin: true,
      type: 'oidc',
      authType: 'oidc',
      acpId: 'acp-1',
      acpRoles: [
        {
          acpId: 'acp-1',
          acpName: 'Demo ACP',
          role: 'ACP_MANAGER',
        },
      ],
    });
  });
});
