/**
 * E2E upload service
 *
 * Handles the dual-upload flow for E2E encrypted conversation media:
 * 1. E2E encrypted blob -> dedicated E2E bucket (no processing, no CDN)
 * 2. Cleartext thumbnail scan copy -> existing media bucket (Rekognition moderation)
 *
 * Server-side gating: presigned GETs for E2E media are only issued after the
 * companion scan copy passes moderation (status: 'ready' in media_uploads).
 *
 * SECURITY:
 * - E2E media S3 keys use the same non-guessable ULID + random scheme.
 * - Presigned URLs are short-lived (5 min PUT, 15 min GET).
 * - Scan copies do not store identityId; only the opaque scanHash.
 * - Rate limiting uses the authenticated identity at request time.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { ObjectId } from 'mongodb';
import { getE2EMediaRepository } from '../repositories/e2e-media.repository';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import { getMessageRepository } from '../repositories/message.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { deriveScanHash } from '../utils/crypto';
import {
  UPLOAD_PURPOSE_CONFIG,
  UPLOAD_RATE_LIMIT,
  type UploadPurpose,
} from '../models/media-upload';
import type { E2EMediaStatus } from '../models/e2e-media';
import elog from '../utils/adieuuLogger';

const PRESIGNED_PUT_EXPIRY_SECONDS = 300; // 5 minutes
const PRESIGNED_GET_EXPIRY_SECONDS = 900; // 15 minutes

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
  };
  return map[contentType] ?? 'bin';
}

// ---------------------------------------------------------------------------
// E2E media upload (encrypted blob -> E2E bucket)
// ---------------------------------------------------------------------------

export interface RequestE2EUploadInput {
  contentType: string;
  contentLength: number;
  identityId: string;
  stripExif: boolean;
}

export interface RequestE2EUploadResult {
  success: boolean;
  e2eMediaId?: string;
  uploadUrl?: string;
  scanHash?: string;
  expiresIn?: number;
  error?: string;
  errorCode?: 'INVALID_CONTENT_TYPE' | 'FILE_TOO_LARGE' | 'RATE_LIMITED' | 'UPLOAD_DISABLED';
}

export async function requestE2EUpload(
  input: RequestE2EUploadInput
): Promise<RequestE2EUploadResult> {
  if (!config.s3.e2eMediaBucket) {
    return {
      success: false,
      error: 'E2E media uploads are not configured',
      errorCode: 'UPLOAD_DISABLED',
    };
  }

  const purposeConfig = UPLOAD_PURPOSE_CONFIG.conv_media;

  // TODO [VIDEO SUPPORT]: When adding video, check if the content type is
  // in VIDEO_MIME_TYPES and route through the async moderation pipeline.
  // The conv_media config should be extended with video MIME types at that time.
  if (!purposeConfig.allowedContentTypes.includes(input.contentType)) {
    return {
      success: false,
      error: `Content type '${input.contentType}' is not allowed for conversation media`,
      errorCode: 'INVALID_CONTENT_TYPE',
    };
  }

  if (input.contentLength > purposeConfig.maxBytes) {
    return {
      success: false,
      error: `File exceeds maximum size of ${(purposeConfig.maxBytes / (1024 * 1024)).toFixed(0)} MB`,
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

  const e2eRepo = getE2EMediaRepository();

  const recentCount = await e2eRepo.countRecentByIdentity(
    input.identityId,
    UPLOAD_RATE_LIMIT.windowSeconds
  );
  if (recentCount >= UPLOAD_RATE_LIMIT.maxRequests) {
    return {
      success: false,
      error: 'Upload rate limit exceeded. Please try again later.',
      errorCode: 'RATE_LIMITED',
    };
  }

  const e2eMediaId = generateMediaId();
  const ext = contentTypeToExtension(input.contentType);
  const s3Key = `uploads/conv_media/${e2eMediaId}.${ext}`;
  const scanHash = deriveScanHash(input.identityId, e2eMediaId);

  const command = new PutObjectCommand({
    Bucket: config.s3.e2eMediaBucket,
    Key: s3Key,
    ContentType: 'application/octet-stream',
    ContentLength: input.contentLength,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS,
  });

  await e2eRepo.createE2EMedia({
    e2eMediaId,
    identityId: new ObjectId(input.identityId),
    scanHash,
    s3Bucket: config.s3.e2eMediaBucket,
    s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
    stripExif: input.stripExif,
  });

  elog.info('E2E media presigned URL generated', {
    e2eMediaId,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return {
    success: true,
    e2eMediaId,
    uploadUrl,
    scanHash,
    expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// E2E media complete
// ---------------------------------------------------------------------------

export interface CompleteE2EUploadResult {
  success: boolean;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'INVALID_STATUS' | 'FORBIDDEN';
}

export async function completeE2EUpload(
  e2eMediaId: string,
  identityId: string
): Promise<CompleteE2EUploadResult> {
  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaIdAndIdentity(e2eMediaId, identityId);

  if (!doc) {
    return { success: false, error: 'E2E media upload not found', errorCode: 'NOT_FOUND' };
  }

  if (doc.status !== 'pending') {
    return {
      success: false,
      error: `Upload is in '${doc.status}' state, expected 'pending'`,
      errorCode: 'INVALID_STATUS',
    };
  }

  await repo.updateStatus(e2eMediaId, 'gated');

  elog.info('E2E media upload marked as complete (gated)', { e2eMediaId });

  return { success: true };
}

// ---------------------------------------------------------------------------
// E2E media status
// ---------------------------------------------------------------------------

export interface E2EMediaStatusResult {
  e2eMediaId: string;
  status: E2EMediaStatus;
  moderationStatus: string;
  moderationReason: string | null;
}

export async function getE2EMediaStatus(
  e2eMediaId: string,
  identityId: string
): Promise<E2EMediaStatusResult | null> {
  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaIdAndIdentity(e2eMediaId, identityId);
  if (!doc) return null;

  return {
    e2eMediaId: doc.e2eMediaId,
    status: doc.status,
    moderationStatus: doc.moderationStatus,
    moderationReason: doc.moderationReason ?? null,
  };
}

// ---------------------------------------------------------------------------
// E2E media download (gated by scan status)
// ---------------------------------------------------------------------------

export interface E2EMediaDownloadResult {
  success: boolean;
  downloadUrl?: string;
  expiresIn?: number;
  status?: E2EMediaStatus;
  moderationStatus?: string;
  moderationReason?: string;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'SCAN_PENDING' | 'REJECTED' | 'NOT_READY' | 'DOWNLOAD_DISABLED';
}

export async function getE2EMediaDownload(
  e2eMediaId: string,
  identityId: string
): Promise<E2EMediaDownloadResult> {
  if (!config.s3.e2eMediaBucket) {
    return {
      success: false,
      error: 'E2E media downloads are not configured',
      errorCode: 'DOWNLOAD_DISABLED',
    };
  }

  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaId(e2eMediaId);

  if (!doc) {
    return { success: false, error: 'E2E media not found', errorCode: 'NOT_FOUND' };
  }

  const requesterObjId = new ObjectId(identityId);
  const isUploader = doc.identityId.equals(requesterObjId);

  if (!isUploader) {
    const messageRepo = getMessageRepository();
    const conversationId = await messageRepo.findConversationByE2EMediaId(e2eMediaId);
    if (!conversationId) {
      return { success: false, error: 'E2E media not found', errorCode: 'NOT_FOUND' };
    }

    const convRepo = getConversationRepository();
    const conversation = await convRepo.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(requesterObjId))) {
      return { success: false, error: 'E2E media not found', errorCode: 'NOT_FOUND' };
    }
  }

  if (doc.status === 'pending') {
    return {
      success: false,
      error: 'Upload has not been completed yet',
      errorCode: 'NOT_READY',
      status: doc.status,
      moderationStatus: doc.moderationStatus,
    };
  }

  if (doc.moderationStatus === 'rejected') {
    return {
      success: false,
      error: 'Content has been rejected by moderation',
      errorCode: 'REJECTED',
      status: doc.status,
      moderationStatus: doc.moderationStatus,
      moderationReason: doc.moderationReason,
    };
  }

  if (doc.status !== 'available') {
    return {
      success: false,
      error: 'Content is awaiting moderation scan',
      errorCode: 'SCAN_PENDING',
      status: doc.status,
      moderationStatus: doc.moderationStatus,
    };
  }

  const command = new GetObjectCommand({
    Bucket: doc.s3Bucket,
    Key: doc.s3Key,
  });

  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_GET_EXPIRY_SECONDS,
  });

  return {
    success: true,
    downloadUrl,
    expiresIn: PRESIGNED_GET_EXPIRY_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Scan copy upload request (cleartext thumbnail -> media bucket)
// ---------------------------------------------------------------------------

export interface RequestScanUploadInput {
  scanHash: string;
  contentType: string;
  contentLength: number;
  identityId: string;
}

export interface RequestScanUploadResult {
  success: boolean;
  scanMediaId?: string;
  uploadUrl?: string;
  expiresIn?: number;
  error?: string;
  errorCode?: 'INVALID_CONTENT_TYPE' | 'FILE_TOO_LARGE' | 'RATE_LIMITED' | 'UPLOAD_DISABLED' | 'INVALID_SCAN_HASH';
}

export async function requestScanUpload(
  input: RequestScanUploadInput
): Promise<RequestScanUploadResult> {
  if (!config.s3.mediaBucket) {
    return {
      success: false,
      error: 'Media uploads are not configured',
      errorCode: 'UPLOAD_DISABLED',
    };
  }

  if (!input.scanHash || input.scanHash.length !== 64) {
    return {
      success: false,
      error: 'Invalid scan hash',
      errorCode: 'INVALID_SCAN_HASH',
    };
  }

  const purposeConfig = UPLOAD_PURPOSE_CONFIG.conv_scan;

  if (!purposeConfig.allowedContentTypes.includes(input.contentType)) {
    return {
      success: false,
      error: `Content type '${input.contentType}' is not allowed for scan copies`,
      errorCode: 'INVALID_CONTENT_TYPE',
    };
  }

  if (input.contentLength > purposeConfig.maxBytes) {
    return {
      success: false,
      error: `File exceeds maximum size of ${(purposeConfig.maxBytes / (1024 * 1024)).toFixed(0)} MB`,
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

  const e2eRepo = getE2EMediaRepository();
  const recentCount = await e2eRepo.countRecentByIdentity(
    input.identityId,
    UPLOAD_RATE_LIMIT.windowSeconds
  );
  if (recentCount >= UPLOAD_RATE_LIMIT.maxRequests) {
    return {
      success: false,
      error: 'Upload rate limit exceeded. Please try again later.',
      errorCode: 'RATE_LIMITED',
    };
  }

  const mediaRepo = getMediaUploadRepository();

  const scanMediaId = generateMediaId();
  const ext = contentTypeToExtension(input.contentType);
  const s3Key = `uploads/conv_scan/${scanMediaId}.${ext}`;
  const purpose: UploadPurpose = 'conv_scan';

  const command = new PutObjectCommand({
    Bucket: config.s3.mediaBucket,
    Key: s3Key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    Metadata: {
      'media-id': scanMediaId,
      purpose,
      'identity-id': input.identityId,
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
    expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS,
  });

  await mediaRepo.create({
    mediaId: scanMediaId,
    purpose,
    s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
    status: 'pending',
    processingFlags: purposeConfig.processingFlags,
    scanHash: input.scanHash,
  } as Omit<import('../models/media-upload').MediaUploadDocument, '_id' | 'createdAt' | 'updatedAt'>);

  elog.info('Scan copy presigned URL generated', {
    scanMediaId,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return {
    success: true,
    scanMediaId,
    uploadUrl,
    expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Scan copy complete
// ---------------------------------------------------------------------------

export async function completeScanUpload(
  scanMediaId: string
): Promise<CompleteE2EUploadResult> {
  const repo = getMediaUploadRepository();
  const doc = await repo.findByMediaId(scanMediaId);

  if (!doc) {
    return { success: false, error: 'Scan upload not found', errorCode: 'NOT_FOUND' };
  }

  if (doc.purpose !== 'conv_scan') {
    return { success: false, error: 'Not a scan upload', errorCode: 'FORBIDDEN' };
  }

  if (doc.status !== 'pending') {
    return {
      success: false,
      error: `Upload is in '${doc.status}' state, expected 'pending'`,
      errorCode: 'INVALID_STATUS',
    };
  }

  await repo.updateStatus(scanMediaId, 'uploaded');

  elog.info('Scan copy upload marked as complete', { scanMediaId });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete E2E media from S3 (used during message deletion)
// ---------------------------------------------------------------------------

export async function deleteE2EMedia(e2eMediaId: string): Promise<boolean> {
  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaId(e2eMediaId);
  if (!doc) return false;

  try {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: doc.s3Bucket,
        Key: doc.s3Key,
      })
    );
  } catch (err) {
    elog.error('Failed to delete E2E media from S3 — DB record retained for retry', { e2eMediaId, err });
    return false;
  }

  await repo.deleteByE2EMediaId(e2eMediaId);
  return true;
}
