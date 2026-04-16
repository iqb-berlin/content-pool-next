import {
  BadRequestException,
  ForbiddenException,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { UnitParserService } from './unit-parser.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('ACP Files')
@Controller('acp/:acpId/files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly unitParserService: UnitParserService,
  ) {}

  @Get()
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'List all files for an ACP' })
  async findAll(
    @Param('acpId') acpId: string,
    @Query('format') format?: string,
    @Query('unitId') unitId?: string,
    @Query('sequenceId') sequenceId?: string,
    @Request() req?: any,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const isManager = req?.acpAccessLevel === 'MANAGER' || req?.acpAccessLevel === 'ADMIN';
    const featureConfig = await this.filesService.getFeatureConfig(acpId);

    if (format === 'zip') {
      if (unitId && sequenceId) {
        throw new BadRequestException('Please provide either unitId or sequenceId, not both');
      }

      if (!unitId && !sequenceId) {
        throw new BadRequestException('ZIP download requires unitId or sequenceId');
      }
      if (!isManager && !featureConfig.allowUnitDownload) {
        throw new ForbiddenException('Unit download is not enabled for this ACP');
      }

      const archive = unitId
        ? await this.filesService.createUnitZip(acpId, unitId)
        : await this.filesService.createSequenceZip(acpId, sequenceId!);

      res?.setHeader('Content-Type', 'application/zip');
      res?.setHeader('Content-Disposition', `attachment; filename="${archive.fileName}"`);
      res?.send(archive.buffer);
      return;
    }

    if (!isManager && !featureConfig.allowFileDownload) {
      throw new ForbiddenException('File listing is not enabled for this ACP');
    }

    return this.filesService.findByAcp(acpId);
  }

  @Delete('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all files for an ACP' })
  async deleteAll(@Param('acpId') acpId: string) {
    await this.filesService.deleteAll(acpId);
    return { message: 'All files deleted successfully' };
  }

  @Get('validate-units')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate completeness of all unit files' })
  async validateUnits(@Param('acpId') acpId: string) {
    return this.unitParserService.validateUnitFiles(acpId);
  }

  @Get('item-list')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Extract item list with metadata from .vomd files' })
  async getItemList(@Param('acpId') acpId: string, @Request() req: any) {
    const isManager = req?.acpAccessLevel === 'MANAGER' || req?.acpAccessLevel === 'ADMIN';
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (featureConfig.enableItemList === false) {
        throw new ForbiddenException('Item list is not enabled for this ACP');
      }
    }
    return this.unitParserService.getItemListFromFiles(acpId);
  }

  @Get('unit-view/:unitId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get unit view data from uploaded files (player, definition)' })
  async getUnitView(
    @Param('acpId') acpId: string,
    @Param('unitId') unitId: string,
    @Request() req: any,
  ) {
    const isManager = req?.acpAccessLevel === 'MANAGER' || req?.acpAccessLevel === 'ADMIN';
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (!featureConfig.enableUnitView) {
        throw new ForbiddenException('Unit view is not enabled for this ACP');
      }
    }
    return this.unitParserService.getUnitViewFromFiles(acpId, unitId);
  }

  @Get(':fileId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get file metadata' })
  async findOne(
    @Param('acpId') acpId: string,
    @Param('fileId') fileId: string,
    @Request() req: any,
  ) {
    const isManager = req?.acpAccessLevel === 'MANAGER' || req?.acpAccessLevel === 'ADMIN';
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (!featureConfig.allowFileDownload) {
        throw new ForbiddenException('File metadata access is not enabled for this ACP');
      }
    }
    return this.filesService.findByIdForAcp(acpId, fileId);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('files', 100))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload files to ACP' })
  async upload(
    @Param('acpId') acpId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.filesService.uploadMultiple(acpId, files);
  }

  @Get(':fileId/download')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Download a file' })
  async download(
    @Param('acpId') acpId: string,
    @Param('fileId') fileId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const isManager = req?.acpAccessLevel === 'MANAGER' || req?.acpAccessLevel === 'ADMIN';
    const file = await this.filesService.findByIdForAcp(acpId, fileId);

    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      const isDependency = await this.filesService.isUnitDependencyFile(acpId, file.originalName);
      const canDownloadForView = !!featureConfig.enableUnitView && isDependency;
      if (!featureConfig.allowFileDownload && !canDownloadForView) {
        throw new ForbiddenException('File download is not enabled for this ACP');
      }
    }

    const { buffer } = await this.filesService.downloadForAcp(acpId, fileId);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.send(buffer);
  }

  @Delete(':fileId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a file' })
  async delete(@Param('acpId') acpId: string, @Param('fileId') fileId: string) {
    await this.filesService.deleteForAcp(acpId, fileId);
    return { message: 'File deleted successfully' };
  }

  @Get(':fileId/validation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get validation result for a file' })
  async getValidation(@Param('acpId') acpId: string, @Param('fileId') fileId: string) {
    return this.filesService.getValidationResultForAcp(acpId, fileId);
  }
}
