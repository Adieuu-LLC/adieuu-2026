/**
 * Custom emoji routes module.
 *
 * CRUD endpoints for user-uploaded custom emojis.
 * All endpoints require an identity session.
 *
 * @module routes/custom-emojis
 */

import { Router } from '../../router';
import { z } from '@adieuu/shared/schemas';
import { success, error, errors } from '../../utils/response';
import { requireIdentitySession } from '../../middleware/identity-session';
import { isValidObjectId } from '../../utils/isValidObjectId';
import {
  createCustomEmoji,
  listCustomEmojis,
  getCustomEmoji,
  updateCustomEmoji,
  deleteCustomEmoji,
  resolveCustomEmojiLimit,
} from '../../services/custom-emoji.service';

const router = new Router();

const CreateSchema = z.object({
  shortcode: z.string().min(2).max(32),
  name: z.string().min(1).max(64),
  mediaId: z.string().min(1).max(100),
});

const UpdateSchema = z.object({
  shortcode: z.string().min(2).max(32).optional(),
  name: z.string().min(1).max(64).optional(),
}).refine(
  (data) => data.shortcode !== undefined || data.name !== undefined,
  { message: 'At least one of shortcode or name is required' },
);

/**
 * GET /custom-emojis - List the current identity's custom emojis.
 */
router.get('/custom-emojis', async (ctx) => {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;
  const { identity, subscriptions, isLifetime } = ctx.identitySession!;

  const result = await listCustomEmojis(identity._id.toHexString());
  if (!result.success) {
    return errors.internal(result.error);
  }

  const limit = resolveCustomEmojiLimit(subscriptions, isLifetime);

  return success({
    emojis: result.data,
    limit,
    used: result.data!.length,
  });
});

/**
 * POST /custom-emojis - Create a custom emoji (Phase 2: after upload is ready).
 */
router.post('/custom-emojis', async (ctx) => {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;
  const { identity, subscriptions, isLifetime } = ctx.identitySession!;

  const parsed = CreateSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return ctx.errors.validationFailed();
  }

  const result = await createCustomEmoji({
    identityId: identity._id.toHexString(),
    shortcode: parsed.data.shortcode,
    name: parsed.data.name,
    mediaId: parsed.data.mediaId,
    subscriptions,
    isLifetime,
  });

  if (!result.success) {
    const httpStatus =
      result.errorCode === 'LIMIT_REACHED' || result.errorCode === 'SUBSCRIPTION_REQUIRED'
        ? 403
        : result.errorCode === 'SHORTCODE_TAKEN' || result.errorCode === 'SHORTCODE_CONFLICT'
          ? 409
          : 400;
    return error(result.errorCode!, result.error!, httpStatus);
  }

  return success(result.data, undefined, 201);
});

/**
 * GET /custom-emojis/:id - Get a single custom emoji.
 */
router.get('/custom-emojis/:id', async (ctx) => {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;

  const id = ctx.params.id ?? '';
  if (!isValidObjectId(id)) return ctx.errors.badRequest();

  const result = await getCustomEmoji(id);
  if (!result.success) {
    return errors.notFound(result.error);
  }

  return success(result.data);
});

/**
 * PATCH /custom-emojis/:id - Update shortcode and/or name.
 */
router.patch('/custom-emojis/:id', async (ctx) => {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;
  const { identity } = ctx.identitySession!;

  const id = ctx.params.id ?? '';
  if (!isValidObjectId(id)) return ctx.errors.badRequest();

  const parsed = UpdateSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return ctx.errors.validationFailed();
  }

  const result = await updateCustomEmoji({
    emojiId: id,
    identityId: identity._id.toHexString(),
    shortcode: parsed.data.shortcode,
    name: parsed.data.name,
  });

  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') return errors.notFound(result.error);
    if (result.errorCode === 'NOT_OWNER') return ctx.errors.forbidden();
    const httpStatus =
      result.errorCode === 'SHORTCODE_TAKEN' || result.errorCode === 'SHORTCODE_CONFLICT'
        ? 409
        : 400;
    return error(result.errorCode!, result.error!, httpStatus);
  }

  return success(result.data);
});

/**
 * DELETE /custom-emojis/:id - Delete a custom emoji.
 */
router.delete('/custom-emojis/:id', async (ctx) => {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;
  const { identity } = ctx.identitySession!;

  const id = ctx.params.id ?? '';
  if (!isValidObjectId(id)) return ctx.errors.badRequest();

  const result = await deleteCustomEmoji({
    emojiId: id,
    identityId: identity._id.toHexString(),
  });

  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') return errors.notFound(result.error);
    if (result.errorCode === 'NOT_OWNER') return ctx.errors.forbidden();
    return error(result.errorCode!, result.error!, 400);
  }

  return success(null, undefined, 204);
});

export const customEmojiRoutes = router;
