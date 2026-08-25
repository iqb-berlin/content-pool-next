import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SimpleItemListEntryDto {
  @ApiProperty()
  itemId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  unitName!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  sourceVariable?: string;

  @ApiPropertyOptional()
  variableId?: string;

  @ApiPropertyOptional()
  variableReadOnlyId?: string;

  @ApiPropertyOptional({ type: Number })
  meanTaskDifficulty?: number;
}
