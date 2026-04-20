import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ValidationService } from "./validation.service";
import { AcpFile, Acp } from "../database/entities";

@Module({
  imports: [TypeOrmModule.forFeature([AcpFile, Acp])],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
