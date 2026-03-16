import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAcpDto {
  @ApiProperty({ example: 'vera-2026-math' })
  @IsString()
  @IsNotEmpty()
  packageId!: string;

  @ApiProperty({ example: 'VERA 2026 Mathematics' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAcpDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class AssignRoleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: ['ACP_MANAGER', 'READ_ONLY'] })
  @IsString()
  @IsNotEmpty()
  role!: string;
}

export class UpdateAccessConfigDto {
  @ApiProperty({ enum: ['PUBLIC', 'REGISTERED', 'CREDENTIALS_LIST'] })
  @IsString()
  @IsNotEmpty()
  accessModel!: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  featureConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}

export class CredentialEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  password!: string;
}

export class UploadCredentialsDto {
  @ApiProperty({ type: [CredentialEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialEntryDto)
  credentials!: CredentialEntryDto[];
}

export class CreateSnapshotDto {
  @ApiPropertyOptional({ description: 'Changelog text describing changes since last snapshot' })
  @IsString()
  @IsOptional()
  changelog?: string;
}
