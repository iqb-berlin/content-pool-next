import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { catchError, map, of } from 'rxjs';

/**
 * Guard that checks if a user has access to a specific ACP view.
 * Public access and credential-based access (via token) are handled by the backend.
 * Registered users are also checked against their roles for the ACP.
 */
export const acpViewGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const api = inject(ApiService);
  const router = inject(Router);
  const acpId = route.paramMap.get('acpId');

  if (!acpId) return of(false);

  // If already logged in (JWT or Credential Token), we let the request through
  // and let the backend handle the fine-grained access.
  if (auth.isLoggedIn) return of(true);

  // For unauthenticated users, we check if the ACP is PUBLIC.
  // getAcpStartPage will return 200 for PUBLIC acps and for those the user has access to.
  // It will return 401/403 for restricted ones.
  return api.getAcpStartPage(acpId).pipe(
    map(() => true),
    catchError((err) => {
      // If unauthorized, check if it requires credential login or regular login
      if (err.status === 401 || err.status === 403) {
        // We could fetch the access model here to decide whether to redirect to /login or /credential-login
        // For simplicity, we redirect to the landing page which shows the correct login button.
        router.navigate(['/']);
        return of(false);
      }
      return of(false);
    })
  );
};
