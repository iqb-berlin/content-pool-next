import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { AccessService } from '../services/access.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const accessService = inject(AccessService);

  if (authService.isLoggedIn) return true;
  return accessService.createAccessUrlTree('login_required', {
    nextUrl: state.url,
  });
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const accessService = inject(AccessService);

  if (!authService.isLoggedIn) {
    return accessService.createAccessUrlTree('login_required', {
      context: 'admin',
      nextUrl: state.url,
    });
  }

  if (authService.isAdmin) return true;

  return accessService.createAccessUrlTree('insufficient_rights', {
    context: 'admin',
    nextUrl: state.url,
  });
};

export const acpManagerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const apiService = inject(ApiService);
  const accessService = inject(AccessService);
  const acpId = route.paramMap.get('acpId') || '';

  if (!authService.isLoggedIn) {
    return accessService.createAccessUrlTree('login_required', {
      context: 'manage',
      acpId: acpId || undefined,
      nextUrl: state.url,
    });
  }

  if (authService.isAdmin) return true;

  if (!acpId) {
    return accessService.createAccessUrlTree('insufficient_rights', {
      context: 'manage',
      nextUrl: state.url,
    });
  }

  return apiService.getAcp(acpId).pipe(
    map(() => true),
    catchError((err) => {
      if (err?.status === 401) {
        return of(
          accessService.createAccessUrlTree('login_required', {
            context: 'manage',
            acpId,
            nextUrl: state.url,
          }),
        );
      }

      return of(
        accessService.createAccessUrlTree('insufficient_rights', {
          context: 'manage',
          acpId,
          nextUrl: state.url,
        }),
      );
    }),
  );
};
