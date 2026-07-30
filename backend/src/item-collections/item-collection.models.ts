export interface StoredItemCollection {
  id: string;
  name: string;
  rowKeys: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  shared?: boolean;
}

export type ItemCollectionViewMode = "all" | "active";

export interface ItemCollectionState {
  collections: StoredItemCollection[];
  activeCollectionId: string | null;
  collectionViewMode: ItemCollectionViewMode;
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
  shared: boolean;
  unavailableRowKeys: string[];
  summary: ItemCollectionSummary;
  ownedByCurrentUser: boolean;
  ownerLabel: string;
}

export interface SharedItemCollectionSource {
  collection: StoredItemCollection;
  ownerLabel: string;
}

export interface ItemCollectionsPayload {
  activeCollectionId: string | null;
  collectionViewMode: ItemCollectionViewMode;
  collections: ItemCollectionView[];
  sharedCollectionsTruncated: boolean;
}

export interface ItemCollectionRowsMutation {
  baseVersion?: unknown;
  addRowKeys?: unknown;
  removeRowKeys?: unknown;
  clear?: unknown;
}

export interface ItemCollectionRowsMutationResult {
  collectionId: string;
  version: number;
  updatedAt: string;
  summary: ItemCollectionSummary;
}
