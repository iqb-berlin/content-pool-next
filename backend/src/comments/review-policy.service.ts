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
      req.user?.isAppAdmin ||
      req.acpAccessLevel === "MANAGER" ||
      req.acpAccessLevel === "ADMIN",
    );
  }

  assertCanParticipateRequest(req: any): void {
    const currentAccessLevels = new Set([
      "ADMIN",
      "MANAGER",
      "READ_ONLY",
      "CREDENTIAL",
      "PUBLIC",
    ]);
    if (
      !req.user?.sub ||
      !currentAccessLevels.has(String(req.acpAccessLevel || ""))
    ) {
      throw new ForbiddenException("Authenticated review access required");
    }
  }

  async assertItemCommentAccess(
    acpId: string,
    actor: CommentActor,
  ): Promise<CommentVisibilityMode> {
    if (!actor.userId && !actor.credentialId) {
      throw new ForbiddenException("Authenticated review access required");
    }
    const featureConfig = await this.getFeatureConfig(acpId);
    const targets = this.commentTargets(featureConfig);
    if (
      !featureConfig.enableCommenting ||
      (targets.length > 0 && !targets.includes(CommentTargetType.ITEM))
    ) {
      throw new ForbiddenException(
        "Item comments are not enabled for this ACP",
      );
    }
    return featureConfig.commentVisibilityMode === "SHARED"
      ? "SHARED"
      : "PRIVATE";
  }

  async isCommentingEnabled(
    acpId: string,
    targetType: CommentTargetType,
  ): Promise<boolean> {
    const featureConfig = await this.getFeatureConfig(acpId);
    if (!featureConfig.enableCommenting) return false;
    const targets = this.commentTargets(featureConfig);
    return targets.length === 0 || targets.includes(targetType);
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
}
