import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerApiService } from './server-api.service';
import { ServerApiController } from './server-api.controller';
import { Acp, AcpFile, ServerApiAuditLog } from '../database/entities';
import { FilesModule } from '../files/files.module';
import { ServerApiAuthService } from './server-api-auth.service';
import { ServerApiAuthGuard } from './server-api-auth.guard';
import { ServerApiAuditService } from './server-api-audit.service';
import { ServerApiAuditInterceptor } from './server-api-audit.interceptor';
import { SnapshotsModule } from '../snapshots/snapshots.module';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpFile, ServerApiAuditLog]), FilesModule, SnapshotsModule],
  controllers: [ServerApiController],
  providers: [
    ServerApiService,
    ServerApiAuthService,
    ServerApiAuthGuard,
    ServerApiAuditService,
    ServerApiAuditInterceptor,
  ],
  exports: [ServerApiService],
})
export class ServerApiModule {}
