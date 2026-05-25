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

import { Router, type RouteContext } from '../../router';
import { success, error, errors } from '../../utils/response';
import {
  requestE2EUploadResult,
  completeE2EUploadResult,
  abandonE2EUploadResult,
  getE2EMediaStatusResult,
  getE2EMediaDownloadResult,
  requestScanUploadResult,
  completeScanUploadResult,
  sealConvScanUploadResult,
  type E2eUploadResult,
} from './e2e.controller';

const router = new Router();

function mapE2eUploadFailure(
  ctx: RouteContext,
  result: Extract<E2eUploadResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'bad_request':
      return errors.badRequest(result.message);
    case 'not_found':
      return errors.notFound(result.message);
    case 'rate_limited':
      return errors.rateLimited(result.message);
    case 'forbidden':
      return error('FORBIDDEN', result.message ?? 'Forbidden', 403);
    case 'conflict':
      return error('REFERENCED', result.message ?? 'E2E media is referenced by a message', 409);
    case 'scan_pending':
      return error('SCAN_PENDING', result.message ?? 'Content is awaiting moderation scan', 202);
    case 'rejected':
      return error(
        'REJECTED',
        result.message ?? 'Content has been rejected by moderation',
        403,
        { moderationReason: result.moderationReason },
      );
    case 'moderation_error':
      return error(
        'MODERATION_ERROR',
        result.message ?? 'Content moderation scan encountered an error',
        403,
      );
  }
}

/**
 * POST /uploads/e2e/request - Request a presigned URL for E2E encrypted media
 *
 * @route POST /api/uploads/e2e/request
 */
router.post('/uploads/e2e/request', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, maxVideoDurationSeconds, subscriptions, entitlements, isLifetime } =
    ctx.identitySession;

  const result = await requestE2EUploadResult(
    {
      identityId: identity._id.toHexString(),
      maxVideoDurationSeconds,
      subscriptions,
      entitlements,
      isLifetime,
    },
    ctx.body,
  );
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/e2e/:mediaId/complete - Confirm E2E media upload finished
 *
 * @route POST /api/uploads/e2e/:mediaId/complete
 */
router.post('/uploads/e2e/:mediaId/complete', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await completeE2EUploadResult(
    identity._id.toHexString(),
    ctx.params.mediaId,
    ctx.body,
  );
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(undefined, 'E2E media upload marked as complete.');
});

/**
 * DELETE /uploads/e2e/:mediaId - Remove pending/gated E2E blob owned by the caller
 *
 * @route DELETE /api/uploads/e2e/:mediaId
 */
router.delete('/uploads/e2e/:mediaId', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await abandonE2EUploadResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(undefined, 'E2E media abandoned.');
});

/**
 * GET /uploads/e2e/:mediaId/status - Check E2E media + moderation status
 *
 * @route GET /api/uploads/e2e/:mediaId/status
 */
router.get('/uploads/e2e/:mediaId/status', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getE2EMediaStatusResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * GET /uploads/e2e/:mediaId/download - Get presigned GET URL (gated by moderation)
 *
 * @route GET /api/uploads/e2e/:mediaId/download
 */
router.get('/uploads/e2e/:mediaId/download', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getE2EMediaDownloadResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/scan/request - Request a presigned URL for the scan copy
 *
 * @route POST /api/uploads/scan/request
 */
router.post('/uploads/scan/request', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await requestScanUploadResult(identity._id.toHexString(), ctx.body);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/scan/:mediaId/complete - Confirm scan copy upload finished
 *
 * @route POST /api/uploads/scan/:mediaId/complete
 */
router.post('/uploads/scan/:mediaId/complete', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await completeScanUploadResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(undefined, 'Scan copy upload marked as complete.');
});

/**
 * POST /uploads/scan/seal - Write `.sealed` when all parts are uploaded
 *
 * @route POST /api/uploads/scan/seal
 */
router.post('/uploads/scan/seal', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await sealConvScanUploadResult(identity._id.toHexString(), ctx.body);
  if (!result.ok) return mapE2eUploadFailure(ctx, result);
  return success(undefined, 'Scan session sealed.');
});

export const e2eUploadRoutes = router;
