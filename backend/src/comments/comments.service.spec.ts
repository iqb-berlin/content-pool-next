import { NotFoundException } from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { CommentTargetType } from "../database/entities";

describe("CommentsService", () => {
  let service: CommentsService;
  let commentRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    delete: jest.Mock;
  };
  let accessConfigRepository: { findOne: jest.Mock };

  beforeEach(() => {
    commentRepository = {
      find: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((value) => ({ id: "c-1", ...value })),
      save: jest.fn().mockImplementation(async (value) => value),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    };

    accessConfigRepository = {
      findOne: jest.fn(),
    };

    service = new CommentsService(
      commentRepository as any,
      accessConfigRepository as any,
    );
  });

  it("queries comments by ACP, user and credential", async () => {
    commentRepository.find.mockResolvedValue([{ id: "c-1" }]);

    await expect(service.findByAcp("acp-1")).resolves.toEqual([{ id: "c-1" }]);
    await expect(service.findByUser("acp-1", "u-1")).resolves.toEqual([
      { id: "c-1" },
    ]);
    await expect(service.findByCredential("acp-1", "reader")).resolves.toEqual([
      { id: "c-1" },
    ]);

    expect(commentRepository.find).toHaveBeenNthCalledWith(1, {
      where: { acpId: "acp-1" },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
    expect(commentRepository.find).toHaveBeenNthCalledWith(2, {
      where: { acpId: "acp-1", userId: "u-1" },
      order: { createdAt: "DESC" },
    });
    expect(commentRepository.find).toHaveBeenNthCalledWith(3, {
      where: { acpId: "acp-1", credentialUsername: "reader" },
      order: { createdAt: "DESC" },
    });
  });

  it("creates comments and deletes existing comments", async () => {
    const created = await service.create({
      acpId: "acp-1",
      userId: "u-1",
      targetType: CommentTargetType.ITEM,
      targetId: "item-1",
      commentText: "hello",
    });

    expect(commentRepository.create).toHaveBeenCalled();
    expect(created).toEqual(
      expect.objectContaining({
        acpId: "acp-1",
        commentText: "hello",
      }),
    );

    commentRepository.findOne.mockResolvedValue({ id: "c-1" });
    await expect(service.delete("c-1")).resolves.toBeUndefined();
    expect(commentRepository.remove).toHaveBeenCalledWith({ id: "c-1" });
  });

  it("throws when deleting an unknown comment", async () => {
    commentRepository.findOne.mockResolvedValue(null);

    await expect(service.delete("missing")).rejects.toThrow(NotFoundException);
  });

  it("deletes by ACP and returns affected count", async () => {
    commentRepository.delete.mockResolvedValue({ affected: 4 });
    await expect(service.deleteByAcp("acp-1")).resolves.toBe(4);

    commentRepository.delete.mockResolvedValue({ affected: undefined });
    await expect(service.deleteByAcp("acp-2")).resolves.toBe(0);
  });

  it("exports comments with proper author fallback chains", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const spyByAcp = jest
      .spyOn(service, "findByAcp")
      .mockResolvedValueOnce([
        {
          targetType: CommentTargetType.ITEM,
          targetId: "item-1",
          commentText: "text",
          createdAt: date,
          user: { displayName: "Display Name", username: "user-a" },
          credentialUsername: "credential-a",
        } as any,
      ])
      .mockResolvedValueOnce([
        {
          targetType: CommentTargetType.ITEM,
          targetId: "item-2",
          commentText: "text-2",
          createdAt: date,
          user: null,
          credentialUsername: null,
        } as any,
      ]);

    const spyByUser = jest.spyOn(service, "findByUser").mockResolvedValue([
      {
        targetType: CommentTargetType.UNIT,
        targetId: "unit-1",
        commentText: "user text",
        createdAt: date,
        user: { username: "user-b" },
      } as any,
    ]);

    const all = await service.exportComments("acp-1");
    const user = await service.exportComments("acp-1", "u-1");
    const unknownAuthor = await service.exportComments("acp-1");

    expect(all[0].author).toBe("Display Name");
    expect(user[0].author).toBe("user-b");
    expect(unknownAuthor[0].author).toBe("Unknown");

    expect(spyByAcp).toHaveBeenCalledTimes(2);
    expect(spyByUser).toHaveBeenCalledWith("acp-1", "u-1");
  });

  it("exports comments by credential and prefers credential author", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    jest.spyOn(service, "findByCredential").mockResolvedValue([
      {
        targetType: CommentTargetType.ITEM,
        targetId: "item-1",
        commentText: "credential text",
        createdAt: date,
        credentialUsername: "reader-1",
        user: { displayName: "Should not win" },
      } as any,
    ]);

    const result = await service.exportCommentsByCredential(
      "acp-1",
      "reader-1",
    );

    expect(result[0].author).toBe("reader-1");
  });

  it("builds XLSX buffers for user and credential exports", async () => {
    jest.spyOn(service, "exportComments").mockResolvedValue([
      {
        targetType: CommentTargetType.ITEM,
        targetId: "item-1",
        comment: "row",
        author: "author",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ] as any);

    jest.spyOn(service, "exportCommentsByCredential").mockResolvedValue([
      {
        targetType: CommentTargetType.UNIT,
        targetId: "unit-1",
        comment: "row",
        author: "reader",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ] as any);

    const byUser = await service.exportCommentsXlsx("acp-1", "u-1");
    const byCredential = await service.exportCommentsXlsxByCredential(
      "acp-1",
      "reader-1",
    );

    expect(Buffer.isBuffer(byUser)).toBe(true);
    expect(Buffer.isBuffer(byCredential)).toBe(true);
    expect(byUser.length).toBeGreaterThan(0);
    expect(byCredential.length).toBeGreaterThan(0);
  });

  it("checks comment feature flags per target type", async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: false,
      },
    });
    await expect(
      service.isCommentingEnabled("acp-1", CommentTargetType.ITEM),
    ).resolves.toBe(false);

    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
      },
    });
    await expect(
      service.isCommentingEnabled("acp-1", CommentTargetType.ITEM),
    ).resolves.toBe(true);

    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.UNIT],
      },
    });
    await expect(
      service.isCommentingEnabled("acp-1", CommentTargetType.UNIT),
    ).resolves.toBe(true);
    await expect(
      service.isCommentingEnabled("acp-1", CommentTargetType.ITEM),
    ).resolves.toBe(false);
  });
});
