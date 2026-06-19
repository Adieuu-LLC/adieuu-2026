/**
 * Community feedback routes.
 */

import { Router, type RouteContext } from '../../router';
import { success, error } from '../../utils/response';
import { requireIdentitySession, type IdentityContext } from '../../middleware/identity-session';
import {
  addCommentResult,
  createPostResult,
  getPostResult,
  listPostsResult,
  removeUpvoteResult,
  upvotePostResult,
  updateStatusResult,
  getNotificationPrefsResult,
  updateNotificationPrefsResult,
  getRoadmapTimelineResult,
  type FeedbackResult,
} from './controller';

const router = new Router();

function mapFeedbackFailure(
  ctx: RouteContext,
  result: Extract<FeedbackResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'forbidden':
      return result.message ? error('FORBIDDEN', result.message, 403) : ctx.errors.forbidden();
    case 'not_found':
      return result.message ? error('NOT_FOUND', result.message, 404) : ctx.errors.notFound();
    case 'rate_limited':
      return ctx.errors.rateLimited();
    case 'conflict':
      return result.message ? error('CONFLICT', result.message, 409) : ctx.errors.conflict();
    case 'bad_request':
    default:
      return result.message ? error('BAD_REQUEST', result.message, 400) : ctx.errors.badRequest();
  }
}

function requireIdentity(ctx: RouteContext) {
  const authError = requireIdentitySession(ctx);
  if (authError) return { ok: false as const, response: authError };
  return { ok: true as const, identitySession: ctx.identitySession! };
}

router.post('/feedback', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await createPostResult(auth.identitySession, ctx.body);
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.get('/feedback', async (ctx) => {
  const result = await listPostsResult(
    ctx.identitySession ?? null,
    new URL(ctx.request.url).searchParams,
  );
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.get('/feedback/notification-prefs', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await getNotificationPrefsResult(auth.identitySession);
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.put('/feedback/notification-prefs', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await updateNotificationPrefsResult(auth.identitySession, ctx.body);
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.get('/feedback/roadmap', async (ctx) => {
  const result = await getRoadmapTimelineResult();
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.get('/feedback/:postId', async (ctx) => {
  const result = await getPostResult(ctx.identitySession ?? null, ctx.params.postId ?? '');
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.post('/feedback/:postId/upvote', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await upvotePostResult(auth.identitySession, ctx.params.postId ?? '');
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.delete('/feedback/:postId/upvote', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await removeUpvoteResult(auth.identitySession, ctx.params.postId ?? '');
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.post('/feedback/:postId/comments', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await addCommentResult(auth.identitySession, ctx.params.postId ?? '', ctx.body);
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

router.patch('/feedback/:postId/status', async (ctx) => {
  const auth = requireIdentity(ctx);
  if (!auth.ok) return auth.response;

  const result = await updateStatusResult(auth.identitySession, ctx.params.postId ?? '', ctx.body);
  if (!result.ok) return mapFeedbackFailure(ctx, result);
  return success(result.data);
});

export const feedbackRoutes = router;
