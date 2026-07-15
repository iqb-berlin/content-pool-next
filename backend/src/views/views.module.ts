import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ViewsService } from "./views.service";
import { ViewsController } from "./views.controller";
import {
  Acp,
  AcpAccessConfig,
  AcpFile,
  AppSettings,
  AcpUserRole,
  AcpItemPreference,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { ItemExplorerModule } from "../item-explorer/item-explorer.module";
import { FilesModule } from "../files/files.module";
import { ItemCollectionsModule } from "../item-collections/item-collections.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Acp,
      AcpAccessConfig,
      AcpFile,
      AppSettings,
      AcpUserRole,
      AcpItemPreference,
    ]),
    AuthModule,
    ItemExplorerModule,
    FilesModule,
    ItemCollectionsModule,
  ],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
