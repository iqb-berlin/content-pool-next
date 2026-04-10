import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ViewsService } from './views.service';
import { AcpAccessGuard } from '../auth/guards/acp-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OidcAuthGuard } from '../auth/guards/oidc-auth.guard';

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
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ACP start page data' })
  async getAcpStartPage(@Param('acpId') acpId: string) {
    return this.viewsService.getAcpStartPage(acpId);
  }

  @Get('acp/:acpId/units')
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all units in an ACP' })
  async getUnits(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.units || [];
  }

  @Get('acp/:acpId/units/:unitId')
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unit view data' })
  async getUnit(
    @Param('acpId') acpId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.viewsService.getUnitViewData(acpId, unitId);
  }

  @Get('acp/:acpId/items')
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get item list for an ACP' })
  async getItems(@Param('acpId') acpId: string) {
    return this.viewsService.getItemList(acpId);
  }

  @Get('acp/:acpId/sequences')
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List task sequences for an ACP' })
  async getSequences(@Param('acpId') acpId: string) {
    const data = await this.viewsService.getAcpStartPage(acpId);
    return data?.sequences || [];
  }

  @Get('acp/:acpId/sequences/:sequenceId')
  @UseGuards(JwtAuthGuard, OidcAuthGuard, AcpAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get task sequence with ordered units' })
  async getSequence(
    @Param('acpId') acpId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.viewsService.getTaskSequence(acpId, sequenceId);
  }
}
