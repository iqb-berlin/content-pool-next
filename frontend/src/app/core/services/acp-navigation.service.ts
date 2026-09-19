import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './auth.service';

/** Resolves the ACP entry point after the user profile becomes available. */
@Injectable({ providedIn: 'root' })
export class AcpNavigationService {
  private readonly user = toSignal(inject(AuthService).currentUser$);

  overviewRoute(acpId: string): string[] {
    const user = this.user();
    const canManage =
      user?.isAppAdmin ||
      user?.acpRoles?.some((role) => role.acpId === acpId && role.role === 'ACP_MANAGER');
    return [canManage ? '/manage' : '/view', acpId];
  }
}
