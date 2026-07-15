export interface StoredItemCollection {
  id: string;
  name: string;
  rowKeys: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCollectionState {
  collections: StoredItemCollection[];
  activeCollectionId: string | null;
}

export interface ItemCollectionSummary {
  rowCount: number;
  itemCount: number;
  unitCount: number;
  itemTimeSeconds: number;
  stimulusTimeSeconds: number;
  testTimeSeconds: number;
  missingItemTimeCount: number;
  missingStimulusTimeUnitCount: number;
  complete: boolean;
}

export interface ItemCollectionView extends StoredItemCollection {
  unavailableRowKeys: string[];
  summary: ItemCollectionSummary;
}

export interface ItemCollectionsPayload {
  activeCollectionId: string | null;
  collections: ItemCollectionView[];
}
