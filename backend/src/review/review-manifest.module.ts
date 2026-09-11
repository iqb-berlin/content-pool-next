import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Acp, AcpFile } from "../database/entities";
import { ReviewManifestService } from "./review-manifest.service";

@Module({
  imports: [TypeOrmModule.forFeature([Acp, AcpFile])],
  providers: [ReviewManifestService],
  exports: [ReviewManifestService],
})
export class ReviewManifestModule {}
