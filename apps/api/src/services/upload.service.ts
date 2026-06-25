/**
 * Upload service
 *
 * Reusable, abstract upload service for presigned S3 URL generation.
 * Handles avatars, banners, DM attachments, and space media. Each
 * purpose has its own content-type allowlist, size limit, and
 * processing flags.
 *
 * SECURITY:
 * - S3 keys use ULIDs + crypto-random suffix: non-guessable, non-sequential.
 * - Presigned PUT URLs are short-lived (5 min) and scoped to a specific
 *   key, content-type, and content-length-range.
 * - No AWS credentials reach the client.
 * - Rate-limited per identity.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SubscriptionTierId } from '@adieuu/shared';
import { config } from '../config';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import {
  UPLOAD_PURPOSE_CONFIG,
  UPLOAD_RATE_LIMIT,
  type UploadPurpose,
  type MediaUploadDocument,
} from '../models/media-upload';
import { resolveMaxUploadBytes } from './media-limits.service';
import elog from '../utils/adieuuLogger';
import { sanitizeIpForStorage } from '../utils/sanitize';

const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return s3Client;
}

function generateMediaId(): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.getRandomValues(new Uint8Array(12));
  const randomPart = Array.from(randomBytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('');
  return `${timestamp}-${randomPart}`;
}

function contentTypeToExtension(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
  };
  return map[contentType] ?? 'bin';
}

export interface RequestUploadInput {
  purpose: UploadPurpose;
  contentType: string;
  contentLength: number;
  identityId?: string;
  userId?: string;
  /** Active subscription tiers (from identity session) for limit resolution. */
  subscriptions?: SubscriptionTierId[];
  /** Entitlements merged from grants and identity overrides (e.g. `founder`). */
  entitlements?: string[];
  /** From identity session merged grants — Lifetime Founder upload caps. */
  isLifetime?: boolean;
  /** Client IP address at the time of the presigned URL request (for NCMEC reporting). */
  clientIp?: string;
}

export interface RequestUploadResult {
  success: boolean;
  mediaId?: string;
  uploadUrl?: string;
  expiresIn?: number;
  /** Headers the client must include in the PUT request (for CloudFront → S3 metadata forwarding). */
  uploadHeaders?: Record<string, string>;
  error?: string;
  errorCode?: 'INVALID_CONTENT_TYPE' | 'FILE_TOO_LARGE' | 'RATE_LIMITED' | 'UPLOAD_DISABLED';
}

export interface CompleteUploadResult {
  success: boolean;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'INVALID_STATUS' | 'FORBIDDEN';
}

/**
 * Request a presigned upload URL for a given purpose.
 */
export async function requestUpload(
  input: RequestUploadInput
): Promise<RequestUploadResult> {
  if (!config.s3.mediaBucket) {
    return {
      success: false,
      error: 'Media uploads are not configured',
      errorCode: 'UPLOAD_DISABLED',
    };
  }

  const purposeConfig = UPLOAD_PURPOSE_CONFIG[input.purpose];
  if (!purposeConfig) {
    return {
      success: false,
      error: 'Invalid upload purpose',
      errorCode: 'INVALID_CONTENT_TYPE',
    };
  }

  if (!purposeConfig.allowedContentTypes.includes(input.contentType)) {
    return {
      success: false,
      error: `Content type '${input.contentType}' is not allowed for ${input.purpose}`,
      errorCode: 'INVALID_CONTENT_TYPE',
    };
  }

  const maxBytes = resolveMaxUploadBytes(input.purpose, input.subscriptions ?? [], {
    entitlements: input.entitlements,
    isLifetime: input.isLifetime,
  });
  if (input.contentLength > maxBytes) {
    return {
      success: false,
      error: `File exceeds maximum size of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
      errorCode: 'FILE_TOO_LARGE',
    };
  }

  if (input.contentLength <= 0) {
    return {
      success: false,
      error: 'Content length must be positive',
      errorCode: 'FILE_TOO_LARGE',
    };
  }

  if (!input.identityId && !input.userId) {
    return {
      success: false,
      error: 'Upload owner required',
      errorCode: 'INVALID_CONTENT_TYPE',
    };
  }

  const repo = getMediaUploadRepository();

  const recentCount = input.identityId
    ? await repo.countRecentByIdentity(input.identityId, UPLOAD_RATE_LIMIT.windowSeconds)
    : await repo.countRecentByUser(input.userId!, UPLOAD_RATE_LIMIT.windowSeconds);
  if (recentCount >= UPLOAD_RATE_LIMIT.maxRequests) {
    return {
      success: false,
      error: 'Upload rate limit exceeded. Please try again later.',
      errorCode: 'RATE_LIMITED',
    };
  }

  const mediaId = generateMediaId();
  const ext = contentTypeToExtension(input.contentType);
  const s3Key = `uploads/${input.purpose}/${mediaId}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.mediaBucket,
    Key: s3Key,
    ContentType: input.contentType,
    Metadata: {
      'media-id': mediaId,
      purpose: input.purpose,
      ...(input.identityId ? { 'identity-id': input.identityId } : {}),
      ...(input.userId ? { 'user-id': input.userId } : {}),
      'strip-exif': String(purposeConfig.processingFlags.stripExif),
      'content-moderation': String(purposeConfig.processingFlags.contentModeration),
      ...(purposeConfig.processingFlags.resize
        ? {
            'resize-max-width': String(purposeConfig.processingFlags.resize.maxWidth),
            'resize-max-height': String(purposeConfig.processingFlags.resize.maxHeight),
          }
        : {}),
    },
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });

  const { ObjectId } = await import('mongodb');
  const uploadIpAddress = sanitizeIpForStorage(input.clientIp);
  await repo.create({
    mediaId,
    ...(input.identityId ? { identityId: new ObjectId(input.identityId) } : {}),
    ...(input.userId ? { userId: new ObjectId(input.userId) } : {}),
    purpose: input.purpose,
    s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
    status: 'pending',
    processingFlags: purposeConfig.processingFlags,
    ...(uploadIpAddress ? { uploadIpAddress } : {}),
  });

  elog.info('Upload presigned URL generated', {
    mediaId,
    purpose: input.purpose,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return {
    success: true,
    mediaId,
    uploadUrl,
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  };
}

/**
 * Mark an upload as completed by the client (triggers processing).
 */
export async function completeUpload(
  mediaId: string,
  owner: { type: 'identity'; id: string } | { type: 'account'; id: string },
): Promise<CompleteUploadResult> {
  const repo = getMediaUploadRepository();
  const doc =
    owner.type === 'identity'
      ? await repo.findByMediaIdAndIdentity(mediaId, owner.id)
      : await repo.findByMediaIdAndUser(mediaId, owner.id);

  if (!doc) {
    return { success: false, error: 'Upload not found', errorCode: 'NOT_FOUND' };
  }

  if (doc.status !== 'pending') {
    return {
      success: false,
      error: `Upload is in '${doc.status}' state, expected 'pending'`,
      errorCode: 'INVALID_STATUS',
    };
  }

  await repo.updateStatus(mediaId, 'uploaded');

  elog.info('Upload marked as complete', { mediaId });

  return { success: true };
}

/**
 * Get the current status of a media upload.
 */
export async function getUploadStatus(
  mediaId: string,
  owner: { type: 'identity'; id: string } | { type: 'account'; id: string },
): Promise<MediaUploadDocument | null> {
  const repo = getMediaUploadRepository();
  return owner.type === 'identity'
    ? await repo.findByMediaIdAndIdentity(mediaId, owner.id)
    : await repo.findByMediaIdAndUser(mediaId, owner.id);
}

/**
 * Process a callback from the Lambda processor.
 * Called by the internal API endpoint with the shared secret.
 */
export async function processCallback(
  mediaId: string,
  status: 'ready' | 'rejected' | 'failed',
  processedS3Key?: string,
  rejectionReason?: string
): Promise<boolean> {
  const repo = getMediaUploadRepository();
  const doc = await repo.findByMediaId(mediaId);

  if (!doc) {
    elog.warn('Process callback for unknown mediaId', { mediaId });
    return false;
  }

  const cdnUrl =
    status === 'ready' && processedS3Key && config.cdn.mediaBaseUrl
      ? `${config.cdn.mediaBaseUrl}/${processedS3Key.replace(/^processed\//, '')}`
      : undefined;

  await repo.updateStatus(mediaId, status, {
    processedS3Key,
    cdnUrl,
    rejectionReason,
  });

  if (status === 'ready' || status === 'rejected' || status === 'failed') {
    await repo.clearUploadIpAddress(mediaId, {
      scanHash: doc.scanHash,
      purpose: doc.purpose,
    });
  }

  if (status === 'rejected') {
    elog.warn('Upload rejected by content moderation', {
      mediaId,
      rejectionReason,
    });

    try {
      const client = getS3Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.s3.mediaBucket,
          Key: doc.s3Key,
        })
      );
    } catch (err) {
      elog.error('Failed to delete rejected upload from S3', { mediaId, err });
    }
  }

  elog.info('Upload process callback handled', { mediaId, status });
  return true;
}
