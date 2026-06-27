import type { MessageSearchTimeRangePresetId } from './messageSearchCacheTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SEARCH_TIME_PRESET: MessageSearchTimeRangePresetId = '7d';

const PRESET_TO_MS: Record<Exclude<MessageSearchTimeRangePresetId, 'all'>, number> = {
  '7d': 7 * DAY_MS,
  '14d': 14 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
  '180d': 180 * DAY_MS,
  '365d': 365 * DAY_MS,
};

/**
 * @param now - typically `Date.now()` (inject for tests)
 * @returns `[startMs, endMs]` with end exclusive, or [0, endMs) for "all" (start = 0)
 */
export function getSearchWindowRange(
  preset: MessageSearchTimeRangePresetId,
  now: number
): { startMs: number; endMs: number } {
  const endMs = now + 1;
  if (preset === 'all') {
    return { startMs: 0, endMs };
  }
  return { startMs: now - PRESET_TO_MS[preset], endMs };
}

/**
 * Same as {@link getSearchWindowRange}, but messages before the viewer joined cannot be
 * decrypted; clamp `startMs` to membership start when known.
 */
export function getEffectiveSearchWindowRange(
  preset: MessageSearchTimeRangePresetId,
  now: number,
  selfParticipantJoinedAtMs: number | null | undefined
): { startMs: number; endMs: number } {
  const { startMs, endMs } = getSearchWindowRange(preset, now);
  if (
    selfParticipantJoinedAtMs == null ||
    !Number.isFinite(selfParticipantJoinedAtMs)
  ) {
    return { startMs, endMs };
  }
  return { startMs: Math.max(startMs, selfParticipantJoinedAtMs), endMs };
}

export const MESSAGE_SEARCH_TIME_PRESETS: {
  id: MessageSearchTimeRangePresetId;
  i18nKey: string;
}[] = [
  { id: '7d', i18nKey: 'conversations.messageSearch.timeRange7d' },
  { id: '14d', i18nKey: 'conversations.messageSearch.timeRange14d' },
  { id: '30d', i18nKey: 'conversations.messageSearch.timeRange30d' },
  { id: '90d', i18nKey: 'conversations.messageSearch.timeRange90d' },
  { id: '180d', i18nKey: 'conversations.messageSearch.timeRange180d' },
  { id: '365d', i18nKey: 'conversations.messageSearch.timeRange365d' },
  { id: 'all', i18nKey: 'conversations.messageSearch.timeRangeAll' },
];
