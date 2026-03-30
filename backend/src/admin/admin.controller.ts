import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OidcAuthGuard } from '../auth/guards/oidc-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Administration')
@Controller('admin')
@UseGuards(JwtAuthGuard, OidcAuthGuard, RolesGuard)
@Roles('APP_ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get application settings' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update application settings' })
  async updateSettings(@Body() data: Record<string, unknown>) {
    return this.adminService.updateSettings(data as any);
  }
}
