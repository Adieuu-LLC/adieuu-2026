/**
 * Upload routes module.
 *
 * Provides endpoints for requesting presigned S3 upload URLs,
 * confirming completed uploads, checking processing status,
 * and receiving Lambda processor callbacks.
 *
 * @module routes/uploads
 *
 * SECURITY:
 * - All user-facing endpoints require identity session
 * - Process callback uses shared secret authentication
 * - Presigned URLs are short-lived and scoped per-object
 */

import { Router } from '../../router';
import { z } from '@adieuu/shared/schemas';
import { success, errors } from '../../utils/response';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import {
  requestUpload,
  completeUpload,
  getUploadStatus,
  processCallback,
} from '../../services/upload.service';
import { config } from '../../config';
import type { UploadPurpose } from '../../models/media-upload';

const router = new Router();

const RequestUploadSchema = z.object({
  purpose: z.enum(['avatar', 'banner', 'dm_attachment', 'space_media']),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

// ============================================================================
// Request presigned upload URL
// ============================================================================

/**
 * POST /uploads/request - Request a presigned S3 upload URL
 *
 * @route POST /api/uploads/request
 *
 * @requestBody
 * - `purpose` (string, required): 'avatar' | 'banner' | 'dm_attachment' | 'space_media'
 * - `contentType` (string, required): MIME type of the file
 * - `contentLength` (number, required): File size in bytes
 *
 * @returns 200 OK with { mediaId, uploadUrl, expiresIn }
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 429 Too Many Requests if rate limited
 */
router.post('/uploads/request', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const parseResult = RequestUploadSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const result = await requestUpload({
    purpose: parseResult.data.purpose as UploadPurpose,
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
    mediaId: result.mediaId,
    uploadUrl: result.uploadUrl,
    expiresIn: result.expiresIn,
  });
});

// ============================================================================
// Complete upload (client confirms file was uploaded)
// ============================================================================

/**
 * POST /uploads/:mediaId/complete - Notify that upload is finished
 *
 * @route POST /api/uploads/:mediaId/complete
 *
 * @returns 200 OK on success
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if upload doesn't exist or doesn't belong to caller
 */
router.post('/uploads/:mediaId/complete', async (ctx) => {
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

  const result = await completeUpload(mediaId, identity._id.toHexString());

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FOUND':
        return errors.notFound(result.error);
      default:
        return errors.badRequest(result.error);
    }
  }

  return success(undefined, 'Upload marked as complete.');
});

// ============================================================================
// Check upload status
// ============================================================================

/**
 * GET /uploads/:mediaId/status - Check processing status
 *
 * @route GET /api/uploads/:mediaId/status
 *
 * @returns 200 OK with { mediaId, status, cdnUrl? }
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if upload doesn't exist or doesn't belong to caller
 */
router.get('/uploads/:mediaId/status', async (ctx) => {
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

  const doc = await getUploadStatus(mediaId, identity._id.toHexString());
  if (!doc) {
    return errors.notFound('Upload not found');
  }

  return success({
    mediaId: doc.mediaId,
    status: doc.status,
    cdnUrl: doc.cdnUrl ?? null,
    rejectionReason: doc.rejectionReason ?? null,
  });
});

// ============================================================================
// Lambda processor callback (internal, authenticated via shared secret)
// ============================================================================

const ProcessCallbackSchema = z.object({
  mediaId: z.string().min(1).max(200),
  status: z.enum(['ready', 'rejected', 'failed']),
  processedS3Key: z.string().max(500).optional(),
  rejectionReason: z.string().max(500).optional(),
});

/**
 * POST /uploads/process-callback - Lambda processor reports result
 *
 * @deprecated The media processor Lambda now invokes a dedicated DB writer
 * Lambda directly. This endpoint is retained as a manual fallback and will
 * be removed in a future release.
 *
 * Internal endpoint authenticated with a shared secret header.
 *
 * @route POST /api/uploads/process-callback
 */
router.post('/uploads/process-callback', async (ctx) => {
  const authHeader = ctx.request.headers.get('x-processor-secret');
  if (!authHeader || authHeader !== config.mediaProcessorSecret) {
    return errors.unauthorized('Invalid processor secret');
  }

  const parseResult = ProcessCallbackSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return errors.badRequest('Invalid callback payload');
  }

  const { mediaId, status, processedS3Key, rejectionReason } = parseResult.data;

  const ok = await processCallback(mediaId, status, processedS3Key, rejectionReason);
  if (!ok) {
    return errors.notFound('Upload not found');
  }

  return success(undefined, 'Callback processed.');
});

export const uploadRoutes = router;
