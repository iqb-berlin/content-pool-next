import { Request } from "express";
import { ServerApiScope } from "./server-api-scopes";

export interface AuthenticatedServerApiClient {
  id: string;
  scopes: string[];
  allowedAcpIds: string[] | null;
}

export interface ServerApiRequest extends Request {
  serverApiClient?: AuthenticatedServerApiClient;
}

export interface AuthenticatedServerApiRequest extends Request {
  serverApiClient: AuthenticatedServerApiClient;
}

export interface ServerApiCapabilities {
  clientId: string;
  scopes: string[];
  capabilities: Record<ServerApiScope, boolean>;
  allowedAcpIds: string[] | null;
}
