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
import { computeColorChecksum } from '@adieuu/shared';
import { getCommunityThemeRepository } from '../../repositories/community-theme.repository';
import { toPublicCommunityTheme } from '../../models/community-theme';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import { checkRateLimit } from '../../services/rate-limit.service';
import { requireAccountSession } from '../../services/session.service';

const router = new Router();

const THEME_UPLOAD_RATE_CONFIG = {
  limit: 5,
  windowSeconds: 60 * 60, // 1 hour
};

/** Pre-computed SHA-256 checksums of built-in preset theme colours. */
const BUILTIN_CHECKSUMS = new Set([
  '08115fe0f979e002004eeee7a02bc7f4bae8ed74e59bba9a338a63e333817346', // midnight
  '652c443ae234ef3765eb277ec2b95f43cbe7e048993aa94b82d6ea21d8903834', // daylight
  '9265bb720887db34db2efb93dc4a9a21d230518f263e5e6e82c3bb2e9cb583ed', // ember
  '9672f39d347898d40485184a2148d5a58eb975842a325ac64df94c6ba28aacf7', // verdant
  '8b2676056db3376c1b91e4c083e055219df3848f7e1079cb9927c34d7dbeed1f', // royal
]);

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
  const rawSearch = url.searchParams.get('search');
  const search = rawSearch && rawSearch.length <= 100 ? rawSearch : undefined;
  const rawTag = url.searchParams.get('tag');
  const tag = rawTag && rawTag.length <= 30 ? rawTag : undefined;
  const sortParam = url.searchParams.get('sort');
  const sort: 'newest' | 'downloads' | 'upvotes' =
    sortParam === 'downloads' ? 'downloads' : sortParam === 'upvotes' ? 'upvotes' : 'newest';

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
  if (!(await requireAccountSession(ctx.request))) {
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

  const colorChecksum = await computeColorChecksum(theme.colors);

  if (BUILTIN_CHECKSUMS.has(colorChecksum)) {
    return ctx.errors.conflict();
  }

  const repo = getCommunityThemeRepository();

  const alreadyShared = await repo.existsByChecksumAndAuthor(colorChecksum, identity._id);
  if (alreadyShared) {
    return ctx.errors.conflict();
  }

  const sanitisedTheme = { ...theme, author: identity.username };

  const doc = await repo.create({
    name,
    description: description ?? '',
    authorIdentityId: identity._id,
    authorUsername: identity.username,
    theme: sanitisedTheme,
    tags: tags ?? [],
    colorChecksum,
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
 * POST /themes/:id/upvote - Upvote a community theme.
 *
 * Requires identity session. Each identity can only upvote a theme once;
 * subsequent calls are idempotent.
 *
 * @route POST /api/themes/:id/upvote
 */
router.post('/themes/:id/upvote', async (ctx) => {
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

  if (theme.authorIdentityId.equals(identity._id)) {
    return ctx.errors.forbidden();
  }

  const added = await repo.upvote(id, identity._id);

  return success({ upvoted: added, upvotes: added ? theme.upvotes + 1 : theme.upvotes });
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
