import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcpService } from './acp.service';
import { AcpController } from './acp.controller';
import { Acp, AcpUserRole, AcpAccessConfig, AcpCredential, AppSettings } from '../database/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Acp, AcpUserRole, AcpAccessConfig, AcpCredential, AppSettings]),
    AuthModule,
  ],
  controllers: [AcpController],
  providers: [AcpService],
  exports: [AcpService],
})
export class AcpModule {}
