import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommentTargetType } from '../database/entities';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  commentText!: string;
}

@ApiTags('Comments')
@Controller('acp/:acpId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all comments for an ACP (Manager only)' })
  async findAll(@Param('acpId') acpId: string) {
    return this.commentsService.findByAcp(acpId);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my comments for an ACP' })
  async findMine(@Param('acpId') acpId: string, @Request() req: any) {
    if (req.user.type === 'credential') {
      return this.commentsService.findByCredential(acpId, req.user.username);
    }
    return this.commentsService.findByUser(acpId, req.user.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment' })
  async create(
    @Param('acpId') acpId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.create({
      acpId,
      userId: req.user.type === 'user' ? req.user.sub : undefined,
      credentialUsername: req.user.type === 'credential' ? req.user.username : undefined,
      targetType: dto.targetType,
      targetId: dto.targetId,
      commentText: dto.commentText,
    });
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all comments for an ACP (Manager only)' })
  async deleteAll(@Param('acpId') acpId: string) {
    const count = await this.commentsService.deleteByAcp(acpId);
    return { message: `${count} comments deleted` };
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export comments as JSON (XLSX generation on client)' })
  async exportComments(@Param('acpId') acpId: string, @Request() req: any) {
    if (req.user.isAppAdmin || req.acpAccessLevel === 'MANAGER') {
      return this.commentsService.exportComments(acpId);
    }
    return this.commentsService.exportComments(acpId, req.user.sub);
  }
}
