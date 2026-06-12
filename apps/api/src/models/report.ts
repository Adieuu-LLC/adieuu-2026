/**
 * Platform report model.
 *
 * Represents a moderation report from automated CSAM hash checks, automated
 * hash-check rejections, or manual user submissions. Extensible for future
 * Space-level moderation via `scopeType` / `scopeId`.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export const REPORT_TYPES = ['content', 'abuse'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_SOURCES = [
  'automated_hash_check',
  'automated_csam_hash',
  'automated_rekognition',
  'manual_user',
] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const REPORT_STATUSES = ['open', 'escalated', 'resolved', 'closed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_CATEGORIES = [
  'csam',
  'illegal_content',
  'violence',
  'harassment',
  'spam',
  'impersonation',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const SCOPE_TYPES = ['platform', 'space'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export interface ReportTargetRef {
  /** Type of the reported content/entity */
  type: 'media_upload' | 'e2e_media' | 'message' | 'identity' | 'theme' | 'other';
  /** ID of the target entity */
  id: string;
  /** Optional S3 key or CDN URL for media evidence */
  mediaUrl?: string;
}

export interface ReportResolution {
  /** Whether the infringing content was removed */
  contentRemoved: boolean;
  /** Whether a warning was issued to the target user */
  userWarned: boolean;
  /** Alias suspension duration in milliseconds (0 = not suspended) */
  aliasSuspendedMs: number;
  /** Whether the alias was permanently banned */
  aliasBanned: boolean;
  /** Mandatory reason from the moderator */
  reason: string;
  /** Identity ID of the moderator who resolved */
  resolvedByIdentityId: string;
  resolvedAt: Date;
}

// ---------------------------------------------------------------------------
// Evidence types for manual user reports
// ---------------------------------------------------------------------------

export interface EvidenceAttachment {
  e2eMediaId: string;
  encryptionKey: string;
  encryptionNonce: string;
  contentType: string;
  fileName?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/** GIF/sticker metadata from decrypted message payload (URL references, not E2E blobs). */
export interface EvidenceGifAttachment {
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

export interface MessageEvidence {
  messageId: string;
  fromIdentityId: string;
  conversationId: string;
  decryptedText: string;
  signatureVerified: boolean;
  isTargetMessage: boolean;
  attachments?: EvidenceAttachment[];
  /** Klipy GIF/sticker references from the decrypted payload */
  gifAttachments?: EvidenceGifAttachment[];
  createdAt: string;
}

export interface ProfileEvidence {
  identityId: string;
  displayName: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  snapshotAt: string;
}

export interface ReportEvidence {
  type: 'message' | 'profile';
  /** For manual message reports: how many messages before/after the target were included. */
  contextMessageCount?: number;
  messageEvidence?: MessageEvidence[];
  profileEvidence?: ProfileEvidence;
}

// ---------------------------------------------------------------------------
// Report document
// ---------------------------------------------------------------------------

export interface ReportDocument extends BaseDocument {
  reportType: ReportType;
  source: ReportSource;
  status: ReportStatus;
  category: ReportCategory;

  /** Moderation scope — `platform` for now, `space` later */
  scopeType: ScopeType;
  /** Scope identifier (null for platform scope) */
  scopeId?: string;

  /** What was reported */
  targetRef: ReportTargetRef;

  /** Identity ID of the alias that posted the reported content (where applicable) */
  targetIdentityId?: string;

  /** Identity ID of the user who filed the report (null for automated) */
  reporterIdentityId?: string;

  /** User ID of the moderator assigned to this report */
  assignedTo?: string;

  /** Automated detection metadata (hash match details, scanHash, mediaId, etc.) */
  detectionMetadata?: Record<string, unknown>;

  /** Cryptographically verified evidence for manual user reports */
  evidence?: ReportEvidence;

  /** Free-text reason supplied by the reporter (manual reports only) */
  reporterReason?: string;

  /** Idempotency key to prevent duplicate automated reports */
  idempotencyKey?: string;

  /** Filled when status becomes 'resolved' */
  resolution?: ReportResolution;
  /** Filled when status becomes 'closed' (report deemed invalid) */
  closureReason?: string;
  closedByIdentityId?: string;
  closedAt?: Date;

  /** Filled when status becomes 'escalated' */
  escalatedByIdentityId?: string;
  escalatedAt?: Date;

  /** Filled when a moderator files a law enforcement report */
  leReportFiled?: boolean;
  leReportFiledAt?: Date;
  leReportFiledBy?: string;

  /** NCMEC CyberTipline report ID (set after successful submission) */
  ncmecReportId?: string;
  /** NCMEC submission status */
  ncmecStatus?: 'submitted' | 'failed';
  /** Last NCMEC submission error (cleared on success) */
  ncmecError?: string;

  /** Tags applied by automated systems or moderator actions */
  tags?: string[];
}

export interface CreateReportInput {
  reportType: ReportType;
  source: ReportSource;
  category: ReportCategory;
  scopeType: ScopeType;
  scopeId?: string;
  targetRef: ReportTargetRef;
  targetIdentityId?: string;
  reporterIdentityId?: string;
  detectionMetadata?: Record<string, unknown>;
  evidence?: ReportEvidence;
  reporterReason?: string;
  idempotencyKey?: string;
}
