/**
 * E2EE conversation-scoped message search (client-side plaintext index).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/conversations/types';
import { loadMessageSearchRetention } from '../../hooks/useMessageSearchPreferences';
import type { MessageSearchCacheMode } from '../../services/messageSearch/messageSearchCacheTypes';
import { displayMessageToSearchRow } from '../../services/messageSearch/displayMessageToSearchRow';
import {
  messageSearchCacheDeleteConversation,
  messageSearchCacheListConversation,
  messageSearchCachePutBatch,
} from '../../services/messageSearch/messageSearchCacheDb';
import type { MessageSearchFilters, MessageSearchTimeRangePresetId, MessageSearchCacheRow } from '../../services/messageSearch/messageSearchCacheTypes';
import { searchMessageRows } from '../../services/messageSearch/messageSearchQuery';
import {
  DEFAULT_SEARCH_TIME_PRESET,
  getSearchWindowRange,
  MESSAGE_SEARCH_TIME_PRESETS,
} from '../../services/messageSearch/searchTimeWindow';
import { Select, Portal, createListCollection } from '@ark-ui/react';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ConversationMessageSearchPanelProps {
  open: boolean;
  conversationId: string;
  identityId: string;
  adminDisallowPersistentCache: boolean;
  getActiveMessages: () => DisplayMessage[];
  participantProfiles: Record<string, PublicIdentity>;
  cacheMode: MessageSearchCacheMode;
  loadOlder: () => Promise<void>;
  messagesLoading: boolean;
  olderCursor: string | null;
  onClose: () => void;
  onPickMessage: (messageId: string) => void;
}

export function ConversationMessageSearchPanel({
  open,
  conversationId,
  identityId,
  adminDisallowPersistentCache,
  getActiveMessages,
  participantProfiles,
  cacheMode,
  loadOlder,
  messagesLoading,
  olderCursor,
  onClose,
  onPickMessage,
}: ConversationMessageSearchPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [timePreset, setTimePreset] = useState<MessageSearchTimeRangePresetId>(DEFAULT_SEARCH_TIME_PRESET);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [filterHasReplies, setFilterHasReplies] = useState(false);
  const [filterRepliesOnly, setFilterRepliesOnly] = useState(false);
  const [filterHasAttachments, setFilterHasAttachments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [indexRows, setIndexRows] = useState<MessageSearchCacheRow[]>([]);

  const timeCollection = useMemo(
    () =>
      createListCollection({
        items: MESSAGE_SEARCH_TIME_PRESETS.map((p) => ({ id: p.id, label: t(p.i18nKey) })),
        itemToValue: (item) => item.id,
        itemToString: (item) => item.label,
      }),
    [t]
  );

  const searchFilters: MessageSearchFilters = useMemo(
    () => ({
      query,
      authorId,
      hasReplies: filterHasReplies || undefined,
      repliesOnly: filterRepliesOnly || undefined,
      hasAttachments: filterHasAttachments || undefined,
    }),
    [authorId, filterHasAttachments, filterHasReplies, filterRepliesOnly, query]
  );

  const results = useMemo(
    () => searchMessageRows(indexRows, searchFilters, 'newest'),
    [indexRows, searchFilters]
  );

  const syncBufferToIdb = useCallback(async () => {
    const rows = getActiveMessages()
      .map((m) => displayMessageToSearchRow(m))
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length > 0) {
      await messageSearchCachePutBatch(rows);
    }
  }, [getActiveMessages]);

  const loadRowsFromIdb = useCallback(async () => {
    const { startMs, endMs } = getSearchWindowRange(timePreset, Date.now());
    const rows = await messageSearchCacheListConversation(conversationId, { startMs, endMs });
    setIndexRows(rows);
  }, [conversationId, timePreset]);

  const fillWindowFromServer = useCallback(async () => {
    const { startMs } = getSearchWindowRange(timePreset, Date.now());
    for (let i = 0; i < 48; i++) {
      const list = getActiveMessages();
      const oldest = list[list.length - 1];
      const oldestMs = oldest ? Date.parse(oldest.createdAt) : Number.NaN;
      if (oldest == null || !Number.isFinite(oldestMs) || oldestMs <= startMs) {
        break;
      }
      if (!olderCursor) {
        break;
      }
      if (messagesLoading) {
        await sleep(120);
        continue;
      }
      await loadOlder();
      await sleep(120);
    }
  }, [getActiveMessages, loadOlder, messagesLoading, olderCursor, timePreset]);

  const refreshIndex = useCallback(async () => {
    setBusy(true);
    try {
      await syncBufferToIdb();
      await fillWindowFromServer();
      await syncBufferToIdb();
      await loadRowsFromIdb();
    } finally {
      setBusy(false);
    }
  }, [fillWindowFromServer, loadRowsFromIdb, syncBufferToIdb]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await refreshIndex();
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, timePreset, refreshIndex]);

  useEffect(() => {
    if (!open || adminDisallowPersistentCache || cacheMode !== 'warm') {
      return;
    }
    const tmo = setTimeout(() => {
      const rows = getActiveMessages()
        .map((m) => displayMessageToSearchRow(m))
        .filter((r): r is NonNullable<typeof r> => r != null);
      if (rows.length > 0) {
        void messageSearchCachePutBatch(rows);
      }
    }, 500);
    return () => clearTimeout(tmo);
  }, [open, getActiveMessages, adminDisallowPersistentCache, cacheMode, conversationId]);

  const closeAndMaybeWipe = useCallback(() => {
    const retention = loadMessageSearchRetention(identityId);
    if (adminDisallowPersistentCache || retention !== 'never') {
      void messageSearchCacheDeleteConversation(conversationId);
    }
    onClose();
  }, [adminDisallowPersistentCache, conversationId, identityId, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="conversation-message-search"
      role="search"
      aria-label={t('conversations.messageSearch.title', 'Search messages')}
    >
      <div className="conversation-message-search__header">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('conversations.messageSearch.placeholder', 'Search…')}
          className="conversation-message-search__input"
          autoFocus
        />
        <Button type="button" variant="secondary" size="sm" onClick={closeAndMaybeWipe}>
          {t('conversations.messageSearch.close', 'Close')}
        </Button>
      </div>
      {adminDisallowPersistentCache && (
        <p className="conversation-message-search__admin-note">
          {t(
            'conversations.messageSearch.adminNoPersistent',
            'This conversation requires that local search data is not kept after you close search.',
          )}
        </p>
      )}

      <div className="conversation-message-search__filters">
        <label className="conversation-message-search__check">
          <input
            type="checkbox"
            checked={filterHasReplies}
            onChange={(e) => setFilterHasReplies(e.target.checked)}
          />
          {t('conversations.messageSearch.filterHasReplies', 'Has replies')}
        </label>
        <label className="conversation-message-search__check">
          <input
            type="checkbox"
            checked={filterRepliesOnly}
            onChange={(e) => setFilterRepliesOnly(e.target.checked)}
          />
          {t('conversations.messageSearch.filterRepliesOnly', 'Replies only')}
        </label>
        <label className="conversation-message-search__check">
          <input
            type="checkbox"
            checked={filterHasAttachments}
            onChange={(e) => setFilterHasAttachments(e.target.checked)}
          />
          {t('conversations.messageSearch.filterHasAttachments', 'Has attachments')}
        </label>
        <label className="conversation-message-search__author">
          <span>{t('conversations.messageSearch.filterAuthor', 'Author')}</span>
          <select
            value={authorId ?? ''}
            onChange={(e) => setAuthorId(e.target.value || null)}
            className="conversation-message-search__author-select"
          >
            <option value="">{t('conversations.messageSearch.filterAuthorAll', 'Anyone')}</option>
            {Object.values(participantProfiles).map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.username || p.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="conversation-message-search__timeframe">
        <span className="conversation-message-search__timeframe-label" id="msg-search-range-label">
          {t('conversations.messageSearch.timeRangeLabel', 'Time range')}
        </span>
        <Select.Root
          collection={timeCollection}
          value={[timePreset]}
          onValueChange={(d) => {
            const v = d.value[0] as MessageSearchTimeRangePresetId | undefined;
            if (v) {
              setTimePreset(v);
            }
          }}
          positioning={{ placement: 'bottom-start', sameWidth: true, strategy: 'fixed' }}
        >
          <Select.Control>
            <Select.Trigger className="conversation-message-search__time-select" aria-labelledby="msg-search-range-label">
              <Select.ValueText />
              <Select.Indicator aria-hidden>▾</Select.Indicator>
            </Select.Trigger>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content>
                {timeCollection.items.map((item) => (
                  <Select.Item key={item.id} item={item}>
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator>✓</Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
      </div>

      {busy && (
        <p className="conversation-message-search__status">{t('conversations.messageSearch.loading', 'Loading…')}</p>
      )}

      <ul className="conversation-message-search__results">
        {results.map((r) => {
          const name = participantProfiles[r.row.authorId]?.displayName
            ?? participantProfiles[r.row.authorId]?.username
            ?? r.row.authorId;
          return (
            <li key={r.row.messageId}>
              <button
                type="button"
                className="conversation-message-search__result"
                onClick={() => {
                  onPickMessage(r.row.messageId);
                  closeAndMaybeWipe();
                }}
              >
                <span className="conversation-message-search__result-meta">
                  {name} · {new Date(r.row.timestamp).toLocaleString()}
                </span>
                <span className="conversation-message-search__result-snippet">{r.snippet || '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {results.length === 0 && !busy && (
        <p className="conversation-message-search__empty">
          {t('conversations.messageSearch.noResults', 'No messages match.')}
        </p>
      )}
    </div>
  );
}
