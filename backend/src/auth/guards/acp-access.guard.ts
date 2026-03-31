import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcpUserRole, AcpRole, AcpAccessConfig, AccessModel } from '../../database/entities';

/**
 * Guard that checks if the current user has access to the ACP specified by :acpId param.
 * Access is granted if:
 * 1. User is an App Admin
 * 2. User has an ACP role (ACP_MANAGER or READ_ONLY)
 * 3. The ACP is configured for PUBLIC access
 * 4. User is authenticated via credential-based login for this ACP
 */
@Injectable()
export class AcpAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(AcpUserRole)
    private readonly acpUserRoleRepository: Repository<AcpUserRole>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const acpId = request.params.acpId || request.params.id;
    const user = request.user;

    if (!acpId) {
      throw new NotFoundException('ACP ID not found in request');
    }

    // Check public access
    const publicConfig = await this.accessConfigRepository.findOne({
      where: { acpId, accessModel: AccessModel.PUBLIC },
    });
    if (publicConfig) {
      request.acpAccessLevel = 'PUBLIC';
      return true;
    }

    // Remaining checks require authentication
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // App Admin has full access
    if (user.isAppAdmin) {
      request.acpAccessLevel = 'ADMIN';
      return true;
    }

    // Credential-based access
    console.log('Checking credential access:', { userType: user.type, userAcpId: user.acpId, requestedAcpId: acpId, match: user.acpId === acpId });
    if (user.type === 'credential' && user.acpId === acpId) {
      request.acpAccessLevel = 'CREDENTIAL';
      return true;
    }

    // User role-based access
    if (user.type === 'user') {
      const role = await this.acpUserRoleRepository.findOne({
        where: { userId: user.sub, acpId },
      });
      if (role) {
        request.acpAccessLevel = role.role === AcpRole.ACP_MANAGER ? 'MANAGER' : 'READ_ONLY';
        return true;
      }
    }

    throw new ForbiddenException('No access to this ACP');
  }
}
