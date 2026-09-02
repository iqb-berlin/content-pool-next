import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, IsNull, Repository } from "typeorm";
import { createHash } from "crypto";
import { Acp, Comment, CommentTargetType } from "../database/entities";
import { UnitParserService } from "../files/unit-parser.service";
import { FileCatalogCache } from "../files/file-catalog.cache";
import { getAssessmentParts, getIndexUnits } from "../acp/acp-index.utils";
import { extractLabelText } from "../files/unit-file-parsing";
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

export interface ItemCommentCount {
  unitId: string;
  itemId: string;
  count: number;
}

export interface ItemCommentCountsSnapshot {
  revision: string;
  counts: ItemCommentCount[];
}

export interface ReviewCommentExportActor {
  userId?: string;
  credentialId?: string;
}

interface ItemTargetResolution {
  unitId: string;
  itemId: string;
  legacyTargetIds: string[];
}

interface ItemCatalogEntry {
  unitId: string;
  itemId: string;
  unitLabel: string;
  itemLabel: string;
  unitOrder: number;
  itemOrder: number;
}

interface ReviewBookletCatalogEntry {
  bookletId: string;
  bookletLabel: string;
  bookletOrder: number;
}

interface ReviewUnitCatalogEntry {
  unitId: string;
  unitLabel: string;
  unitOrder: number;
}

interface ReviewExportTarget {
  level: string;
  levelOrder: number;
  bookletId: string;
  bookletLabel: string;
  bookletOrder: number;
  unitId: string;
  unitLabel: string;
  unitOrder: number;
  itemId: string;
  itemLabel: string;
  itemOrder: number;
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

  async getItemCommentCounts(
    acpId: string,
    actor: CommentActor,
  ): Promise<ItemCommentCountsSnapshot> {
    const visibilityMode = await this.reviewPolicy.assertItemCommentAccess(
      acpId,
      actor,
    );
    const commentWhere: FindOptionsWhere<Comment> = {
      acpId,
      targetType: CommentTargetType.ITEM,
      deletedAt: IsNull(),
    };
    if (visibilityMode === "PRIVATE" && !actor.isManager) {
      if (actor.userId) commentWhere.userId = actor.userId;
      else if (actor.credentialId)
        commentWhere.credentialId = actor.credentialId;
    }
    const [comments, catalog] = await Promise.all([
      this.commentRepository.find({
        where: commentWhere,
      }),
      this.getItemCatalog(acpId),
    ]);
    const catalogByKey = new Map(
      catalog.map((entry) => [
        this.itemCatalogKey(entry.unitId, entry.itemId),
        entry,
      ]),
    );
    const legacyOwners = new Map<string, Set<string>>();
    for (const entry of catalog) {
      const key = this.itemCatalogKey(entry.unitId, entry.itemId);
      for (const alias of [
        entry.itemId,
        this.legacyItemTargetId(entry.unitId, entry.itemId),
      ]) {
        const owners = legacyOwners.get(alias) || new Set<string>();
        owners.add(key);
        legacyOwners.set(alias, owners);
      }
    }

    const counts = new Map<string, number>();
    for (const comment of comments) {
      if (!this.reviewPolicy.canViewComment(visibilityMode, actor, comment)) {
        continue;
      }
      let key =
        comment.unitId && comment.itemId
          ? this.itemCatalogKey(comment.unitId, comment.itemId)
          : "";
      if (!key) {
        const owners = legacyOwners.get(comment.targetId);
        key = owners?.size === 1 ? [...owners][0] : "";
      }
      if (!key || !catalogByKey.has(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const result = [...counts]
      .map(([key, count]) => {
        const entry = catalogByKey.get(key)!;
        return { unitId: entry.unitId, itemId: entry.itemId, count };
      })
      .sort(
        (left, right) =>
          left.unitId.localeCompare(right.unitId, undefined, {
            numeric: true,
          }) ||
          left.itemId.localeCompare(right.itemId, undefined, { numeric: true }),
      );
    return {
      revision: createHash("sha256")
        .update(JSON.stringify([visibilityMode, result]))
        .digest("hex"),
      counts: result,
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

  async exportReviewCommentsCsv(
    acpId: string,
    actor: ReviewCommentExportActor,
  ): Promise<Buffer> {
    const data = await this.getReviewExportRows(acpId, actor);
    const headers = this.reviewExportHeaders(false);
    const lines = [
      headers.map((header) => this.quoteCsvField(header.label)).join(";"),
      ...data.map((row) =>
        headers.map((header) => this.quoteCsvField(row[header.key])).join(";"),
      ),
    ];
    return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
  }

  async exportReviewCommentsXlsx(
    acpId: string,
    actor?: ReviewCommentExportActor,
  ): Promise<Buffer> {
    const data = await this.getReviewExportRows(acpId, actor);
    return this.buildReviewXlsxBuffer(data, !actor);
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

  private async getReviewExportRows(
    acpId: string,
    actor?: ReviewCommentExportActor,
  ): Promise<Array<Record<string, string>>> {
    if (actor && !actor.userId && !actor.credentialId) {
      throw new ForbiddenException("A stable review identity is required");
    }
    const commentsPromise = actor?.credentialId
      ? this.findByCredential(acpId, actor.credentialId)
      : actor?.userId
        ? this.findByUser(acpId, actor.userId)
        : this.findByAcp(acpId);
    const [comments, itemCatalog, acp] = await Promise.all([
      commentsPromise,
      this.getItemCatalog(acpId),
      this.acpRepository.findOne({ where: { id: acpId } }),
    ]);
    const bookletCatalog = this.buildReviewBookletCatalog(acp?.acpIndex);
    const unitCatalog = this.buildReviewUnitCatalog(acp?.acpIndex, itemCatalog);
    const resolved = comments.map((comment) => ({
      comment,
      target: this.resolveReviewExportTarget(
        comment,
        itemCatalog,
        bookletCatalog,
        unitCatalog,
      ),
    }));
    const sorted = resolved.sort((left, right) => {
      return (
        left.target.levelOrder - right.target.levelOrder ||
        left.target.bookletOrder - right.target.bookletOrder ||
        left.target.unitOrder - right.target.unitOrder ||
        left.target.itemOrder - right.target.itemOrder ||
        left.comment.createdAt.getTime() - right.comment.createdAt.getTime() ||
        left.comment.id.localeCompare(right.comment.id)
      );
    });
    return sorted.map(({ comment, target }) => ({
      level: target.level,
      bookletId: target.bookletId,
      bookletLabel: target.bookletLabel,
      unitId: target.unitId,
      unitLabel: target.unitLabel,
      itemId: target.itemId,
      itemLabel: target.itemLabel,
      threadId: comment.parentCommentId || comment.id,
      parentCommentId: comment.parentCommentId || "",
      comment: comment.commentText,
      author: this.resolveAuthorLabel(comment),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: (comment.updatedAt || comment.createdAt).toISOString(),
    }));
  }

  private reviewExportHeaders(includeAuthor: boolean) {
    const headers = [
      { key: "level", label: "Ebene", width: 18 },
      { key: "bookletId", label: "Booklet-ID", width: 24 },
      { key: "bookletLabel", label: "Booklet-Bezeichnung", width: 32 },
      { key: "unitId", label: "Unit-ID", width: 24 },
      { key: "unitLabel", label: "Unit-Bezeichnung", width: 32 },
      { key: "itemId", label: "Item-ID", width: 24 },
      { key: "itemLabel", label: "Item-Bezeichnung", width: 32 },
      { key: "threadId", label: "Thread-ID", width: 38 },
      { key: "parentCommentId", label: "Antwort auf", width: 38 },
      { key: "comment", label: "Kommentar", width: 55 },
      { key: "createdAt", label: "Erstellt", width: 22 },
      { key: "updatedAt", label: "Geändert", width: 22 },
    ];
    if (includeAuthor) {
      headers.splice(10, 0, { key: "author", label: "Autor", width: 22 });
    }
    return headers;
  }

  private quoteCsvField(value: unknown): string {
    const raw = String(value ?? "");
    const spreadsheetSafe = /^[\t\r]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
  }

  private async buildReviewXlsxBuffer(
    data: Array<Record<string, string>>,
    includeAuthor: boolean,
  ): Promise<Buffer> {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "IQB ContentPool";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Kommentare", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const headers = this.reviewExportHeaders(includeAuthor);
    sheet.columns = headers.map((header) => ({
      header: header.label,
      key: header.key,
      width: header.width,
    }));
    const headerRow = sheet.getRow(1);
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A5276" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const row of data) sheet.addRow(row);
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: headers.length },
    };
    sheet.getColumn("comment").alignment = {
      vertical: "top",
      wrapText: true,
    };
    return Buffer.from(await workbook.xlsx.writeBuffer());
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
    const indexUnits = getIndexUnits(acp?.acpIndex);
    for (const [unitOrder, unit] of indexUnits.entries()) {
      const indexUnitId = String(unit?.id || "").trim();
      const unitLabel =
        extractLabelText(unit?.name || unit?.label) ||
        String(unit?.description || indexUnitId).trim();
      const items = Array.isArray(unit?.items) ? unit.items : [];
      for (const [itemOrder, item] of items.entries()) {
        const itemId = String(item?.id || "").trim();
        indexEntries.push({
          unitId: indexUnitId,
          itemId,
          unitLabel,
          itemLabel:
            extractLabelText(item?.name || item?.label) ||
            String(item?.description || itemId).trim(),
          unitOrder,
          itemOrder,
        });
      }
    }
    const entries = [...indexEntries];
    const indexUnitOrders = new Map(
      indexUnits.map((unit, unitOrder) => [
        String(unit?.id || "").trim(),
        unitOrder,
      ]),
    );
    const indexAliases = new Map<string, ItemCatalogEntry | null>();
    for (const indexEntry of indexEntries) {
      for (const alias of [
        indexEntry.itemId,
        this.legacyItemTargetId(indexEntry.unitId, indexEntry.itemId),
      ]) {
        const aliasKey = this.itemCatalogKey(indexEntry.unitId, alias);
        indexAliases.set(
          aliasKey,
          indexAliases.has(aliasKey) ? null : indexEntry,
        );
      }
    }
    const parsedUnitOrders = new Map<string, number>();
    for (const [parsedOrder, item] of (itemList.items || []).entries()) {
      const parsedEntry = {
        unitId: String(item.unitId || "").trim(),
        itemId: String(item.itemId || "").trim(),
        unitLabel: String(item.unitLabel || item.unitId || "").trim(),
        itemLabel: String(item.description || item.itemId || "").trim(),
        unitOrder: 0,
        itemOrder: Number.isFinite(item.rowNumber)
          ? Number(item.rowNumber)
          : parsedOrder,
      };
      if (!parsedUnitOrders.has(parsedEntry.unitId)) {
        parsedUnitOrders.set(
          parsedEntry.unitId,
          indexUnits.length + parsedUnitOrders.size,
        );
      }
      parsedEntry.unitOrder =
        indexUnitOrders.get(parsedEntry.unitId) ??
        parsedUnitOrders.get(parsedEntry.unitId)!;
      const aliasKey = this.itemCatalogKey(
        parsedEntry.unitId,
        parsedEntry.itemId,
      );
      const indexEntry = indexAliases.get(aliasKey);
      if (indexAliases.has(aliasKey)) {
        if (
          indexEntry &&
          (!indexEntry.unitLabel || indexEntry.unitLabel === indexEntry.unitId)
        ) {
          indexEntry.unitLabel = parsedEntry.unitLabel;
        }
        if (
          indexEntry &&
          (!indexEntry.itemLabel || indexEntry.itemLabel === indexEntry.itemId)
        ) {
          indexEntry.itemLabel = parsedEntry.itemLabel;
        }
      } else {
        entries.push(parsedEntry);
      }
    }

    const unique = new Map<string, ItemCatalogEntry>();
    for (const entry of entries) {
      if (!entry.unitId || !entry.itemId) continue;
      const key = this.itemCatalogKey(entry.unitId, entry.itemId);
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, entry);
      } else {
        existing.unitOrder = Math.min(existing.unitOrder, entry.unitOrder);
        existing.itemOrder = Math.min(existing.itemOrder, entry.itemOrder);
        if (!existing.unitLabel) existing.unitLabel = entry.unitLabel;
        if (!existing.itemLabel) existing.itemLabel = entry.itemLabel;
      }
    }
    return [...unique.values()];
  }

  private buildReviewBookletCatalog(
    index: unknown,
  ): Map<string, ReviewBookletCatalogEntry> {
    const catalog = new Map<string, ReviewBookletCatalogEntry>();
    let bookletOrder = 0;
    for (const part of getAssessmentParts(index)) {
      const modules = Array.isArray(part?.bookletModules)
        ? part.bookletModules
        : [];
      for (const module of modules) {
        const bookletId = String(module?.id || "").trim();
        if (!bookletId || catalog.has(bookletId)) continue;
        catalog.set(bookletId, {
          bookletId,
          bookletLabel:
            extractLabelText(module?.name || module?.label) || bookletId,
          bookletOrder: bookletOrder++,
        });
      }
    }
    return catalog;
  }

  private buildReviewUnitCatalog(
    index: unknown,
    itemCatalog: ItemCatalogEntry[],
  ): Map<string, ReviewUnitCatalogEntry> {
    const catalog = new Map<string, ReviewUnitCatalogEntry>();
    for (const [unitOrder, unit] of getIndexUnits(index).entries()) {
      const unitId = String(unit?.id || "").trim();
      if (!unitId || catalog.has(unitId)) continue;
      catalog.set(unitId, {
        unitId,
        unitLabel:
          extractLabelText(unit?.name || unit?.label) ||
          String(unit?.description || unitId).trim(),
        unitOrder,
      });
    }
    for (const entry of itemCatalog) {
      if (catalog.has(entry.unitId)) continue;
      catalog.set(entry.unitId, {
        unitId: entry.unitId,
        unitLabel: entry.unitLabel,
        unitOrder: entry.unitOrder,
      });
    }
    return catalog;
  }

  private resolveReviewExportTarget(
    comment: Comment,
    itemCatalog: ItemCatalogEntry[],
    bookletCatalog: Map<string, ReviewBookletCatalogEntry>,
    unitCatalog: Map<string, ReviewUnitCatalogEntry>,
  ): ReviewExportTarget {
    const fallbackOrder = Number.MAX_SAFE_INTEGER;
    if (comment.targetType === CommentTargetType.TASK_SEQUENCE) {
      const booklet = bookletCatalog.get(comment.targetId);
      return {
        level: "Booklet (Legacy)",
        levelOrder: 0,
        bookletId: comment.targetId,
        bookletLabel: booklet?.bookletLabel || comment.targetId,
        bookletOrder: booklet?.bookletOrder ?? fallbackOrder,
        unitId: "",
        unitLabel: "",
        unitOrder: fallbackOrder,
        itemId: "",
        itemLabel: "",
        itemOrder: fallbackOrder,
      };
    }

    const unitId =
      comment.unitId ||
      (comment.targetType === CommentTargetType.UNIT ? comment.targetId : "");
    let itemEntry: ItemCatalogEntry | undefined;
    if (comment.targetType === CommentTargetType.ITEM) {
      const itemId = comment.itemId || "";
      if (unitId && itemId) {
        itemEntry = itemCatalog.find(
          (entry) => entry.unitId === unitId && entry.itemId === itemId,
        );
      } else {
        const candidates = itemCatalog.filter(
          (entry) =>
            entry.itemId === comment.targetId ||
            this.legacyItemTargetId(entry.unitId, entry.itemId) ===
              comment.targetId,
        );
        if (candidates.length === 1) itemEntry = candidates[0];
      }
    }
    const resolvedUnitId = itemEntry?.unitId || unitId;
    const unitEntry = unitCatalog.get(resolvedUnitId);
    const resolvedItemId =
      itemEntry?.itemId ||
      (comment.targetType === CommentTargetType.ITEM
        ? comment.itemId || comment.targetId
        : "");
    return {
      level: comment.targetType === CommentTargetType.UNIT ? "Unit" : "Item",
      levelOrder: 1,
      bookletId: "",
      bookletLabel: "",
      bookletOrder: fallbackOrder,
      unitId: resolvedUnitId,
      unitLabel: unitEntry?.unitLabel || itemEntry?.unitLabel || resolvedUnitId,
      unitOrder: unitEntry?.unitOrder ?? itemEntry?.unitOrder ?? fallbackOrder,
      itemId: resolvedItemId,
      itemLabel:
        comment.targetType === CommentTargetType.ITEM
          ? itemEntry?.itemLabel || resolvedItemId
          : "",
      itemOrder:
        comment.targetType === CommentTargetType.UNIT
          ? -1
          : (itemEntry?.itemOrder ?? fallbackOrder),
    };
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
