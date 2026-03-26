import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { UnitParserService } from './unit-parser.service';
import { AcpFile, Acp } from '../database/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AcpFile, Acp]),
    MulterModule.register({
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    }),
    AuthModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, UnitParserService],
  exports: [FilesService, UnitParserService],
})
export class FilesModule {}
