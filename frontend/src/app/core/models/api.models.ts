export interface User {
  id: string;
  username: string;
  displayName?: string;
  isAppAdmin: boolean;
  oidcSub?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface CredentialLoginResponse {
  accessToken: string;
  acpId: string;
  username: string;
}

export interface AcpRole {
  acpId: string;
  acpName?: string;
  role: 'ACP_MANAGER' | 'READ_ONLY';
}

export interface UserProfile extends User {
  acpRoles: AcpRole[];
}

export interface Acp {
  id: string;
  packageId: string;
  name: string;
  description?: string;
  acpIndex: Record<string, any>;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AcpFile {
  id: string;
  acpId: string;
  filePath: string;
  originalName: string;
  fileType?: string;
  fileSize: number;
  checksum?: string;
  validationResult?: ValidationResult;
  uploadedAt: string;
}

export interface IndexSyncReport {
  unitsAdded: number;
  unitsUpdated: number;
  itemsAdded: number;
  itemsUpdated: number;
  warnings: string[];
}

export type FileUploadConflictStrategy = 'reject' | 'overwrite' | 'keep-both';

export interface FileUploadResponse {
  files: AcpFile[];
  syncReport: IndexSyncReport;
  validationSummary?: UploadValidationSummary;
}

export interface UploadValidationSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  semanticValid: boolean;
  semanticIssueCount: number;
  timestamp: string;
}

export interface UnitFileValidationResult {
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

export interface ValidateUnitsResponse {
  unitResults: UnitFileValidationResult[];
  validationSummary: UploadValidationSummary;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  timestamp: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  path?: string;
}

export interface AcpSnapshot {
  id: string;
  acpId: string;
  versionNumber: number;
  acpIndexSnapshot: Record<string, any>;
  changelog?: string;
  createdAt: string;
}

export interface SnapshotCurrentDiff {
  snapshotId: string;
  comparedWith: 'current';
  indexChanged: boolean;
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: number;
}

export interface AccessConfig {
  id: string;
  acpId: string;
  accessModel: 'PUBLIC' | 'REGISTERED' | 'CREDENTIALS_LIST';
  allowRegistered?: boolean;
  featureConfig: FeatureConfig;
  validFrom?: string;
  validUntil?: string;
}

export interface Credential {
  id: string;
  username: string;
}

export interface MetadataColumnsConfig {
  visible?: string[];
  order?: string[];
}

export interface FeatureConfig {
  allowIndexDownload?: boolean;
  allowUnitDownload?: boolean;
  allowFileDownload?: boolean;
  enableUnitView?: boolean;
  showMetadata?: boolean;
  showRichText?: boolean;
  showCodingScheme?: boolean;
  enableUnitListNavigation?: boolean;
  enableSequenceNavigation?: boolean;
  enableCommenting?: boolean;
  commentTargets?: string[];
  enableItemList?: boolean;
  metadataColumns?: MetadataColumnsConfig;
  // Legacy key (read-only compatibility)
  itemListMetadataColumns?: string[];
  enableItemClick?: boolean;
  enableItemListFilter?: boolean;
  enableItemListSort?: boolean;
  enableItemListTags?: boolean;
  showAudioVideoCodingVariables?: boolean;
  showItemExplorerPlayerTargetInfo?: boolean;
  availableTags?: string[];
  persistUserPreferences?: boolean;
}

export interface Comment {
  id: string;
  acpId: string;
  userId?: string;
  credentialUsername?: string;
  targetType: 'UNIT' | 'ITEM' | 'TASK_SEQUENCE';
  targetId: string;
  commentText: string;
  createdAt: string;
}

export interface AppSettings {
  id: string;
  theme: Record<string, any>;
  language: string;
  logoUrl?: string;
  landingPageHtml?: string;
  imprintHtml?: string;
  privacyHtml?: string;
  accessibilityHtml?: string;
  defaultAcpIndex: Record<string, any>;
}

export interface PublicAcp {
  id: string;
  name: string;
  description?: string;
  accessModel: string;
  requiresLogin?: boolean;
}

export interface UnitViewData {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  items: any[];
  dependencies: FileDependency[];
  codingScheme?: string;
  richText?: string;
}

export interface FileDependency {
  type: string;
  fileId: string;
  originalName: string;
  downloadUrl: string;
}

export interface ItemViewPreferences {
  ui?: Record<string, unknown>;
  tags?: Record<string, string[]>;
}

export interface ItemExplorerMetadataColumns {
  visible?: string[];
  order?: string[];
}

export interface ItemExplorerSharedState {
  ui?: Record<string, unknown>;
  tags?: Record<string, string[]>;
  metadataColumns?: ItemExplorerMetadataColumns;
  itemOrder?: string[];
  itemProperties?: Record<string, Record<string, unknown>>;
}

export interface ItemExplorerStateEnvelope {
  status: 'CLEAN' | 'DIRTY';
  version: number;
  publishedVersion: number;
  canEdit: boolean;
  canPublish: boolean;
  updatedAt: string;
  updatedByUsername?: string | null;
  updatedByRole?: string | null;
  activeState: ItemExplorerSharedState;
  publishedState: ItemExplorerSharedState;
  draftState: ItemExplorerSharedState;
}

export interface ItemExplorerChangeLogEntry {
  id: string;
  acpId: string;
  changeType: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  diff: Record<string, unknown>;
  draftVersion?: number | null;
  publishedVersion?: number | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  createdAt: string;
}

export interface TaskSequence {
  id: string;
  name: any;
  units: { id: string; name: string }[];
}

export interface OidcConfig {
  enabled: boolean;
  issuerUrl: string | null;
  clientId: string | null;
  redirectUri: string;
  scope: string;
}

export interface AuthContext {
  allowedMethods: ('oidc' | 'credentials')[];
  oidcEnabled: boolean;
  message: string;
}
