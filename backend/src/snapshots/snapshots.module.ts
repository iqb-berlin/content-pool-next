import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnapshotsService } from "./snapshots.service";
import { SnapshotsController } from "./snapshots.controller";
import {
  AcpSnapshot,
  AcpSnapshotFile,
  Acp,
  AcpFile,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AcpSnapshot, AcpSnapshotFile, Acp, AcpFile]),
    AuthModule,
  ],
  controllers: [SnapshotsController],
  providers: [SnapshotsService],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}
