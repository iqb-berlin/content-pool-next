import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ItemsService } from "./items.service";
import { ItemsController } from "./items.controller";
import { ItemResponseStateService } from "./item-response-state.service";
import { Acp, AcpAccessConfig, ItemResponseState } from "../database/entities";
import { FilesModule } from "../files/files.module";
import { AuthModule } from "../auth/auth.module";
import { ItemExplorerModule } from "../item-explorer/item-explorer.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Acp, AcpAccessConfig, ItemResponseState]),
    FilesModule,
    AuthModule,
    ItemExplorerModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService, ItemResponseStateService],
  exports: [ItemsService],
})
export class ItemsModule {}
