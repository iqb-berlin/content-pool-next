import { BadRequestException } from "@nestjs/common";
import { ReviewCommentsController } from "./review-comments.controller";

describe("ReviewCommentsController", () => {
  let controller: ReviewCommentsController;
  let commentsService: any;
  let reviewPolicy: any;

  beforeEach(() => {
    commentsService = {
      getItemThread: jest.fn().mockResolvedValue({ comments: [] }),
      createItemComment: jest.fn().mockResolvedValue({ id: "c-1" }),
      updateOwnComment: jest.fn().mockResolvedValue({ id: "c-1", version: 2 }),
      deleteOwnComment: jest.fn().mockResolvedValue(undefined),
    };
    reviewPolicy = {
      resolveActor: jest.fn((req) => {
        const credential = req.user?.type === "credential";
        return {
          userId: credential ? undefined : req.user?.sub,
          credentialId: credential ? req.user?.sub : undefined,
          credentialUsername: credential ? req.user?.username : undefined,
          authorLabel: req.user?.username || "Unbekannt",
          isManager: Boolean(
            req.user?.isAppAdmin ||
            req.acpAccessLevel === "MANAGER" ||
            req.acpAccessLevel === "ADMIN",
          ),
        };
      }),
    };
    controller = new ReviewCommentsController(commentsService, reviewPolicy);
  });

  it("resolves stable OIDC and credential actors for item thread operations", async () => {
    await controller.getItemThread("acp-1", " unit-1 ", " item-1 ", {
      user: { type: "oidc", sub: "user-1", username: "kuerzel" },
      acpAccessLevel: "READ_ONLY",
    });
    expect(commentsService.getItemThread).toHaveBeenCalledWith(
      "acp-1",
      "unit-1",
      "item-1",
      {
        userId: "user-1",
        credentialId: undefined,
        credentialUsername: undefined,
        authorLabel: "kuerzel",
        isManager: false,
      },
    );

    await controller.createItemComment(
      "acp-1",
      {
        unitId: "unit-1",
        itemId: "item-1",
        commentText: "Antwort",
        parentCommentId: "00000000-0000-4000-8000-000000000001",
      },
      {
        user: {
          type: "credential",
          sub: "credential-1",
          username: "reader",
        },
        acpAccessLevel: "CREDENTIAL",
      },
    );
    expect(commentsService.createItemComment).toHaveBeenCalledWith(
      "acp-1",
      expect.objectContaining({
        unitId: "unit-1",
        itemId: "item-1",
        commentText: "Antwort",
      }),
      expect.objectContaining({
        credentialId: "credential-1",
        credentialUsername: "reader",
        authorLabel: "reader",
      }),
    );
  });

  it("delegates versioned update and delete operations", async () => {
    const req = {
      user: { type: "oidc", sub: "user-1", username: "u1" },
      acpAccessLevel: "MANAGER",
    };
    await controller.updateComment(
      "acp-1",
      "00000000-0000-4000-8000-000000000001",
      { commentText: "Neu", version: 2 },
      req,
    );
    expect(commentsService.updateOwnComment).toHaveBeenCalledWith(
      "acp-1",
      "00000000-0000-4000-8000-000000000001",
      "Neu",
      2,
      expect.objectContaining({ userId: "user-1", isManager: true }),
    );

    await expect(
      controller.deleteComment(
        "acp-1",
        "00000000-0000-4000-8000-000000000001",
        "invalid",
        req,
      ),
    ).rejects.toThrow(BadRequestException);
    await controller.deleteComment(
      "acp-1",
      "00000000-0000-4000-8000-000000000001",
      "2",
      req,
    );
    expect(commentsService.deleteOwnComment).toHaveBeenCalledWith(
      "acp-1",
      "00000000-0000-4000-8000-000000000001",
      2,
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("rejects missing item targets before service access", async () => {
    await expect(
      controller.getItemThread("acp-1", "", "item-1", {
        user: { type: "oidc", sub: "user-1", username: "u1" },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(commentsService.getItemThread).not.toHaveBeenCalled();
  });
});
