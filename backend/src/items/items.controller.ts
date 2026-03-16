import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Items')
@Controller('acp/:acpId/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
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
  @ApiOperation({ summary: 'Get a single item by ID' })
  async getItem(
    @Param('acpId') acpId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.getItem(acpId, itemId);
  }
}
