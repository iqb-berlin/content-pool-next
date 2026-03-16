import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ViewsService } from './views.service';

@ApiTags('Public Views')
@Controller('view')
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get public app settings (theme, logo, legal pages)' })
  async getPublicSettings() {
    return this.viewsService.getPublicSettings();
  }

  @Get('acp')
  @ApiOperation({ summary: 'List publicly accessible ACPs' })
  async getPublicAcps() {
    return this.viewsService.getPublicAcps();
  }

  @Get('acp/:acpId')
  @ApiOperation({ summary: 'ACP start page data' })
  async getAcpStartPage(@Param('acpId') acpId: string) {
    return this.viewsService.getAcpStartPage(acpId);
  }

  @Get('acp/:acpId/units')
  @ApiOperation({ summary: 'List all units in an ACP' })
  async getUnits(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.units || [];
  }

  @Get('acp/:acpId/units/:unitId')
  @ApiOperation({ summary: 'Get unit view data' })
  async getUnit(
    @Param('acpId') acpId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.viewsService.getUnitViewData(acpId, unitId);
  }

  @Get('acp/:acpId/items')
  @ApiOperation({ summary: 'Get item list for an ACP' })
  async getItems(@Param('acpId') acpId: string) {
    return this.viewsService.getItemList(acpId);
  }

  @Get('acp/:acpId/sequences')
  @ApiOperation({ summary: 'List task sequences for an ACP' })
  async getSequences(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.sequences || [];
  }

  @Get('acp/:acpId/sequences/:sequenceId')
  @ApiOperation({ summary: 'Get task sequence with ordered units' })
  async getSequence(
    @Param('acpId') acpId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.viewsService.getTaskSequence(acpId, sequenceId);
  }
}
