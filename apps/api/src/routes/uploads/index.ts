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

import { Router, type RouteContext } from '../../router';
import { success, errors } from '../../utils/response';
import {
  requestUploadResult,
  completeUploadResult,
  getUploadStatusResult,
  processCallbackResult,
  type UploadResult,
} from './controller';

const router = new Router();

function mapUploadFailure(
  ctx: RouteContext,
  result: Extract<UploadResult, { ok: false }>,
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
    case 'unauthorized':
      return errors.unauthorized(result.message);
  }
}

/**
 * POST /uploads/request - Request a presigned S3 upload URL
 *
 * @route POST /api/uploads/request
 */
router.post('/uploads/request', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, subscriptions, entitlements, isLifetime } = ctx.identitySession;

  const result = await requestUploadResult(
    {
      identityId: identity._id.toHexString(),
      subscriptions,
      entitlements,
      isLifetime,
    },
    ctx.body,
  );
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/:mediaId/complete - Notify that upload is finished
 *
 * @route POST /api/uploads/:mediaId/complete
 */
router.post('/uploads/:mediaId/complete', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await completeUploadResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(undefined, 'Upload marked as complete.');
});

/**
 * GET /uploads/:mediaId/status - Check processing status
 *
 * @route GET /api/uploads/:mediaId/status
 */
router.get('/uploads/:mediaId/status', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getUploadStatusResult(identity._id.toHexString(), ctx.params.mediaId);
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/process-callback - Lambda processor reports result
 *
 * @deprecated The media processor Lambda now invokes a dedicated DB writer
 * Lambda directly. This endpoint is retained as a manual fallback and will
 * be removed in a future release.
 *
 * @route POST /api/uploads/process-callback
 */
router.post('/uploads/process-callback', async (ctx) => {
  const result = await processCallbackResult(
    ctx.request.headers.get('x-processor-secret'),
    ctx.body,
  );
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(undefined, 'Callback processed.');
});

export const uploadRoutes = router;
