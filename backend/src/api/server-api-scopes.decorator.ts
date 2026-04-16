import { SetMetadata } from '@nestjs/common';

export const SERVER_API_SCOPES_KEY = 'server_api_scopes';

export const ServerApiScopes = (...scopes: string[]) => SetMetadata(SERVER_API_SCOPES_KEY, scopes);
