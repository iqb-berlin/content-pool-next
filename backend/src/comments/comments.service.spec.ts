import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { CommentTargetType } from "../database/entities";
import { ReviewPolicyService } from "./review-policy.service";

describe("CommentsService", () => {
  let service: CommentsService;
  let commentRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let deleteQueryBuilder: any;
  let accessConfigRepository: { findOne: jest.Mock };
  let unitParserService: { getItemListFromFiles: jest.Mock };
  let fileCatalogCache: { get: jest.Mock };
  let acpRepository: { findOne: jest.Mock };

  beforeEach(() => {
    deleteQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    commentRepository = {
      find: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((value) => ({ id: "c-1", ...value })),
      save: jest.fn().mockImplementation(async (value) => value),
      findOne: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(deleteQueryBuilder),
    };

    accessConfigRepository = {
      findOne: jest.fn(),
    };
    unitParserService = {
      getItemListFromFiles: jest.fn().mockResolvedValue({
        items: [{ unitId: "unit-1", itemId: "item-1" }],
      }),
    };
    fileCatalogCache = {
      get: jest.fn().mockResolvedValue({ signature: "files-v1" }),
    };
    acpRepository = {
      findOne: jest.fn().mockResolvedValue({
        acpIndex: null,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    };

    service = new CommentsService(
      commentRepository as any,
      new ReviewPolicyService(accessConfigRepository as any),
      unitParserService as any,
      fileCatalogCache as any,
      acpRepository as any,
    );
  });

  it("queries comments by ACP, user and credential", async () => {
    commentRepository.find.mockResolvedValue([{ id: "c-1" }]);

    await expect(service.findByAcp("acp-1")).resolves.toEqual([{ id: "c-1" }]);
    await expect(service.findByUser("acp-1", "u-1")).resolves.toEqual([
      { id: "c-1" },
    ]);
    await expect(
      service.findByCredential("acp-1", "credential-1"),
    ).resolves.toEqual([{ id: "c-1" }]);

    expect(commentRepository.find).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ acpId: "acp-1" }),
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
    expect(commentRepository.find).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ acpId: "acp-1", userId: "u-1" }),
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
    expect(commentRepository.find).toHaveBeenNthCalledWith(3, {
      where: expect.objectContaining({
        acpId: "acp-1",
        credentialId: "credential-1",
      }),
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  });

  it("creates comments", async () => {
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
  });

  it("rejects blank comment text without relying on controller validation", async () => {
    await expect(
      service.create({
        acpId: "acp-1",
        targetType: CommentTargetType.ITEM,
        targetId: "unit-1_item-1",
        commentText: "   ",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it("deletes only unreferenced legacy non-item comments by ACP", async () => {
    deleteQueryBuilder.execute.mockResolvedValueOnce({ affected: 4 });
    commentRepository.count.mockResolvedValueOnce(7);
    await expect(
      service.deleteUnreferencedLegacyByAcp("acp-1"),
    ).resolves.toEqual({ deletedCount: 4, retainedCount: 7 });

    expect(deleteQueryBuilder.where).toHaveBeenCalledWith('"acp_id" = :acpId', {
      acpId: "acp-1",
    });
    expect(deleteQueryBuilder.andWhere).toHaveBeenCalledWith(
      '"target_type" <> :itemTargetType',
      { itemTargetType: CommentTargetType.ITEM },
    );
    expect(deleteQueryBuilder.andWhere).toHaveBeenCalledWith(
      '"unit_id" IS NULL',
    );
    expect(deleteQueryBuilder.andWhere).toHaveBeenCalledWith(
      '"item_id" IS NULL',
    );
    expect(deleteQueryBuilder.andWhere).toHaveBeenCalledWith(
      '"parent_comment_id" IS NULL',
    );
    expect(deleteQueryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("NOT EXISTS"),
    );

    deleteQueryBuilder.execute.mockResolvedValueOnce({ affected: undefined });
    commentRepository.count.mockResolvedValueOnce(2);
    await expect(
      service.deleteUnreferencedLegacyByAcp("acp-2"),
    ).resolves.toEqual({ deletedCount: 0, retainedCount: 2 });
    expect(commentRepository.count).toHaveBeenNthCalledWith(1, {
      where: { acpId: "acp-1" },
    });
    expect(commentRepository.count).toHaveBeenNthCalledWith(2, {
      where: { acpId: "acp-2" },
    });
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
      "credential-1",
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
      "credential-1",
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

  it("returns shared item threads and keeps private replies without leaking parents", async () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const root = {
      id: "root",
      acpId: "acp-1",
      userId: "other",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      unitId: "unit-1",
      itemId: "item-1",
      parentCommentId: null,
      commentText: "Root",
      authorLabel: "AB",
      createdAt,
      updatedAt: createdAt,
      version: 1,
    } as any;
    const reply = {
      ...root,
      id: "reply",
      userId: "me",
      parentCommentId: "root",
      commentText: "Reply",
      authorLabel: "ME",
      createdAt: new Date("2026-01-01T11:00:00.000Z"),
      updatedAt: new Date("2026-01-01T11:00:00.000Z"),
    };
    commentRepository.find.mockResolvedValue([root, reply]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    const shared = await service.getItemThread(
      "acp-1",
      "unit-1",
      "item-1",
      actor,
    );
    expect(shared.comments).toHaveLength(2);
    expect(shared.comments[1]).toMatchObject({
      id: "reply",
      isOwn: true,
      parentVisible: true,
    });

    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "PRIVATE",
      },
    });
    const privateSnapshot = await service.getItemThread(
      "acp-1",
      "unit-1",
      "item-1",
      actor,
    );
    expect(privateSnapshot.comments).toEqual([
      expect.objectContaining({ id: "reply", parentVisible: false }),
    ]);
  });

  it("does not transfer comment ownership to a recreated credential with the same username", async () => {
    const date = new Date("2026-01-01T10:00:00.000Z");
    commentRepository.find.mockResolvedValue([
      {
        id: "old-comment",
        acpId: "acp-1",
        credentialId: "old-credential-id",
        credentialUsername: "reviewer",
        targetType: CommentTargetType.ITEM,
        targetId: "unit-1_item-1",
        unitId: "unit-1",
        itemId: "item-1",
        commentText: "Old owner",
        createdAt: date,
        updatedAt: date,
        version: 1,
      },
    ]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "PRIVATE",
      },
    });

    const snapshot = await service.getItemThread("acp-1", "unit-1", "item-1", {
      credentialId: "new-credential-id",
      credentialUsername: "reviewer",
      authorLabel: "RE",
      isManager: false,
    });

    expect(snapshot.comments).toEqual([]);
  });

  it("creates one-level replies for existing items with stable credential ownership", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    commentRepository.findOne.mockResolvedValue({
      id: "reply-1",
      acpId: "acp-1",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      unitId: "unit-1",
      itemId: "item-1",
      parentCommentId: "root-1",
    });
    commentRepository.save.mockImplementation(async (value) => ({
      ...value,
      createdAt: date,
      updatedAt: date,
    }));

    const result = await service.createItemComment(
      "acp-1",
      {
        unitId: "unit-1",
        itemId: "item-1",
        parentCommentId: "reply-1",
        commentText: " Antwort ",
      },
      {
        credentialId: "cred-1",
        credentialUsername: "reader",
        authorLabel: "RE",
        isManager: false,
      },
    );

    expect(unitParserService.getItemListFromFiles).toHaveBeenCalledWith(
      "acp-1",
    );
    expect(commentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: "cred-1",
        unitId: "unit-1",
        itemId: "item-1",
        parentCommentId: "root-1",
        commentText: "Antwort",
      }),
    );
    expect(result).toMatchObject({ isOwn: true, parentCommentId: "root-1" });
  });

  it("rejects replies to a foreign comment after switching to private visibility", async () => {
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "PRIVATE",
      },
    });
    commentRepository.findOne.mockResolvedValue({
      id: "foreign-root",
      acpId: "acp-1",
      userId: "other",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      unitId: "unit-1",
      itemId: "item-1",
      parentCommentId: null,
    });

    await expect(
      service.createItemComment(
        "acp-1",
        {
          unitId: "unit-1",
          itemId: "item-1",
          parentCommentId: "foreign-root",
          commentText: "Hidden reply",
        },
        { userId: "me", authorLabel: "ME", isManager: false },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it("builds private revisions only from the comments visible to the actor", async () => {
    const date = new Date("2026-01-01T10:00:00.000Z");
    const own = {
      id: "own",
      acpId: "acp-1",
      userId: "me",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      unitId: "unit-1",
      itemId: "item-1",
      parentCommentId: null,
      commentText: "Own",
      createdAt: date,
      updatedAt: date,
      version: 1,
    } as any;
    const hidden = {
      ...own,
      id: "hidden",
      userId: "other",
      commentText: "Hidden",
    };
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "PRIVATE",
      },
    });
    commentRepository.find
      .mockResolvedValueOnce([own, hidden])
      .mockResolvedValueOnce([
        own,
        {
          ...hidden,
          version: 2,
          updatedAt: new Date("2026-01-01T10:00:00.001Z"),
        },
      ]);
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    const before = await service.getItemThread(
      "acp-1",
      "unit-1",
      "item-1",
      actor,
    );
    const after = await service.getItemThread(
      "acp-1",
      "unit-1",
      "item-1",
      actor,
    );

    expect(before.comments.map((comment) => comment.id)).toEqual(["own"]);
    expect(after.revision).toBe(before.revision);
  });

  it("does not assign ambiguous raw legacy target IDs to an item thread", async () => {
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [{ unitId: "unit-1", itemId: "01" }],
    });
    commentRepository.find.mockResolvedValue([]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });

    await service.getItemThread("acp-1", "unit-1", "01", {
      userId: "me",
      authorLabel: "ME",
      isManager: false,
    });

    const where = commentRepository.find.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitId: "unit-1", itemId: "01" }),
        expect.objectContaining({ targetId: "unit-1_01" }),
      ]),
    );
    expect(where).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ targetId: "01" })]),
    );
    expect(where).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "unit-101" }),
      ]),
    );
  });

  it("normalizes raw and prefixed IDs to the same typed item target", async () => {
    commentRepository.find.mockResolvedValue([]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });

    await service.getItemThread("acp-1", "unit-1", "item-1", {
      userId: "me",
      authorLabel: "ME",
      isManager: false,
    });
    await service.getItemThread("acp-1", "unit-1", "unit-1_item-1", {
      userId: "me",
      authorLabel: "ME",
      isManager: false,
    });

    for (const call of commentRepository.find.mock.calls) {
      expect(call[0].where[0]).toEqual(
        expect.objectContaining({ unitId: "unit-1", itemId: "item-1" }),
      );
    }
    expect(unitParserService.getItemListFromFiles).toHaveBeenCalledTimes(1);
  });

  it("prefers an exact item ID over another item's colliding legacy alias", async () => {
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        { unitId: "U", itemId: "I" },
        { unitId: "U", itemId: "U_I" },
      ],
    });
    commentRepository.find.mockResolvedValue([]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    await service.getItemThread("acp-1", "U", "U_I", actor);
    await service.getItemThread("acp-1", "U", "I", actor);

    expect(commentRepository.find.mock.calls[0][0].where).toEqual([
      expect.objectContaining({ unitId: "U", itemId: "U_I" }),
      expect.objectContaining({ targetId: "U_U_I" }),
    ]);
    expect(commentRepository.find.mock.calls[1][0].where).toEqual([
      expect.objectContaining({ unitId: "U", itemId: "I" }),
    ]);
  });

  it("rebuilds the item catalog when the file signature changes", async () => {
    commentRepository.find.mockResolvedValue([]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    fileCatalogCache.get
      .mockResolvedValueOnce({ signature: "files-v1" })
      .mockResolvedValueOnce({ signature: "files-v2" });
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    await service.getItemThread("acp-1", "unit-1", "item-1", actor);
    await service.getItemThread("acp-1", "unit-1", "item-1", actor);

    expect(unitParserService.getItemListFromFiles).toHaveBeenCalledTimes(2);
  });

  it("does not attach a colliding legacy target ID to either typed item", async () => {
    unitParserService.getItemListFromFiles.mockResolvedValue({
      items: [
        { unitId: "a_b", itemId: "c" },
        { unitId: "a", itemId: "b_c" },
      ],
    });
    commentRepository.find.mockResolvedValue([]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    await service.getItemThread("acp-1", "a_b", "c", actor);
    await service.getItemThread("acp-1", "a", "b_c", actor);

    expect(commentRepository.find.mock.calls[0][0].where).toEqual([
      expect.objectContaining({ unitId: "a_b", itemId: "c" }),
    ]);
    expect(commentRepository.find.mock.calls[1][0].where).toEqual([
      expect.objectContaining({ unitId: "a", itemId: "b_c" }),
    ]);
  });

  it("accepts an item from the canonical ACP index when no parsed file row exists", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "SHARED",
      },
    });
    unitParserService.getItemListFromFiles.mockResolvedValue({ items: [] });
    acpRepository.findOne.mockResolvedValue({
      acpIndex: {
        assessmentParts: [
          { units: [{ id: "unit-1", items: [{ id: "item-1" }] }] },
        ],
      },
    });
    commentRepository.save.mockImplementation(async (value) => ({
      ...value,
      createdAt: date,
      updatedAt: date,
    }));

    await expect(
      service.createItemComment(
        "acp-1",
        {
          unitId: "unit-1",
          itemId: "unit-1_item-1",
          commentText: "Index item",
        },
        { userId: "me", authorLabel: "ME", isManager: false },
      ),
    ).resolves.toMatchObject({
      commentText: "Index item",
      unitId: "unit-1",
      itemId: "item-1",
    });
  });

  it("keeps a deleted root as a neutral tombstone when its reply is visible", async () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const root = {
      id: "root",
      acpId: "acp-1",
      userId: "other",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      unitId: "unit-1",
      itemId: "item-1",
      parentCommentId: null,
      commentText: "",
      authorLabel: "Other",
      createdAt,
      updatedAt: createdAt,
      deletedAt: new Date("2026-01-01T11:00:00.000Z"),
      version: 2,
    } as any;
    const reply = {
      ...root,
      id: "reply",
      userId: "me",
      parentCommentId: "root",
      commentText: "Still visible",
      authorLabel: "ME",
      deletedAt: null,
      createdAt: new Date("2026-01-01T10:30:00.000Z"),
      updatedAt: new Date("2026-01-01T10:30:00.000Z"),
      version: 1,
    };
    commentRepository.find.mockResolvedValue([root, reply]);
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        enableCommenting: true,
        commentTargets: [CommentTargetType.ITEM],
        commentVisibilityMode: "PRIVATE",
      },
    });

    const snapshot = await service.getItemThread("acp-1", "unit-1", "item-1", {
      userId: "me",
      authorLabel: "ME",
      isManager: false,
    });

    expect(snapshot.comments).toEqual([
      expect.objectContaining({
        id: "root",
        commentText: "",
        authorLabel: "Gelöscht",
        isDeleted: true,
        isOwn: false,
      }),
      expect.objectContaining({
        id: "reply",
        parentCommentId: "root",
        parentVisible: true,
        isDeleted: false,
      }),
    ]);
  });

  it("prevents foreign edits and reports stale own edits as conflicts", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: { enableCommenting: true, commentTargets: ["ITEM"] },
    });
    commentRepository.findOne.mockResolvedValue({
      id: "c-1",
      acpId: "acp-1",
      userId: "other",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      commentText: "Text",
      authorLabel: "OT",
      createdAt: date,
      updatedAt: date,
      version: 2,
    });

    await expect(
      service.updateOwnComment("acp-1", "c-1", "Neu", 2, {
        userId: "me",
        authorLabel: "ME",
        isManager: true,
      }),
    ).rejects.toThrow(ForbiddenException);

    commentRepository.findOne.mockResolvedValue({
      id: "c-1",
      acpId: "acp-1",
      userId: "me",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      commentText: "Text",
      authorLabel: "ME",
      createdAt: date,
      updatedAt: date,
      version: 2,
    });
    await expect(
      service.updateOwnComment("acp-1", "c-1", "Neu", 1, {
        userId: "me",
        authorLabel: "ME",
        isManager: false,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("does not let the item-thread endpoint mutate another comment target", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: { enableCommenting: true, commentTargets: ["ITEM"] },
    });
    commentRepository.findOne.mockResolvedValue({
      id: "unit-comment",
      acpId: "acp-1",
      userId: "me",
      targetType: CommentTargetType.UNIT,
      targetId: "unit-1",
      commentText: "Text",
      createdAt: date,
      updatedAt: date,
      version: 1,
    });

    await expect(
      service.updateOwnComment("acp-1", "unit-comment", "Neu", 1, {
        userId: "me",
        authorLabel: "ME",
        isManager: false,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(commentRepository.update).not.toHaveBeenCalled();
  });

  it("updates and soft-deletes own comments with the expected version", async () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const ownComment = {
      id: "c-1",
      acpId: "acp-1",
      userId: "me",
      targetType: CommentTargetType.ITEM,
      targetId: "unit-1_item-1",
      commentText: "Text",
      authorLabel: "ME",
      createdAt: date,
      updatedAt: date,
      version: 1,
    } as any;
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: { enableCommenting: true, commentTargets: ["ITEM"] },
    });
    commentRepository.findOne.mockResolvedValue(ownComment);
    commentRepository.update.mockResolvedValue({ affected: 1 });
    const actor = { userId: "me", authorLabel: "ME", isManager: false };

    await expect(
      service.updateOwnComment("acp-1", "c-1", " Neu ", 1, actor),
    ).resolves.toMatchObject({ commentText: "Neu", version: 2 });
    await expect(
      service.deleteOwnComment("acp-1", "c-1", 1, actor),
    ).resolves.toBeUndefined();
    expect(commentRepository.update).toHaveBeenCalledTimes(2);
    expect(commentRepository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "c-1", acpId: "acp-1", version: 1 }),
      expect.objectContaining({ commentText: "", version: 2 }),
    );
  });
});
