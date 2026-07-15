import { UnauthorizedException } from "@nestjs/common";
import {
  requireStablePreferenceIdentity,
  resolveStablePreferenceIdentity,
} from "./preference-identity";

describe("preference identity", () => {
  it.each(["user", "oidc", undefined])(
    "maps %s principals to a stable user identity",
    (type) => {
      expect(
        resolveStablePreferenceIdentity({ sub: " user-1 ", type }),
      ).toEqual({ kind: "user", userId: "user-1" });
    },
  );

  it("maps credentials by stable id and keeps the username as metadata", () => {
    expect(
      resolveStablePreferenceIdentity({
        type: "credential",
        sub: "credential-1",
        username: " reader-a ",
      }),
    ).toEqual({
      kind: "credential",
      credentialId: "credential-1",
      credentialUsername: "reader-a",
    });
  });

  it("does not use a credential username as a persistence identity", () => {
    expect(
      resolveStablePreferenceIdentity({
        type: "credential",
        username: "legacy-reader",
      }),
    ).toBeNull();
  });

  it("provides a consistent unauthorized boundary", () => {
    expect(() =>
      requireStablePreferenceIdentity(null, "stable owner required"),
    ).toThrow(UnauthorizedException);
  });
});
