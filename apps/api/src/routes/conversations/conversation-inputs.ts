/**
 * Shared sanitization and parsing helpers for conversation routes.
 *
 * @module routes/conversations/conversation-inputs
 */

import { sanitizeString } from '../../utils/sanitize';
import { isValidObjectId } from '../../utils';
import type { EditMessageBody, SendMessageBody, SendReactionBody } from './conversation-schemas';

/** Valid Mongo ObjectId hex string after `sanitizeString(..., 'general')`. */
export function sanitizeObjectId24(
  raw: string | undefined,
): { ok: true; id: string } | { ok: false } {
  const s = sanitizeString(raw ?? '', 'general');
  if (!s.value || !isValidObjectId(s.value)) return { ok: false };
  return { ok: true, id: s.value };
}

/** Cursor for paginated lists: omit invalid tokens (lenient). */
export function parseOptionalObjectIdCursor(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const s = sanitizeString(raw, 'general');
  if (s.value && isValidObjectId(s.value)) return s.value;
  return undefined;
}

export function clampListLimit(limitParam: string | null, defaultLimit = 50, max = 100): number {
  let limit = limitParam ? parseInt(limitParam, 10) : defaultLimit;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > max) limit = max;
  return limit;
}

/**
 * Batch reaction `messageIds` query: 1–100 ids, each sanitized.
 */
export function sanitizeCommaSeparatedMessageIds(
  messageIdsParam: string | null,
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (!messageIdsParam) {
    return { ok: false, message: 'messageIds query parameter is required.' };
  }
  const parts = messageIdsParam.split(',').filter(Boolean);
  if (parts.length === 0 || parts.length > 100) {
    return { ok: false, message: 'Provide between 1 and 100 message IDs.' };
  }
  const ids: string[] = [];
  for (const part of parts) {
    const s = sanitizeObjectId24(part);
    if (!s.ok) {
      return { ok: false, message: 'Invalid message ID in list.' };
    }
    ids.push(s.id);
  }
  return { ok: true, ids };
}

/**
 * Pinned-message page cursor: optional; if present must be a valid ObjectId after sanitize.
 */
export function parsePinnedListCursor(
  cursorParam: string | null,
): { ok: true; cursor: string | undefined } | { ok: false; message: string } {
  if (cursorParam == null || cursorParam.trim() === '') {
    return { ok: true, cursor: undefined };
  }
  const s = sanitizeObjectId24(cursorParam);
  if (!s.ok) {
    return { ok: false, message: 'Invalid cursor.' };
  }
  return { ok: true, cursor: s.id };
}

export function sanitizeParticipantIds(
  participants: readonly string[],
): { ok: true; ids: string[] } | { ok: false } {
  const ids: string[] = [];
  for (const id of participants) {
    const s = sanitizeObjectId24(id);
    if (!s.ok) return { ok: false };
    ids.push(s.id);
  }
  return { ok: true, ids };
}

export function sanitizeSendMessageBody(
  parsed: SendMessageBody,
): { ok: true; data: SendMessageBody } | { ok: false } {
  const wrappedKeys: SendMessageBody['wrappedKeys'] = [];
  for (const w of parsed.wrappedKeys) {
    const sid = sanitizeObjectId24(w.identityId);
    if (!sid.ok) return { ok: false };
    wrappedKeys.push({ ...w, identityId: sid.id });
  }
  let replyToMessageId = parsed.replyToMessageId;
  if (replyToMessageId) {
    const s = sanitizeObjectId24(replyToMessageId);
    if (!s.ok) return { ok: false };
    replyToMessageId = s.id;
  }
  let mentionedIdentityIds = parsed.mentionedIdentityIds;
  if (mentionedIdentityIds?.length) {
    const out: string[] = [];
    for (const id of mentionedIdentityIds) {
      const sid = sanitizeObjectId24(id);
      if (!sid.ok) return { ok: false };
      out.push(sid.id);
    }
    mentionedIdentityIds = out;
  }
  return {
    ok: true,
    data: {
      ...parsed,
      wrappedKeys,
      ...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
      ...(mentionedIdentityIds !== undefined ? { mentionedIdentityIds } : {}),
    },
  };
}

export function sanitizeEditMessageBody(
  parsed: EditMessageBody,
): { ok: true; data: EditMessageBody } | { ok: false } {
  const wrappedKeys: EditMessageBody['wrappedKeys'] = [];
  for (const w of parsed.wrappedKeys) {
    const sid = sanitizeObjectId24(w.identityId);
    if (!sid.ok) return { ok: false };
    wrappedKeys.push({ ...w, identityId: sid.id });
  }
  return { ok: true, data: { ...parsed, wrappedKeys } };
}

export function sanitizeSendReactionBody(
  parsed: SendReactionBody,
): { ok: true; data: SendReactionBody } | { ok: false } {
  const wrappedKeys: SendReactionBody['wrappedKeys'] = [];
  for (const w of parsed.wrappedKeys) {
    const sid = sanitizeObjectId24(w.identityId);
    if (!sid.ok) return { ok: false };
    wrappedKeys.push({ ...w, identityId: sid.id });
  }
  return { ok: true, data: { ...parsed, wrappedKeys } };
}
