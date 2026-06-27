/**
 * Pure helpers for conversation message pagination (ObjectId-ordered message ids).
 * API lists messages newest-first; {@link messagePageBoundsFromNewestFirst} matches that order.
 */

/** GET …/messages: use with `cursor` to page toward the past or toward the present. */
export type MessagePaginationDirection = 'older' | 'newer';

const OBJECT_ID_HEX = /^[0-9a-f]{24}$/;

/**
 * Lexicographic order on 24-char hex strings matches MongoDB ObjectId comparison
 * for equal-length ids.
 */
export function compareObjectIdHex(a: string, b: string): number {
  const ax = a.toLowerCase();
  const bx = b.toLowerCase();
  if (ax === bx) return 0;
  if (ax < bx) return -1;
  return 1;
}

export function isValidObjectIdHex(id: string): boolean {
  return OBJECT_ID_HEX.test(id.toLowerCase());
}

/**
 * Bounds for a single fetched page when the API returns messages **newest first**
 * (index 0 = newest in that page).
 */
export function messagePageBoundsFromNewestFirst(
  messages: { id: string }[],
): { pageOldestId: string | null; pageNewestId: string | null } {
  if (messages.length === 0) {
    return { pageOldestId: null, pageNewestId: null };
  }
  return {
    pageNewestId: messages[0]!.id,
    pageOldestId: messages[messages.length - 1]!.id,
  };
}

/**
 * Whether more pages exist **toward the present** (newer messages than this page's newest),
 * using the conversation's canonical `lastMessageId` as the live tail.
 *
 * When `conversationLastMessageId` is missing, returns `null` — the caller should fall back
 * to a repository check (e.g. `hasMessageNewerThan(pageNewestId)`).
 */
export function computeHasNewerPagesFromLastMessageId(
  pageNewestId: string | null | undefined,
  conversationLastMessageId: string | null | undefined,
): boolean | null {
  const p = pageNewestId?.trim();
  const l = conversationLastMessageId?.trim();
  if (!p || !isValidObjectIdHex(p)) return false;
  if (!l || !isValidObjectIdHex(l)) return null;
  if (p === l) return false;
  const ord = compareObjectIdHex(l, p);
  if (ord > 0) return true;
  return false;
}
