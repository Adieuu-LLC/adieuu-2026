/**
 * Persists recent in-conversation message search criteria in localStorage (per device).
 *
 * @module services/messageSearch/recentMessageSearchCriteria
 */

import type {
  MessageSearchFilters,
  MessageSearchTimeRangePresetId,
} from './messageSearchCacheTypes';

const PREFIX = 'adieuu.message-search.recent.';
const MAX_RECENT = 20;

export interface StoredMessageSearchCriteria {
  filters: MessageSearchFilters;
  timePreset: MessageSearchTimeRangePresetId;
  savedAt: number;
}

function storageKey(identityId: string, conversationId: string): string {
  return `${PREFIX}${identityId}.${conversationId}`;
}

function criteriaKey(filters: MessageSearchFilters, timePreset: MessageSearchTimeRangePresetId): string {
  return JSON.stringify({
    t: timePreset,
    q: filters.query,
    a: filters.authorId,
    h: filters.hasReplies,
    r: filters.repliesOnly,
    x: filters.hasAttachments,
  });
}

/**
 * Recents for this identity + conversation, newest first.
 */
export function loadRecentMessageSearchCriteria(
  identityId: string,
  conversationId: string
): StoredMessageSearchCriteria[] {
  if (!identityId || !conversationId) return [];
  try {
    const raw = localStorage.getItem(storageKey(identityId, conversationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is StoredMessageSearchCriteria =>
        row != null &&
        typeof row === 'object' &&
        'filters' in row &&
        'timePreset' in row &&
        'savedAt' in row
    );
  } catch {
    return [];
  }
}

/**
 * Add or move to front; dedupes by filters + time preset; caps length.
 */
export function addRecentMessageSearchCriteria(
  identityId: string,
  conversationId: string,
  filters: MessageSearchFilters,
  timePreset: MessageSearchTimeRangePresetId
): void {
  if (!identityId || !conversationId) return;
  const key = criteriaKey(filters, timePreset);
  const now = Date.now();
  const prev = loadRecentMessageSearchCriteria(identityId, conversationId);
  const next = prev.filter((s) => criteriaKey(s.filters, s.timePreset) !== key);
  const entry: StoredMessageSearchCriteria = { filters: { ...filters }, timePreset, savedAt: now };
  next.unshift(entry);
  const capped = next.slice(0, MAX_RECENT);
  try {
    localStorage.setItem(storageKey(identityId, conversationId), JSON.stringify(capped));
  } catch {
    // ignore quota / private mode
  }
}

