/**
 * Shared sanitization and parsing helpers for Space routes.
 *
 * Consistent with the rest of the API, sanitization happens at the controller
 * boundary via {@link sanitizeString}/{@link sanitizeObjectId} before values
 * reach services or repositories. Zod (see `@adieuu/shared/schemas`) validates
 * shape/length; these helpers strip control/invisible/injection characters and
 * re-assert the invariants after stripping.
 *
 * @module routes/spaces/space-inputs
 */

import { sanitizeString, sanitizeObjectId } from '../../utils/sanitize';
import {
  SPACE_SLUG_PATTERN,
  SPACE_SLUG_MIN_LENGTH,
  SPACE_SLUG_MAX_LENGTH,
  SPACE_NAME_MAX_LENGTH,
  SPACE_DESCRIPTION_MAX_LENGTH,
  SPACE_MESSAGE_MAX_LENGTH,
  SPACE_CHANNEL_NAME_MAX_LENGTH,
} from '@adieuu/shared';

/** Max length for Space role names (mirrors the shared Zod schema). */
const SPACE_ROLE_NAME_MAX_LENGTH = 100;
/** Max length for member nicknames (mirrors the shared Zod schema). */
const SPACE_NICKNAME_MAX_LENGTH = 50;
/** Max length for ban reasons (mirrors the shared Zod schema). */
const SPACE_BAN_REASON_MAX_LENGTH = 500;

/** Valid Mongo ObjectId hex string after `sanitizeString(..., 'id')`. */
export function sanitizeSpaceObjectId(
  raw: string | undefined,
): { ok: true; id: string } | { ok: false } {
  return sanitizeObjectId(raw);
}

/** Cursor for paginated lists: omit invalid tokens (lenient). */
export function parseSpaceListCursor(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const s = sanitizeObjectId(raw);
  return s.ok ? s.id : undefined;
}

/** Clamp a `limit` query param into a sane range. */
export function clampSpaceListLimit(
  limitParam: string | null,
  defaultLimit = 30,
  max = 100,
): number {
  let limit = limitParam ? parseInt(limitParam, 10) : defaultLimit;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > max) limit = max;
  return limit;
}

/**
 * Slug: strip to lowercase alphanumeric + hyphen, then re-assert the shared
 * pattern/length. Homoglyphs, control chars, and `${` are removed by
 * `sanitizeString`; the pattern re-check rejects leading/trailing hyphens.
 */
export function sanitizeSpaceSlug(
  raw: string | undefined,
): { ok: true; slug: string } | { ok: false } {
  const slug = sanitizeString(raw ?? '', 'alphanumdash').value.toLowerCase();
  if (
    slug.length < SPACE_SLUG_MIN_LENGTH ||
    slug.length > SPACE_SLUG_MAX_LENGTH ||
    !SPACE_SLUG_PATTERN.test(slug)
  ) {
    return { ok: false };
  }
  return { ok: true, slug };
}

/**
 * Space name: general-text sanitize (keeps international scripts/emoji), must be
 * non-empty and within the shared max length after stripping.
 */
export function sanitizeSpaceName(
  raw: string | undefined,
): { ok: true; name: string } | { ok: false } {
  const name = sanitizeString(raw ?? '', 'general').value;
  if (!name || name.length > SPACE_NAME_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, name };
}

/**
 * Optional description: absent/blank collapses to `undefined`; otherwise
 * general-text sanitize with the shared max length.
 */
export function sanitizeSpaceDescription(
  raw: string | undefined,
): { ok: true; description: string | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, description: undefined };
  const description = sanitizeString(raw, 'general').value;
  if (description.length > SPACE_DESCRIPTION_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, description: description.length > 0 ? description : undefined };
}

/**
 * Plaintext (non-E2EE) channel message content: general-text sanitize, must be
 * non-empty and within the shared max length after stripping.
 */
export function sanitizeSpaceMessageContent(
  raw: string | undefined,
): { ok: true; content: string } | { ok: false } {
  const content = sanitizeString(raw ?? '', 'general').value;
  if (!content || content.length > SPACE_MESSAGE_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, content };
}

/**
 * Client-generated dedup id (UUID). Zod validates the UUID shape; this strips
 * any stray characters and re-checks the canonical UUID format.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeClientMessageId(
  raw: string | undefined,
): { ok: true; clientMessageId: string } | { ok: false } {
  const value = sanitizeString(raw ?? '', 'alphanumdash').value.toLowerCase();
  if (!UUID_PATTERN.test(value)) {
    return { ok: false };
  }
  return { ok: true, clientMessageId: value };
}

/**
 * Role name: general-text sanitize, must be non-empty and within the shared
 * max length after stripping. `undefined` passes through (field not updated).
 */
export function sanitizeSpaceRoleName(
  raw: string | undefined,
): { ok: true; name: string | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, name: undefined };
  const name = sanitizeString(raw, 'general').value.trim();
  if (!name || name.length > SPACE_ROLE_NAME_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, name };
}

/**
 * Channel or category name: general-text sanitize, must be non-empty and
 * within the shared max length after stripping. `undefined` passes through.
 */
export function sanitizeSpaceChannelName(
  raw: string | undefined,
): { ok: true; name: string | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, name: undefined };
  const name = sanitizeString(raw, 'general').value.trim();
  if (!name || name.length > SPACE_CHANNEL_NAME_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, name };
}

/**
 * Member nickname: general-text sanitize. `null` (clear) and `undefined`
 * (not updated) pass through; a provided string must stay non-empty and
 * within the shared max length after stripping.
 */
export function sanitizeSpaceNickname(
  raw: string | null | undefined,
): { ok: true; nickname: string | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, nickname: undefined };
  if (raw === null) return { ok: true, nickname: null };
  const nickname = sanitizeString(raw, 'general').value.trim();
  if (!nickname || nickname.length > SPACE_NICKNAME_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, nickname };
}

/**
 * Ban reason: general-text sanitize, must be non-empty and within the shared
 * max length after stripping (shown to moderators; must never carry
 * control/injection characters).
 */
export function sanitizeSpaceBanReason(
  raw: string | undefined,
): { ok: true; reason: string } | { ok: false } {
  const reason = sanitizeString(raw ?? '', 'general').value.trim();
  if (!reason || reason.length > SPACE_BAN_REASON_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, reason };
}

/**
 * Directory search term: general-text sanitize, trimmed, capped, and collapsed
 * to `undefined` when empty. Regex metacharacters are additionally escaped in
 * the repository before use, so this term is safe to pass through.
 */
export function sanitizeSpaceSearchTerm(
  raw: string | null,
  maxLength = 100,
): string | undefined {
  if (!raw || raw.length > maxLength) return undefined;
  const value = sanitizeString(raw, 'general').value;
  return value.length > 0 ? value : undefined;
}
