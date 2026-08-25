import { ForbiddenException } from "@nestjs/common";
import { CommentTargetType } from "../database/entities";
import { ReviewPolicyService } from "./review-policy.service";

describe("ReviewPolicyService", () => {
  let accessConfigRepository: { findOne: jest.Mock };
  let policy: ReviewPolicyService;

  beforeEach(() => {
    accessConfigRepository = { findOne: jest.fn() };
    policy = new ReviewPolicyService(accessConfigRepository as any);
  });

  it("resolves stable identities and current manager rights", () => {
    expect(
      policy.resolveActor({
        user: { type: "oidc", sub: "user-1", username: "AB" },
        acpAccessLevel: "READ_ONLY",
      }),
    ).toEqual({
      userId: "user-1",
      credentialId: undefined,
      credentialUsername: undefined,
      authorLabel: "AB",
      isManager: false,
    });
    expect(
      policy.resolveActor({
        user: {
          type: "credential",
          sub: "credential-1",
          username: "reader",
        },
        acpAccessLevel: "CREDENTIAL",
      }),
    ).toEqual(
      expect.objectContaining({
        credentialId: "credential-1",
        credentialUsername: "reader",
        userId: undefined,
      }),
    );
    expect(
      policy.isManagerRequest({
        user: { isAppAdmin: false },
        acpAccessLevel: "ADMIN",
      }),
    ).toBe(true);
  });

  it("keeps review participation behind its own request policy", () => {
    expect(() =>
      policy.assertCanParticipateRequest({
        user: { sub: "user-1" },
        acpAccessLevel: "READ_ONLY",
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertCanParticipateRequest({
        user: { sub: "user-1" },
        acpAccessLevel: "PUBLIC",
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertCanParticipateRequest({
        user: { sub: "user-1" },
        acpAccessLevel: "UNRELATED",
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      policy.assertCanParticipateRequest({ acpAccessLevel: "PUBLIC" }),
    ).toThrow(ForbiddenException);
  });

  it("rejects anonymous and disabled item review access", async () => {
    await expect(
      policy.assertItemCommentAccess("acp-1", {
        authorLabel: "?",
        isManager: false,
      }),
    ).rejects.toThrow(ForbiddenException);

    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: { enableCommenting: false },
    });
    await expect(
      policy.assertItemCommentAccess("acp-1", {
        userId: "user-1",
        authorLabel: "AB",
        isManager: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("uses stable IDs exclusively for ownership", () => {
    const comment = {
      userId: null,
      credentialId: "credential-old",
      credentialUsername: "same-name",
    } as any;
    expect(
      policy.isOwnedBy(comment, {
        credentialId: "credential-new",
        credentialUsername: "same-name",
        authorLabel: "SN",
        isManager: false,
      }),
    ).toBe(false);
    expect(
      policy.isOwnedBy(
        { credentialId: null, credentialUsername: "same-name" } as any,
        {
          credentialId: "credential-new",
          credentialUsername: "same-name",
          authorLabel: "SN",
          isManager: false,
        },
      ),
    ).toBe(false);
  });

  it("encapsulates visibility, reply and mutation decisions", () => {
    const foreignComment = { userId: "other" } as any;
    const actor = {
      userId: "me",
      authorLabel: "ME",
      isManager: false,
    };
    expect(policy.canViewComment("PRIVATE", actor, foreignComment)).toBe(false);
    expect(policy.canViewComment("SHARED", actor, foreignComment)).toBe(true);
    expect(() =>
      policy.assertCanReply("PRIVATE", actor, foreignComment),
    ).toThrow(ForbiddenException);
    expect(() => policy.assertCanMutate(actor, foreignComment)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      policy.assertCanMutate(actor, { userId: "me" } as any),
    ).not.toThrow();
  });

  it("keeps target feature checks behind the policy boundary", async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    await expect(
      policy.assertItemCommentAccess("acp-1", {
        userId: "user-1",
        authorLabel: "AB",
        isManager: false,
      }),
    ).resolves.toBe("SHARED");
    await expect(
      policy.isCommentingEnabled("acp-1", CommentTargetType.UNIT),
    ).resolves.toBe(false);
  });
});
