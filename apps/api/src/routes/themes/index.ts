/**
 * Community Themes routes module.
 *
 * Public browse/get endpoints + identity-authenticated upload/delete/report.
 *
 * @module routes/themes
 */

import { Router, type RouteContext } from '../../router';
import { success, error } from '../../utils/response';
import {
  listThemesResult,
  getSharedChecksumsResult,
  getThemeResult,
  uploadThemeResult,
  deleteThemeResult,
  upvoteThemeResult,
  reportThemeResult,
  type ThemeResult,
} from './controller';

const router = new Router();

function mapThemeFailure(
  ctx: RouteContext,
  result: Extract<ThemeResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'bad_request':
      return ctx.errors.badRequest();
    case 'not_found':
      return ctx.errors.notFound();
    case 'forbidden':
      return ctx.errors.forbidden();
    case 'conflict':
      return ctx.errors.conflict();
    case 'rate_limited':
      return ctx.errors.rateLimited();
  }
}

/**
 * GET /themes - List community themes with optional search/filter.
 *
 * Public endpoint; no authentication required.
 *
 * @route GET /api/themes
 */
router.get('/themes', async (ctx) => {
  const url = new URL(ctx.request.url, 'http://localhost');
  const result = await listThemesResult(url.searchParams);
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(result.data);
});

/**
 * GET /themes/me/shared-checksums - List colour checksums the current alias has already shared.
 *
 * @route GET /api/themes/me/shared-checksums
 */
router.get('/themes/me/shared-checksums', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getSharedChecksumsResult(identity._id);
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(result.data);
});

/**
 * GET /themes/:id - Get a single community theme by ID.
 *
 * Public endpoint. Increments download counter.
 *
 * @route GET /api/themes/:id
 */
router.get('/themes/:id', async (ctx) => {
  const result = await getThemeResult(ctx.params.id ?? '');
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /themes - Upload/share a theme publicly.
 *
 * @route POST /api/themes
 */
router.post('/themes', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await uploadThemeResult(identity._id, identity.username, ctx.body);
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(result.data);
});

/**
 * DELETE /themes/:id - Delete own theme.
 *
 * @route DELETE /api/themes/:id
 */
router.delete('/themes/:id', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await deleteThemeResult(identity._id, ctx.params.id ?? '');
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(undefined, 'Theme deleted.');
});

/**
 * POST /themes/:id/upvote - Upvote a community theme.
 *
 * @route POST /api/themes/:id/upvote
 */
router.post('/themes/:id/upvote', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, subscriptions } = ctx.identitySession;

  const hasPaidTier = subscriptions.some((t) => t === 'access' || t === 'insider');
  if (!hasPaidTier) {
    return error('TIER_REQUIRED', 'Upgrade to a paid plan to upvote themes.', 403);
  }

  const result = await upvoteThemeResult(identity._id, ctx.params.id ?? '');
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(result.data);
});

/**
 * POST /themes/:id/report - Report a community theme.
 *
 * @route POST /api/themes/:id/report
 */
router.post('/themes/:id/report', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const result = await reportThemeResult(ctx.params.id ?? '');
  if (!result.ok) return mapThemeFailure(ctx, result);
  return success(undefined, 'Theme reported. Thank you.');
});

export const themeRoutes = router;
