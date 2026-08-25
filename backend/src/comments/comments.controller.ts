import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  Res,
  ForbiddenException,
} from "@nestjs/common";
import { Response } from "express";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { CommentsService } from "./comments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { CommentTargetType } from "../database/entities";
import { IsString, IsNotEmpty, IsEnum, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { UuidParam } from "../common/uuid-param";
import { ReviewPolicyService } from "./review-policy.service";

export class CreateCommentDto {
  @ApiProperty({ enum: CommentTargetType })
  @IsEnum(CommentTargetType)
  targetType!: CommentTargetType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  commentText!: string;
}

@ApiTags("Comments")
@Controller("acp/:acpId/comments")
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly reviewPolicy: ReviewPolicyService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all comments for an ACP (Manager only)" })
  async findAll(@UuidParam("acpId") acpId: string, @Request() req: any) {
    this.assertManagerAccess(req);
    return this.commentsService.findByAcp(acpId);
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List my comments for an ACP" })
  async findMine(@UuidParam("acpId") acpId: string, @Request() req: any) {
    if (req.user.type === "credential") {
      return this.commentsService.findByCredential(acpId, req.user.sub);
    }
    return this.commentsService.findByUser(acpId, req.user.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a comment" })
  async create(
    @UuidParam("acpId") acpId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    const isManager = this.reviewPolicy.isManagerRequest(req);
    if (!isManager) {
      const enabled = await this.commentsService.isCommentingEnabled(
        acpId,
        dto.targetType,
      );
      if (!enabled) {
        throw new ForbiddenException(
          "Commenting is not enabled for this ACP or target type",
        );
      }
    }

    return this.commentsService.create({
      acpId,
      userId: req.user.type === "oidc" ? req.user.sub : undefined,
      credentialId: req.user.type === "credential" ? req.user.sub : undefined,
      credentialUsername:
        req.user.type === "credential" ? req.user.username : undefined,
      authorLabel: req.user.username,
      targetType: dto.targetType,
      targetId: dto.targetId,
      commentText: dto.commentText,
    });
  }

  @Delete()
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete unreferenced legacy comments for an ACP (Manager only)",
  })
  async deleteLegacyComments(
    @UuidParam("acpId") acpId: string,
    @Request() req: any,
  ) {
    this.assertManagerAccess(req);
    const result =
      await this.commentsService.deleteUnreferencedLegacyByAcp(acpId);
    return {
      message: `${result.deletedCount} legacy comments deleted; ${result.retainedCount} comments retained`,
      ...result,
      scope: "UNREFERENCED_LEGACY_NON_ITEM",
    };
  }

  @Get("export")
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Export comments as JSON" })
  async exportComments(@UuidParam("acpId") acpId: string, @Request() req: any) {
    if (this.reviewPolicy.isManagerRequest(req)) {
      return this.commentsService.exportComments(acpId);
    }
    if (req.user.type === "credential") {
      return this.commentsService.exportCommentsByCredential(
        acpId,
        req.user.sub,
      );
    }
    return this.commentsService.exportComments(acpId, req.user.sub);
  }

  @Get("export.xlsx")
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Export comments as XLSX" })
  async exportCommentsXlsx(
    @UuidParam("acpId") acpId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    let buffer: Buffer;
    let fileSuffix = "all";

    if (this.reviewPolicy.isManagerRequest(req)) {
      buffer = await this.commentsService.exportCommentsXlsx(acpId);
    } else if (req.user.type === "credential") {
      fileSuffix = req.user.username || "mine";
      buffer = await this.commentsService.exportCommentsXlsxByCredential(
        acpId,
        req.user.sub,
      );
    } else {
      fileSuffix = req.user.username || "mine";
      buffer = await this.commentsService.exportCommentsXlsx(
        acpId,
        req.user.sub,
      );
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="comments-${acpId}-${fileSuffix}.xlsx"`,
    );
    res.send(buffer);
  }

  private assertManagerAccess(req: any): void {
    if (!this.reviewPolicy.isManagerRequest(req)) {
      throw new ForbiddenException("Manager access required");
    }
  }
}
