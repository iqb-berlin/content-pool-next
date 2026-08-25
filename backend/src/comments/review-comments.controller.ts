import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UuidParam } from "../common/uuid-param";
import { CommentsService } from "./comments.service";
import { ReviewPolicyService } from "./review-policy.service";
import { ReviewAccessGuard } from "./review-access.guard";

class CreateItemReviewCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  commentText!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}

class UpdateReviewCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  commentText!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  version!: number;
}

@ApiTags("Review Comments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ReviewAccessGuard)
@Controller("acp/:acpId/review/comments")
export class ReviewCommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly reviewPolicy: ReviewPolicyService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the visible comment thread for one item" })
  async getItemThread(
    @UuidParam("acpId") acpId: string,
    @Query("unitId") unitId: string,
    @Query("itemId") itemId: string,
    @Request() req: any,
  ) {
    const target = this.normalizeTarget(unitId, itemId);
    return this.commentsService.getItemThread(
      acpId,
      target.unitId,
      target.itemId,
      this.reviewPolicy.resolveActor(req),
    );
  }

  @Post()
  @ApiOperation({ summary: "Create an item comment or reply" })
  async createItemComment(
    @UuidParam("acpId") acpId: string,
    @Body() dto: CreateItemReviewCommentDto,
    @Request() req: any,
  ) {
    const target = this.normalizeTarget(dto.unitId, dto.itemId);
    return this.commentsService.createItemComment(
      acpId,
      {
        ...target,
        commentText: dto.commentText,
        parentCommentId: dto.parentCommentId,
      },
      this.reviewPolicy.resolveActor(req),
    );
  }

  @Patch(":commentId")
  @ApiOperation({ summary: "Update an own comment with optimistic locking" })
  async updateComment(
    @UuidParam("acpId") acpId: string,
    @UuidParam("commentId") commentId: string,
    @Body() dto: UpdateReviewCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.updateOwnComment(
      acpId,
      commentId,
      dto.commentText,
      dto.version,
      this.reviewPolicy.resolveActor(req),
    );
  }

  @Delete(":commentId")
  @ApiOperation({ summary: "Delete an own comment" })
  async deleteComment(
    @UuidParam("acpId") acpId: string,
    @UuidParam("commentId") commentId: string,
    @Query("version") rawVersion: string,
    @Request() req: any,
  ) {
    const version = Number(rawVersion);
    if (!Number.isInteger(version) || version < 1) {
      throw new BadRequestException("A valid comment version is required");
    }
    await this.commentsService.deleteOwnComment(
      acpId,
      commentId,
      version,
      this.reviewPolicy.resolveActor(req),
    );
    return { success: true };
  }

  private normalizeTarget(unitId: unknown, itemId: unknown) {
    const normalizedUnitId = String(unitId || "").trim();
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedUnitId || !normalizedItemId) {
      throw new BadRequestException("unitId and itemId are required");
    }
    return { unitId: normalizedUnitId, itemId: normalizedItemId };
  }
}
