import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { AcpCapabilitiesService } from "../auth/capabilities/acp-capabilities.service";

@Injectable()
export class ReviewAccessGuard implements CanActivate {
  constructor(
    private readonly acpAccessGuard: AcpAccessGuard,
    private readonly capabilities: AcpCapabilitiesService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.acpAccessGuard.canActivate(context);
    const req = context.switchToHttp().getRequest();
    const grants = await this.capabilities.resolve(req);
    const read = req.method === "GET" || req.method === "HEAD";
    // Legacy bulk deletion is administrative; all own mutations require participation.
    const legacyDelete =
      req.method === "DELETE" &&
      context.getHandler().name === "deleteLegacyComments";
    if (
      grants.includes("review:participate") ||
      ((read || legacyDelete) && grants.includes("review:manage"))
    )
      return true;
    throw new ForbiddenException("Review-Zugriff ist nicht erlaubt");
  }
}
