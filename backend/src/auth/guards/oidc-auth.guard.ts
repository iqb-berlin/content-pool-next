import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OidcAuthGuard extends JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, validate the JWT
    const jwtValid = await super.canActivate(context);
    if (!jwtValid) {
      return false;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Check if user authenticated via OIDC
    if (user.authType !== 'oidc') {
      throw new ForbiddenException('OIDC authentication required for this resource');
    }

    return true;
  }
}
