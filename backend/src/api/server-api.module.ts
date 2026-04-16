import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerApiService } from './server-api.service';
import { ServerApiController } from './server-api.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpFile, ServerApiAuditLog]), FilesModule],
  controllers: [ServerApiController],
  providers: [ServerApiService],
  exports: [ServerApiService],
})
export class ServerApiModule {}
