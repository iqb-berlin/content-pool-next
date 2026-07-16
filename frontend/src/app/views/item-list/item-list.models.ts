export type ItemListSortField = 'itemId' | 'unitId' | 'name' | 'meanTaskDifficulty';

export interface ItemListUiPreferences extends Record<string, unknown> {
  filterText: string;
  meanTaskDifficultyFilter: string;
  sortField: ItemListSortField;
  sortDir: 'asc' | 'desc';
}

export interface ItemListPreferences {
  ui: ItemListUiPreferences;
  tags: Record<string, string[]>;
}
