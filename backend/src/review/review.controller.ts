import {
  BadRequestException,
  ConflictException,
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
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  Min,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsUUID,
  IsString,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { randomUUID } from "crypto";
import {
  AcpAccessConfig,
  AcpCredential,
  AcpUserRole,
} from "../database/entities";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { AcpCapabilitiesService } from "../auth/capabilities/acp-capabilities.service";
import { hasCapability } from "../auth/capabilities/acp-capabilities";
import { UuidParam } from "../common/uuid-param";
import { ReviewManifestService } from "./review-manifest.service";

class ReviewMemberDto {
  @IsIn(["user", "credential"]) kind!: "user" | "credential";
  @IsUUID() id!: string;
}
class ReviewGroupDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MaxLength(120) name!: string;
  @IsBoolean() archived!: boolean;
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ReviewMemberDto)
  members!: ReviewMemberDto[];
}
class ReviewConfigDto {
  @IsBoolean() enableReview!: boolean;
  @IsInt() @Min(1) configVersion!: number;
  @IsIn(["PRIVATE", "SHARED", "GROUP"]) visibilityMode!:
    | "PRIVATE"
    | "SHARED"
    | "GROUP";
  @IsOptional() @IsBoolean() confirmExistingComments?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReviewGroupDto)
  groups?: ReviewGroupDto[];
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
        grants.includes("review:manage") ||
        (config?.featureConfig?.enableReview === true &&
          grants.includes("review:participate")),
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
    return this.configs.manager.transaction(async (manager) => {
      const config = await manager.findOne(AcpAccessConfig, {
        where: { acpId },
        lock: { mode: "pessimistic_write" },
      });
      if (!config) throw new ForbiddenException("ACP-Konfiguration fehlt");
      if (config.reviewConfigVersion !== dto.configVersion)
        throw new ConflictException(
          "Die Review-Konfiguration wurde geändert. Bitte neu laden.",
        );
      const previousMode =
        config.featureConfig.commentVisibilityMode || "PRIVATE";
      if (
        dto.visibilityMode === "SHARED" &&
        previousMode !== "SHARED" &&
        dto.confirmExistingComments !== true
      ) {
        throw new BadRequestException(
          "Die Freigabe aller bestehenden Kommentare muss ausdrücklich bestätigt werden",
        );
      }
      if (dto.groups) {
        const previous = config.reviewGroups || [];
        const ids = new Set<string>();
        const next = [];
        for (const group of dto.groups) {
          const name = group.name.trim();
          if (!name) throw new BadRequestException("Gruppenname fehlt");
          if (group.id && !previous.some((entry) => entry.id === group.id))
            throw new BadRequestException("Unbekannte Review-Gruppe");
          const id = group.id || randomUUID();
          if (ids.has(id))
            throw new BadRequestException("Doppelte Review-Gruppe");
          ids.add(id);
          const previousMembers =
            previous.find((entry) => entry.id === id)?.members || [];
          const members = [];
          for (const member of group.members) {
            const exists =
              member.kind === "user"
                ? await manager.findOne(AcpUserRole, {
                    where: { acpId, userId: member.id },
                  })
                : await manager.findOne(AcpCredential, {
                    where: { accessConfigId: config.id, id: member.id },
                  });
            if (!exists) {
              // Deleted ACP identities may still occur in saved group JSON.
              // Drop historical references, but reject invalid new assignments.
              if (
                previousMembers.some(
                  (entry) =>
                    entry.kind === member.kind && entry.id === member.id,
                )
              )
                continue;
              throw new BadRequestException(
                "Gruppenmitglied gehört nicht zu diesem ACP",
              );
            }
            members.push(member);
          }
          next.push({ ...group, id, name, members });
        }
        if (previous.some((group) => !ids.has(group.id)))
          throw new BadRequestException(
            "Gruppen bitte archivieren statt entfernen",
          );
        config.reviewGroups = next;
      }
      if (dto.visibilityMode === "GROUP" && previousMode !== "GROUP") {
        config.featureConfig.ungroupedVisibilityMode = previousMode;
      }
      config.featureConfig = {
        ...config.featureConfig,
        enableReview: dto.enableReview,
        commentVisibilityMode: dto.visibilityMode,
      };
      config.reviewConfigVersion += 1;
      config.reviewRevision = (BigInt(config.reviewRevision) + 1n).toString();
      await manager.save(config);
      return this.configView(config);
    });
  }

  @Get("review/config")
  async getConfig(@UuidParam("acpId") acpId: string, @Request() req: any) {
    await this.capabilities.assert(req, "review:manage");
    const config = await this.configs.findOne({ where: { acpId } });
    if (!config) throw new ForbiddenException("ACP-Konfiguration fehlt");
    return this.configView(config);
  }

  @Get("review/members")
  async getMembers(@UuidParam("acpId") acpId: string, @Request() req: any) {
    await this.capabilities.assert(req, "review:manage");
    const config = await this.configs.findOne({ where: { acpId } });
    if (!config) throw new ForbiddenException("ACP-Konfiguration fehlt");
    const users = await this.configs.manager.find(AcpUserRole, {
      where: { acpId },
      relations: ["user"],
    });
    const credentials = await this.configs.manager.find(AcpCredential, {
      where: { accessConfigId: config.id },
    });
    return [
      ...users.map((role) => ({
        kind: "user",
        id: role.userId,
        label: role.user.displayName || role.user.username,
      })),
      ...credentials.map((credential) => ({
        kind: "credential",
        id: credential.id,
        label: credential.username,
      })),
    ];
  }

  private configView(config: AcpAccessConfig) {
    return {
      enableReview: config.featureConfig.enableReview === true,
      visibilityMode: config.featureConfig.commentVisibilityMode || "PRIVATE",
      configVersion: config.reviewConfigVersion,
      groups: config.reviewGroups || [],
    };
  }

  @Get("review")
  async getReview(@UuidParam("acpId") acpId: string, @Request() req: any) {
    const access = await this.getCapabilities(acpId, req);
    if (!access.canReview)
      throw new ForbiddenException("Review ist deaktiviert oder nicht erlaubt");
    return this.manifest.getManifest(acpId);
  }
}
