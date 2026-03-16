import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ACP Files')
@Controller('acp/:acpId/files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'List all files for an ACP' })
  async findAll(@Param('acpId') acpId: string) {
    return this.filesService.findByAcp(acpId);
  }

  @Get(':fileId')
  @ApiOperation({ summary: 'Get file metadata' })
  async findOne(@Param('fileId') fileId: string) {
    return this.filesService.findById(fileId);
  }

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 50))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload files to ACP' })
  async upload(
    @Param('acpId') acpId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.filesService.uploadMultiple(acpId, files);
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Download a file' })
  async download(@Param('fileId') fileId: string, @Res() res: Response) {
    const { buffer, file } = await this.filesService.download(fileId);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.send(buffer);
  }

  @Delete(':fileId')
  @ApiOperation({ summary: 'Delete a file' })
  async delete(@Param('fileId') fileId: string) {
    await this.filesService.delete(fileId);
    return { message: 'File deleted successfully' };
  }

  @Get(':fileId/validation')
  @ApiOperation({ summary: 'Get validation result for a file' })
  async getValidation(@Param('fileId') fileId: string) {
    return this.filesService.getValidationResult(fileId);
  }
}
