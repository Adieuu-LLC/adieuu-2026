/**
 * E2E media model
 * Tracks E2E encrypted media uploads for conversation attachments.
 *
 * PRIVACY DESIGN:
 * - E2E encrypted blobs are stored in a dedicated S3 bucket with no CDN.
 * - Clients fetch via presigned GET and decrypt locally.
 * - Server-side gating: presigned GETs are only issued after the companion
 *   scan copy (in media_uploads, keyed by scanHash) passes CSAM hash
 *   moderation.
 * - The scanHash is derived as SHA3-256(identityId || e2eMediaId || domain)
 *   so the server can look up moderation status without the scan copy
 *   storing an identityId.
 *
 * HONEST-CLIENT LIMITATION:
 * A modified client could submit non-matching content for scanning vs E2E,
 * or skip the scan upload entirely. This is an accepted limitation inherent
 * to E2E content moderation. Server-side gating prevents conforming clients
 * from viewing unscanned media.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * E2E media upload status.
 *
 * - pending:   presigned URL issued, client has not confirmed upload yet
 * - uploaded:  client confirmed upload to E2E bucket
 * - gated:     uploaded but scan copy has not passed moderation yet
 * - available: scan passed, presigned GETs are allowed
 */
export type E2EMediaStatus = 'pending' | 'uploaded' | 'gated' | 'available';

/**
 * Moderation status derived from the companion scan copy.
 *
 * - pending:  scan copy not yet processed
 * - passed:   hash check passed
 * - rejected: hash check flagged the content
 * - error:    scan processing failed
 * - skipped:  sender opted out of client-side moderation
 */
export type ModerationStatus = 'pending' | 'passed' | 'rejected' | 'error' | 'skipped';

/**
 * Report status for future reporting/review infrastructure.
 * Placeholder — no reporting UI or endpoints in this build.
 */
export type ReportStatus = 'none' | 'pending_review' | 'reviewed_safe' | 'reviewed_violation';

/**
 * Report reason categories for future use.
 */
export type ReportReason =
  | 'illegal_content'
  | 'csam'
  | 'violence'
  | 'harassment'
  | 'spam'
  | 'other';

/**
 * Moderation action taken by an admin (future use).
 */
export type ModerationAction =
  | 'no_action'
  | 'content_removed'
  | 'identity_warned'
  | 'identity_suspended';

/**
 * E2E media document stored in MongoDB (collection: e2e_media).
 */
export interface E2EMediaDocument extends BaseDocument {
  /** Unique E2E media identifier */
  e2eMediaId: string;

  /** Identity that uploaded this media */
  identityId: ObjectId;

  /**
   * One-way hash linking to the companion scan copy in media_uploads.
   * Derived as: SHA3-256(identityId || e2eMediaId || "adieuu-conv-scan-v1")
   */
  scanHash: string;

  /** S3 bucket where the encrypted blob is stored */
  s3Bucket: string;

  /** S3 object key for the encrypted blob */
  s3Key: string;

  /** MIME content type of the original (pre-encryption) file */
  contentType: string;

  /** Declared content length in bytes */
  contentLength: number;

  /** Current upload/gating status */
  status: E2EMediaStatus;

  /** Moderation status derived from the companion scan copy */
  moderationStatus: ModerationStatus;

  /** Reason for moderation rejection (from hash check) */
  moderationReason?: string;

  /** Whether the uploader chose to preserve EXIF metadata in the E2E version */
  stripExif: boolean;

  /**
   * TTL expiry aligned with the host message. Non-FS messages have no
   * expiry (media lives until explicitly deleted). FS messages propagate
   * their expiresAt so the media is cleaned up on the same schedule.
   */
  expiresAt?: Date;

  // --- Flagging/reporting placeholders (no UI/endpoints in this build) ---

  /** Report status for admin review */
  reportStatus: ReportStatus;

  /** When the media was reported */
  reportedAt?: Date;

  /** Identity that reported this media (if applicable) */
  reportedBy?: ObjectId;

  /** Reason for the report */
  reportReason?: ReportReason;

  /** Admin moderation action taken */
  moderationAction?: ModerationAction;

  /** When the moderation action was taken */
  moderationActionAt?: Date;
}

/**
 * Input for creating a new E2E media record.
 */
export interface CreateE2EMediaInput {
  e2eMediaId: string;
  identityId: ObjectId;
  scanHash: string;
  s3Bucket: string;
  s3Key: string;
  contentType: string;
  contentLength: number;
  stripExif: boolean;
  expiresAt?: Date;
}

/**
 * Async moderation result type reserved for future batch video hash pipelines.
 */
export interface AsyncModerationResult {
  jobId: string;
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  hashMatches?: Array<{
    source: string;
    hashType: string;
    classification: string;
  }>;
}
