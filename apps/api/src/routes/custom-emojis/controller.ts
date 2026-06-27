/**
 * Custom emoji HTTP controllers — list, create, read, update, delete.
 *
 * All user-supplied strings are sanitized before service calls.
 *
 * @module routes/custom-emojis/controller
 */

import { z } from '@adieuu/shared/schemas';
import type { RouteContext } from '../../router/types';
import { success, error, errors } from '../../utils/response';
import { requireIdentitySession } from '../../middleware/identity-session';
import { isValidObjectId, sanitizeString } from '../../utils';
import {
  createCustomEmoji,
  listCustomEmojis,
  getCustomEmoji,
  updateCustomEmoji,
  deleteCustomEmoji,
  resolveCustomEmojiLimit,
} from '../../services/custom-emoji.service';

const CreateSchema = z.object({
  shortcode: z.string().min(2).max(32),
  name: z.string().min(1).max(64),
  mediaId: z.string().min(1).max(100),
});

const UpdateSchema = z
  .object({
    shortcode: z.string().min(2).max(32).optional(),
    name: z.string().min(1).max(64).optional(),
  })
  .refine((data) => data.shortcode !== undefined || data.name !== undefined, {
    message: 'At least one of shortcode or name is required',
  });

function parseEmojiMongoId(raw: string | undefined): { ok: true; id: string } | { ok: false } {
  const { value } = sanitizeString(raw ?? '', 'general');
  if (!value || !isValidObjectId(value)) return { ok: false };
  return { ok: true, id: value };
}

function sanitizeCreateBody(
  parsed: z.infer<typeof CreateSchema>,
):
  | { ok: true; shortcode: string; name: string; mediaId: string }
  | { ok: false } {
  const shortcode = sanitizeString(parsed.shortcode, 'idenhanced').value;
  if (shortcode.length < 2 || shortcode.length > 32) return { ok: false };

  const name = sanitizeString(parsed.name, 'general').value;
  if (name.length < 1 || name.length > 64) return { ok: false };

  const mediaId = sanitizeString(parsed.mediaId, 'idenhanced').value;
  if (!mediaId || mediaId.length > 100) return { ok: false };

  return { ok: true, shortcode, name, mediaId };
}

function sanitizeUpdateBody(
  parsed: z.infer<typeof UpdateSchema>,
):
  | { ok: true; shortcode?: string; name?: string }
  | { ok: false } {
  let shortcode: string | undefined;
  if (parsed.shortcode !== undefined) {
    shortcode = sanitizeString(parsed.shortcode, 'idenhanced').value;
    if (shortcode.length < 2 || shortcode.length > 32) return { ok: false };
  }

  let name: string | undefined;
  if (parsed.name !== undefined) {
    name = sanitizeString(parsed.name, 'general').value;
    if (name.length < 1 || name.length > 64) return { ok: false };
  }

  return { ok: true, shortcode, name };
}

export async function listCustomEmojisCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function createCustomEmojiCtrl(ctx: RouteContext): Promise<Response> {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;

  const { identity, subscriptions, isLifetime } = ctx.identitySession!;

  const parsed = CreateSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return ctx.errors.validationFailed();
  }

  const sanitized = sanitizeCreateBody(parsed.data);
  if (!sanitized.ok) {
    return ctx.errors.validationFailed();
  }

  const result = await createCustomEmoji({
    identityId: identity._id.toHexString(),
    shortcode: sanitized.shortcode,
    name: sanitized.name,
    mediaId: sanitized.mediaId,
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
}

export async function getCustomEmojiCtrl(ctx: RouteContext): Promise<Response> {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;

  const { identity } = ctx.identitySession!;

  const idParsed = parseEmojiMongoId(ctx.params.id);
  if (!idParsed.ok) return ctx.errors.badRequest();

  const result = await getCustomEmoji(idParsed.id, identity._id.toHexString());
  if (!result.success) {
    return errors.notFound(result.error);
  }

  return success(result.data);
}

export async function updateCustomEmojiCtrl(ctx: RouteContext): Promise<Response> {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;

  const { identity } = ctx.identitySession!;

  const idParsed = parseEmojiMongoId(ctx.params.id);
  if (!idParsed.ok) return ctx.errors.badRequest();

  const parsed = UpdateSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return ctx.errors.validationFailed();
  }

  const sanitized = sanitizeUpdateBody(parsed.data);
  if (!sanitized.ok) {
    return ctx.errors.validationFailed();
  }

  const result = await updateCustomEmoji({
    emojiId: idParsed.id,
    identityId: identity._id.toHexString(),
    shortcode: sanitized.shortcode,
    name: sanitized.name,
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
}

export async function deleteCustomEmojiCtrl(ctx: RouteContext): Promise<Response> {
  const guard = requireIdentitySession(ctx);
  if (guard) return guard;

  const { identity } = ctx.identitySession!;

  const idParsed = parseEmojiMongoId(ctx.params.id);
  if (!idParsed.ok) return ctx.errors.badRequest();

  const result = await deleteCustomEmoji({
    emojiId: idParsed.id,
    identityId: identity._id.toHexString(),
  });

  if (!result.success) {
    if (result.errorCode === 'NOT_FOUND') return errors.notFound(result.error);
    if (result.errorCode === 'NOT_OWNER') return ctx.errors.forbidden();
    return error(result.errorCode!, result.error!, 400);
  }

  return success(null, undefined, 204);
}
