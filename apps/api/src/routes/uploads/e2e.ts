/**
 * E2E media upload routes.
 *
 * Provides endpoints for the dual-upload conversation media flow:
 * - E2E encrypted blob upload (request, complete, status, gated download)
 * - Scan copy upload (request, complete) for Rekognition moderation
 *
 * SECURITY:
 * - All endpoints require identity session authentication
 * - E2E media downloads are gated by scan moderation status
 * - Scan copies do not store identityId (anonymous via scanHash)
 * - Rate limiting uses the authenticated identity at request time
 *
 * @module routes/uploads/e2e
 */

import { Router } from '../../router';
import { z } from '@adieuu/shared/schemas';
import { success, error, errors } from '../../utils/response';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
  getIdentityUploadContext,
} from '../../services/identity.service';
import { VIDEO_MIME_TYPES } from '../../models/media-upload';
import {
  requestE2EUpload,
  completeE2EUpload,
  getE2EMediaStatus,
  getE2EMediaDownload,
  requestScanUpload,
  completeScanUpload,
} from '../../services/e2e-upload.service';

const router = new Router();

const RequestE2EUploadSchema = z
  .object({
    contentType: z.string().min(1).max(100),
    contentLength: z.number().int().positive(),
    stripExif: z.boolean().default(true),
    declaredDurationSeconds: z.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const isVideo = (VIDEO_MIME_TYPES as readonly string[]).includes(data.contentType);
    if (isVideo && data.declaredDurationSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'declaredDurationSeconds is required for video content types',
        path: ['declaredDurationSeconds'],
      });
    }
  });

const RequestScanUploadSchema = z.object({
  scanHash: z.string().length(64),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

// ============================================================================
// E2E media: Request presigned upload URL
// ============================================================================

/**
 * POST /uploads/e2e/request - Request a presigned URL for E2E encrypted media
 *
 * @route POST /api/uploads/e2e/request
 *
 * @requestBody
 * - `contentType` (string): MIME type of the original file
 * - `contentLength` (number): File size in bytes (of the encrypted blob)
 * - `stripExif` (boolean, default true): Whether EXIF was stripped client-side
 *
 * @returns 200 OK with { e2eMediaId, uploadUrl, scanHash, expiresIn }
 */
router.post('/uploads/e2e/request', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const uploadCtx = await getIdentityUploadContext(identitySessionId);
  if (!uploadCtx) {
    return ctx.errors.unauthorized();
  }

  const parseResult = RequestE2EUploadSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const result = await requestE2EUpload({
    contentType: parseResult.data.contentType,
    contentLength: parseResult.data.contentLength,
    identityId: uploadCtx.identity._id.toHexString(),
    stripExif: parseResult.data.stripExif,
    maxVideoDurationSeconds: uploadCtx.maxVideoDurationSeconds,
    declaredDurationSeconds: parseResult.data.declaredDurationSeconds,
  });

  if (!result.success) {
    switch (result.errorCode) {
      case 'RATE_LIMITED':
        return errors.rateLimited(result.error);
      case 'UPLOAD_DISABLED':
        return errors.badRequest(result.error);
      case 'VIDEO_DURATION_EXCEEDED':
        return errors.badRequest(result.error);
      case 'VIDEO_DURATION_REQUIRED':
        return errors.badRequest(result.error);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success({
    e2eMediaId: result.e2eMediaId,
    uploadUrl: result.uploadUrl,
    scanHash: result.scanHash,
    expiresIn: result.expiresIn,
  });
});

// ============================================================================
// E2E media: Complete upload
// ============================================================================

/**
 * POST /uploads/e2e/:mediaId/complete - Confirm E2E media upload finished
 *
 * @route POST /api/uploads/e2e/:mediaId/complete
 */
router.post('/uploads/e2e/:mediaId/complete', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { mediaId } = ctx.params;
  if (!mediaId || mediaId.length > 100) {
    return ctx.errors.badRequest();
  }

  const result = await completeE2EUpload(mediaId, identity._id.toHexString());

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return errors.notFound(result.error);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success(undefined, 'E2E media upload marked as complete.');
});

// ============================================================================
// E2E media: Check status
// ============================================================================

/**
 * GET /uploads/e2e/:mediaId/status - Check E2E media + moderation status
 *
 * @route GET /api/uploads/e2e/:mediaId/status
 *
 * @returns 200 OK with { e2eMediaId, status, moderationStatus, moderationReason }
 */
router.get('/uploads/e2e/:mediaId/status', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { mediaId } = ctx.params;
  if (!mediaId || mediaId.length > 100) {
    return ctx.errors.badRequest();
  }

  const result = await getE2EMediaStatus(mediaId, identity._id.toHexString());
  if (!result) {
    return errors.notFound('E2E media not found');
  }

  return success(result);
});

// ============================================================================
// E2E media: Gated download
// ============================================================================

/**
 * GET /uploads/e2e/:mediaId/download - Get presigned GET URL (gated by moderation)
 *
 * @route GET /api/uploads/e2e/:mediaId/download
 *
 * @returns 200 OK with { downloadUrl, expiresIn } when scan passed
 * @returns 202 Accepted when scan is still pending
 * @returns 403 Forbidden when content was rejected
 */
router.get('/uploads/e2e/:mediaId/download', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { mediaId } = ctx.params;
  if (!mediaId || mediaId.length > 100) {
    return ctx.errors.badRequest();
  }

  const result = await getE2EMediaDownload(mediaId, identity._id.toHexString());

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return errors.notFound(result.error);
      case 'REJECTED':
        return error('REJECTED', result.error ?? 'Content has been rejected by moderation', 403, {
          moderationReason: result.moderationReason,
        });
      case 'MODERATION_ERROR':
        return error('MODERATION_ERROR', result.error ?? 'Content moderation scan encountered an error', 403);
      case 'SCAN_PENDING':
        return error('SCAN_PENDING', result.error ?? 'Content is awaiting moderation scan', 202);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success({
    downloadUrl: result.downloadUrl,
    expiresIn: result.expiresIn,
  });
});

// ============================================================================
// Scan copy: Request presigned upload URL
// ============================================================================

/**
 * POST /uploads/scan/request - Request a presigned URL for the scan copy
 *
 * @route POST /api/uploads/scan/request
 *
 * @requestBody
 * - `scanHash` (string, 64 chars): SHA3-256 derived scan hash
 * - `contentType` (string): MIME type of the thumbnail
 * - `contentLength` (number): File size in bytes
 *
 * @returns 200 OK with { scanMediaId, uploadUrl, expiresIn }
 */
router.post('/uploads/scan/request', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const parseResult = RequestScanUploadSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const result = await requestScanUpload({
    scanHash: parseResult.data.scanHash,
    contentType: parseResult.data.contentType,
    contentLength: parseResult.data.contentLength,
    identityId: identity._id.toHexString(),
  });

  if (!result.success) {
    switch (result.errorCode) {
      case 'RATE_LIMITED':
        return errors.rateLimited(result.error);
      case 'UPLOAD_DISABLED':
        return errors.badRequest(result.error);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success({
    scanMediaId: result.scanMediaId,
    uploadUrl: result.uploadUrl,
    expiresIn: result.expiresIn,
  });
});

// ============================================================================
// Scan copy: Complete upload
// ============================================================================

/**
 * POST /uploads/scan/:mediaId/complete - Confirm scan copy upload finished
 *
 * @route POST /api/uploads/scan/:mediaId/complete
 */
router.post('/uploads/scan/:mediaId/complete', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { mediaId } = ctx.params;
  if (!mediaId || mediaId.length > 100) {
    return ctx.errors.badRequest();
  }

  const result = await completeScanUpload(mediaId);

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return errors.notFound(result.error);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success(undefined, 'Scan copy upload marked as complete.');
});

export const e2eUploadRoutes = router;
