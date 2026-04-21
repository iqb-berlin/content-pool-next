import { HttpContextToken } from '@angular/common/http';

export const BYPASS_APP_AUTH = new HttpContextToken<boolean>(() => false);
export const OIDC_REFRESH_RETRY_ATTEMPTED = new HttpContextToken<boolean>(() => false);
