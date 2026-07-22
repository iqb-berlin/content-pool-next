import { CodingAsText } from '@iqb/responses';
import { ItemExplorerPerspective } from '../../core/models/api.models';

export type DeepReadonly<T> = T extends (...args: infer _Args) => infer _Result
  ? T
  : T extends ReadonlyArray<infer Item>
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface MetadataColumn {
  id: string;
  label: string;
  visible?: boolean;
  kind?: 'text' | 'number' | 'booklet' | 'position';
}

export interface ExplorerItem {
  itemId: string;
  uuid: string;
  rowKey: string;
  rowNumber?: number;
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
  bookletOccurrences?: Array<{ booklet: string; position: number }>;
  tags?: string[];
  previewTargetId?: string;
  excluded?: boolean;
}

export type ReadonlyExplorerItem = DeepReadonly<ExplorerItem>;

export interface MetadataSettings {
  visible: string[];
  order: string[];
  referenceNumberVisible?: boolean;
}

export interface PersonalItemTagConfig {
  label: string;
  color: string;
}

export interface PersonalItemRowData {
  [key: string]: unknown;
  category?: string;
  tags?: string[];
  note?: string;
}

export interface PendingPersonalRowUpdate {
  version: number;
  rowData: PersonalItemRowData | null;
  perspective: ItemExplorerPerspective;
}

export interface SuspendedPersonalSession {
  identity: string;
  updates: Array<[string, PendingPersonalRowUpdate]>;
}

export interface ItemParameterUploadSuccess {
  unitId?: string;
  itemId?: string;
  subId?: string;
  value?: number;
  fields?: string[];
  bookletOccurrences?: Array<{ booklet: string; position: number }>;
}

export type ReadonlyItemParameterUploadSuccess = DeepReadonly<ItemParameterUploadSuccess>;

export interface ItemParameterUploadResult {
  updated: number;
  failed: Array<{ csvRow: string; reason: string }>;
  successes: ItemParameterUploadSuccess[];
  showOnlyItemsWithEmpiricalDifficulty?: boolean;
}

export type PersonalDataLoadState = 'idle' | 'loading' | 'loaded' | 'error';
export type PersonalDataSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface PreviewTargetOption {
  id: string;
  label: string;
  sourceType: string;
}

export interface PreviewTargetResolution {
  itemTarget: string;
  isDerived: boolean;
  options: PreviewTargetOption[];
  defaultTargetId: string;
}

export type CodingVariableFocusStatus = 'unique' | 'missing-target' | 'not-found' | 'ambiguous';

export interface CodingVariableFocusResolution {
  status: CodingVariableFocusStatus;
  targetId: string;
  codingId: string;
  matches: CodingAsText[];
  isDerived: boolean;
  sourceIds: string[];
}

export type ExplorerUiStatus = 'CLEAN' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';

export type PreviewStatus =
  | { kind: 'idle' }
  | { kind: 'loading-unit'; item: ExplorerItem }
  | { kind: 'loading-response'; item: ExplorerItem; reuseUnit: true }
  | { kind: 'ready'; item: ExplorerItem }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; reason: string };
