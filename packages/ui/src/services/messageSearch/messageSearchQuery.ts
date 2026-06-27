import type {
  MessageSearchCacheRow,
  MessageSearchFilters,
  MessageSearchResultItem,
} from './messageSearchCacheTypes';

const SNIPPET_MAX = 160;

function buildSnippet(text: string, q: string): string {
  const t = text;
  if (!q.trim()) return t.slice(0, SNIPPET_MAX) + (t.length > SNIPPET_MAX ? '…' : '');
  const lower = t.toLowerCase();
  const qi = q.trim().toLowerCase();
  const pos = lower.indexOf(qi);
  if (pos < 0) return t.slice(0, SNIPPET_MAX) + (t.length > SNIPPET_MAX ? '…' : '');
  const start = Math.max(0, pos - 40);
  const end = Math.min(t.length, pos + q.length + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < t.length ? '…' : '';
  return prefix + t.slice(start, end) + suffix;
}

function matchesFilters(
  row: MessageSearchCacheRow,
  filters: MessageSearchFilters
): boolean {
  if (filters.authorId && row.authorId !== filters.authorId) return false;
  if (filters.hasReplies === true && !row.hasReplies) return false;
  if (filters.repliesOnly === true && !row.isReply) return false;
  if (filters.hasAttachments === true && !row.hasAttachments) return false;
  return true;
}

/**
 * Substring search + filters over pre-fetched rows (already time-windowed).
 */
export function searchMessageRows(
  rows: MessageSearchCacheRow[],
  filters: MessageSearchFilters,
  sort: 'newest' | 'oldest'
): MessageSearchResultItem[] {
  const q = filters.query.trim();
  const hit: MessageSearchResultItem[] = [];
  for (const row of rows) {
    if (!matchesFilters(row, filters)) continue;
    if (q) {
      if (!row.bodyText.toLowerCase().includes(q.toLowerCase())) continue;
    }
    hit.push({
      row,
      snippet: buildSnippet(row.bodyText, q),
    });
  }
  hit.sort((a, b) => {
    const t = a.row.timestamp - b.row.timestamp;
    if (t !== 0) return sort === 'newest' ? -t : t;
    return sort === 'newest'
      ? b.row.messageId.localeCompare(a.row.messageId)
      : a.row.messageId.localeCompare(b.row.messageId);
  });
  return hit;
}
