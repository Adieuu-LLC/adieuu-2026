import type { TrackedMention } from './composerTypes';

export function detectShortcodeQuery(
  text: string,
  cursorPos: number,
): { query: string; colonIdx: number } | null {
  const before = text.slice(0, cursorPos);
  const colonIdx = before.lastIndexOf(':');
  if (colonIdx === -1) return null;
  const query = before.slice(colonIdx + 1);
  if (query.length === 0 || !/^[a-z0-9_+-]+$/i.test(query)) return null;
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
