import { UnauthorizedException } from "@nestjs/common";

export type StablePreferenceIdentity =
  | {
      kind: "user";
      userId: string;
    }
  | {
      kind: "credential";
      credentialId: string;
      credentialUsername?: string;
    };

export function resolveStablePreferenceIdentity(
  principal: unknown,
): StablePreferenceIdentity | null {
  if (!principal || typeof principal !== "object") return null;

  const candidate = principal as {
    sub?: unknown;
    type?: unknown;
    username?: unknown;
  };
  const id = typeof candidate.sub === "string" ? candidate.sub.trim() : "";
  if (!id) return null;

  if (candidate.type === "credential") {
    const credentialUsername =
      typeof candidate.username === "string" ? candidate.username.trim() : "";
    return {
      kind: "credential",
      credentialId: id,
      ...(credentialUsername ? { credentialUsername } : {}),
    };
  }

  return { kind: "user", userId: id };
}

export function requireStablePreferenceIdentity(
  principal: unknown,
  message = "A stable identity is required",
): StablePreferenceIdentity {
  const identity = resolveStablePreferenceIdentity(principal);
  if (!identity) throw new UnauthorizedException(message);
  return identity;
}
