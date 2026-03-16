export interface User {
  id: string;
  username: string;
  displayName?: string;
  isAppAdmin: boolean;
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

export interface AccessConfig {
  id: string;
  acpId: string;
  accessModel: 'PUBLIC' | 'REGISTERED' | 'CREDENTIALS_LIST';
  featureConfig: FeatureConfig;
  validFrom?: string;
  validUntil?: string;
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
  itemListMetadataColumns?: string[];
  enableItemClick?: boolean;
  enableItemListFilter?: boolean;
  enableItemListSort?: boolean;
  enableItemListTags?: boolean;
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

export interface TaskSequence {
  id: string;
  name: any;
  units: { id: string; name: string }[];
}
