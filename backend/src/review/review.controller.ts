import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IsBoolean } from "class-validator";
import { AcpAccessConfig } from "../database/entities";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { AcpCapabilitiesService } from "../auth/capabilities/acp-capabilities.service";
import { hasCapability } from "../auth/capabilities/acp-capabilities";
import { UuidParam } from "../common/uuid-param";
import { ReviewManifestService } from "./review-manifest.service";

class ReviewConfigDto {
  @IsBoolean() enableReview!: boolean;
}
@Controller("view/acp/:acpId")
@UseGuards(AcpAccessGuard)
export class ReviewController {
  constructor(
    private readonly capabilities: AcpCapabilitiesService,
    private readonly manifest: ReviewManifestService,
    @InjectRepository(AcpAccessConfig)
    private readonly configs: Repository<AcpAccessConfig>,
  ) {}

  @Get("capabilities")
  async getCapabilities(
    @UuidParam("acpId") acpId: string,
    @Request() req: any,
  ) {
    const grants = await this.capabilities.resolve(req);
    const config = await this.configs.findOne({ where: { acpId } });
    return {
      capabilities: grants,
      canViewExplorer:
        hasCapability(grants, "item-explorer:view") ||
        (config?.accessModel === "PUBLIC" &&
          config.featureConfig?.enableItemList !== false),
      canEditExplorer: hasCapability(grants, "item-explorer:edit"),
      canReview:
        config?.featureConfig?.enableReview === true &&
        (grants.includes("review:participate") ||
          grants.includes("review:manage")),
      canManageReview: grants.includes("review:manage"),
      enableReview: config?.featureConfig?.enableReview === true,
    };
  }

  @Put("review/config")
  async configure(
    @UuidParam("acpId") acpId: string,
    @Body() dto: ReviewConfigDto,
    @Request() req: any,
  ) {
    await this.capabilities.assert(req, "review:manage");
    const config = await this.configs.findOne({ where: { acpId } });
    if (!config) throw new ForbiddenException("ACP-Konfiguration fehlt");
    config.featureConfig = {
      ...config.featureConfig,
      enableReview: dto.enableReview,
    };
    await this.configs.save(config);
    return { enableReview: dto.enableReview };
  }

  @Get("review")
  async getReview(@UuidParam("acpId") acpId: string, @Request() req: any) {
    const access = await this.getCapabilities(acpId, req);
    if (!access.canReview)
      throw new ForbiddenException("Review ist deaktiviert oder nicht erlaubt");
    return this.manifest.getManifest(acpId);
  }
}
