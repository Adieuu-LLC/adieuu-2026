/**
 * Media upload model
 * Tracks user-uploaded media through the upload -> processing -> ready pipeline.
 *
 * SECURITY: Upload keys use ULIDs + random suffix to prevent URL guessing.
 * Raw uploads (uploads/ prefix) are never served publicly; only processed
 * files (processed/ prefix) are accessible via CloudFront.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Upload purpose determines allowed content types, size limits,
 * and which processing flags are applied.
 */
export type UploadPurpose = 'avatar' | 'banner' | 'dm_attachment' | 'space_media';

/**
 * Processing status of a media upload.
 *
 * - pending:    presigned URL issued, client has not confirmed upload yet
 * - uploaded:   client confirmed upload, awaiting processing
 * - processing: Lambda is actively processing the file
 * - ready:      processed and available via CDN
 * - rejected:   content moderation or validation failed
 * - failed:     processing error (retryable)
 */
export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'rejected' | 'failed';

/**
 * Flags that control which processing steps the Lambda applies.
 */
export interface ProcessingFlags {
  stripExif: boolean;
  resize?: { maxWidth: number; maxHeight: number };
  contentModeration: boolean;
}

/**
 * Media upload document stored in MongoDB.
 */
export interface MediaUploadDocument extends BaseDocument {
  /** Unique media identifier (ULID) */
  mediaId: string;

  /** Identity that owns this upload */
  identityId: ObjectId;

  /** Upload purpose (determines limits and processing) */
  purpose: UploadPurpose;

  /** S3 object key for the raw upload (uploads/{purpose}/{ulid}-{random}.{ext}) */
  s3Key: string;

  /** S3 object key for the processed file (set by Lambda) */
  processedS3Key?: string;

  /** MIME content type */
  contentType: string;

  /** Declared content length in bytes */
  contentLength: number;

  /** Current processing status */
  status: UploadStatus;

  /** Reason for rejection (e.g. 'csam_detected', 'invalid_content_type') */
  rejectionReason?: string;

  /** Processing configuration for the Lambda */
  processingFlags: ProcessingFlags;

  /** Public CDN URL once processed and ready */
  cdnUrl?: string;
}

/**
 * Per-purpose configuration for upload validation.
 */
export interface UploadPurposeConfig {
  maxBytes: number;
  allowedContentTypes: string[];
  processingFlags: ProcessingFlags;
}

/**
 * Configuration for each upload purpose.
 */
export const UPLOAD_PURPOSE_CONFIG: Record<UploadPurpose, UploadPurposeConfig> = {
  avatar: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    processingFlags: {
      stripExif: true,
      resize: { maxWidth: 512, maxHeight: 512 },
      contentModeration: true,
    },
  },
  banner: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    processingFlags: {
      stripExif: true,
      resize: { maxWidth: 1920, maxHeight: 480 },
      contentModeration: true,
    },
  },
  dm_attachment: {
    maxBytes: 25 * 1024 * 1024, // 25 MB
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    processingFlags: {
      stripExif: false,
      contentModeration: false,
    },
  },
  space_media: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    processingFlags: {
      stripExif: true,
      resize: { maxWidth: 1920, maxHeight: 1080 },
      contentModeration: true,
    },
  },
} as const;

/**
 * Rate limit for upload requests per identity.
 */
export const UPLOAD_RATE_LIMIT = {
  maxRequests: 10,
  windowSeconds: 60,
} as const;
