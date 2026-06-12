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
 * - User-facing endpoints require identity session (or account session for ticket attachments)
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
  type RequestUploadSession,
  type UploadOwner,
} from './controller';
import { requireAccountSession } from '../../services/session.service';
import { getClientIp } from '../auth/controller';

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

async function resolveUploadSession(ctx: RouteContext, purpose?: string): Promise<
  | { ok: true; session: RequestUploadSession; owner: UploadOwner }
  | { ok: false; response: Response }
> {
  if (ctx.identitySession) {
    const { identity, subscriptions, entitlements, isLifetime } = ctx.identitySession;
    const identityId = identity._id.toHexString();
    return {
      ok: true,
      session: {
        type: 'identity',
        identityId,
        subscriptions,
        entitlements,
        isLifetime,
      },
      owner: { type: 'identity', id: identityId },
    };
  }

  if (purpose === 'ticket_attachment') {
    const accountSession = await requireAccountSession(ctx.request);
    if (accountSession) {
      return {
        ok: true,
        session: { type: 'account', userId: accountSession.userId },
        owner: { type: 'account', id: accountSession.userId },
      };
    }
  }

  return { ok: false, response: ctx.errors.unauthorized() };
}

/**
 * POST /uploads/request - Request a presigned S3 upload URL
 *
 * @route POST /api/uploads/request
 */
router.post('/uploads/request', async (ctx) => {
  const body = ctx.body as { purpose?: string } | undefined;
  const auth = await resolveUploadSession(ctx, body?.purpose);
  if (!auth.ok) return auth.response;

  const clientIp = getClientIp(ctx.request);
  const result = await requestUploadResult(auth.session, ctx.body, clientIp);
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /uploads/:mediaId/complete - Notify that upload is finished
 *
 * @route POST /api/uploads/:mediaId/complete
 */
router.post('/uploads/:mediaId/complete', async (ctx) => {
  const auth = await resolveUploadSession(ctx, 'ticket_attachment');
  if (!auth.ok) return auth.response;

  const result = await completeUploadResult(auth.owner, ctx.params.mediaId);
  if (!result.ok) return mapUploadFailure(ctx, result);
  return success(undefined, 'Upload marked as complete.');
});

/**
 * GET /uploads/:mediaId/status - Check processing status
 *
 * @route GET /api/uploads/:mediaId/status
 */
router.get('/uploads/:mediaId/status', async (ctx) => {
  const auth = await resolveUploadSession(ctx, 'ticket_attachment');
  if (!auth.ok) return auth.response;

  const result = await getUploadStatusResult(auth.owner, ctx.params.mediaId);
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
