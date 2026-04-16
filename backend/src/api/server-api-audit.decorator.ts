import { SetMetadata } from '@nestjs/common';

export interface ServerApiAuditMetadata {
  action: string;
  resourceType: string;
}

export const SERVER_API_AUDIT_KEY = 'server_api_audit';

export const ServerApiAudit = (action: string, resourceType: string) =>
  SetMetadata(SERVER_API_AUDIT_KEY, { action, resourceType } as ServerApiAuditMetadata);
