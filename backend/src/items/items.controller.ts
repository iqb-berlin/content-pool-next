import { Controller, Get, Param, Query, Post, Delete, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
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
}
