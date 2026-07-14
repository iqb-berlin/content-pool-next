import {
  BadRequestException,
  Body,
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
  Sse,
} from "@nestjs/common";
import { Response } from "express";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
} from "@nestjs/swagger";
import { FilesService } from "./files.service";
import { UnitParserService } from "./unit-parser.service";
import { ValidationService } from "../validation/validation.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { FileProcessingJobsService } from "./file-processing-jobs.service";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";

@ApiTags("ACP Files")
@Controller("acp/:acpId/files")
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly unitParserService: UnitParserService,
    private readonly validationService: ValidationService,
    private readonly fileProcessingJobsService: FileProcessingJobsService,
    private readonly itemExplorerStateService: ItemExplorerStateService,
  ) {}

  @Get()
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "List all files for an ACP" })
  async findAll(
    @Param("acpId") acpId: string,
    @Query("format") format?: string,
    @Query("unitId") unitId?: string,
    @Query("sequenceId") sequenceId?: string,
    @Request() req?: any,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const isManager =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    const featureConfig = await this.filesService.getFeatureConfig(acpId);

    if (format === "zip") {
      if (unitId && sequenceId) {
        throw new BadRequestException(
          "Please provide either unitId or sequenceId, not both",
        );
      }

      if (!unitId && !sequenceId) {
        throw new BadRequestException(
          "ZIP download requires unitId or sequenceId",
        );
      }
      if (!isManager && !featureConfig.allowUnitDownload) {
        throw new ForbiddenException(
          "Unit download is not enabled for this ACP",
        );
      }

      const archive = unitId
        ? await this.filesService.createUnitZip(acpId, unitId)
        : await this.filesService.createSequenceZip(acpId, sequenceId!);

      res?.setHeader("Content-Type", "application/zip");
      res?.setHeader(
        "Content-Disposition",
        `attachment; filename="${archive.fileName}"`,
      );
      res?.send(archive.buffer);
      return;
    }

    if (!isManager && !featureConfig.allowFileDownload) {
      throw new ForbiddenException("File listing is not enabled for this ACP");
    }

    return this.filesService.findByAcp(acpId);
  }

  @Delete("all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete all files for an ACP" })
  async deleteAll(@Param("acpId") acpId: string) {
    await this.filesService.deleteAll(acpId);
    const cleanupResult =
      await this.filesService.cleanupReferencesAfterFileMutation(acpId);
    return {
      message: "All files deleted successfully",
      cleanupReport: cleanupResult.cleanupReport,
      responseStateCleanup: cleanupResult.responseStateCleanup,
      validationSummary: cleanupResult.validationSummary,
    };
  }

  @Get("validate-units")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Validate completeness of all unit files" })
  async validateUnits(@Param("acpId") acpId: string) {
    const files = await this.filesService.findByAcp(acpId);
    const [unitResults, validationRun] = await Promise.all([
      this.unitParserService.validateUnitFiles(acpId),
      this.validationService.autoValidateUploadedFiles(acpId, files),
    ]);

    return {
      unitResults,
      validationSummary: validationRun.summary,
    };
  }

  @Get("item-list")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Extract item list with metadata from .vomd files" })
  async getItemList(
    @Param("acpId") acpId: string,
    @Request() req: any,
    @Query("perspective") perspective?: string,
  ) {
    const isManager = this.isManagerViewContext(req, perspective);
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (featureConfig.enableItemList === false) {
        throw new ForbiddenException("Item list is not enabled for this ACP");
      }
    }
    const explorerState = await this.itemExplorerStateService.getStateForViewer(
      acpId,
      isManager,
    );
    return this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
    });
  }

  @Post("item-list/renumber")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Recalculate stable Item Explorer row numbers",
  })
  async recalculateItemRowNumbers(@Param("acpId") acpId: string) {
    const explorerState = await this.itemExplorerStateService.getStateForViewer(
      acpId,
      true,
    );
    return this.unitParserService.getItemListFromFiles(acpId, {
      itemPropertiesOverride: explorerState.activeState.itemProperties,
      recalculateRowNumbers: true,
    });
  }

  @Get("unit-view/:unitId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({
    summary: "Get unit view data from uploaded files (player, definition)",
  })
  async getUnitView(
    @Param("acpId") acpId: string,
    @Param("unitId") unitId: string,
    @Request() req: any,
    @Query("perspective") perspective?: string,
  ) {
    const isManager = this.isManagerViewContext(req, perspective);
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (featureConfig.enableUnitView === false) {
        throw new ForbiddenException("Unit view is not enabled for this ACP");
      }
    }
    return this.unitParserService.getUnitViewFromFiles(acpId, unitId);
  }

  @Get("jobs/:jobId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get file processing job status" })
  async getProcessingJob(
    @Param("acpId") acpId: string,
    @Param("jobId") jobId: string,
  ) {
    return this.fileProcessingJobsService.getJobSnapshot(acpId, jobId);
  }

  @Sse("jobs/:jobId/events")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Stream file processing job progress" })
  async streamProcessingJob(
    @Param("acpId") acpId: string,
    @Param("jobId") jobId: string,
  ) {
    await this.fileProcessingJobsService.ensureJobExists(acpId, jobId);
    return this.fileProcessingJobsService.streamJob(jobId);
  }

  @Get("jobs/:jobId/archive")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Download generated ZIP archive for a completed file job",
  })
  async downloadJobArchive(
    @Param("acpId") acpId: string,
    @Param("jobId") jobId: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const archive = await this.fileProcessingJobsService.downloadArchive(
      acpId,
      jobId,
    );
    res?.setHeader("Content-Type", "application/zip");
    res?.setHeader("Content-Length", String(archive.buffer.length));
    res?.setHeader(
      "Content-Disposition",
      `attachment; filename="${archive.fileName}"`,
    );
    res?.send(archive.buffer);
  }

  @Get(":fileId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get file metadata" })
  async findOne(
    @Param("acpId") acpId: string,
    @Param("fileId") fileId: string,
    @Request() req: any,
  ) {
    const isManager =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    if (!isManager) {
      const featureConfig = await this.filesService.getFeatureConfig(acpId);
      if (!featureConfig.allowFileDownload) {
        throw new ForbiddenException(
          "File metadata access is not enabled for this ACP",
        );
      }
    }
    return this.filesService.findByIdForAcp(acpId, fileId);
  }

  @Get(":fileId/preview")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get preview data for a file" })
  async getPreview(
    @Param("acpId") acpId: string,
    @Param("fileId") fileId: string,
    @Request() req: any,
  ) {
    const file = await this.filesService.findByIdForAcp(acpId, fileId);
    await this.ensureFileContentAccess(acpId, file.originalName, req);
    return this.filesService.getPreviewForAcp(acpId, fileId);
  }

  @Post("upload")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor("files", 100))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({
    name: "conflictStrategy",
    required: false,
    description: "reject | overwrite | keep-both",
  })
  @ApiOperation({ summary: "Upload files to ACP" })
  async upload(
    @Param("acpId") acpId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("conflictStrategy") conflictStrategy?: string,
  ) {
    return {
      files: await this.filesService.uploadMultiple(
        acpId,
        files,
        conflictStrategy,
      ),
    };
  }

  @Post("bulk-download")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Download all or selected ACP files as ZIP archive",
  })
  async bulkDownload(
    @Param("acpId") acpId: string,
    @Body() body: { fileIds?: string[] } = {},
    @Res({ passthrough: true }) res?: Response,
  ) {
    const archive = await this.filesService.createFilesZip(acpId, body.fileIds);
    res?.setHeader("Content-Type", "application/zip");
    res?.setHeader("Content-Length", String(archive.buffer.length));
    res?.setHeader(
      "Content-Disposition",
      `attachment; filename="${archive.fileName}"`,
    );
    res?.send(archive.buffer);
  }

  @Post("bulk-download/jobs")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Start ZIP creation job for all or selected ACP files",
  })
  async startBulkDownloadJob(
    @Param("acpId") acpId: string,
    @Body() body: { fileIds?: string[] } = {},
    @Request() req?: any,
  ) {
    return this.fileProcessingJobsService.createAndStartDownloadJob(
      acpId,
      body.fileIds || [],
      { createdByUserId: req?.user?.sub || null },
    );
  }

  @Post("process-upload")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Start processing for freshly uploaded ACP files" })
  async processUpload(
    @Param("acpId") acpId: string,
    @Body() body: { fileIds?: string[]; runCleanup?: boolean },
    @Request() req: any,
  ) {
    return this.fileProcessingJobsService.createAndStartJob(
      acpId,
      body.fileIds || [],
      {
        createdByUserId: req?.user?.sub || null,
        runCleanup: !!body.runCleanup,
      },
    );
  }

  @Post("bulk-delete")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete multiple files for an ACP" })
  async bulkDelete(
    @Param("acpId") acpId: string,
    @Body() body: { fileIds?: string[] },
  ) {
    const deletedFileIds = await this.filesService.deleteManyForAcp(
      acpId,
      body.fileIds || [],
    );
    const cleanupResult =
      await this.filesService.cleanupReferencesAfterFileMutation(acpId);

    return {
      message: "Files deleted successfully",
      deletedCount: deletedFileIds.length,
      deletedFileIds,
      cleanupReport: cleanupResult.cleanupReport,
      responseStateCleanup: cleanupResult.responseStateCleanup,
      validationSummary: cleanupResult.validationSummary,
    };
  }

  @Post("sync-index")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Synchronize ACP-Index from uploaded unit files (non-destructive merge)",
  })
  async syncIndex(@Param("acpId") acpId: string) {
    return this.unitParserService.syncIndexFromFiles(acpId);
  }

  @Get(":fileId/download")
  @UseGuards(AcpAccessGuard)
  @ApiQuery({
    name: "disposition",
    required: false,
    description: "attachment | inline",
  })
  @ApiOperation({ summary: "Download a file" })
  async download(
    @Param("acpId") acpId: string,
    @Param("fileId") fileId: string,
    @Query("disposition") disposition: string | undefined,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const file = await this.filesService.findByIdForAcp(acpId, fileId);
    await this.ensureFileContentAccess(acpId, file.originalName, req);

    const { buffer } = await this.filesService.downloadForAcp(acpId, fileId);
    const resolvedDisposition = this.resolveDisposition(disposition);
    res.setHeader(
      "Content-Disposition",
      `${resolvedDisposition}; filename="${file.originalName}"`,
    );
    res.setHeader("Content-Type", file.fileType || "application/octet-stream");
    res.send(buffer);
  }

  @Delete(":fileId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a file" })
  async delete(@Param("acpId") acpId: string, @Param("fileId") fileId: string) {
    await this.filesService.deleteForAcp(acpId, fileId);
    const cleanupResult =
      await this.filesService.cleanupReferencesAfterFileMutation(acpId);
    return {
      message: "File deleted successfully",
      cleanupReport: cleanupResult.cleanupReport,
      responseStateCleanup: cleanupResult.responseStateCleanup,
      validationSummary: cleanupResult.validationSummary,
    };
  }

  @Get(":fileId/validation")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ACP_MANAGER")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get validation result for a file" })
  async getValidation(
    @Param("acpId") acpId: string,
    @Param("fileId") fileId: string,
  ) {
    return this.filesService.getValidationResultForAcp(acpId, fileId);
  }

  private async ensureFileContentAccess(
    acpId: string,
    originalName: string,
    req: any,
  ): Promise<void> {
    const isManager =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    if (isManager) {
      return;
    }

    const featureConfig = await this.filesService.getFeatureConfig(acpId);
    const isDependency = await this.filesService.isUnitDependencyFile(
      acpId,
      originalName,
    );
    const canDownloadForView =
      featureConfig.enableUnitView !== false && isDependency;

    if (!featureConfig.allowFileDownload && !canDownloadForView) {
      throw new ForbiddenException("File download is not enabled for this ACP");
    }
  }

  private isManagerViewContext(req: any, perspective?: string): boolean {
    const isManager =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    if (!isManager) {
      return false;
    }

    const normalizedPerspective = String(perspective || "editor")
      .trim()
      .toLowerCase();

    return normalizedPerspective !== "read-only";
  }

  private resolveDisposition(
    disposition: string | undefined,
  ): "attachment" | "inline" {
    const normalized = String(disposition || "attachment")
      .trim()
      .toLowerCase();

    if (normalized === "attachment" || normalized === "inline") {
      return normalized;
    }

    throw new BadRequestException(
      'Invalid disposition. Expected "attachment" or "inline".',
    );
  }
}
