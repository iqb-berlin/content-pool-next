import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AcpAccessConfig,
  Comment,
  CommentTargetType,
} from "../database/entities";

export type CommentVisibilityMode = "PRIVATE" | "SHARED";

export interface CommentActor {
  userId?: string;
  credentialId?: string;
  credentialUsername?: string;
  authorLabel: string;
  isManager: boolean;
}

/**
 * Temporary policy boundary for the current ACP access model.
 * Ticket #60 can replace these decisions with review capabilities without
 * changing the comment API or persistence service.
 */
@Injectable()
export class ReviewPolicyService {
  constructor(
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
  ) {}

  resolveActor(req: any): CommentActor {
    const credential = req.user?.type === "credential";
    return {
      userId: credential ? undefined : req.user?.sub,
      credentialId: credential ? req.user?.sub : undefined,
      credentialUsername: credential ? req.user?.username : undefined,
      authorLabel:
        String(req.user?.username || "Unbekannt").trim() || "Unbekannt",
      isManager: this.isManagerRequest(req),
    };
  }

  isManagerRequest(req: any): boolean {
    return Boolean(
      req.user?.isAppAdmin || req.acpCapabilities?.includes("review:manage"),
    );
  }

  assertCanParticipateRequest(req: any): void {
    if (
      !req.user?.sub ||
      !req.acpCapabilities?.includes("review:participate")
    ) {
      throw new ForbiddenException("Review-Teilnahme ist nicht erlaubt");
    }
  }

  async assertItemCommentAccess(
    acpId: string,
    actor: CommentActor,
  ): Promise<CommentVisibilityMode> {
    return this.assertCommentAccess(acpId, actor, CommentTargetType.ITEM);
  }

  async assertCommentAccess(
    acpId: string,
    actor: CommentActor,
    targetType: CommentTargetType,
  ): Promise<CommentVisibilityMode> {
    if (!actor.userId && !actor.credentialId) {
      throw new ForbiddenException("Authenticated review access required");
    }
    if (targetType === CommentTargetType.TASK_SEQUENCE) {
      throw new ForbiddenException("Legacy comments are read-only");
    }
    const featureConfig = await this.getFeatureConfig(acpId);
    const targets = this.commentTargets(featureConfig);
    if (
      !featureConfig.enableCommenting ||
      !this.isTargetEnabled(targets, targetType)
    ) {
      throw new ForbiddenException(
        `${targetType} comments are not enabled for this ACP`,
      );
    }
    return featureConfig.commentVisibilityMode === "SHARED"
      ? "SHARED"
      : "PRIVATE";
  }

  async assertItemAndCodingCountAccess(
    acpId: string,
    actor: CommentActor,
  ): Promise<{
    visibilityMode: CommentVisibilityMode;
    targetTypes: CommentTargetType[];
  }> {
    if (!actor.userId && !actor.credentialId) {
      throw new ForbiddenException("Authenticated review access required");
    }
    const featureConfig = await this.getFeatureConfig(acpId);
    const configured = this.commentTargets(featureConfig);
    const targetTypes = [
      CommentTargetType.ITEM,
      CommentTargetType.CODING,
    ].filter((target) => this.isTargetEnabled(configured, target));
    if (!featureConfig.enableCommenting || targetTypes.length === 0) {
      throw new ForbiddenException(
        "Item and coding comments are not enabled for this ACP",
      );
    }
    return {
      visibilityMode:
        featureConfig.commentVisibilityMode === "SHARED" ? "SHARED" : "PRIVATE",
      targetTypes,
    };
  }

  async isCommentingEnabled(
    acpId: string,
    targetType: CommentTargetType,
  ): Promise<boolean> {
    const featureConfig = await this.getFeatureConfig(acpId);
    if (!featureConfig.enableCommenting) return false;
    const targets = this.commentTargets(featureConfig);
    return this.isTargetEnabled(targets, targetType);
  }

  canViewComment(
    visibilityMode: CommentVisibilityMode,
    actor: CommentActor,
    comment: Comment,
  ): boolean {
    return (
      visibilityMode === "SHARED" ||
      actor.isManager ||
      this.isOwnedBy(comment, actor)
    );
  }

  assertCanReply(
    visibilityMode: CommentVisibilityMode,
    actor: CommentActor,
    parent: Comment,
  ): void {
    if (!this.canViewComment(visibilityMode, actor, parent)) {
      throw new ForbiddenException(
        "Replies are only allowed for visible comments",
      );
    }
  }

  assertCanMutate(actor: CommentActor, comment: Comment): void {
    if (!this.isOwnedBy(comment, actor)) {
      throw new ForbiddenException("Only the author may change this comment");
    }
  }

  isOwnedBy(comment: Comment, actor: CommentActor): boolean {
    if (actor.userId && comment.userId) return actor.userId === comment.userId;
    if (actor.credentialId && comment.credentialId) {
      return actor.credentialId === comment.credentialId;
    }
    return false;
  }

  private async getFeatureConfig(
    acpId: string,
  ): Promise<Record<string, unknown>> {
    const config = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    return (config?.featureConfig || {}) as Record<string, unknown>;
  }

  private commentTargets(featureConfig: Record<string, unknown>): string[] {
    return Array.isArray(featureConfig.commentTargets)
      ? (featureConfig.commentTargets as string[])
      : [];
  }

  private isTargetEnabled(
    targets: string[],
    targetType: CommentTargetType,
  ): boolean {
    if (targets.length > 0) return targets.includes(targetType);
    return ![CommentTargetType.BOOKLET, CommentTargetType.CODING].includes(
      targetType,
    );
  }
}
