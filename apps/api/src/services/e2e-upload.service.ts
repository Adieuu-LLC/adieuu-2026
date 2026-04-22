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
import type { ConvScanSealManifestV1 } from '@adieuu/shared';
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
  VIDEO_MIME_TYPES,
  type UploadPurpose,
} from '../models/media-upload';
import type { E2EMediaStatus } from '../models/e2e-media';
import elog from '../utils/adieuuLogger';
import {
  convScanManifestObjectKey,
  convScanSealObjectKey,
  isNestedConvScanS3Key,
} from '../utils/conv-scan-keys';
import { purgeConvScanCleartextArtifacts } from '../utils/conv-scan-purge';

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

function isVideoContentType(contentType: string): boolean {
  return (VIDEO_MIME_TYPES as readonly string[]).includes(contentType);
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

// ---------------------------------------------------------------------------
// E2E media upload (encrypted blob -> E2E bucket)
// ---------------------------------------------------------------------------

export interface RequestE2EUploadInput {
  contentType: string;
  contentLength: number;
  identityId: string;
  stripExif: boolean;
  /** From identity session — ceiling for video duration (seconds). */
  maxVideoDurationSeconds: number;
  /** Client-reported duration in seconds; required when contentType is video. */
  declaredDurationSeconds?: number;
}

export interface RequestE2EUploadResult {
  success: boolean;
  e2eMediaId?: string;
  uploadUrl?: string;
  scanHash?: string;
  expiresIn?: number;
  error?: string;
  errorCode?:
    | 'INVALID_CONTENT_TYPE'
    | 'FILE_TOO_LARGE'
    | 'RATE_LIMITED'
    | 'UPLOAD_DISABLED'
    | 'VIDEO_DURATION_REQUIRED'
    | 'VIDEO_DURATION_EXCEEDED';
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

  if (isVideoContentType(input.contentType)) {
    const d = input.declaredDurationSeconds;
    if (d === undefined || !Number.isFinite(d) || d <= 0) {
      return {
        success: false,
        error: 'Video uploads must include a positive declaredDurationSeconds value',
        errorCode: 'VIDEO_DURATION_REQUIRED',
      };
    }
    if (d > input.maxVideoDurationSeconds) {
      return {
        success: false,
        error: `Video exceeds maximum duration of ${input.maxVideoDurationSeconds} seconds`,
        errorCode: 'VIDEO_DURATION_EXCEEDED',
      };
    }
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
  errorCode?: 'NOT_FOUND' | 'INVALID_STATUS' | 'FORBIDDEN' | 'SEAL_FAILED';
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
// Abandon E2E upload (uploader-only; no message may reference the media)
// ---------------------------------------------------------------------------

export interface AbandonE2EUploadResult {
  success: boolean;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'REFERENCED' | 'INVALID_STATUS' | 'DELETE_FAILED' | 'UPLOAD_DISABLED';
}

/**
 * Remove a never-sent E2E blob created for an outbox send that was cancelled,
 * or similar orphan sessions. Refuses when a live message references the id
 * or when the record is already {@link E2EMediaStatus | available}.
 */
export async function abandonE2EUpload(
  e2eMediaId: string,
  identityId: string
): Promise<AbandonE2EUploadResult> {
  if (!config.s3.e2eMediaBucket) {
    return {
      success: false,
      error: 'E2E media uploads are not configured',
      errorCode: 'UPLOAD_DISABLED',
    };
  }

  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaIdAndIdentity(e2eMediaId, identityId);

  if (!doc) {
    return { success: false, error: 'E2E media upload not found', errorCode: 'NOT_FOUND' };
  }

  const messageRepo = getMessageRepository();
  const referencedConversationId = await messageRepo.findConversationByE2EMediaId(e2eMediaId);
  if (referencedConversationId) {
    return {
      success: false,
      error: 'E2E media is referenced by a message',
      errorCode: 'REFERENCED',
    };
  }

  if (doc.status !== 'pending' && doc.status !== 'uploaded' && doc.status !== 'gated') {
    return {
      success: false,
      error: `Cannot abandon upload in '${doc.status}' state`,
      errorCode: 'INVALID_STATUS',
    };
  }

  try {
    await purgeConvScanCleartextArtifacts(doc.scanHash, {
      removeDbRows: true,
      s3Client: getS3Client(),
      mediaBucket: config.s3.mediaBucket,
    });
  } catch (err) {
    elog.error('conv_scan purge failed during E2E abandon — continuing with E2E delete', {
      e2eMediaId,
      scanHash: doc.scanHash,
      err,
    });
  }

  const deleted = await deleteE2EMedia(e2eMediaId);
  if (!deleted) {
    return {
      success: false,
      error: 'Failed to delete E2E media from storage',
      errorCode: 'DELETE_FAILED',
    };
  }

  elog.info('E2E media abandoned by uploader', { e2eMediaId });
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
  errorCode?: 'NOT_FOUND' | 'SCAN_PENDING' | 'REJECTED' | 'MODERATION_ERROR' | 'NOT_READY' | 'DOWNLOAD_DISABLED';
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

  if (doc.moderationStatus === 'error') {
    return {
      success: false,
      error: 'Content moderation scan encountered an error',
      errorCode: 'MODERATION_ERROR',
      status: doc.status,
      moderationStatus: doc.moderationStatus,
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
  errorCode?:
    | 'INVALID_CONTENT_TYPE'
    | 'FILE_TOO_LARGE'
    | 'RATE_LIMITED'
    | 'UPLOAD_DISABLED'
    | 'INVALID_SCAN_HASH'
    | 'SCAN_SESSION_NOT_FOUND'
    | 'FORBIDDEN';
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

  const e2eRepo = getE2EMediaRepository();
  const e2eSession = await e2eRepo.findByScanHash(input.scanHash);
  if (!e2eSession) {
    return {
      success: false,
      error: 'No E2E upload session for this scan hash',
      errorCode: 'SCAN_SESSION_NOT_FOUND',
    };
  }
  if (!e2eSession.identityId.equals(new ObjectId(input.identityId))) {
    return {
      success: false,
      error: 'Not allowed to upload scan copies for this session',
      errorCode: 'FORBIDDEN',
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
  const s3Key = `uploads/conv_scan/${input.scanHash}/${scanMediaId}.${ext}`;
  const purpose: UploadPurpose = 'conv_scan';
  const isVideoScan = input.contentType.startsWith('video/');

  const metadata: Record<string, string> = {
    'media-id': scanMediaId,
    purpose,
    'identity-id': input.identityId,
    'strip-exif': String(!isVideoScan && purposeConfig.processingFlags.stripExif),
    'content-moderation': String(purposeConfig.processingFlags.contentModeration),
  };
  if (!isVideoScan && purposeConfig.processingFlags.resize) {
    metadata['resize-max-width'] = String(purposeConfig.processingFlags.resize.maxWidth);
    metadata['resize-max-height'] = String(purposeConfig.processingFlags.resize.maxHeight);
  }

  const command = new PutObjectCommand({
    Bucket: config.s3.mediaBucket,
    Key: s3Key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    Metadata: metadata,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS,
  });

  const processingFlags = isVideoScan
    ? {
        stripExif: false,
        contentModeration: purposeConfig.processingFlags.contentModeration,
      }
    : purposeConfig.processingFlags;

  await mediaRepo.create({
    mediaId: scanMediaId,
    purpose,
    s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
    status: 'pending',
    processingFlags,
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
  scanMediaId: string,
  options?: { identityId?: string }
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

  if (doc.scanHash && isNestedConvScanS3Key(doc.s3Key) && !options?.identityId) {
    elog.error('conv_scan nested upload completed without identityId; seal not written', {
      scanMediaId,
    });
    return {
      success: false,
      error: 'Failed to finalise scan session',
      errorCode: 'SEAL_FAILED',
    };
  }

  if (
    doc.scanHash &&
    isNestedConvScanS3Key(doc.s3Key) &&
    config.s3.mediaBucket &&
    options?.identityId
  ) {
    const pending = await repo.countPendingConvScanByScanHash(doc.scanHash);
    if (pending === 0) {
      const sealResult = await putConvScanSealObject(
        doc.scanHash,
        scanMediaId,
        options.identityId
      );
      if (!sealResult.ok) {
        return {
          success: false,
          error: sealResult.error,
          errorCode: 'SEAL_FAILED',
        };
      }
    }
  }

  return { success: true };
}

const CONV_SCAN_MANIFEST_JSON_MAX_BYTES = 65536;

async function putConvScanManifestObject(
  scanHash: string,
  manifest: ConvScanSealManifestV1,
  identityId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!config.s3.mediaBucket) {
    return { ok: false, error: 'Media uploads are not configured' };
  }
  const key = convScanManifestObjectKey(scanHash);
  const body = JSON.stringify(manifest);
  if (Buffer.byteLength(body, 'utf8') > CONV_SCAN_MANIFEST_JSON_MAX_BYTES) {
    return { ok: false, error: 'Manifest too large' };
  }
  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.s3.mediaBucket,
        Key: key,
        Body: Buffer.from(body, 'utf8'),
        ContentType: 'application/json',
        Metadata: {
          purpose: 'conv_scan',
          'identity-id': identityId,
          'strip-exif': 'false',
          'content-moderation': 'false',
        },
      })
    );
    elog.info('conv_scan manifest written', { scanHash, key });
    return { ok: true };
  } catch (err) {
    elog.error('Failed to write conv_scan manifest', { scanHash, key, err });
    return { ok: false, error: 'Failed to finalise scan session' };
  }
}

async function putConvScanSealObject(
  scanHash: string,
  primaryScanMediaId: string,
  identityId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!config.s3.mediaBucket) {
    return { ok: false, error: 'Media uploads are not configured' };
  }
  const sealKey = convScanSealObjectKey(scanHash);
  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.s3.mediaBucket,
        Key: sealKey,
        Body: Buffer.from('{}'),
        ContentType: 'application/json',
        Metadata: {
          'media-id': primaryScanMediaId,
          purpose: 'conv_scan',
          'identity-id': identityId,
          'strip-exif': 'false',
          'content-moderation': 'false',
        },
      })
    );
    elog.info('conv_scan seal object written', { primaryScanMediaId, sealKey });
    return { ok: true };
  } catch (err) {
    elog.error('Failed to write conv_scan seal object', { primaryScanMediaId, sealKey, err });
    return { ok: false, error: 'Failed to finalise scan session' };
  }
}

// ---------------------------------------------------------------------------
// Scan session: explicit seal (multi-part)
// ---------------------------------------------------------------------------

export interface SealConvScanSessionInput {
  scanHash: string;
  identityId: string;
  /** When set, must be the full set of uploaded part mediaIds for this scanHash (order ignored). */
  scanMediaIds?: string[];
  /** Optional v1 manifest (validated against uploaded parts; written to S3 before `.sealed`). */
  manifest?: ConvScanSealManifestV1;
}

export interface SealConvScanSessionResult {
  success: boolean;
  error?: string;
  errorCode?:
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'INVALID_STATUS'
    | 'INVALID_PARTS'
    | 'PENDING_PARTS'
    | 'SEAL_FAILED'
    | 'UPLOAD_DISABLED'
    | 'INVALID_MANIFEST';
}

export async function sealConvScanUploadSession(
  input: SealConvScanSessionInput
): Promise<SealConvScanSessionResult> {
  if (!config.s3.mediaBucket) {
    return {
      success: false,
      error: 'Media uploads are not configured',
      errorCode: 'UPLOAD_DISABLED',
    };
  }

  if (!input.scanHash || input.scanHash.length !== 64) {
    return { success: false, error: 'Invalid scan hash', errorCode: 'INVALID_STATUS' };
  }

  const e2eRepo = getE2EMediaRepository();
  const e2e = await e2eRepo.findByScanHash(input.scanHash);
  if (!e2e) {
    return { success: false, error: 'E2E media session not found for scan hash', errorCode: 'NOT_FOUND' };
  }

  if (!e2e.identityId.equals(new ObjectId(input.identityId))) {
    return { success: false, error: 'Not allowed to seal this scan session', errorCode: 'FORBIDDEN' };
  }

  const mediaRepo = getMediaUploadRepository();
  const pending = await mediaRepo.countPendingConvScanByScanHash(input.scanHash);
  if (pending > 0) {
    return {
      success: false,
      error: 'All scan parts must be uploaded before sealing',
      errorCode: 'PENDING_PARTS',
    };
  }

  const uploadedIds = (await mediaRepo.findUploadedNestedConvScanMediaIdsByScanHash(input.scanHash))
    .slice()
    .sort();

  if (uploadedIds.length === 0) {
    const totalParts = await mediaRepo.countConvScanByScanHash(input.scanHash);
    if (totalParts === 0) {
      return {
        success: false,
        error: 'No uploaded scan parts to seal',
        errorCode: 'INVALID_STATUS',
      };
    }
    const nonTerminal = await mediaRepo.countConvScanNonTerminalByScanHash(input.scanHash);
    if (nonTerminal === 0) {
      elog.info('conv_scan seal skipped; session already finalised', { scanHash: input.scanHash });
      return { success: true };
    }
    return {
      success: false,
      error: 'No uploaded scan parts to seal',
      errorCode: 'INVALID_STATUS',
    };
  }

  if (input.scanMediaIds !== undefined) {
    const provided = [...new Set(input.scanMediaIds)].sort();
    if (
      provided.length !== uploadedIds.length ||
      !provided.every((id, i) => id === uploadedIds[i])
    ) {
      return {
        success: false,
        error: 'scanMediaIds must list every uploaded part for this session',
        errorCode: 'INVALID_PARTS',
      };
    }
  }

  let manifestToWrite: ConvScanSealManifestV1 | undefined;
  if (input.manifest !== undefined) {
    const sortedParts = [...input.manifest.parts].sort((a, b) =>
      a.mediaId.localeCompare(b.mediaId)
    );
    const seen = new Set<string>();
    for (const p of sortedParts) {
      if (seen.has(p.mediaId)) {
        return {
          success: false,
          error: 'Duplicate manifest mediaId',
          errorCode: 'INVALID_MANIFEST',
        };
      }
      seen.add(p.mediaId);
      if (
        p.contentSha256 !== undefined &&
        !/^[0-9a-f]{64}$/i.test(p.contentSha256)
      ) {
        return {
          success: false,
          error: 'Invalid contentSha256 in manifest',
          errorCode: 'INVALID_MANIFEST',
        };
      }
    }
    if (sortedParts.length !== uploadedIds.length) {
      return {
        success: false,
        error: 'Manifest parts must match uploaded scan parts',
        errorCode: 'INVALID_MANIFEST',
      };
    }
    for (let i = 0; i < uploadedIds.length; i++) {
      if (sortedParts[i]!.mediaId !== uploadedIds[i]) {
        return {
          success: false,
          error: 'Manifest parts must match uploaded scan parts',
          errorCode: 'INVALID_MANIFEST',
        };
      }
    }
    manifestToWrite = {
      version: 1,
      parts: sortedParts.map((p) => ({
        mediaId: p.mediaId,
        ...(p.contentSha256 !== undefined
          ? { contentSha256: p.contentSha256.toLowerCase() }
          : {}),
      })),
    };
    const json = JSON.stringify(manifestToWrite);
    if (Buffer.byteLength(json, 'utf8') > CONV_SCAN_MANIFEST_JSON_MAX_BYTES) {
      return {
        success: false,
        error: 'Manifest too large',
        errorCode: 'INVALID_MANIFEST',
      };
    }
  }

  if (manifestToWrite !== undefined) {
    const manResult = await putConvScanManifestObject(
      input.scanHash,
      manifestToWrite,
      input.identityId
    );
    if (!manResult.ok) {
      return { success: false, error: manResult.error, errorCode: 'SEAL_FAILED' };
    }
  }

  const primaryMediaId = uploadedIds[0]!;
  const sealResult = await putConvScanSealObject(input.scanHash, primaryMediaId, input.identityId);
  if (!sealResult.ok) {
    return { success: false, error: sealResult.error, errorCode: 'SEAL_FAILED' };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete E2E media from S3 (used during message deletion)
// ---------------------------------------------------------------------------

export async function deleteE2EMedia(e2eMediaId: string): Promise<boolean> {
  const repo = getE2EMediaRepository();
  const doc = await repo.findByE2EMediaId(e2eMediaId);
  if (!doc) return false;

  if (doc.scanHash) {
    try {
      await purgeConvScanCleartextArtifacts(doc.scanHash, {
        removeDbRows: false,
        s3Client: getS3Client(),
        mediaBucket: config.s3.mediaBucket,
      });
    } catch (err) {
      elog.error('conv_scan S3 purge failed during E2E media delete', {
        e2eMediaId,
        scanHash: doc.scanHash,
        err,
      });
    }
  }

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
