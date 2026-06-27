export type ReportType = 'content' | 'abuse';

export const REPORT_SOURCE_VALUES = [
  'automated_hash_check',
  'automated_csam_hash',
  'automated_rekognition',
  'manual_user',
] as const;

export type ReportSource =
  | (typeof REPORT_SOURCE_VALUES)[number]
  | 'unknown';

export type ReportSourceI18nKey =
  | 'sourceManual'
  | 'sourceAutoHashCheck'
  | 'sourceAutoCsamHash'
  | 'sourceAutoRekognition'
  | 'sourceUnknown';

/** Coerce API/DB source strings to a known ReportSource; unknown inputs become `unknown`. */
export function normalizeReportSource(source: string): ReportSource {
  if ((REPORT_SOURCE_VALUES as readonly string[]).includes(source)) {
    return source as ReportSource;
  }
  return 'unknown';
}

/** i18n key under `moderation.reports` for a report source label. */
export function getReportSourceI18nKey(source: string): ReportSourceI18nKey {
  switch (normalizeReportSource(source)) {
    case 'manual_user':
      return 'sourceManual';
    case 'automated_csam_hash':
      return 'sourceAutoCsamHash';
    case 'automated_hash_check':
      return 'sourceAutoHashCheck';
    case 'automated_rekognition':
      return 'sourceAutoRekognition';
    case 'unknown':
      return 'sourceUnknown';
  }
}
export type ModerationReportStatus = 'open' | 'escalated' | 'resolved' | 'closed';
export type ReportCategory =
  | 'csam'
  | 'illegal_content'
  | 'violence'
  | 'harassment'
  | 'spam'
  | 'impersonation'
  | 'other';

export interface ReportTargetRef {
  type: string;
  id: string;
  mediaUrl?: string;
}

export interface ReportResolution {
  contentRemoved: boolean;
  userWarned: boolean;
  aliasSuspendedMs: number;
  aliasBanned: boolean;
  reason: string;
  resolvedByIdentityId: string;
  resolvedAt: string;
}

export interface PublicEvidenceAttachment {
  e2eMediaId: string;
  encryptionKey: string;
  encryptionNonce: string;
  contentType: string;
  fileName?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/** GIF/sticker metadata from decrypted message payload (URL references). */
export interface PublicEvidenceGifAttachment {
  provider: 'klipy';
  type: 'gif' | 'sticker';
  url: string;
  posterUrl?: string;
  previewUrl: string;
  tinyUrl: string;
  blurPreview: string;
  width: number;
  height: number;
  searchTerm: string;
  title?: string;
  slug: string;
}

export interface PublicMessageEvidence {
  messageId: string;
  fromIdentityId: string;
  conversationId: string;
  decryptedText: string;
  signatureVerified: boolean;
  isTargetMessage: boolean;
  attachments?: PublicEvidenceAttachment[];
  gifAttachments?: PublicEvidenceGifAttachment[];
  createdAt: string;
}

export interface PublicProfileEvidence {
  identityId: string;
  displayName: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  snapshotAt: string;
}

export interface PublicReportEvidence {
  type: 'message' | 'profile';
  /** Messages before/after the target included in this report (manual message reports). */
  contextMessageCount?: number;
  messageEvidence?: PublicMessageEvidence[];
  profileEvidence?: PublicProfileEvidence;
}

export interface PublicReport {
  id: string;
  reportType: ReportType;
  source: ReportSource;
  status: ModerationReportStatus;
  category: ReportCategory;
  scopeType: string;
  scopeId?: string;
  targetRef: ReportTargetRef;
  targetIdentityId?: string;
  targetUserId?: string;
  reporterIdentityId?: string;
  reporterUserId?: string;
  assignedTo?: string;
  detectionMetadata?: Record<string, unknown>;
  evidence?: PublicReportEvidence;
  reporterReason?: string;
  resolution?: ReportResolution;
  closureReason?: string;
  closedByIdentityId?: string;
  closedAt?: string;
  escalatedByIdentityId?: string;
  escalatedAt?: string;
  leReportFiled?: boolean;
  leReportFiledAt?: string;
  leReportFiledBy?: string;
  ncmecReportId?: string;
  ncmecStatus?: string;
  ncmecError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicReportEvent {
  id: string;
  reportId: string;
  eventType: string;
  actorIdentityId: string;
  body?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ReportListParams {
  page?: number;
  limit?: number;
  status?: string;
  assigned?: 'me' | 'unassigned';
  type?: string;
  category?: string;
  targetIdentityId?: string;
  reporterIdentityId?: string;
}

export interface ReportListResponse {
  reports: PublicReport[];
  total: number;
  page: number;
  limit: number;
}

export interface ModerationIdentityProfile {
  displayName: string;
  username: string;
  avatarUrl?: string;
}

export interface ReportDetailResponse {
  report: PublicReport;
  events: PublicReportEvent[];
  identityProfiles: Record<string, ModerationIdentityProfile>;
}

export interface ResolveReportParams {
  reason: string;
  removeContent?: boolean;
  warnUser?: boolean;
  suspendAliasMs?: number;
  banAlias?: boolean;
}

export interface ModerationModerator {
  identityId: string;
  displayName: string;
  username: string;
}

export interface ModeratorsListResponse {
  moderators: ModerationModerator[];
}

/** Presigned S3 GET for one conv_scan object (moderator-only API). */
export interface ModerationScanEvidenceItem {
  mediaId: string;
  contentType: string;
  downloadUrl: string;
}

export interface ModerationScanEvidenceResponse {
  expiresInSeconds: number;
  items: ModerationScanEvidenceItem[];
}

export type LeReportCategory = 'csam';

export interface FileLeReportParams {
  category: LeReportCategory;
  notes?: string;
}
