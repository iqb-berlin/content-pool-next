import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface ServerApiClient {
  id: string;
  token: string;
  scopes: string[];
}

export const ALL_SERVER_API_SCOPES = [
  "acp.read",
  "transfer.read",
  "transfer.write",
  "index.read",
  "index.write",
  "files.read",
  "files.write",
  "audit.read",
] as const;

@Injectable()
export class ServerApiAuthService {
  private readonly logger = new Logger(ServerApiAuthService.name);
  private readonly clients: ServerApiClient[];

  constructor(private readonly configService: ConfigService) {
    this.clients = this.loadClients();
    if (!this.clients.length) {
      this.logger.warn(
        "No server API tokens configured. All integration requests will be rejected.",
      );
    }
  }

  validateToken(token: string): Omit<ServerApiClient, "token"> | null {
    for (const client of this.clients) {
      if (this.tokensEqual(client.token, token)) {
        return {
          id: client.id,
          scopes: [...client.scopes],
        };
      }
    }

    return null;
  }

  hasScopes(clientScopes: string[], requiredScopes: string[]): boolean {
    if (!requiredScopes.length) return true;
    const normalized = new Set(clientScopes);
    return requiredScopes.every((scope) => normalized.has(scope));
  }

  private loadClients(): ServerApiClient[] {
    const fromJson = this.loadClientsFromJson();
    if (fromJson.length) {
      return fromJson;
    }

    // Fallback for simple setup
    const legacyToken = (
      this.configService.get<string>("SERVER_API_KEY", "") || ""
    ).trim();
    if (legacyToken) {
      return [
        {
          id: "legacy",
          token: legacyToken,
          scopes: [...ALL_SERVER_API_SCOPES],
        },
      ];
    }

    return [];
  }

  private loadClientsFromJson(): ServerApiClient[] {
    const raw = (
      this.configService.get<string>("SERVER_API_TOKENS", "") || ""
    ).trim();
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.logger.warn(
          "SERVER_API_TOKENS must be a JSON array. Ignoring malformed config.",
        );
        return [];
      }

      const clients: ServerApiClient[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;

        const id = String((entry as any).id || "").trim();
        const token = String((entry as any).token || "").trim();
        const scopesInput = Array.isArray((entry as any).scopes)
          ? (entry as any).scopes
          : [];
        const scopes = Array.from(
          new Set<string>(
            scopesInput
              .map((scope: unknown) => String(scope || "").trim())
              .filter((scope: string) => scope.length > 0),
          ),
        );

        if (!id || !token) {
          continue;
        }

        clients.push({
          id,
          token,
          scopes: scopes.length ? scopes : [...ALL_SERVER_API_SCOPES],
        });
      }

      return clients;
    } catch {
      this.logger.warn(
        "SERVER_API_TOKENS contains invalid JSON. Ignoring malformed config.",
      );
      return [];
    }
  }

  private tokensEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }
}
