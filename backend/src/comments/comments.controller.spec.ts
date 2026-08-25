import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { CommentsController } from "./comments.controller";
import { CommentTargetType } from "../database/entities";

describe("CommentsController", () => {
  let controller: CommentsController;
  let commentsService: any;
  let reviewPolicy: any;

  beforeEach(() => {
    commentsService = {
      findByAcp: jest.fn().mockResolvedValue([{ id: "c-1" }]),
      findByCredential: jest.fn().mockResolvedValue([{ id: "c-cred" }]),
      findByUser: jest.fn().mockResolvedValue([{ id: "c-user" }]),
      isCommentingEnabled: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ id: "c-new" }),
      deleteUnreferencedLegacyByAcp: jest
        .fn()
        .mockResolvedValue({ deletedCount: 3, retainedCount: 5 }),
      exportComments: jest.fn().mockResolvedValue([{ id: "c-export" }]),
      exportCommentsByCredential: jest
        .fn()
        .mockResolvedValue([{ id: "c-export-cred" }]),
      exportCommentsXlsx: jest.fn().mockResolvedValue(Buffer.from("xlsx-all")),
      exportCommentsXlsxByCredential: jest
        .fn()
        .mockResolvedValue(Buffer.from("xlsx-cred")),
    };

    reviewPolicy = {
      isManagerRequest: jest.fn(
        (req) =>
          Boolean(req.user?.isAppAdmin) ||
          req.acpAccessLevel === "MANAGER" ||
          req.acpAccessLevel === "ADMIN",
      ),
    };
    controller = new CommentsController(commentsService, reviewPolicy);
  });

  it("returns all comments for managers", async () => {
    const req = { user: { isAppAdmin: false }, acpAccessLevel: "MANAGER" };
    const result = await controller.findAll("acp-1", req);

    expect(result).toEqual([{ id: "c-1" }]);
    expect(commentsService.findByAcp).toHaveBeenCalledWith("acp-1");
  });

  it("rejects all-comments access for non-managers", async () => {
    const req = { user: { isAppAdmin: false }, acpAccessLevel: "PUBLIC" };

    await expect(controller.findAll("acp-1", req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("returns mine for credential users", async () => {
    const req = {
      user: {
        type: "credential",
        sub: "credential-1",
        username: "cred-user",
      },
    };
    const result = await controller.findMine("acp-1", req);

    expect(result).toEqual([{ id: "c-cred" }]);
    expect(commentsService.findByCredential).toHaveBeenCalledWith(
      "acp-1",
      "credential-1",
    );
    expect(commentsService.findByUser).not.toHaveBeenCalled();
  });

  it("returns mine for OIDC users", async () => {
    const req = { user: { type: "oidc", sub: "u-1" } };
    const result = await controller.findMine("acp-1", req);

    expect(result).toEqual([{ id: "c-user" }]);
    expect(commentsService.findByUser).toHaveBeenCalledWith("acp-1", "u-1");
  });

  it("creates comment directly for managers", async () => {
    const req = {
      user: { type: "oidc", sub: "u-1", isAppAdmin: true },
      acpAccessLevel: "PUBLIC",
    };
    const dto = {
      targetType: CommentTargetType.ITEM,
      targetId: "item-1",
      commentText: "Hallo",
    };

    const result = await controller.create("acp-1", dto as any, req);

    expect(result).toEqual({ id: "c-new" });
    expect(commentsService.isCommentingEnabled).not.toHaveBeenCalled();
    expect(commentsService.create).toHaveBeenCalledWith({
      acpId: "acp-1",
      userId: "u-1",
      credentialId: undefined,
      credentialUsername: undefined,
      authorLabel: undefined,
      targetType: CommentTargetType.ITEM,
      targetId: "item-1",
      commentText: "Hallo",
    });
  });

  it.each([
    [
      "ACP manager",
      {
        user: { type: "oidc", sub: "manager-1", isAppAdmin: false },
        acpAccessLevel: "MANAGER",
      },
    ],
    [
      "app admin",
      {
        user: { type: "oidc", sub: "admin-1", isAppAdmin: true },
        acpAccessLevel: "PUBLIC",
      },
    ],
  ])(
    "rejects the ACP ID as a legacy comment target for %s",
    async (_label, req) => {
      const dto = {
        targetType: CommentTargetType.UNIT,
        targetId: "acp-1",
        commentText: "Invalid ACP-level comment",
      };

      await expect(controller.create("acp-1", dto, req)).rejects.toThrow(
        BadRequestException,
      );
      expect(reviewPolicy.isManagerRequest).not.toHaveBeenCalled();
      expect(commentsService.isCommentingEnabled).not.toHaveBeenCalled();
      expect(commentsService.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [CommentTargetType.UNIT, "unit-1"],
    [CommentTargetType.ITEM, "item-1"],
    [CommentTargetType.TASK_SEQUENCE, "sequence-1"],
  ])("keeps valid %s targets available", async (targetType, targetId) => {
    const req = {
      user: { type: "oidc", sub: "manager-1", isAppAdmin: false },
      acpAccessLevel: "MANAGER",
    };

    await expect(
      controller.create(
        "acp-1",
        { targetType, targetId, commentText: "Valid content comment" },
        req,
      ),
    ).resolves.toEqual({ id: "c-new" });
    expect(commentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        acpId: "acp-1",
        targetType,
        targetId,
      }),
    );
  });

  it("rejects create for non-managers when commenting is disabled", async () => {
    commentsService.isCommentingEnabled.mockResolvedValueOnce(false);
    const req = {
      user: { type: "credential", sub: "cred-id", username: "cred" },
      acpAccessLevel: "PUBLIC",
    };
    const dto = {
      targetType: CommentTargetType.UNIT,
      targetId: "unit-1",
      commentText: "x",
    };

    await expect(controller.create("acp-1", dto as any, req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("creates comment for credential users when commenting is enabled", async () => {
    commentsService.isCommentingEnabled.mockResolvedValueOnce(true);
    const req = {
      user: { type: "credential", sub: "cred-id", username: "cred" },
      acpAccessLevel: "PUBLIC",
    };
    const dto = {
      targetType: CommentTargetType.ITEM,
      targetId: "item-1",
      commentText: "ok",
    };

    await controller.create("acp-1", dto as any, req);

    expect(commentsService.create).toHaveBeenCalledWith({
      acpId: "acp-1",
      userId: undefined,
      credentialId: "cred-id",
      credentialUsername: "cred",
      authorLabel: "cred",
      targetType: CommentTargetType.ITEM,
      targetId: "item-1",
      commentText: "ok",
    });
  });

  it("deletes only safe legacy comments for managers", async () => {
    const req = { user: { isAppAdmin: true }, acpAccessLevel: "PUBLIC" };
    const result = await controller.deleteLegacyComments("acp-1", req);

    expect(result).toEqual({
      message: "3 legacy comments deleted; 5 comments retained",
      deletedCount: 3,
      retainedCount: 5,
      scope: "UNREFERENCED_LEGACY_NON_ITEM",
    });
    expect(commentsService.deleteUnreferencedLegacyByAcp).toHaveBeenCalledWith(
      "acp-1",
    );
  });

  it("rejects legacy bulk deletion for non-managers", async () => {
    const req = { user: { isAppAdmin: false }, acpAccessLevel: "PUBLIC" };

    await expect(controller.deleteLegacyComments("acp-1", req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("exports comments for manager users", async () => {
    const req = {
      user: { isAppAdmin: false, type: "oidc", sub: "u-1" },
      acpAccessLevel: "MANAGER",
    };
    const result = await controller.exportComments("acp-1", req);

    expect(result).toEqual([{ id: "c-export" }]);
    expect(commentsService.exportComments).toHaveBeenCalledWith("acp-1");
  });

  it("exports comments for credential users with credential filter", async () => {
    const req = {
      user: {
        isAppAdmin: false,
        type: "credential",
        sub: "credential-1",
        username: "cred-user",
      },
      acpAccessLevel: "PUBLIC",
    };

    const result = await controller.exportComments("acp-1", req);

    expect(result).toEqual([{ id: "c-export-cred" }]);
    expect(commentsService.exportCommentsByCredential).toHaveBeenCalledWith(
      "acp-1",
      "credential-1",
    );
  });

  it("exports comments for OIDC users with user filter", async () => {
    const req = {
      user: { isAppAdmin: false, type: "oidc", sub: "u-42" },
      acpAccessLevel: "PUBLIC",
    };

    await controller.exportComments("acp-1", req);

    expect(commentsService.exportComments).toHaveBeenCalledWith(
      "acp-1",
      "u-42",
    );
  });

  it("exports XLSX for manager users", async () => {
    const req = { user: { isAppAdmin: true }, acpAccessLevel: "PUBLIC" };
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportCommentsXlsx("acp-1", req, res);

    expect(commentsService.exportCommentsXlsx).toHaveBeenCalledWith("acp-1");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="comments-acp-1-all.xlsx"',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("xlsx-all"));
  });

  it("exports XLSX for credential users with username fallback", async () => {
    const req = {
      user: {
        isAppAdmin: false,
        type: "credential",
        sub: "credential-1",
        username: "",
      },
      acpAccessLevel: "PUBLIC",
    };
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportCommentsXlsx("acp-1", req, res);

    expect(commentsService.exportCommentsXlsxByCredential).toHaveBeenCalledWith(
      "acp-1",
      "credential-1",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="comments-acp-1-mine.xlsx"',
    );
  });

  it("exports XLSX for OIDC users with username fallback", async () => {
    const req = {
      user: { isAppAdmin: false, type: "oidc", sub: "u-2", username: "" },
      acpAccessLevel: "PUBLIC",
    };
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;

    await controller.exportCommentsXlsx("acp-1", req, res);

    expect(commentsService.exportCommentsXlsx).toHaveBeenCalledWith(
      "acp-1",
      "u-2",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="comments-acp-1-mine.xlsx"',
    );
  });
});
