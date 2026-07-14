import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { Response } from "express";
import { ViewsService } from "./views.service";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";

class SaveItemPreferencesDto {
  @ApiPropertyOptional({
    description: "Preference scope/view id",
    example: "item-list",
  })
  @IsOptional()
  @IsString()
  viewId?: string;

  @ApiPropertyOptional({
    description: "View specific UI state",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  ui?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Item tags keyed by item identifier",
    type: "object",
    additionalProperties: {
      type: "array",
      items: { type: "string" },
    },
  })
  @IsOptional()
  @IsObject()
  tags?: Record<string, string[]>;

  @ApiPropertyOptional({
    description: "Personal working data keyed by stable item row key",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  rowData?: Record<string, Record<string, unknown>>;
}

class PatchPersonalItemRowDto {
  @ApiProperty({
    description: "Stable item row key",
    example: "item-uuid::1",
  })
  @IsString()
  rowKey!: string;

  @ApiPropertyOptional({
    description: "Personal row data, or null to remove the row",
    type: "object",
    nullable: true,
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  rowData?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: "Explorer state used to render the item row",
    enum: ["editor", "read-only"],
    default: "read-only",
  })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

class ExportPersonalItemDataDto {
  @ApiPropertyOptional({
    description:
      "Stable item row keys in the current filtered and sorted list order",
    type: [String],
    maxItems: 10_000,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  rowKeys?: string[];

  @ApiPropertyOptional({
    description: "Explorer state used to render the exported item rows",
    enum: ["editor", "read-only"],
    default: "read-only",
  })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

@ApiTags("Public Views")
@Controller("view")
export class ViewsController {
  constructor(
    private readonly viewsService: ViewsService,
    private readonly itemExplorerStateService: ItemExplorerStateService,
  ) {}

  @Get("settings")
  @ApiOperation({
    summary: "Get public app settings (theme, logo, legal pages)",
  })
  async getPublicSettings() {
    return this.viewsService.getPublicSettings();
  }

  @Get("acp")
  @ApiOperation({ summary: "List publicly accessible ACPs" })
  async getPublicAcps() {
    return this.viewsService.getPublicAcps();
  }

  @Get("acp/:acpId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "ACP start page data" })
  async getAcpStartPage(@Param("acpId") acpId: string) {
    return this.viewsService.getAcpStartPage(acpId);
  }

  @Get("acp/:acpId/index")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get ACP-Index for read-only view" })
  async getAcpIndex(@Param("acpId") acpId: string) {
    return this.viewsService.getAcpIndex(acpId);
  }

  @Get("acp/:acpId/index/export")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Export ACP-Index JSON for read-only view" })
  async exportAcpIndex(
    @Param("acpId") acpId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    if (!(await this.canUseFeature(acpId, req, "allowIndexDownload"))) {
      throw new ForbiddenException(
        "Index download is not enabled for this ACP",
      );
    }

    const index = await this.viewsService.getAcpIndex(acpId);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="acp-index-${acpId}.json"`,
    );
    res.json(index || {});
  }

  @Get("acp/:acpId/units")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "List all units in an ACP" })
  async getUnits(@Param("acpId") acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.units || [];
  }

  @Get("acp/:acpId/units/:unitId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get unit view data" })
  async getUnit(
    @Param("acpId") acpId: string,
    @Param("unitId") unitId: string,
    @Request() req: any,
  ) {
    if (!(await this.canUseFeature(acpId, req, "enableUnitView", true))) {
      throw new ForbiddenException("Unit view is not enabled for this ACP");
    }

    return this.viewsService.getUnitViewData(acpId, unitId);
  }

  @Get("acp/:acpId/items")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get item list for an ACP" })
  async getItems(@Param("acpId") acpId: string, @Request() req: any) {
    if (!(await this.canUseFeature(acpId, req, "enableItemList", true))) {
      throw new ForbiddenException("Item list is not enabled for this ACP");
    }

    return this.viewsService.getItemList(acpId);
  }

  @Get("acp/:acpId/item-explorer/state")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get shared Item Explorer state for ACP" })
  async getItemExplorerState(
    @Param("acpId") acpId: string,
    @Request() req: any,
  ) {
    const canEdit =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    return this.itemExplorerStateService.getStateForViewer(acpId, canEdit);
  }

  @Get("acp/:acpId/items/preferences")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get persisted user preferences for item views" })
  async getItemPreferences(
    @Param("acpId") acpId: string,
    @Request() req: any,
    @Query("viewId") viewId?: string,
  ) {
    const normalizedViewId = this.normalizePreferenceViewId(viewId);
    if (!(await this.isPreferencePersistenceEnabled(acpId, normalizedViewId))) {
      return { ui: {}, tags: {}, rowData: {} };
    }

    return this.viewsService.getItemPreferences(
      acpId,
      req?.user,
      normalizedViewId,
    );
  }

  @Put("acp/:acpId/items/preferences")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Save persisted user preferences for item views" })
  @ApiBody({ type: SaveItemPreferencesDto })
  async saveItemPreferences(
    @Param("acpId") acpId: string,
    @Body() dto: SaveItemPreferencesDto,
    @Request() req: any,
  ) {
    const normalizedViewId = this.normalizePreferenceViewId(dto.viewId);
    if (normalizedViewId === "item-explorer") {
      throw new BadRequestException(
        "Item Explorer preferences must be saved through their dedicated endpoints",
      );
    }
    if (!(await this.isPreferencePersistenceEnabled(acpId, normalizedViewId))) {
      return { ui: {}, tags: {}, rowData: {} };
    }

    return this.viewsService.saveItemPreferences(
      acpId,
      req?.user,
      {
        ui: dto.ui,
        tags: dto.tags,
        rowData: dto.rowData,
      },
      normalizedViewId,
    );
  }

  @Patch("acp/:acpId/items/preferences/row-data")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Patch personal working data for one item row" })
  @ApiBody({ type: PatchPersonalItemRowDto })
  async patchPersonalItemRow(
    @Param("acpId") acpId: string,
    @Body() dto: PatchPersonalItemRowDto,
    @Request() req: any,
  ) {
    if (!(await this.isPersonalItemDataEnabled(acpId))) {
      throw new ForbiddenException(
        "Personal item data is not enabled for this ACP",
      );
    }

    return this.viewsService.patchPersonalItemPreferenceRow(
      acpId,
      req?.user,
      dto.rowKey,
      dto.rowData ?? null,
      "item-explorer",
      (req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN") &&
        dto.perspective === "editor",
    );
  }

  @Post("acp/:acpId/items/preferences/export.xlsx")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Export personal Item Explorer working data" })
  @ApiBody({ type: ExportPersonalItemDataDto })
  async exportPersonalItemDataXlsx(
    @Param("acpId") acpId: string,
    @Body() dto: ExportPersonalItemDataDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    if (!(await this.isPersonalItemDataEnabled(acpId))) {
      throw new ForbiddenException(
        "Personal item data is not enabled for this ACP",
      );
    }

    const canEditExplorerState =
      (req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN") &&
      dto.perspective === "editor";
    const buffer = await this.viewsService.exportPersonalItemDataXlsx(
      acpId,
      req?.user,
      dto.rowKeys,
      canEditExplorerState,
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="personal-item-data-${acpId}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get("acp/:acpId/sequences")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "List task sequences for an ACP" })
  async getSequences(@Param("acpId") acpId: string, @Request() req: any) {
    if (
      !(await this.canUseFeature(acpId, req, "enableSequenceNavigation", true))
    ) {
      throw new ForbiddenException(
        "Task sequences are not enabled for this ACP",
      );
    }

    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.sequences || [];
  }

  @Get("acp/:acpId/sequences/:sequenceId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get task sequence with ordered units" })
  async getSequence(
    @Param("acpId") acpId: string,
    @Param("sequenceId") sequenceId: string,
    @Request() req: any,
  ) {
    if (
      !(await this.canUseFeature(acpId, req, "enableSequenceNavigation", true))
    ) {
      throw new ForbiddenException(
        "Task sequences are not enabled for this ACP",
      );
    }

    return this.viewsService.getTaskSequence(acpId, sequenceId);
  }

  private async canUseFeature(
    acpId: string,
    req: any,
    featureKey: string,
    defaultWhenUnset = false,
  ): Promise<boolean> {
    if (req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN") {
      return true;
    }

    const data = await this.viewsService.getAcpStartPage(acpId);
    const featureConfig = (data?.featureConfig || {}) as Record<
      string,
      unknown
    >;
    const value = featureConfig[featureKey];
    if (value === undefined) {
      return defaultWhenUnset;
    }
    return Boolean(value);
  }

  private async isPreferencePersistenceEnabled(
    acpId: string,
    viewId?: string,
  ): Promise<boolean> {
    const data = await this.viewsService.getAcpStartPage(acpId);
    const featureConfig = (data?.featureConfig || {}) as Record<
      string,
      unknown
    >;
    return (
      Boolean(featureConfig.persistUserPreferences) ||
      (viewId === "item-explorer" &&
        Boolean(featureConfig.enablePersonalItemData))
    );
  }

  private async isPersonalItemDataEnabled(acpId: string): Promise<boolean> {
    const data = await this.viewsService.getAcpStartPage(acpId);
    const featureConfig = (data?.featureConfig || {}) as Record<
      string,
      unknown
    >;
    return featureConfig.enablePersonalItemData === true;
  }

  private normalizePreferenceViewId(viewId?: string): string {
    const normalized = String(viewId || "").trim();
    return normalized ? normalized.slice(0, 120) : "item-list";
  }
}
