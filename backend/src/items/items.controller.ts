import { Controller, Get, Param, Query, Post, Delete, UseInterceptors, UploadedFile, UseGuards, Body, Request, Put, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes, ApiBody, ApiProperty } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ItemsService } from './items.service';
import { ItemResponseStateService } from './item-response-state.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsObject } from 'class-validator';

class SaveItemTagsDto {
  @ApiProperty({
    description: 'Map of item UUID to tag list',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsObject()
  tags!: Record<string, string[]>;
}

@ApiTags('Items')
@Controller('acp/:acpId/items')
export class ItemsController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly stateService: ItemResponseStateService,
  ) {}

  @Get()
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'List all items in an ACP (with optional filter/sort)' })
  @ApiQuery({ name: 'filter', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  async getItems(
    @Param('acpId') acpId: string,
    @Query('filter') filter?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.itemsService.getFilteredItems(acpId, filter, sortBy, sortDir);
  }

  @Get('tags')
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get persisted item tags for an ACP' })
  async getItemTags(@Param('acpId') acpId: string, @Request() req: any) {
    const isManager = req.user?.isAppAdmin || req.acpAccessLevel === 'MANAGER';
    if (!isManager && !(await this.itemsService.canUseItemTags(acpId))) {
      throw new ForbiddenException('Item tags are not enabled for this ACP');
    }
    return this.itemsService.getItemTags(acpId);
  }

  @Put('tags')
  @UseGuards(JwtAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Persist item tags for an ACP' })
  async saveItemTags(
    @Param('acpId') acpId: string,
    @Body() dto: SaveItemTagsDto,
    @Request() req: any,
  ) {
    const isManager = req.user?.isAppAdmin || req.acpAccessLevel === 'MANAGER';
    if (!isManager && !(await this.itemsService.canUseItemTags(acpId))) {
      throw new ForbiddenException('Item tags are not enabled for this ACP');
    }
    return this.itemsService.saveItemTags(acpId, dto.tags || {});
  }

  @Get(':itemId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get a single item by ID' })
  async getItem(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.getItem(acpId, itemId);
  }

  @Post('upload-empirical-difficulty')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a CSV to match empirical item difficulties' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadEmpiricalDifficulties(
    @Param('acpId') acpId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.itemsService.uploadEmpiricalDifficulties(acpId, file.buffer);
  }

  @Delete('empirical-difficulty')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear all empirical difficulties for an ACP' })
  async clearEmpiricalDifficulties(@Param('acpId') acpId: string) {
    return this.itemsService.clearEmpiricalDifficulties(acpId);
  }

  @Get('response-state/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all response states for an ACP (Manager only)' })
  async getAllResponseStates(
    @Param('acpId') acpId: string,
    @Request() _req: any,
  ) {
    return this.stateService.getAllStatesForAcp(acpId, true);
  }

  // Response State Endpoints

  @Post(':itemId/response-state')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save response state for an item (Manager only)' })
  async saveResponseState(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
    @Body() body: { unitId: string; responseData: Record<string, any> },
    @Request() _req: any,
  ) {
    return this.stateService.saveResponseState(acpId, itemId, body.unitId, body.responseData, true);
  }

  @Get(':itemId/response-state')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get response state for an item' })
  async getResponseState(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
  ) {
    const state = await this.stateService.getResponseState(acpId, itemId);
    return state || { state: null };
  }

  @Post(':itemId/response-state/with-fallback')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get response state for an item with fallback to previous items in same unit' })
  async getResponseStateWithFallback(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
    @Body() body: { unitId: string; itemList: { itemId: string; unitId: string }[] },
  ) {
    return this.stateService.getResponseStateWithFallback(
      acpId,
      itemId,
      body.unitId,
      body.itemList,
    );
  }

  @Delete(':itemId/response-state')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete response state for an item (Manager only)' })
  async deleteResponseState(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
    @Request() _req: any,
  ) {
    return this.stateService.deleteResponseState(acpId, itemId, true);
  }
}
