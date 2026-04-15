import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewsService } from './views.service';
import { ViewsController } from './views.controller';
import { Acp, AcpAccessConfig, AcpFile, AppSettings, AcpUserRole } from '../database/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpAccessConfig, AcpFile, AppSettings, AcpUserRole]), AuthModule],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
