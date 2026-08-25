import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { createHash } from "crypto";
import { Acp, Comment, CommentTargetType } from "../database/entities";
import { UnitParserService } from "../files/unit-parser.service";
import { FileCatalogCache } from "../files/file-catalog.cache";
import { getIndexUnits } from "../acp/acp-index.utils";
import {
  CommentActor,
  CommentVisibilityMode,
  ReviewPolicyService,
} from "./review-policy.service";

export { CommentActor, CommentVisibilityMode } from "./review-policy.service";

export interface CommentView {
  id: string;
  acpId: string;
  targetType: CommentTargetType;
  targetId: string;
  unitId: string | null;
  itemId: string | null;
  parentCommentId: string | null;
  parentVisible: boolean;
  commentText: string;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  isOwn: boolean;
  isDeleted: boolean;
}

export interface CommentThreadSnapshot {
  revision: string;
  visibilityMode: CommentVisibilityMode;
  comments: CommentView[];
}

interface ItemTargetResolution {
  unitId: string;
  itemId: string;
  legacyTargetIds: string[];
}

interface ItemCatalogEntry {
  unitId: string;
  itemId: string;
}

@Injectable()
export class CommentsService {
  private readonly itemCatalogCache = new Map<
    string,
    Promise<ItemCatalogEntry[]>
  >();
  private readonly maxItemCatalogCacheEntries = 100;

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly reviewPolicy: ReviewPolicyService,
    private readonly unitParserService: UnitParserService,
    private readonly fileCatalogCache: FileCatalogCache,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
  ) {}

  async findByAcp(acpId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId, deletedAt: IsNull() },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async findByUser(acpId: string, userId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId, userId, deletedAt: IsNull() },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async findByCredential(
    acpId: string,
    credentialId: string,
  ): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { acpId, credentialId, deletedAt: IsNull() },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async create(data: {
    acpId: string;
    userId?: string;
    credentialId?: string;
    credentialUsername?: string;
    authorLabel?: string;
    targetType: CommentTargetType;
    targetId: string;
    unitId?: string;
    itemId?: string;
    parentCommentId?: string;
    commentText: string;
  }): Promise<Comment> {
    const commentText = this.normalizeCommentText(data.commentText);
    const comment = this.commentRepository.create({
      ...data,
      commentText,
      version: 1,
    });
    return this.commentRepository.save(comment);
  }

  async getItemThread(
    acpId: string,
    unitId: string,
    itemId: string,
    actor: CommentActor,
  ): Promise<CommentThreadSnapshot> {
    const visibilityMode = await this.reviewPolicy.assertItemCommentAccess(
      acpId,
      actor,
    );
    const target = await this.resolveItemTarget(acpId, unitId, itemId);
    const comments = await this.commentRepository.find({
      where: [
        {
          acpId,
          targetType: CommentTargetType.ITEM,
          unitId: target.unitId,
          itemId: target.itemId,
        },
        ...target.legacyTargetIds.map((targetId) => ({
          acpId,
          targetType: CommentTargetType.ITEM,
          targetId,
          unitId: IsNull(),
        })),
      ],
      relations: ["user"],
      order: { createdAt: "ASC" },
    });

    const visibleComments = comments.filter(
      (comment) =>
        !comment.deletedAt &&
        this.reviewPolicy.canViewComment(visibilityMode, actor, comment),
    );
    const requiredDeletedParentIds = new Set(
      visibleComments
        .map((comment) => comment.parentCommentId)
        .filter((id): id is string => Boolean(id)),
    );
    const deletedParents = comments.filter(
      (comment) =>
        Boolean(comment.deletedAt) && requiredDeletedParentIds.has(comment.id),
    );
    const responseComments = [...visibleComments, ...deletedParents].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    const responseIds = new Set(responseComments.map((comment) => comment.id));

    return {
      revision: this.buildRevision(responseComments, visibilityMode),
      visibilityMode,
      comments: responseComments.map((comment) =>
        this.toCommentView(comment, actor, responseIds),
      ),
    };
  }

  async createItemComment(
    acpId: string,
    input: {
      unitId: string;
      itemId: string;
      commentText: string;
      parentCommentId?: string;
    },
    actor: CommentActor,
  ): Promise<CommentView> {
    const visibilityMode = await this.reviewPolicy.assertItemCommentAccess(
      acpId,
      actor,
    );
    const target = await this.resolveItemTarget(
      acpId,
      input.unitId,
      input.itemId,
    );

    let parentCommentId: string | undefined;
    if (input.parentCommentId) {
      const parent = await this.commentRepository.findOne({
        where: { id: input.parentCommentId, acpId },
      });
      if (
        !parent ||
        parent.deletedAt ||
        !this.matchesItemTarget(parent, target)
      ) {
        throw new NotFoundException("Reply target not found for this item");
      }
      this.reviewPolicy.assertCanReply(visibilityMode, actor, parent);
      parentCommentId = parent.parentCommentId || parent.id;
    }

    const comment = await this.create({
      acpId,
      userId: actor.userId,
      credentialId: actor.credentialId,
      credentialUsername: actor.credentialUsername,
      authorLabel: actor.authorLabel,
      targetType: CommentTargetType.ITEM,
      targetId: this.legacyItemTargetId(target.unitId, target.itemId),
      unitId: target.unitId,
      itemId: target.itemId,
      parentCommentId,
      commentText: input.commentText,
    });
    return this.toCommentView(comment, actor, new Set([comment.id]));
  }

  async updateOwnComment(
    acpId: string,
    commentId: string,
    commentText: string,
    version: number,
    actor: CommentActor,
  ): Promise<CommentView> {
    await this.reviewPolicy.assertItemCommentAccess(acpId, actor);
    const current = await this.findMutableComment(acpId, commentId, actor);
    const normalizedCommentText = this.normalizeCommentText(commentText);
    if (current.version !== version) {
      throw this.versionConflict(current, actor);
    }

    const updatedAt = new Date();
    const result = await this.commentRepository.update(
      { id: commentId, acpId, version, deletedAt: IsNull() },
      {
        commentText: normalizedCommentText,
        updatedAt,
        version: version + 1,
      },
    );
    if (!result.affected) {
      const latest = await this.commentRepository.findOne({
        where: { id: commentId, acpId },
        relations: ["user"],
      });
      if (!latest) throw new NotFoundException("Comment not found");
      throw this.versionConflict(latest, actor);
    }

    return this.toCommentView(
      {
        ...current,
        commentText: normalizedCommentText,
        updatedAt,
        version: version + 1,
      },
      actor,
      new Set([commentId]),
    );
  }

  async deleteOwnComment(
    acpId: string,
    commentId: string,
    version: number,
    actor: CommentActor,
  ): Promise<void> {
    await this.reviewPolicy.assertItemCommentAccess(acpId, actor);
    const current = await this.findMutableComment(acpId, commentId, actor);
    if (current.version !== version) {
      throw this.versionConflict(current, actor);
    }
    const result = await this.commentRepository.update(
      { id: commentId, acpId, version, deletedAt: IsNull() },
      {
        commentText: "",
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: version + 1,
      },
    );
    if (!result.affected) {
      const latest = await this.commentRepository.findOne({
        where: { id: commentId, acpId },
      });
      if (!latest) throw new NotFoundException("Comment not found");
      throw this.versionConflict(latest, actor);
    }
  }

  async deleteUnreferencedLegacyByAcp(
    acpId: string,
  ): Promise<{ deletedCount: number; retainedCount: number }> {
    const result = await this.commentRepository
      .createQueryBuilder()
      .delete()
      .from(Comment)
      .where('"acp_id" = :acpId', { acpId })
      .andWhere('"target_type" <> :itemTargetType', {
        itemTargetType: CommentTargetType.ITEM,
      })
      .andWhere('"unit_id" IS NULL')
      .andWhere('"item_id" IS NULL')
      .andWhere('"parent_comment_id" IS NULL')
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM "comments" child WHERE child."parent_comment_id" = "comments"."id")',
      )
      .execute();
    const retainedCount = await this.commentRepository.count({
      where: { acpId },
    });
    return {
      deletedCount: result.affected || 0,
      retainedCount,
    };
  }

  async exportComments(acpId: string, userId?: string): Promise<any[]> {
    const comments = userId
      ? await this.findByUser(acpId, userId)
      : await this.findByAcp(acpId);
    return comments.map((comment) => this.toExportRow(comment));
  }

  async exportCommentsByCredential(
    acpId: string,
    credentialId: string,
  ): Promise<any[]> {
    const comments = await this.findByCredential(acpId, credentialId);
    return comments.map((comment) => this.toExportRow(comment, true));
  }

  async exportCommentsXlsx(acpId: string, userId?: string): Promise<Buffer> {
    const data = await this.exportComments(acpId, userId);
    return this.buildXlsxBuffer(data);
  }

  async exportCommentsXlsxByCredential(
    acpId: string,
    credentialId: string,
  ): Promise<Buffer> {
    const data = await this.exportCommentsByCredential(acpId, credentialId);
    return this.buildXlsxBuffer(data);
  }

  private toExportRow(
    comment: Comment,
    preferCredential = false,
  ): Record<string, unknown> {
    return {
      targetType: comment.targetType,
      targetId: comment.targetId,
      unitId: comment.unitId || "",
      itemId: comment.itemId || "",
      threadId: comment.parentCommentId || comment.id,
      parentCommentId: comment.parentCommentId || "",
      comment: comment.commentText,
      author: preferCredential
        ? comment.authorLabel ||
          comment.credential?.username ||
          comment.credentialUsername ||
          this.resolveAuthorLabel(comment)
        : this.resolveAuthorLabel(comment),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: (comment.updatedAt || comment.createdAt).toISOString(),
    };
  }

  private async buildXlsxBuffer(data: any[]): Promise<Buffer> {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "IQB ContentPool";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Kommentare");
    sheet.columns = [
      { header: "Zieltyp", key: "targetType", width: 18 },
      { header: "Ziel-ID", key: "targetId", width: 25 },
      { header: "Unit-ID", key: "unitId", width: 22 },
      { header: "Item-ID", key: "itemId", width: 22 },
      { header: "Thread-ID", key: "threadId", width: 38 },
      { header: "Antwort auf", key: "parentCommentId", width: 38 },
      { header: "Kommentar", key: "comment", width: 50 },
      { header: "Autor", key: "author", width: 20 },
      { header: "Erstellt", key: "createdAt", width: 22 },
      { header: "Geändert", key: "updatedAt", width: 22 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A5276" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const row of data) sheet.addRow(row);
    sheet.getColumn("comment").alignment = {
      vertical: "top",
      wrapText: true,
    };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async isCommentingEnabled(
    acpId: string,
    targetType: CommentTargetType,
  ): Promise<boolean> {
    return this.reviewPolicy.isCommentingEnabled(acpId, targetType);
  }

  private async resolveItemTarget(
    acpId: string,
    unitId: string,
    requestedItemId: string,
  ): Promise<ItemTargetResolution> {
    const catalog = await this.getItemCatalog(acpId);
    const unitItems = catalog.filter((item) => item.unitId === unitId);
    const exactMatches = unitItems.filter(
      (item) => item.itemId === requestedItemId,
    );
    const matches = exactMatches.length
      ? exactMatches
      : unitItems.filter(
          (item) =>
            this.legacyItemTargetId(item.unitId, item.itemId) ===
            requestedItemId,
        );
    if (matches.length === 0) {
      throw new NotFoundException("Item not found in this ACP");
    }
    if (matches.length > 1) {
      throw new BadRequestException("Item ID is ambiguous in this unit");
    }

    const target = matches[0];
    const legacyTargetId = this.legacyItemTargetId(
      target.unitId,
      target.itemId,
    );
    const legacyTargetOwners = catalog.filter(
      (item) =>
        item.itemId === legacyTargetId ||
        this.legacyItemTargetId(item.unitId, item.itemId) === legacyTargetId,
    );
    const legacyTargetIsUnique = legacyTargetOwners.length === 1;

    return {
      ...target,
      legacyTargetIds: legacyTargetIsUnique ? [legacyTargetId] : [],
    };
  }

  private async getItemCatalog(acpId: string): Promise<ItemCatalogEntry[]> {
    const [fileCatalog, acp] = await Promise.all([
      this.fileCatalogCache.get(acpId),
      this.acpRepository.findOne({ where: { id: acpId } }),
    ]);
    const cacheKey = `${acpId}:${fileCatalog.signature}:${
      acp?.updatedAt?.toISOString() || "missing"
    }`;
    this.deleteStaleItemCatalogEntries(acpId, cacheKey);

    let catalogPromise = this.itemCatalogCache.get(cacheKey);
    if (!catalogPromise) {
      catalogPromise = this.buildItemCatalog(acpId, acp);
      if (this.itemCatalogCache.size >= this.maxItemCatalogCacheEntries) {
        const oldestKey = this.itemCatalogCache.keys().next().value as
          | string
          | undefined;
        if (oldestKey) this.itemCatalogCache.delete(oldestKey);
      }
      this.itemCatalogCache.set(cacheKey, catalogPromise);
    }

    try {
      return await catalogPromise;
    } catch (error) {
      this.itemCatalogCache.delete(cacheKey);
      throw error;
    }
  }

  private async buildItemCatalog(
    acpId: string,
    acp: Acp | null,
  ): Promise<ItemCatalogEntry[]> {
    const itemList = await this.unitParserService.getItemListFromFiles(acpId);
    const indexEntries: ItemCatalogEntry[] = [];
    for (const unit of getIndexUnits(acp?.acpIndex)) {
      const indexUnitId = String(unit?.id || "").trim();
      for (const item of Array.isArray(unit?.items) ? unit.items : []) {
        indexEntries.push({
          unitId: indexUnitId,
          itemId: String(item?.id || "").trim(),
        });
      }
    }
    const entries = [...indexEntries];
    const indexAliases = new Set<string>();
    for (const indexEntry of indexEntries) {
      indexAliases.add(
        this.itemCatalogKey(indexEntry.unitId, indexEntry.itemId),
      );
      indexAliases.add(
        this.itemCatalogKey(
          indexEntry.unitId,
          this.legacyItemTargetId(indexEntry.unitId, indexEntry.itemId),
        ),
      );
    }
    for (const item of itemList.items || []) {
      const parsedEntry = {
        unitId: String(item.unitId || "").trim(),
        itemId: String(item.itemId || "").trim(),
      };
      if (
        !indexAliases.has(
          this.itemCatalogKey(parsedEntry.unitId, parsedEntry.itemId),
        )
      ) {
        entries.push(parsedEntry);
      }
    }

    const unique = new Map<string, ItemCatalogEntry>();
    for (const entry of entries) {
      if (!entry.unitId || !entry.itemId) continue;
      unique.set(this.itemCatalogKey(entry.unitId, entry.itemId), entry);
    }
    return [...unique.values()];
  }

  private deleteStaleItemCatalogEntries(
    acpId: string,
    currentKey: string,
  ): void {
    const prefix = `${acpId}:`;
    for (const key of this.itemCatalogCache.keys()) {
      if (key.startsWith(prefix) && key !== currentKey) {
        this.itemCatalogCache.delete(key);
      }
    }
  }

  private itemCatalogKey(unitId: string, itemId: string): string {
    return `${unitId}\u0000${itemId}`;
  }

  private async findMutableComment(
    acpId: string,
    commentId: string,
    actor: CommentActor,
  ): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, acpId },
      relations: ["user"],
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException("Comment not found");
    }
    if (comment.targetType !== CommentTargetType.ITEM) {
      throw new NotFoundException("Item comment not found");
    }
    this.reviewPolicy.assertCanMutate(actor, comment);
    return comment;
  }

  private matchesItemTarget(
    comment: Comment,
    target: ItemTargetResolution,
  ): boolean {
    if (comment.targetType !== CommentTargetType.ITEM) return false;
    if (comment.unitId || comment.itemId) {
      return (
        comment.unitId === target.unitId && comment.itemId === target.itemId
      );
    }
    return target.legacyTargetIds.includes(comment.targetId);
  }

  private legacyItemTargetId(unitId: string, itemId: string): string {
    return `${unitId}_${itemId}`;
  }

  private toCommentView(
    comment: Comment,
    actor: CommentActor,
    visibleIds: Set<string>,
  ): CommentView {
    const deleted = Boolean(comment.deletedAt);
    return {
      id: comment.id,
      acpId: comment.acpId,
      targetType: comment.targetType,
      targetId: comment.targetId,
      unitId: comment.unitId || null,
      itemId: comment.itemId || null,
      parentCommentId: comment.parentCommentId || null,
      parentVisible:
        !comment.parentCommentId || visibleIds.has(comment.parentCommentId),
      commentText: deleted ? "" : comment.commentText,
      authorLabel: deleted ? "Gelöscht" : this.resolveAuthorLabel(comment),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: (comment.updatedAt || comment.createdAt).toISOString(),
      version: comment.version || 1,
      isOwn: !deleted && this.reviewPolicy.isOwnedBy(comment, actor),
      isDeleted: deleted,
    };
  }

  private resolveAuthorLabel(comment: Comment): string {
    return (
      comment.authorLabel ||
      comment.user?.displayName ||
      comment.user?.username ||
      comment.credential?.username ||
      comment.credentialUsername ||
      "Unknown"
    );
  }

  private buildRevision(
    comments: Comment[],
    visibilityMode: CommentVisibilityMode,
  ): string {
    const projection = comments
      .map(
        (comment) =>
          `${comment.id}:${comment.version || 1}:${comment.deletedAt?.toISOString() || ""}`,
      )
      .sort()
      .join("|");
    return createHash("sha256")
      .update(`${visibilityMode}|${projection}`, "utf8")
      .digest("hex");
  }

  private normalizeCommentText(commentText: string): string {
    const normalized = String(commentText || "").trim();
    if (!normalized) {
      throw new BadRequestException("Comment text is required");
    }
    if (normalized.length > 10_000) {
      throw new BadRequestException(
        "Comment text must not exceed 10000 characters",
      );
    }
    return normalized;
  }

  private versionConflict(
    comment: Comment,
    actor: CommentActor,
  ): ConflictException {
    return new ConflictException({
      code: "COMMENT_VERSION_CONFLICT",
      message: "The comment was changed by another request",
      current: this.toCommentView(comment, actor, new Set([comment.id])),
    });
  }
}
