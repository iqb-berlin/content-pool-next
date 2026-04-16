import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ViewsService } from './views.service';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';

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
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'ACP start page data' })
  async getAcpStartPage(@Param('acpId') acpId: string) {
    return this.viewsService.getAcpStartPage(acpId);
  }

  @Get('acp/:acpId/index')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get ACP-Index for read-only view' })
  async getAcpIndex(@Param('acpId') acpId: string) {
    return this.viewsService.getAcpIndex(acpId);
  }

  @Get('acp/:acpId/index/export')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Export ACP-Index JSON for read-only view' })
  async exportAcpIndex(@Param('acpId') acpId: string, @Res() res: Response) {
    const index = await this.viewsService.getAcpIndex(acpId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="acp-index-${acpId}.json"`);
    res.json(index || {});
  }

  @Get('acp/:acpId/units')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'List all units in an ACP' })
  async getUnits(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.units || [];
  }

  @Get('acp/:acpId/units/:unitId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get unit view data' })
  async getUnit(
    @Param('acpId') acpId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.viewsService.getUnitViewData(acpId, unitId);
  }

  @Get('acp/:acpId/items')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get item list for an ACP' })
  async getItems(@Param('acpId') acpId: string) {
    return this.viewsService.getItemList(acpId);
  }

  @Get('acp/:acpId/sequences')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'List task sequences for an ACP' })
  async getSequences(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.sequences || [];
  }

  @Get('acp/:acpId/sequences/:sequenceId')
  @UseGuards(AcpAccessGuard)
  @ApiOperation({ summary: 'Get task sequence with ordered units' })
  async getSequence(
    @Param('acpId') acpId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.viewsService.getTaskSequence(acpId, sequenceId);
  }
}
