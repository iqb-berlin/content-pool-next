import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SnapshotsService } from './snapshots.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSnapshotDto } from '../acp/dto/acp.dto';

@ApiTags('ACP Snapshots')
@Controller('acp/:acpId/snapshots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @Get()
  @ApiOperation({ summary: 'List all snapshots for an ACP' })
  async findAll(@Param('acpId') acpId: string) {
    return this.snapshotsService.findByAcp(acpId);
  }

  @Get(':snapshotId')
  @ApiOperation({ summary: 'Get snapshot details' })
  async findOne(@Param('snapshotId') snapshotId: string) {
    return this.snapshotsService.findById(snapshotId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new snapshot' })
  async create(
    @Param('acpId') acpId: string,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.snapshotsService.create(acpId, dto.changelog);
  }

  @Post(':snapshotId/restore')
  @ApiOperation({ summary: 'Restore ACP to a snapshot' })
  async restore(@Param('snapshotId') snapshotId: string) {
    return this.snapshotsService.restore(snapshotId);
  }

  @Get(':snapshotId/diff')
  @ApiOperation({ summary: 'Compare snapshot with previous' })
  async diff(@Param('snapshotId') snapshotId: string) {
    return this.snapshotsService.diff(snapshotId);
  }

  @Get(':snapshotId/diff/current')
  @ApiOperation({ summary: 'Compare snapshot with current ACP state' })
  async diffWithCurrent(@Param('snapshotId') snapshotId: string) {
    return this.snapshotsService.diffWithCurrent(snapshotId);
  }

  @Delete(':snapshotId')
  @ApiOperation({ summary: 'Delete snapshot' })
  async delete(@Param('snapshotId') snapshotId: string) {
    await this.snapshotsService.delete(snapshotId);
    return { message: 'Snapshot deleted successfully' };
  }
}
