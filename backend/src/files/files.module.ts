import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MulterModule } from "@nestjs/platform-express";
import { FilesService } from "./files.service";
import { FilesController } from "./files.controller";
import { UnitParserService } from "./unit-parser.service";
import {
  AcpFile,
  AcpFileProcessingJob,
  Acp,
  AcpUserRole,
  AcpAccessConfig,
  ItemResponseState,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { ValidationModule } from "../validation/validation.module";
import { FileProcessingJobsService } from "./file-processing-jobs.service";

const MAX_UPLOAD_FILE_SIZE_BYTES = 512 * 1024 * 1024;

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcpFile,
      AcpFileProcessingJob,
      Acp,
      AcpUserRole,
      AcpAccessConfig,
      ItemResponseState,
    ]),
    MulterModule.register({
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES }, // 512MB
    }),
    AuthModule,
    ValidationModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, UnitParserService, FileProcessingJobsService],
  exports: [FilesService, UnitParserService, FileProcessingJobsService],
})
export class FilesModule {}
