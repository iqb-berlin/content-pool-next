import { SimpleItemListEntryDto } from "./dto/simple-item-list-entry.dto";

export interface SimpleItemListIndexUnit {
  id: string;
  name?: string;
}

export interface SimpleItemListIndexItem {
  id: string;
  name?: string;
  sourceVariable?: string;
  variableId?: string;
  variableReadOnlyId?: string;
  useUnitAliasAsPrefix?: boolean;
}

export function projectSimpleItemListEntry(
  unit: SimpleItemListIndexUnit,
  item: SimpleItemListIndexItem,
  meanTaskDifficulty?: number,
): SimpleItemListEntryDto {
  const projected: SimpleItemListEntryDto = {
    itemId:
      item.useUnitAliasAsPrefix !== false ? `${unit.id}_${item.id}` : item.id,
    unitId: unit.id,
    unitName: unit.name || unit.id,
    name: item.name,
    sourceVariable: item.sourceVariable,
    variableId: item.variableId,
    variableReadOnlyId: item.variableReadOnlyId,
  };

  return meanTaskDifficulty === undefined
    ? projected
    : { ...projected, meanTaskDifficulty };
}

export function simpleItemListKey(unitId: string, itemId: string): string {
  return `${unitId}\u0000${itemId}`;
}
