import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { ReviewPolicyService } from "./review-policy.service";

/**
 * Stable access boundary for review routes. Ticket #60 can replace the
 * delegated ACP access decision here without changing review controllers.
 */
@Injectable()
export class ReviewAccessGuard implements CanActivate {
  constructor(
    private readonly acpAccessGuard: AcpAccessGuard,
    private readonly reviewPolicy: ReviewPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.acpAccessGuard.canActivate(context);
    const request = context.switchToHttp().getRequest();
    this.reviewPolicy.assertCanParticipateRequest(request);
    return true;
  }
}
