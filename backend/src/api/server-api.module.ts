import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerApiService } from './server-api.service';
import { ServerApiController } from './server-api.controller';
import { Acp, AcpFile, AcpAccessConfig } from '../database/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpFile, AcpAccessConfig]), AuthModule],
  controllers: [ServerApiController],
  providers: [ServerApiService],
  exports: [ServerApiService],
})
export class ServerApiModule {}
