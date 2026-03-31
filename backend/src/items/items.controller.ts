import { Controller, Get, Param, Query, Post, Delete, UseInterceptors, UploadedFile, UseGuards, Body, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ItemsService } from './items.service';
import { ItemResponseStateService } from './item-response-state.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';

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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear all empirical difficulties for an ACP' })
  async clearEmpiricalDifficulties(@Param('acpId') acpId: string) {
    return this.itemsService.clearEmpiricalDifficulties(acpId);
  }

  @Get('response-state/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all response states for an ACP (Manager only)' })
  async getAllResponseStates(
    @Param('acpId') acpId: string,
    @Request() req: any,
  ) {
    const isManager = req.acpAccessLevel === 'MANAGER' || req.user?.isAppAdmin;
    return this.stateService.getAllStatesForAcp(acpId, isManager);
  }

  // Response State Endpoints

  @Post(':itemId/response-state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save response state for an item (Manager only)' })
  async saveResponseState(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
    @Body() body: { unitId: string; responseData: Record<string, any> },
    @Request() req: any,
  ) {
    const isManager = req.acpAccessLevel === 'MANAGER' || req.user?.isAppAdmin;
    return this.stateService.saveResponseState(acpId, itemId, body.unitId, body.responseData, isManager);
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete response state for an item (Manager only)' })
  async deleteResponseState(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
    @Request() req: any,
  ) {
    const isManager = req.acpAccessLevel === 'MANAGER' || req.user?.isAppAdmin;
    return this.stateService.deleteResponseState(acpId, itemId, isManager);
  }
}
