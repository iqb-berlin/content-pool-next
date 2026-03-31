import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
  Logger,
  ForbiddenException,
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
  CreateCredentialDto,
  UpdateCredentialDto,
} from './dto/acp.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OidcAuthGuard } from '../auth/guards/oidc-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('ACP Management')
@Controller('acp')
@UseGuards(JwtAuthGuard, OidcAuthGuard)
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
  @UseGuards(RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiOperation({ summary: 'List role assignments for ACP' })
  async getRoles(@Param('id') id: string) {
    return this.acpService.getRoles(id);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiOperation({ summary: 'Assign user role for ACP (ACP Manager can assign READ_ONLY only)' })
  async assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @Request() req: any) {
    // If user is not App Admin, they can only assign READ_ONLY role
    if (!req.user?.isAppAdmin && dto.role === 'ACP_MANAGER') {
      throw new ForbiddenException('Only Application Admins can assign ACP_MANAGER role');
    }
    return this.acpService.assignRole(id, dto);
  }

  @Delete(':id/roles/:userId')
  @UseGuards(RolesGuard)
  @Roles('ACP_MANAGER')
  @ApiOperation({ summary: 'Remove user role for ACP (ACP Manager can remove READ_ONLY only)' })
  async removeRole(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) {
    // If user is not App Admin, check if they're removing an ACP_MANAGER role (which is forbidden)
    if (!req.user?.isAppAdmin) {
      const roles = await this.acpService.getRoles(id);
      const roleToRemove = roles.find(r => r.userId === userId);
      if (roleToRemove?.role === 'ACP_MANAGER') {
        throw new ForbiddenException('Only Application Admins can remove ACP_MANAGER role');
      }
    }
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
  async uploadCredentials(
    @Param('id') id: string,
    @Query('mode') mode: 'replace' | 'append' | 'upsert' = 'replace',
    @Body() dto: UploadCredentialsDto,
  ) {
    const result = await this.acpService.uploadCredentials(id, dto.credentials, mode);
    return {
      message: `Credentials processed: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped`,
      ...result,
    };
  }

  @Get(':id/access/credentials')
  @ApiOperation({ summary: 'Get credentials list for ACP' })
  async getCredentials(@Param('id') id: string) {
    return this.acpService.getCredentials(id);
  }

  @Delete(':id/access/credentials/:credentialId')
  @ApiOperation({ summary: 'Delete a credential from ACP' })
  async deleteCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    await this.acpService.deleteCredential(id, credentialId);
    return { message: 'Credential deleted successfully' };
  }

  @Post(':id/access/credentials/single')
  @ApiOperation({ summary: 'Create a single credential for ACP' })
  async createCredential(@Param('id') id: string, @Body() dto: CreateCredentialDto) {
    return this.acpService.createCredential(id, dto);
  }

  @Patch(':id/access/credentials/:credentialId')
  @ApiOperation({ summary: 'Update a credential' })
  async updateCredential(
    @Param('id') id: string,
    @Param('credentialId') credentialId: string,
    @Body() dto: UpdateCredentialDto,
  ) {
    return this.acpService.updateCredential(id, credentialId, dto);
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
