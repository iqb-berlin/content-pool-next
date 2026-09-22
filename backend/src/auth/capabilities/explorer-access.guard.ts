import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AcpAccessGuard } from "../guards/acp-access.guard";
import { AcpCapabilitiesService } from "./acp-capabilities.service";

@Injectable()
export class ExplorerReadGuard implements CanActivate {
  constructor(
    private readonly access: AcpAccessGuard,
    private readonly capabilities: AcpCapabilitiesService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.canActivate(context);
    await this.capabilities.assert(
      context.switchToHttp().getRequest(),
      "item-explorer:view",
      true,
    );
    return true;
  }
}
@Injectable()
export class ExplorerEditGuard implements CanActivate {
  constructor(
    private readonly access: AcpAccessGuard,
    private readonly capabilities: AcpCapabilitiesService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.canActivate(context);
    await this.capabilities.assert(
      context.switchToHttp().getRequest(),
      "item-explorer:edit",
    );
    return true;
  }
}
