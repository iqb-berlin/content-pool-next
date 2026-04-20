import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { UnitParserService } from './unit-parser.service';
import {
  AcpFile,
  Acp,
  AcpUserRole,
  AcpAccessConfig,
  ItemResponseState,
} from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcpFile,
      Acp,
      AcpUserRole,
      AcpAccessConfig,
      ItemResponseState,
    ]),
    MulterModule.register({
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    }),
    AuthModule,
    ValidationModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, UnitParserService],
  exports: [FilesService, UnitParserService],
})
export class FilesModule {}
