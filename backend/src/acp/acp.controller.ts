import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Res,
  Header,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AcpService } from './acp.service';
import {
  CreateAcpDto,
  UpdateAcpDto,
  AssignRoleDto,
  UpdateAccessConfigDto,
  UploadCredentialsDto,
  UpdateMetadataColumnsDto,
} from './dto/acp.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('ACP Management')
@Controller('acp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AcpController {
  private readonly logger = new Logger(AcpController.name);
  
  constructor(private readonly acpService: AcpService) {}

  @Get()
  @ApiOperation({ summary: 'List all ACPs accessible to the current user' })
  async findAll(@Request() req: any) {
    if (req.user.isAppAdmin) {
      return this.acpService.findAll();
    }
    return this.acpService.findByUser(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ACP by ID' })
  async findOne(@Param('id') id: string) {
    return this.acpService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('APP_ADMIN')
  @ApiOperation({ summary: 'Create a new ACP (Admin only)' })
  async create(@Body() dto: CreateAcpDto) {
    return this.acpService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ACP name/description' })
  async update(@Param('id') id: string, @Body() dto: UpdateAcpDto) {
    return this.acpService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('APP_ADMIN')
  @ApiOperation({ summary: 'Delete ACP (Admin only)' })
  async delete(@Param('id') id: string) {
    return this.acpService.delete(id);
  }

  // ACP-Index endpoints
  @Get(':id/index')
  @ApiOperation({ summary: 'Get ACP-Index' })
  async getIndex(@Param('id') id: string) {
    return this.acpService.getIndex(id);
  }

  @Put(':id/index')
  @ApiOperation({ summary: 'Update ACP-Index' })
  async updateIndex(@Param('id') id: string, @Body() index: Record<string, unknown>) {
    return this.acpService.updateIndex(id, index);
  }

  @Post(':id/index/import')
  @ApiOperation({ summary: 'Import ACP-Index from JSON (replaces existing)' })
  async importIndex(@Param('id') id: string, @Body() index: Record<string, unknown>) {
    return this.acpService.importIndex(id, index);
  }

  @Get(':id/index/export')
  @Header('Content-Type', 'application/json')
  @ApiOperation({ summary: 'Export ACP-Index as JSON file download' })
  async exportIndex(@Param('id') id: string, @Res() res: Response) {
    const index = await this.acpService.getIndex(id);
    res.setHeader('Content-Disposition', `attachment; filename="acp-index-${id}.json"`);
    res.json(index);
  }

  // Role management
  @Get(':id/roles')
  @ApiOperation({ summary: 'List role assignments for ACP' })
  async getRoles(@Param('id') id: string) {
    return this.acpService.getRoles(id);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('APP_ADMIN')
  @ApiOperation({ summary: 'Assign user role for ACP (Admin only)' })
  async assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.acpService.assignRole(id, dto);
  }

  @Delete(':id/roles/:userId')
  @UseGuards(RolesGuard)
  @Roles('APP_ADMIN')
  @ApiOperation({ summary: 'Remove user role for ACP (Admin only)' })
  async removeRole(@Param('id') id: string, @Param('userId') userId: string) {
    return this.acpService.removeRole(id, userId);
  }

  // Access configuration
  @Get(':id/access')
  @ApiOperation({ summary: 'Get access configuration for ACP' })
  async getAccessConfig(@Param('id') id: string) {
    return this.acpService.getAccessConfig(id);
  }

  @Put(':id/access')
  @ApiOperation({ summary: 'Update access configuration for ACP' })
  async updateAccessConfig(@Param('id') id: string, @Body() dto: UpdateAccessConfigDto) {
    return this.acpService.updateAccessConfig(id, dto);
  }

  @Post(':id/access/credentials')
  @ApiOperation({ summary: 'Upload credentials list for ACP' })
  async uploadCredentials(@Param('id') id: string, @Body() dto: UploadCredentialsDto) {
    const count = await this.acpService.uploadCredentials(id, dto.credentials);
    return { message: `${count} credentials uploaded successfully` };
  }

  @Put(':id/metadata-columns')
  @UseGuards(RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiOperation({ summary: 'Update metadata column visibility and order (ACP Manager only)' })
  async updateMetadataColumns(@Param('id') id: string, @Body() dto: UpdateMetadataColumnsDto, @Request() req: any) {
    this.logger.log(`Updating metadata columns for ACP ${id} by user ${req.user?.sub}`, {
      userRoles: req.user?.roles,
      userAcpRoles: req.user?.acpRoles,
      dto
    });
    
    try {
      const result = await this.acpService.updateMetadataColumns(id, dto);
      this.logger.log(`Successfully updated metadata columns for ACP ${id}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to update metadata columns for ACP ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
