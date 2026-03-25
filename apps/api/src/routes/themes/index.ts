/**
 * Community Themes routes module.
 *
 * Public browse/get endpoints + identity-authenticated upload/delete/report.
 *
 * @module routes/themes
 */

import { ObjectId } from 'mongodb';
import { Router } from '../../router';
import { success } from '../../utils/response';
import { z, CommunityThemeUploadSchema } from '@adieuu/shared/schemas';
import { getCommunityThemeRepository } from '../../repositories/community-theme.repository';
import { toPublicCommunityTheme } from '../../models/community-theme';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import { checkRateLimit } from '../../services/rate-limit.service';
import { getSessionFromRequest } from '../../services/session.service';

const router = new Router();

const THEME_UPLOAD_RATE_CONFIG = {
  limit: 5,
  windowSeconds: 60 * 60, // 1 hour
};

/**
 * GET /themes - List community themes with optional search/filter.
 *
 * Public endpoint; no authentication required.
 *
 * @route GET /api/themes
 * @query page (number, default 1)
 * @query limit (number, default 20, max 50)
 * @query search (string, optional)
 * @query tag (string, optional)
 * @query sort ('newest' | 'downloads', default 'newest')
 */
router.get('/themes', async (ctx) => {
  const url = new URL(ctx.request.url, 'http://localhost');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const search = url.searchParams.get('search') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;
  const sortParam = url.searchParams.get('sort');
  const sort: 'newest' | 'downloads' = sortParam === 'downloads' ? 'downloads' : 'newest';

  const repo = getCommunityThemeRepository();
  const { themes, total } = await repo.list({ page, limit, search, tag, sort });

  return success({
    themes: themes.map(toPublicCommunityTheme),
    total,
    page,
    limit,
  });
});

/**
 * GET /themes/:id - Get a single community theme by ID.
 *
 * Public endpoint. Increments download counter.
 *
 * @route GET /api/themes/:id
 */
router.get('/themes/:id', async (ctx) => {
  const { id } = ctx.params;
  if (!id || !ObjectId.isValid(id)) {
    return ctx.errors.badRequest();
  }

  const repo = getCommunityThemeRepository();
  const theme = await repo.findById(id);
  if (!theme) {
    return ctx.errors.notFound();
  }

  void repo.incrementDownloads(id);

  return success(toPublicCommunityTheme(theme));
});

/**
 * POST /themes - Upload/share a theme publicly.
 *
 * Requires both a user session and an identity session.
 *
 * @route POST /api/themes
 */
router.post('/themes', async (ctx) => {
  const userSession = await getSessionFromRequest(ctx.request);
  if (!userSession?.userId) {
    return ctx.errors.unauthorized();
  }

  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const rateLimitResult = await checkRateLimit(
    'theme_upload',
    identity._id.toHexString(),
    THEME_UPLOAD_RATE_CONFIG,
  );
  if (!rateLimitResult.allowed) {
    return ctx.errors.rateLimited();
  }

  const parseResult = CommunityThemeUploadSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { name, description, theme, tags } = parseResult.data;

  const repo = getCommunityThemeRepository();
  const doc = await repo.create({
    name,
    description: description ?? '',
    authorIdentityId: identity._id,
    authorUsername: identity.username,
    theme,
    tags: tags ?? [],
  });

  return success(toPublicCommunityTheme(doc));
});

/**
 * DELETE /themes/:id - Delete own theme.
 *
 * Requires identity session; must be the author.
 *
 * @route DELETE /api/themes/:id
 */
router.delete('/themes/:id', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { id } = ctx.params;
  if (!id || !ObjectId.isValid(id)) {
    return ctx.errors.badRequest();
  }

  const repo = getCommunityThemeRepository();
  const deleted = await repo.deleteByIdAndAuthor(id, identity._id);
  if (!deleted) {
    return ctx.errors.notFound();
  }

  return success(undefined, 'Theme deleted.');
});

/**
 * POST /themes/:id/report - Report a community theme.
 *
 * Requires identity session.
 *
 * @route POST /api/themes/:id/report
 */
router.post('/themes/:id/report', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { id } = ctx.params;
  if (!id || !ObjectId.isValid(id)) {
    return ctx.errors.badRequest();
  }

  const repo = getCommunityThemeRepository();
  const theme = await repo.findById(id);
  if (!theme) {
    return ctx.errors.notFound();
  }

  await repo.markReported(id);
  return success(undefined, 'Theme reported. Thank you.');
});

export const themeRoutes = router;
