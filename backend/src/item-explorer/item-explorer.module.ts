import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Acp,
  AcpAccessConfig,
  AcpItemExplorerChangeLog,
  AcpItemExplorerState,
} from "../database/entities";
import { ItemExplorerStateService } from "./item-explorer-state.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Acp,
      AcpAccessConfig,
      AcpItemExplorerState,
      AcpItemExplorerChangeLog,
    ]),
  ],
  providers: [ItemExplorerStateService],
  exports: [ItemExplorerStateService],
})
export class ItemExplorerModule {}
