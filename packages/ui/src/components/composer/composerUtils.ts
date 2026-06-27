import type { TrackedMention, TrackedPageTag, MentionSource } from './composerTypes';
import { isGroupMentionId } from './composerTypes';
import type { MentionEntity } from '../../services/messagePayload';

export function detectShortcodeQuery(
  text: string,
  cursorPos: number,
): { query: string; colonIdx: number } | null {
  const before = text.slice(0, cursorPos);
  const colonIdx = before.lastIndexOf(':');
  if (colonIdx === -1) return null;
  const query = before.slice(colonIdx + 1);
  if (query.length === 0 || !/^[a-z0-9_+\-]+$/i.test(query)) return null;
  return { query, colonIdx };
}

export function detectMentionQuery(
  text: string,
  cursorPos: number,
): { query: string; atIdx: number } | null {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  if (atIdx > 0 && !/\s/.test(before[atIdx - 1]!)) return null;
  const query = before.slice(atIdx + 1);
  if (!/^[a-zA-Z0-9_.\- ]*$/.test(query)) return null;
  return { query, atIdx };
}

/**
 * Adjust tracked mention offsets after a text mutation.
 * Returns the filtered array with offsets adjusted; mentions that overlap
 * the edit region are removed.
 */
export function updateMentionOffsets(
  entries: TrackedMention[],
  oldText: string,
  newText: string,
  cursorPos: number,
): TrackedMention[] {
  const delta = newText.length - oldText.length;
  if (delta === 0) return entries;
  return entries.filter((m) => {
    const mEnd = m.offset + m.length;
    if (cursorPos <= m.offset) {
      m.offset += delta;
      return true;
    }
    if (cursorPos - Math.max(delta, 0) >= mEnd) return true;
    return false;
  });
}

export function detectPageTagQuery(
  text: string,
  cursorPos: number,
): { query: string; hashIdx: number } | null {
  const before = text.slice(0, cursorPos);
  const hashIdx = before.lastIndexOf('#');
  if (hashIdx === -1) return null;
  if (hashIdx > 0 && !/\s/.test(before[hashIdx - 1]!)) return null;
  const query = before.slice(hashIdx + 1);
  if (!/^[a-zA-Z0-9_\- ]*$/.test(query)) return null;
  return { query, hashIdx };
}

export function updatePageTagOffsets(
  entries: TrackedPageTag[],
  oldText: string,
  newText: string,
  cursorPos: number,
): TrackedPageTag[] {
  const delta = newText.length - oldText.length;
  if (delta === 0) return entries;
  return entries.filter((m) => {
    const mEnd = m.offset + m.length;
    if (cursorPos <= m.offset) {
      m.offset += delta;
      return true;
    }
    if (cursorPos - Math.max(delta, 0) >= mEnd) return true;
    return false;
  });
}

/**
 * Expand group mention sentinels (@here / @everyone) to participant IDs for notification routing.
 *
 * Returns `undefined` when there are no mentions, or when every mention resolves to zero IDs
 * (e.g. only group mentions with no expandable participants).
 *
 * Group mention IDs require `mentionSource.users`; when `mentionSource` is omitted or
 * `mentionSource.users` is empty, group mentions are skipped and contribute no IDs. Individual
 * mention IDs are always included regardless of `mentionSource`. A mix of group and individual
 * mentions therefore returns only the individual IDs when the group cannot be expanded.
 */
export function resolveMentionedIdentityIds(
  mentions: Pick<MentionEntity, 'id'>[],
  mentionSource?: MentionSource,
): string[] | undefined {
  if (mentions.length === 0) return undefined;
  const ids = new Set<string>();
  for (const mention of mentions) {
    if (isGroupMentionId(mention.id)) {
      for (const user of mentionSource?.users ?? []) {
        ids.add(user.id);
      }
    } else {
      ids.add(mention.id);
    }
  }
  return ids.size > 0 ? [...ids] : undefined;
}
