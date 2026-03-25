import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    this.logger.log(`RolesGuard checking: ${JSON.stringify(requiredRoles)}`);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user, params } = context.switchToHttp().getRequest();
    
    this.logger.log(`User object: ${JSON.stringify(user, null, 2)}`);
    this.logger.log(`Request params: ${JSON.stringify(params, null, 2)}`);
    
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    
    // Check if user is App Admin
    if (requiredRoles.includes('APP_ADMIN') && user.isAppAdmin) {
      this.logger.log('Access granted: User is App Admin');
      return true;
    }
    
    // Check ACP-specific roles (like ACP_MANAGER)
    if (requiredRoles.includes('ACP_MANAGER') && user.acpRoles) {
      const acpId = params.id || params.acpId;
      
      this.logger.log(`Checking ACP_MANAGER role for ACP ID: ${acpId}`);
      this.logger.log(`User ACP roles: ${JSON.stringify(user.acpRoles, null, 2)}`);
      
      if (!acpId) {
        throw new ForbiddenException('ACP ID not found in request');
      }
      
      const acpRole = user.acpRoles.find((role: any) => role.acpId === acpId);
      
      this.logger.log(`Found ACP role: ${JSON.stringify(acpRole)}`);
      
      if (acpRole && acpRole.role === 'ACP_MANAGER') {
        this.logger.log('Access granted: User is ACP Manager for this ACP');
        return true;
      }
    }
    
    this.logger.warn('Access denied: Insufficient permissions');
    throw new ForbiddenException('Insufficient permissions');
  }
}
