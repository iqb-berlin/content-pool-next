import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AccessService } from '../services/access.service';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const access = inject(AccessService);

  const token = auth.getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      const status = error.status;
      const nextUrl = `${window.location.pathname}${window.location.search}`;

      if (status === 401 && !isInlineAuthError(req.url)) {
        const hadToken = !!auth.getToken();
        if (hadToken) {
          auth.clearSession();
          void access.redirectToAccess('session_expired', {
            nextUrl,
            replaceUrl: true,
          });
        } else {
          void access.redirectToAccess('login_required', {
            nextUrl,
            replaceUrl: true,
          });
        }
      }

      if (status === 403 && !req.url.startsWith('/api/auth/') && !!auth.getToken()) {
        const message = String(error.error?.message || '').toLowerCase();
        const reason = message.includes('not enabled') ? 'feature_disabled' : 'insufficient_rights';

        void access.redirectToAccess(reason, {
          nextUrl,
          replaceUrl: true,
        });
      }

      return throwError(() => error);
    }),
  );
};

function isInlineAuthError(url: string): boolean {
  return (
    url.startsWith('/api/auth/login') ||
    url.startsWith('/api/auth/credential-login') ||
    url.startsWith('/api/auth/oidc-callback')
  );
}
