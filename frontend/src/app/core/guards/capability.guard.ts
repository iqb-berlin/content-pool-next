import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from '../services/api.service';

export const explorerCapabilityGuard: CanActivateFn = (route) => {
  const api = inject(ApiService);
  const router = inject(Router);
  const id = route.paramMap.get('acpId') || route.parent?.paramMap.get('acpId') || '';
  return api.getCapabilities(id).pipe(
    map((access) => (access.canViewExplorer ? true : router.createUrlTree(['/view', id]))),
    catchError(() => of(router.createUrlTree(['/view', id]))),
  );
};
