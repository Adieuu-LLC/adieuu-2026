/**
 * E2EE conversation-scoped message search (client-side plaintext index).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Checkbox, Select, Portal, createListCollection } from '@ark-ui/react';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/conversations/types';
import type { MessageSearchCacheMode } from '../../services/messageSearch/messageSearchCacheTypes';
import { displayMessageToSearchRow } from '../../services/messageSearch/displayMessageToSearchRow';
import {
  messageSearchCacheListConversation,
  messageSearchCachePutBatch,
} from '../../services/messageSearch/messageSearchCacheDb';
import { endMessageSearchSessionAndWipeCache } from '../../services/messageSearch/messageSearchSessionEnd';
import type {
  MessageSearchFilters,
  MessageSearchTimeRangePresetId,
  MessageSearchCacheRow,
} from '../../services/messageSearch/messageSearchCacheTypes';
import {
  addRecentMessageSearchCriteria,
  loadRecentMessageSearchCriteria,
  type StoredMessageSearchCriteria,
} from '../../services/messageSearch/recentMessageSearchCriteria';
import { searchMessageRows } from '../../services/messageSearch/messageSearchQuery';
import { formatSearchElapsedMs } from '../../services/messageSearch/formatSearchElapsed';
import {
  DEFAULT_SEARCH_TIME_PRESET,
  getEffectiveSearchWindowRange,
  MESSAGE_SEARCH_TIME_PRESETS,
} from '../../services/messageSearch/searchTimeWindow';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ConversationMessageSearchPanelProps {
  conversationId: string;
  identityId: string;
  /** When false, sidebar is hidden but session state stays mounted in the parent. */
  sidebarVisible: boolean;
  adminDisallowPersistentCache: boolean;
  getActiveMessages: () => DisplayMessage[];
  participantProfiles: Record<string, PublicIdentity>;
  cacheMode: MessageSearchCacheMode;
  loadOlder: () => Promise<void>;
  messagesLoading: boolean;
  olderCursor: string | null;
  /** After local cache wipe; parent clears session flags. */
  onEndSearchSession: () => void;
  onPickMessage: (messageId: string) => void;
  /** When known, search and background fetch do not extend before this instant (epoch ms). */
  selfParticipantJoinedAtMs: number | null;
}

type Phase = 'hub' | 'criteria' | 'results';

/** Sentinel for "Anyone" in author Select (must not collide with identity ids). */
const AUTHOR_ANY = '__msgsearch_author_any__';

function formatRecentRowLabel(
  stored: StoredMessageSearchCriteria,
  t: TFunction,
  participantProfiles: Record<string, PublicIdentity>
): string {
  const q = stored.filters.query.trim();
  const text = q.length > 0 ? q : t('conversations.messageSearch.recentNoKeywords', 'Any text');
  const preset = MESSAGE_SEARCH_TIME_PRESETS.find((p) => p.id === stored.timePreset);
  const timeLabel = preset ? t(preset.i18nKey) : stored.timePreset;
  let authorPart = '';
  if (stored.filters.authorId) {
    const p = participantProfiles[stored.filters.authorId];
    authorPart = ` · ${p?.displayName ?? p?.username ?? stored.filters.authorId}`;
  }
  return `${text} · ${timeLabel}${authorPart}`;
}

export function ConversationMessageSearchPanel({
  conversationId,
  identityId,
  sidebarVisible,
  adminDisallowPersistentCache,
  getActiveMessages,
  participantProfiles,
  cacheMode,
  loadOlder,
  messagesLoading,
  olderCursor,
  onEndSearchSession,
  onPickMessage,
  selfParticipantJoinedAtMs,
}: ConversationMessageSearchPanelProps) {
  const { t } = useTranslation();
  const recentsInitial = useMemo(
    () => loadRecentMessageSearchCriteria(identityId, conversationId),
    [identityId, conversationId]
  );
  const [phase, setPhase] = useState<Phase>(() => (recentsInitial.length === 0 ? 'criteria' : 'hub'));
  const [recentsVersion, setRecentsVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [timePreset, setTimePreset] = useState<MessageSearchTimeRangePresetId>(DEFAULT_SEARCH_TIME_PRESET);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [filterHasReplies, setFilterHasReplies] = useState(false);
  const [filterRepliesOnly, setFilterRepliesOnly] = useState(false);
  const [filterHasAttachments, setFilterHasAttachments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchPaused, setSearchPaused] = useState(false);
  const [searchTick, setSearchTick] = useState(0);
  const [indexRows, setIndexRows] = useState<MessageSearchCacheRow[]>([]);
  /** Shown in the results view after a run fully completes (including when there are 0 query matches). */
  const [searchRunCompleteSummary, setSearchRunCompleteSummary] = useState<{
    durationMs: number;
    indexedCount: number;
    resultCount: number;
  } | null>(null);
  const [resultSort, setResultSort] = useState<'newest' | 'oldest'>('newest');

  const searchRunIdRef = useRef(0);
  const pauseRequestedRef = useRef(false);
  const searchAccumulatedActiveMsRef = useRef(0);
  const searchSegmentStartMsRef = useRef(0);
  const exitedByPauseRef = useRef(false);
  const lastIndexedCountRef = useRef(0);
  /** Kept in sync in loadRows and cleared on new search, for end-of-run metrics. */
  const indexRowsDataRef = useRef<MessageSearchCacheRow[]>([]);
  const searchFiltersForMetricsRef = useRef<MessageSearchFilters | null>(null);
  const resultSortForMetricsRef = useRef<'newest' | 'oldest'>('newest');

  const timeRangeId = useId();
  const authorLabelId = useId();
  const resultSortLabelId = useId();

  const timeCollection = useMemo(
    () =>
      createListCollection({
        items: MESSAGE_SEARCH_TIME_PRESETS.map((p) => ({ id: p.id, label: t(p.i18nKey) })),
        itemToValue: (item) => item.id,
        itemToString: (item) => item.label,
      }),
    [t]
  );

  const authorCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { id: AUTHOR_ANY, label: t('conversations.messageSearch.filterAuthorAll', 'Anyone') },
          ...Object.values(participantProfiles).map((p) => ({
            id: p.id,
            label: p.displayName || p.username || p.id,
          })),
        ],
        itemToValue: (item) => item.id,
        itemToString: (item) => item.label,
      }),
    [participantProfiles, t]
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

  searchFiltersForMetricsRef.current = searchFilters;
  resultSortForMetricsRef.current = resultSort;

  const results = useMemo(
    () => searchMessageRows(indexRows, searchFilters, resultSort),
    [indexRows, searchFilters, resultSort]
  );

  useEffect(() => {
    if (!busy || searchPaused) {
      return;
    }
    const id = window.setInterval(() => {
      setSearchTick((n) => n + 1);
    }, 200);
    return () => {
      window.clearInterval(id);
    };
  }, [busy, searchPaused]);

  const activeSearchElapsedMs = useMemo(() => {
    if (searchPaused) {
      return searchAccumulatedActiveMsRef.current;
    }
    if (!busy) {
      return searchAccumulatedActiveMsRef.current;
    }
    return (
      searchAccumulatedActiveMsRef.current + (Date.now() - searchSegmentStartMsRef.current)
    );
  }, [searchTick, busy, searchPaused]);

  const displaySearchTimeMs = useMemo(() => {
    if (searchRunCompleteSummary != null && !busy && !searchPaused) {
      return searchRunCompleteSummary.durationMs;
    }
    return activeSearchElapsedMs;
  }, [searchRunCompleteSummary, activeSearchElapsedMs, busy, searchPaused]);

  const displayIndexedCount = useMemo(() => {
    if (searchRunCompleteSummary != null && !busy && !searchPaused) {
      return searchRunCompleteSummary.indexedCount;
    }
    return indexRows.length;
  }, [searchRunCompleteSummary, indexRows.length, busy, searchPaused]);

  const displayResultCount = useMemo(() => {
    if (searchRunCompleteSummary != null && !busy && !searchPaused) {
      return searchRunCompleteSummary.resultCount;
    }
    return results.length;
  }, [searchRunCompleteSummary, results.length, busy, searchPaused]);

  const resultSortCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { id: 'newest' as const, label: t('conversations.messageSearch.sortNewestFirst', 'Newest first') },
          { id: 'oldest' as const, label: t('conversations.messageSearch.sortOldestFirst', 'Oldest first') },
        ],
        itemToValue: (item) => item.id,
        itemToString: (item) => item.label,
      }),
    [t]
  );

  const syncBufferToIdb = useCallback(async () => {
    const rows = getActiveMessages()
      .map((m) => displayMessageToSearchRow(m))
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length > 0) {
      await messageSearchCachePutBatch(rows);
    }
  }, [getActiveMessages]);

  const loadRowsFromIdb = useCallback(
    async (expectedRunId: number) => {
      const { startMs, endMs } = getEffectiveSearchWindowRange(
        timePreset,
        Date.now(),
        selfParticipantJoinedAtMs
      );
      const rows = await messageSearchCacheListConversation(conversationId, { startMs, endMs });
      if (expectedRunId !== searchRunIdRef.current) {
        return;
      }
      lastIndexedCountRef.current = rows.length;
      indexRowsDataRef.current = rows;
      setIndexRows(rows);
    },
    [conversationId, timePreset, selfParticipantJoinedAtMs]
  );

  const cancelOngoingSearchRun = useCallback(() => {
    searchRunIdRef.current += 1;
    setBusy(false);
    setSearchPaused(false);
  }, []);

  const checkPause = useCallback((): boolean => {
    if (!pauseRequestedRef.current) {
      return false;
    }
    pauseRequestedRef.current = false;
    searchAccumulatedActiveMsRef.current += Date.now() - searchSegmentStartMsRef.current;
    setSearchPaused(true);
    setBusy(false);
    exitedByPauseRef.current = true;
    return true;
  }, []);

  const runIndexingPipeline = useCallback(
    async (runId: number) => {
      const { startMs } = getEffectiveSearchWindowRange(
        timePreset,
        Date.now(),
        selfParticipantJoinedAtMs
      );
      for (let i = 0; i < 48; i++) {
        if (runId !== searchRunIdRef.current) {
          return;
        }
        if (checkPause()) {
          return;
        }
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
          if (runId !== searchRunIdRef.current) {
            return;
          }
          if (checkPause()) {
            return;
          }
          continue;
        }
        await loadOlder();
        await sleep(120);
        if (runId !== searchRunIdRef.current) {
          return;
        }
        if (checkPause()) {
          return;
        }
        await syncBufferToIdb();
        if (runId !== searchRunIdRef.current) {
          return;
        }
        await loadRowsFromIdb(runId);
        if (runId !== searchRunIdRef.current) {
          return;
        }
        if (checkPause()) {
          return;
        }
      }
      await syncBufferToIdb();
      if (runId !== searchRunIdRef.current) {
        return;
      }
      if (checkPause()) {
        return;
      }
      await loadRowsFromIdb(runId);
    },
    [
      checkPause,
      getActiveMessages,
      loadOlder,
      loadRowsFromIdb,
      messagesLoading,
      olderCursor,
      selfParticipantJoinedAtMs,
      syncBufferToIdb,
      timePreset,
    ]
  );

  const runMessageSearch = useCallback(
    async (mode: 'new' | 'resume') => {
      searchRunIdRef.current += 1;
      const runId = searchRunIdRef.current;
      pauseRequestedRef.current = false;
      exitedByPauseRef.current = false;
      setSearchRunCompleteSummary(null);
      if (mode === 'new') {
        setIndexRows([]);
        lastIndexedCountRef.current = 0;
        indexRowsDataRef.current = [];
      }
      setSearchPaused(false);
      if (mode === 'new') {
        searchAccumulatedActiveMsRef.current = 0;
      }
      searchSegmentStartMsRef.current = Date.now();
      setSearchTick(0);
      setBusy(true);
      try {
        await syncBufferToIdb();
        if (runId !== searchRunIdRef.current) {
          return;
        }
        if (checkPause()) {
          return;
        }
        await loadRowsFromIdb(runId);
        if (runId !== searchRunIdRef.current) {
          return;
        }
        if (checkPause()) {
          return;
        }
        await runIndexingPipeline(runId);
      } finally {
        if (runId === searchRunIdRef.current && !exitedByPauseRef.current) {
          const durationMs =
            searchAccumulatedActiveMsRef.current +
            (Date.now() - searchSegmentStartMsRef.current);
          const filters = searchFiltersForMetricsRef.current;
          const sort = resultSortForMetricsRef.current;
          const resultCount =
            filters != null
              ? searchMessageRows(indexRowsDataRef.current, filters, sort).length
              : 0;
          setSearchRunCompleteSummary({
            durationMs,
            indexedCount: lastIndexedCountRef.current,
            resultCount,
          });
          setBusy(false);
          setSearchPaused(false);
        }
      }
    },
    [checkPause, loadRowsFromIdb, runIndexingPipeline, syncBufferToIdb]
  );

  useEffect(() => {
    if (adminDisallowPersistentCache || cacheMode !== 'warm') {
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
  }, [getActiveMessages, adminDisallowPersistentCache, cacheMode, conversationId]);

  const applyStoredCriteria = useCallback((stored: StoredMessageSearchCriteria) => {
    setQuery(stored.filters.query);
    setAuthorId(stored.filters.authorId);
    setFilterHasReplies(!!stored.filters.hasReplies);
    setFilterRepliesOnly(!!stored.filters.repliesOnly);
    setFilterHasAttachments(!!stored.filters.hasAttachments);
    setTimePreset(stored.timePreset);
    setPhase('criteria');
  }, []);

  const goToNewSearch = useCallback(() => {
    setQuery('');
    setTimePreset(DEFAULT_SEARCH_TIME_PRESET);
    setAuthorId(null);
    setFilterHasReplies(false);
    setFilterRepliesOnly(false);
    setFilterHasAttachments(false);
    setPhase('criteria');
  }, []);

  const handleStartSearch = useCallback(() => {
    addRecentMessageSearchCriteria(identityId, conversationId, searchFilters, timePreset);
    setRecentsVersion((n) => n + 1);
    setPhase('results');
    void runMessageSearch('new');
  }, [conversationId, identityId, runMessageSearch, searchFilters, timePreset]);

  const handleResumeSearch = useCallback(() => {
    void runMessageSearch('resume');
  }, [runMessageSearch]);

  const handlePauseSearch = useCallback(() => {
    pauseRequestedRef.current = true;
  }, []);

  const handleResultPick = useCallback(
    (messageId: string) => {
      if (busy) {
        pauseRequestedRef.current = true;
      }
      onPickMessage(messageId);
    },
    [busy, onPickMessage]
  );

  const endSearchWithWipe = useCallback(() => {
    cancelOngoingSearchRun();
    endMessageSearchSessionAndWipeCache({
      identityId,
      conversationId,
      adminDisallowPersistentCache,
    });
    onEndSearchSession();
  }, [adminDisallowPersistentCache, cancelOngoingSearchRun, conversationId, identityId, onEndSearchSession]);

  const recents = useMemo(
    () => loadRecentMessageSearchCriteria(identityId, conversationId),
    [identityId, conversationId, recentsVersion]
  );
  const hasRecents = recents.length > 0;

  return (
    <aside
      className={
        'conversation-search-sidebar' + (sidebarVisible ? '' : ' conversation-search-sidebar--hidden')
      }
      role="search"
      aria-label={t('conversations.messageSearch.title', 'Search messages')}
      aria-hidden={!sidebarVisible}
    >
      <div className="conversation-search-sidebar__header">
        <h3 className="conversation-search-sidebar__title">
          {t('conversations.messageSearch.title', 'Search messages')}
        </h3>
      </div>

      {phase === 'hub' && (
        <div className="conversation-search-sidebar__body conversation-search-sidebar__hub">
          <Button type="button" className="conversation-search-sidebar__new-search" onClick={goToNewSearch}>
            {t('conversations.messageSearch.newSearch', 'New search')}
          </Button>
          {recents.length > 0 && (
            <>
              <p className="conversation-search-sidebar__section-label">
                {t('conversations.messageSearch.recentSearches', 'Recent searches')}
              </p>
              <ul className="conversation-search-sidebar__recent-list">
                {recents.map((r) => (
                  <li key={`${r.savedAt}-${r.timePreset}`}>
                    <button
                      type="button"
                      className="conversation-search-sidebar__recent-item"
                      onClick={() => applyStoredCriteria(r)}
                    >
                      {formatRecentRowLabel(r, t, participantProfiles)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {phase === 'criteria' && (
        <div className="conversation-search-sidebar__body conversation-search-sidebar__criteria">
          {adminDisallowPersistentCache && (
            <p className="conversation-search-sidebar__admin-note">
              {t(
                'conversations.messageSearch.adminNoPersistent',
                'This conversation requires that local search data is not kept after you close search.',
              )}
            </p>
          )}

          <div className="conversation-search-sidebar__field">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') {
                  return;
                }
                e.preventDefault();
                void handleStartSearch();
              }}
              placeholder={t('conversations.messageSearch.placeholder', 'Search…')}
              className="conversation-search-sidebar__keywords"
              autoFocus
            />
          </div>

          <div className="conversation-search-sidebar__filters">
            <Checkbox.Root
              checked={filterHasReplies}
              onCheckedChange={(e) => setFilterHasReplies(e.checked === true)}
              className="conversation-search-sidebar__checkbox"
            >
              <Checkbox.Control className="conversation-search-sidebar__checkbox-control" />
              <Checkbox.Label className="conversation-search-sidebar__checkbox-label">
                {t('conversations.messageSearch.filterHasReplies', 'Has replies')}
              </Checkbox.Label>
              <Checkbox.HiddenInput />
            </Checkbox.Root>
            <Checkbox.Root
              checked={filterRepliesOnly}
              onCheckedChange={(e) => setFilterRepliesOnly(e.checked === true)}
              className="conversation-search-sidebar__checkbox"
            >
              <Checkbox.Control className="conversation-search-sidebar__checkbox-control" />
              <Checkbox.Label className="conversation-search-sidebar__checkbox-label">
                {t('conversations.messageSearch.filterRepliesOnly', 'Replies only')}
              </Checkbox.Label>
              <Checkbox.HiddenInput />
            </Checkbox.Root>
            <Checkbox.Root
              checked={filterHasAttachments}
              onCheckedChange={(e) => setFilterHasAttachments(e.checked === true)}
              className="conversation-search-sidebar__checkbox"
            >
              <Checkbox.Control className="conversation-search-sidebar__checkbox-control" />
              <Checkbox.Label className="conversation-search-sidebar__checkbox-label">
                {t('conversations.messageSearch.filterHasAttachments', 'Has attachments')}
              </Checkbox.Label>
              <Checkbox.HiddenInput />
            </Checkbox.Root>
          </div>

          <div className="conversation-search-sidebar__field">
            <span className="conversation-search-sidebar__field-label" id={authorLabelId}>
              {t('conversations.messageSearch.filterAuthor', 'Author')}
            </span>
            <Select.Root
              collection={authorCollection}
              value={[authorId ?? AUTHOR_ANY]}
              onValueChange={(d) => {
                const v = d.value[0] ?? AUTHOR_ANY;
                setAuthorId(v && v !== AUTHOR_ANY ? v : null);
              }}
              positioning={{ placement: 'bottom-start', sameWidth: true, strategy: 'fixed' }}
            >
              <Select.Control className="conversation-search-sidebar__select-control">
                <Select.Trigger
                  className="conversation-search-sidebar__select-trigger"
                  aria-labelledby={authorLabelId}
                >
                  <Select.ValueText className="conversation-search-sidebar__select-value" />
                  <Select.Indicator
                    className="conversation-search-sidebar__select-chevron"
                    aria-hidden
                  >
                    ▾
                  </Select.Indicator>
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner className="conversation-search-sidebar__select-positioner">
                  <Select.Content className="conversation-search-sidebar__select-content">
                    <Select.List className="conversation-search-sidebar__select-list">
                      {authorCollection.items.map((item) => (
                        <Select.Item
                          key={item.id}
                          item={item}
                          className="conversation-search-sidebar__select-item"
                        >
                          <Select.ItemText className="conversation-search-sidebar__select-item-text">
                            {item.label}
                          </Select.ItemText>
                          <Select.ItemIndicator className="conversation-search-sidebar__select-item-indicator">
                            ✓
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>

          <div className="conversation-search-sidebar__field conversation-search-sidebar__field--row">
            <span className="conversation-search-sidebar__field-label" id={timeRangeId}>
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
              <Select.Control className="conversation-search-sidebar__select-control">
                <Select.Trigger
                  className="conversation-search-sidebar__select-trigger"
                  aria-labelledby={timeRangeId}
                >
                  <Select.ValueText className="conversation-search-sidebar__select-value" />
                  <Select.Indicator
                    className="conversation-search-sidebar__select-chevron"
                    aria-hidden
                  >
                    ▾
                  </Select.Indicator>
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner className="conversation-search-sidebar__select-positioner">
                  <Select.Content className="conversation-search-sidebar__select-content">
                    <Select.List className="conversation-search-sidebar__select-list">
                      {timeCollection.items.map((item) => (
                        <Select.Item
                          key={item.id}
                          item={item}
                          className="conversation-search-sidebar__select-item"
                        >
                          <Select.ItemText className="conversation-search-sidebar__select-item-text">
                            {item.label}
                          </Select.ItemText>
                          <Select.ItemIndicator className="conversation-search-sidebar__select-item-indicator">
                            ✓
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>

          <div className="conversation-search-sidebar__actions conversation-search-sidebar__actions--start">
            <Button
              type="button"
              className="conversation-search-sidebar__start-btn"
              onClick={handleStartSearch}
            >
              {t('conversations.messageSearch.startSearch', 'Start search')}
            </Button>
            <div className="conversation-search-sidebar__sub-actions">
              {hasRecents && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setPhase('hub')}>
                  {t('conversations.messageSearch.recentSearchesShort', 'Recent Searches')}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="conversation-search-sidebar__end-search-btn"
                onClick={endSearchWithWipe}
              >
                {t('conversations.messageSearch.endSearch', 'End search')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && (
        <div className="conversation-search-sidebar__body conversation-search-sidebar__results-wrap">
          <div className="conversation-search-sidebar__results-toolbar">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                cancelOngoingSearchRun();
                setPhase('criteria');
              }}
            >
              {t('conversations.messageSearch.modifySearch', 'Modify search')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={endSearchWithWipe}>
              {t('conversations.messageSearch.endSearch', 'End search')}
            </Button>
          </div>
          {(busy || searchPaused || searchRunCompleteSummary != null) && (
            <div
              className="conversation-search-sidebar__indexing"
              role="status"
              aria-live="polite"
            >
              <div className="conversation-search-sidebar__indexing-head">
                <p className="conversation-search-sidebar__indexing-title">
                  {searchPaused
                    ? t('conversations.messageSearch.searchPaused', 'Search paused')
                    : busy
                      ? t('conversations.messageSearch.searching', 'Searching…')
                      : t('conversations.messageSearch.searchComplete', 'Search complete')}
                </p>
                {(searchPaused || busy) && (
                  <Button
                    type="button"
                    className="conversation-search-sidebar__indexing-action-btn"
                    variant="secondary"
                    size="sm"
                    onClick={searchPaused ? handleResumeSearch : handlePauseSearch}
                  >
                    {searchPaused
                      ? t('conversations.messageSearch.resumeSearch', 'Resume search')
                      : t('conversations.messageSearch.pauseSearch', 'Pause search')}
                  </Button>
                )}
              </div>
              <p className="conversation-search-sidebar__indexing-stats">
                {displayResultCount === 1
                  ? t('conversations.messageSearch.searchStatusLineOne', {
                      time: formatSearchElapsedMs(displaySearchTimeMs),
                      indexedCount: displayIndexedCount,
                      defaultValue:
                        '{{time}} · 1 result found across {{indexedCount}} messages indexed',
                    })
                  : t('conversations.messageSearch.searchStatusLineMany', {
                      time: formatSearchElapsedMs(displaySearchTimeMs),
                      resultCount: displayResultCount,
                      indexedCount: displayIndexedCount,
                      defaultValue:
                        '{{time}} · {{resultCount}} results found across {{indexedCount}} messages indexed',
                    })}
              </p>
              {searchPaused && (
                <p className="conversation-search-sidebar__indexing-hint">
                  {t(
                    'conversations.messageSearch.searchPausedHint',
                    'Resume to keep loading older messages and update results.',
                  )}
                </p>
              )}
            </div>
          )}
          <div className="conversation-search-sidebar__results-sort">
            <span className="conversation-search-sidebar__field-label" id={resultSortLabelId}>
              {t('conversations.messageSearch.sortLabel', 'Sort')}
            </span>
            <Select.Root
              collection={resultSortCollection}
              value={[resultSort]}
              onValueChange={(d) => {
                const v = d.value[0];
                if (v === 'newest' || v === 'oldest') {
                  setResultSort(v);
                }
              }}
              positioning={{ placement: 'bottom-start', sameWidth: true, strategy: 'fixed' }}
            >
              <Select.Control className="conversation-search-sidebar__select-control">
                <Select.Trigger
                  className="conversation-search-sidebar__select-trigger"
                  aria-labelledby={resultSortLabelId}
                >
                  <Select.ValueText className="conversation-search-sidebar__select-value" />
                  <Select.Indicator
                    className="conversation-search-sidebar__select-chevron"
                    aria-hidden
                  >
                    ▾
                  </Select.Indicator>
                </Select.Trigger>
              </Select.Control>
              <Portal>
                <Select.Positioner className="conversation-search-sidebar__select-positioner">
                  <Select.Content className="conversation-search-sidebar__select-content">
                    <Select.List className="conversation-search-sidebar__select-list">
                      {resultSortCollection.items.map((item) => (
                        <Select.Item
                          key={item.id}
                          item={item}
                          className="conversation-search-sidebar__select-item"
                        >
                          <Select.ItemText className="conversation-search-sidebar__select-item-text">
                            {item.label}
                          </Select.ItemText>
                          <Select.ItemIndicator className="conversation-search-sidebar__select-item-indicator">
                            ✓
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>
          <ul className="conversation-search-sidebar__results" aria-label={t('conversations.messageSearch.resultsListAria', 'Search results')}>
            {results.map((r) => {
              const name = participantProfiles[r.row.authorId]?.displayName
                ?? participantProfiles[r.row.authorId]?.username
                ?? r.row.authorId;
              return (
                <li key={r.row.messageId}>
                  <button
                    type="button"
                    className="conversation-search-sidebar__result"
                    onClick={() => handleResultPick(r.row.messageId)}
                  >
                    <span className="conversation-search-sidebar__result-meta">
                      {name} · {new Date(r.row.timestamp).toLocaleString()}
                    </span>
                    <span className="conversation-search-sidebar__result-snippet">{r.snippet || '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && !busy && !searchPaused && (
            <p className="conversation-search-sidebar__empty">
              {t('conversations.messageSearch.noResults', 'No messages match.')}
            </p>
          )}
        </div>
      )}

      {phase === 'hub' && (
        <div className="conversation-search-sidebar__footer">
          <Button type="button" variant="secondary" size="sm" onClick={endSearchWithWipe}>
            {t('conversations.messageSearch.endSearch', 'End search')}
          </Button>
        </div>
      )}
    </aside>
  );
}
