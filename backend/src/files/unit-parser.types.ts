import type { AsyncCacheStatus } from "./async-lru-cache";

export interface UnitXmlData {
  unitId: string;
  unitLabel: string;
  description?: string;
  definitionRef: string;
  playerRef: string;
  codingSchemeRef?: string;
  metadataRef?: string;
}

export interface UnitValidationResult {
  unitId: string;
  unitLabel: string;
  valid: boolean;
  files: {
    xml: { expected: string; found: boolean };
    definition: { expected: string; found: boolean };
    codingScheme: { expected: string; found: boolean };
    metadata: { expected: string; found: boolean };
    player: { expected: string; found: boolean; resolvedName?: string };
  };
}

export interface MetadataColumn {
  id: string;
  label: string;
}

export interface VomdItemData {
  itemId: string;
  uuid: string;
  rowKey: string;
  subId?: string;
  subIdDisplay?: string;
  unitId: string;
  unitLabel: string;
  description: string;
  variableId: string;
  sourceVariable?: string;
  metadata: Record<string, string>;
  empiricalDifficulty?: number;
  meanTaskDifficulty?: number;
  infit?: number;
  discrimination?: number;
  solutionRate?: number;
  itemTimeSeconds?: number;
  stimulusTimeSeconds?: number;
  bookletOccurrences: Array<{ booklet: string; position: number }>;
  tags?: string[];
  rowNumber: number;
}

export interface ItemListResult {
  columns: MetadataColumn[];
  items: VomdItemData[];
  subIdLabel: string;
  subIdLabels: Record<string, string>;
  unitMetadata: Record<string, any[]>;
  codingSchemes: Record<string, any>;
}

export type ItemExplorerCacheStatus = AsyncCacheStatus;

export interface ItemExplorerLoadDiagnostics {
  cacheStatus: ItemExplorerCacheStatus;
  rowCacheStatus: ItemExplorerCacheStatus;
  sourceReadMs: number;
  fileSignatureMs: number;
  explorerStateMs?: number;
  rowNumberRevisionMs: number;
  parseMs: number;
  rowNumberingMs: number;
  totalMs: number;
}
