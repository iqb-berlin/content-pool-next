import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Acp } from '../database/entities';

/**
 * Items module - provides item list extraction from ACP-Index.
 * Most item logic is in ViewsService. This module will be extended
 * with item tagging and user preferences.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Acp])],
})
export class ItemsModule {}
