import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { UnitParserService } from './unit-parser.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';

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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (format === 'zip') {
      if (unitId && sequenceId) {
        throw new BadRequestException('Please provide either unitId or sequenceId, not both');
      }

      if (!unitId && !sequenceId) {
        throw new BadRequestException('ZIP download requires unitId or sequenceId');
      }

      const archive = unitId
        ? await this.filesService.createUnitZip(acpId, unitId)
        : await this.filesService.createSequenceZip(acpId, sequenceId!);

      res?.setHeader('Content-Type', 'application/zip');
      res?.setHeader('Content-Disposition', `attachment; filename="${archive.fileName}"`);
      res?.send(archive.buffer);
      return;
    }

    return this.filesService.findByAcp(acpId);
  }

  @Delete('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all files for an ACP' })
  async deleteAll(@Param('acpId') acpId: string) {
    await this.filesService.deleteAll(acpId);
    return { message: 'All files deleted successfully' };
  }

  @Get('validate-units')
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate completeness of all unit files' })
  async validateUnits(@Param('acpId') acpId: string) {
    return this.unitParserService.validateUnitFiles(acpId);
  }

  @Get('item-list')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Extract item list with metadata from .vomd files' })
  async getItemList(@Param('acpId') acpId: string) {
    return this.unitParserService.getItemListFromFiles(acpId);
  }

  @Get('unit-view/:unitId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get unit view data from uploaded files (player, definition)' })
  async getUnitView(
    @Param('acpId') acpId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.unitParserService.getUnitViewFromFiles(acpId, unitId);
  }

  @Get(':fileId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get file metadata' })
  async findOne(@Param('fileId') fileId: string) {
    return this.filesService.findById(fileId);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
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
  async download(@Param('fileId') fileId: string, @Res() res: Response) {
    const { buffer, file } = await this.filesService.download(fileId);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.send(buffer);
  }

  @Delete(':fileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a file' })
  async delete(@Param('fileId') fileId: string) {
    await this.filesService.delete(fileId);
    return { message: 'File deleted successfully' };
  }

  @Get(':fileId/validation')
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get validation result for a file' })
  async getValidation(@Param('fileId') fileId: string) {
    return this.filesService.getValidationResult(fileId);
  }
}
