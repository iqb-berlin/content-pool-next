import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcpService } from "./acp.service";
import { AcpController } from "./acp.controller";
import {
  Acp,
  AcpUserRole,
  AcpAccessConfig,
  AcpCredential,
  AppSettings,
  User,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { ItemExplorerModule } from "../item-explorer/item-explorer.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Acp,
      AcpUserRole,
      AcpAccessConfig,
      AcpCredential,
      AppSettings,
      User,
    ]),
    AuthModule,
    ItemExplorerModule,
  ],
  controllers: [AcpController],
  providers: [AcpService],
  exports: [AcpService],
})
export class AcpModule {}
