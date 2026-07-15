import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcpItemPreference } from "../database/entities";
import { FilesModule } from "../files/files.module";
import { ItemExplorerModule } from "../item-explorer/item-explorer.module";
import { ItemCollectionStore } from "./item-collection.store";
import { ItemCollectionsService } from "./item-collections.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AcpItemPreference]),
    FilesModule,
    ItemExplorerModule,
  ],
  providers: [ItemCollectionStore, ItemCollectionsService],
  exports: [ItemCollectionsService],
})
export class ItemCollectionsModule {}
