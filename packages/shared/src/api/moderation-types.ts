export type ReportType = 'content' | 'abuse';
export type ReportSource = 'automated_rekognition' | 'manual_user';
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

export interface PublicMessageEvidence {
  messageId: string;
  fromIdentityId: string;
  conversationId: string;
  decryptedText: string;
  signatureVerified: boolean;
  isTargetMessage: boolean;
  attachments?: PublicEvidenceAttachment[];
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
