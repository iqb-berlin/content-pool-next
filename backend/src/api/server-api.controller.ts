import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ServerApiService } from './server-api.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Server API')
@Controller('server')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ServerApiController {
  constructor(private readonly serverApiService: ServerApiService) {}

  @Get('acp')
  @ApiOperation({ summary: 'List all ACPs (server-to-server)' })
  async listAcps() {
    return this.serverApiService.listAcps();
  }

  @Get('acp/:acpId')
  @ApiOperation({ summary: 'Get ACP transfer data (index + file list)' })
  async getAcp(@Param('acpId') acpId: string) {
    return this.serverApiService.getAcpTransferData(acpId);
  }

  @Post('acp')
  @ApiOperation({ summary: 'Receive ACP data from external application (create or update)' })
  async receiveAcp(
    @Body() body: { packageId: string; name: string; description?: string; acpIndex: Record<string, any> },
  ) {
    return this.serverApiService.receiveAcp(body);
  }
}
