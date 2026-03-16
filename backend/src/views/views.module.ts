import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewsService } from './views.service';
import { ViewsController } from './views.controller';
import { Acp, AcpAccessConfig, AcpFile } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpAccessConfig, AcpFile])],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
