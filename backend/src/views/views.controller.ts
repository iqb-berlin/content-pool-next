import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Response } from "express";
import { ViewsService } from "./views.service";
import { AcpAccessGuard } from "../auth/guards/acp-access.guard";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";
import { ItemCollectionsService } from "../item-collections/item-collections.service";
import {
  requireStablePreferenceIdentity,
  resolveStablePreferenceIdentity,
} from "../item-preferences/preference-identity";
import { SimpleItemListEntryDto } from "./dto/simple-item-list-entry.dto";
import { UuidParam } from "../common/uuid-param";

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
  @ApiProperty({
    description:
      "Stable item row keys in the current filtered and sorted list order",
    type: [String],
    maxItems: 10_000,
  })
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  rowKeys!: string[];

  @ApiPropertyOptional({
    description: "Explorer state used to render the exported item rows",
    enum: ["editor", "read-only"],
    default: "read-only",
  })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

class ExportAllPersonalItemDataDto {
  @ApiPropertyOptional({
    description: "Explorer state used to resolve item metadata",
    enum: ["editor", "read-only"],
    default: "read-only",
  })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

class CreateItemCollectionDto {
  @ApiPropertyOptional({ example: "Meine Kollektion" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ["editor", "read-only"] })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

class UpdateItemCollectionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  baseVersion!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10_000 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  rowKeys?: string[];

  @ApiPropertyOptional({ enum: ["editor", "read-only"] })
  @IsOptional()
  @IsIn(["editor", "read-only"])
  perspective?: "editor" | "read-only";
}

class ActivateItemCollectionDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  collectionId?: string | null;

  @ApiPropertyOptional({ enum: ["editor", "read-only"] })
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
    private readonly itemCollectionsService: ItemCollectionsService,
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
  async getAcpStartPage(@UuidParam("acpId") acpId: string) {
    return this.viewsService.getAcpStartPage(acpId);
  }

  @Get("acp/:acpId/index")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get ACP-Index for read-only view" })
  async getAcpIndex(@UuidParam("acpId") acpId: string) {
    return this.viewsService.getAcpIndex(acpId);
  }

  @Get("acp/:acpId/index/export")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Export ACP-Index JSON for read-only view" })
  async exportAcpIndex(
    @UuidParam("acpId") acpId: string,
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
  async getUnits(@UuidParam("acpId") acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.units || [];
  }

  @Get("acp/:acpId/units/:unitId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get unit view data" })
  async getUnit(
    @UuidParam("acpId") acpId: string,
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
  @ApiOkResponse({ type: SimpleItemListEntryDto, isArray: true })
  async getItems(@UuidParam("acpId") acpId: string, @Request() req: any) {
    if (!(await this.canUseFeature(acpId, req, "enableItemList", true))) {
      throw new ForbiddenException("Item list is not enabled for this ACP");
    }

    const canEdit =
      req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN";
    return this.viewsService.getItemList(acpId, canEdit);
  }

  @Get("acp/:acpId/item-explorer/state")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Get shared Item Explorer state for ACP" })
  async getItemExplorerState(
    @UuidParam("acpId") acpId: string,
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
    @UuidParam("acpId") acpId: string,
    @Request() req: any,
    @Query("viewId") viewId?: string,
  ) {
    const normalizedViewId = this.normalizePreferenceViewId(viewId);
    if (!(await this.isPreferencePersistenceEnabled(acpId, normalizedViewId))) {
      return { ui: {}, tags: {}, rowData: {} };
    }

    return this.viewsService.getItemPreferences(
      acpId,
      resolveStablePreferenceIdentity(req?.user),
      normalizedViewId,
    );
  }

  @Put("acp/:acpId/items/preferences")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Save persisted user preferences for item views" })
  @ApiBody({ type: SaveItemPreferencesDto })
  async saveItemPreferences(
    @UuidParam("acpId") acpId: string,
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
      resolveStablePreferenceIdentity(req?.user),
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
    @UuidParam("acpId") acpId: string,
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
      resolveStablePreferenceIdentity(req?.user),
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
    @UuidParam("acpId") acpId: string,
    @Body() dto: ExportPersonalItemDataDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    if (!(await this.canUseFeature(acpId, req, "enableItemList", true))) {
      throw new ForbiddenException("Item list is not enabled for this ACP");
    }
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
      resolveStablePreferenceIdentity(req?.user),
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

  @Post("acp/:acpId/items/preferences/export-all.csv")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({
    summary: "Export all participants' Item Explorer working data",
  })
  @ApiBody({ type: ExportAllPersonalItemDataDto })
  async exportAllPersonalItemDataCsv(
    @UuidParam("acpId") acpId: string,
    @Body() dto: ExportAllPersonalItemDataDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    if (req?.acpAccessLevel !== "MANAGER" && req?.acpAccessLevel !== "ADMIN") {
      throw new ForbiddenException(
        "Only ACP managers can export all participants' item data",
      );
    }
    if (!(await this.isPersonalItemDataEnabled(acpId))) {
      throw new ForbiddenException(
        "Personal item data is not enabled for this ACP",
      );
    }

    const buffer = await this.viewsService.exportAllPersonalItemDataCsv(
      acpId,
      dto.perspective === "editor",
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="all-participant-item-data-${acpId}.csv"`,
    );
    res.send(buffer);
  }

  @Get("acp/:acpId/items/collections")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "List the caller's personal item collections" })
  async getItemCollections(
    @UuidParam("acpId") acpId: string,
    @Query("perspective") perspective: "editor" | "read-only" | undefined,
    @Request() req: any,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    return this.itemCollectionsService.getItemCollections(
      acpId,
      this.requireCollectionIdentity(req),
      this.isEditorPerspective(req, perspective),
    );
  }

  @Post("acp/:acpId/items/collections")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Create a personal item collection" })
  async createItemCollection(
    @UuidParam("acpId") acpId: string,
    @Body() dto: CreateItemCollectionDto,
    @Request() req: any,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    return this.itemCollectionsService.createItemCollection(
      acpId,
      this.requireCollectionIdentity(req),
      dto.name,
      this.isEditorPerspective(req, dto.perspective),
    );
  }

  @Patch("acp/:acpId/items/collections/:collectionId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Update a personal item collection" })
  async updateItemCollection(
    @UuidParam("acpId") acpId: string,
    @UuidParam("collectionId") collectionId: string,
    @Body() dto: UpdateItemCollectionDto,
    @Request() req: any,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    return this.itemCollectionsService.updateItemCollection(
      acpId,
      this.requireCollectionIdentity(req),
      collectionId,
      dto,
      this.isEditorPerspective(req, dto.perspective),
    );
  }

  @Put("acp/:acpId/items/collections/active")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Persist the active personal item collection" })
  async activateItemCollection(
    @UuidParam("acpId") acpId: string,
    @Body() dto: ActivateItemCollectionDto,
    @Request() req: any,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    return this.itemCollectionsService.activateItemCollection(
      acpId,
      this.requireCollectionIdentity(req),
      dto.collectionId || null,
      this.isEditorPerspective(req, dto.perspective),
    );
  }

  @Delete("acp/:acpId/items/collections/:collectionId")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Delete a personal item collection" })
  async deleteItemCollection(
    @UuidParam("acpId") acpId: string,
    @UuidParam("collectionId") collectionId: string,
    @Query("perspective") perspective: "editor" | "read-only" | undefined,
    @Request() req: any,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    return this.itemCollectionsService.deleteItemCollection(
      acpId,
      this.requireCollectionIdentity(req),
      collectionId,
      this.isEditorPerspective(req, perspective),
    );
  }

  @Post("acp/:acpId/items/collections/:collectionId/export.csv")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "Export one personal item collection as CSV" })
  async exportItemCollectionCsv(
    @UuidParam("acpId") acpId: string,
    @UuidParam("collectionId") collectionId: string,
    @Query("perspective") perspective: "editor" | "read-only" | undefined,
    @Request() req: any,
    @Res() res: Response,
  ) {
    await this.assertItemCollectionsEnabled(acpId, req);
    const buffer = await this.itemCollectionsService.exportItemCollectionCsv(
      acpId,
      this.requireCollectionIdentity(req),
      collectionId,
      this.isEditorPerspective(req, perspective),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="item-collection-${collectionId}.csv"`,
    );
    res.send(buffer);
  }

  @Get("acp/:acpId/sequences")
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: "List task sequences for an ACP" })
  async getSequences(@UuidParam("acpId") acpId: string, @Request() req: any) {
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
    @UuidParam("acpId") acpId: string,
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

  private async assertItemCollectionsEnabled(
    acpId: string,
    req?: any,
  ): Promise<void> {
    const data = await this.viewsService.getAcpStartPage(acpId);
    const featureConfig = (data?.featureConfig || {}) as Record<
      string,
      unknown
    >;
    const isManager =
      req?.user?.isAppAdmin ||
      req?.acpAccessLevel === "MANAGER" ||
      req?.acpAccessLevel === "ADMIN";
    if (!isManager && featureConfig.enableItemList === false) {
      throw new ForbiddenException("Item list is not enabled for this ACP");
    }
    if (featureConfig.enableItemCollections !== true) {
      throw new ForbiddenException(
        "Item collections are not enabled for this ACP",
      );
    }
  }

  private requireCollectionIdentity(req?: any) {
    return requireStablePreferenceIdentity(
      req?.user,
      "A stable identity is required for item collections",
    );
  }

  private isEditorPerspective(
    req: any,
    perspective?: "editor" | "read-only",
  ): boolean {
    return (
      (req?.acpAccessLevel === "MANAGER" || req?.acpAccessLevel === "ADMIN") &&
      perspective === "editor"
    );
  }

  private normalizePreferenceViewId(viewId?: string): string {
    const normalized = String(viewId || "").trim();
    return normalized ? normalized.slice(0, 120) : "item-list";
  }
}
