import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { ItemResponseStateService } from './item-response-state.service';
import { Acp, ItemResponseState } from '../database/entities';
import { FilesModule } from '../files/files.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Acp, ItemResponseState]), FilesModule, AuthModule],
  controllers: [ItemsController],
  providers: [ItemsService, ItemResponseStateService],
  exports: [ItemsService],
})
export class ItemsModule {}
