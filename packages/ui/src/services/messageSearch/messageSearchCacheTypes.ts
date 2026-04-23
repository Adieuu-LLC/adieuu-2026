/**
 * Local plaintext message rows for E2EE conversation search (IndexedDB).
 *
 * @module services/messageSearch/messageSearchCacheTypes
 */

export interface MessageSearchCacheRow {
  messageId: string;
  conversationId: string;
  /** `createdAt` in epoch ms (sorting + time-window queries) */
  timestamp: number;
  authorId: string;
  /** Normalised text used for display + substring search */
  bodyText: string;
  hasAttachments: boolean;
  isReply: boolean;
  parentMessageId: string | undefined;
  hasReplies: boolean;
}

export type MessageSearchTimeRangePresetId =
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | '180d'
  | '365d'
  | 'all';

export interface MessageSearchFilters {
  query: string;
  authorId: string | null;
  hasReplies?: boolean;
  repliesOnly?: boolean;
  hasAttachments?: boolean;
}

export interface MessageSearchResultItem {
  row: MessageSearchCacheRow;
  /** Short excerpt around first match, when query non-empty */
  snippet: string;
}

export type MessageSearchCacheRetention =
  | 'wipe_immediately'
  | 'never'
  | 'after_1h'
  | 'after_1d'
  | 'after_7d'
  | 'after_30d';

export type MessageSearchCacheMode = 'on_demand' | 'warm';
