import { useCallback, useRef } from 'react';
import type { PublicSpace, PublicSpaceChannel, PublicSpaceMessage } from '@adieuu/shared';
import type { SpaceChannelMessagesState } from './types';

type SpacesApiLike = {
  listMine: () => Promise<{ success: boolean; data?: { spaces: PublicSpace[] } }>;
  getBySlug: (slug: string) => Promise<{ success: boolean; data?: PublicSpace; error?: { code: string } }>;
  listChannels: (spaceId: string) => Promise<{ success: boolean; data?: { channels: PublicSpaceChannel[] } }>;
  getMessages: (
    spaceId: string,
    channelId: string,
    options?: { limit?: number; cursor?: string; direction?: 'asc' | 'desc' },
  ) => Promise<{ success: boolean; data?: { messages: PublicSpaceMessage[]; cursor: string | null } }>;
  getMessagesAround: (
    spaceId: string,
    channelId: string,
    messageId: string,
    options?: { before?: number; after?: number },
  ) => Promise<{ success: boolean; data?: { messages: PublicSpaceMessage[]; cursor: string | null } }>;
};

const MESSAGES_PAGE_SIZE = 50;

/** Error codes returned by the API when a Space is genuinely missing. */
const NOT_FOUND_CODES = new Set(['NOT_FOUND', 'FORBIDDEN']);

export interface SpaceDataFetchingParams {
  api: { spaces: SpacesApiLike };
  isLoggedIn: boolean;
  setSpaces: React.Dispatch<React.SetStateAction<PublicSpace[]>>;
  setSpacesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveSpace: React.Dispatch<React.SetStateAction<PublicSpace | null>>;
  setActiveSpaceLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveSpaceError: React.Dispatch<React.SetStateAction<'not_found' | 'error' | null>>;
  setChannels: React.Dispatch<React.SetStateAction<PublicSpaceChannel[]>>;
  setMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, SpaceChannelMessagesState>>>;
}

export function useSpaceDataFetching(params: SpaceDataFetchingParams) {
  const {
    api,
    isLoggedIn,
    setSpaces,
    setSpacesLoading,
    setActiveSpace,
    setActiveSpaceLoading,
    setActiveSpaceError,
    setChannels,
    setMessagesByChannel,
  } = params;

  const spacesSeq = useRef(0);
  const spaceSeq = useRef(0);
  const channelMsgSeq = useRef(0);

  const fetchSpaces = useCallback(async () => {
    if (!isLoggedIn) {
      setSpaces([]);
      setSpacesLoading(false);
      return;
    }
    const seq = ++spacesSeq.current;
    setSpacesLoading(true);
    try {
      const res = await api.spaces.listMine();
      if (seq !== spacesSeq.current) return;
      setSpaces(res.success && res.data ? res.data.spaces : []);
    } catch {
      if (seq === spacesSeq.current) setSpaces([]);
    } finally {
      if (seq === spacesSeq.current) setSpacesLoading(false);
    }
  }, [api, isLoggedIn, setSpaces, setSpacesLoading]);

  const resolveSpace = useCallback(
    async (slug: string) => {
      const seq = ++spaceSeq.current;
      setActiveSpaceLoading(true);
      setActiveSpaceError(null);
      setActiveSpace(null);
      setChannels([]);
      try {
        const res = await api.spaces.getBySlug(slug);
        if (seq !== spaceSeq.current) return;
        if (res.success && res.data) {
          setActiveSpace(res.data);
          setActiveSpaceError(null);
          const chRes = await api.spaces.listChannels(res.data.id);
          if (seq !== spaceSeq.current) return;
          if (chRes.success && chRes.data) {
            setChannels(chRes.data.channels);
          }
        } else if (res.error && NOT_FOUND_CODES.has(res.error.code)) {
          setActiveSpaceError('not_found');
        } else {
          setActiveSpaceError('error');
        }
      } catch {
        if (seq === spaceSeq.current) setActiveSpaceError('error');
      } finally {
        if (seq === spaceSeq.current) setActiveSpaceLoading(false);
      }
    },
    [api, setActiveSpace, setActiveSpaceLoading, setActiveSpaceError, setChannels],
  );

  const clearActiveSpace = useCallback(() => {
    spaceSeq.current++;
    setActiveSpace(null);
    setActiveSpaceLoading(false);
    setActiveSpaceError(null);
    setChannels([]);
    setMessagesByChannel({});
  }, [setActiveSpace, setActiveSpaceLoading, setActiveSpaceError, setChannels, setMessagesByChannel]);

  const fetchChannelMessages = useCallback(
    async (
      spaceId: string,
      channelId: string,
      cursor?: string,
      options?: { mergeLatest?: boolean },
    ) => {
      const mergeLatest = options?.mergeLatest ?? false;
      const seq = ++channelMsgSeq.current;
      setMessagesByChannel((prev) => ({
        ...prev,
        [channelId]: {
          messages: prev[channelId]?.messages ?? [],
          olderCursor: prev[channelId]?.olderCursor ?? null,
          loading: true,
        },
      }));
      try {
        // A cursor always means "load older" for Spaces; the repository returns
        // messages older than the cursor only when direction is 'asc'. Omitting
        // it makes the API return newer-than-cursor rows, which dedupe to zero
        // and terminate pagination early (history stuck at the first page).
        const res = await api.spaces.getMessages(spaceId, channelId, {
          limit: MESSAGES_PAGE_SIZE,
          ...(cursor ? { cursor, direction: 'asc' as const } : {}),
        });
        if (seq !== channelMsgSeq.current) return;
        if (res.success && res.data) {
          setMessagesByChannel((prev) => {
            const existing = prev[channelId];
            let merged: PublicSpaceMessage[];
            let nextCursor: string | null;
            if (cursor) {
              // Older page: append below existing history (newest-first order).
              merged = deduplicateMessages([...(existing?.messages ?? []), ...res.data!.messages]);
              nextCursor = res.data!.cursor;
            } else if (mergeLatest && existing?.messages?.length) {
              // Reconnect/focus refresh: prepend the newest page while keeping
              // already-loaded older history and its cursor intact.
              merged = deduplicateMessages([...res.data!.messages, ...existing.messages]);
              nextCursor = existing.olderCursor;
            } else {
              // Initial load: replace the window with the latest page.
              merged = res.data!.messages;
              nextCursor = res.data!.cursor;
            }
            return {
              ...prev,
              [channelId]: {
                messages: merged,
                olderCursor: nextCursor,
                loading: false,
              },
            };
          });
        } else {
          // Non-success response: clear the loading flag so the top sentinel is
          // not gated forever.
          setMessagesByChannel((prev) => {
            const existing = prev[channelId];
            if (!existing) return prev;
            return { ...prev, [channelId]: { ...existing, loading: false } };
          });
        }
      } catch {
        if (seq === channelMsgSeq.current) {
          setMessagesByChannel((prev) => ({
            ...prev,
            [channelId]: {
              ...prev[channelId]!,
              loading: false,
            },
          }));
        }
      }
    },
    [api, setMessagesByChannel],
  );

  /**
   * Re-fetch latest messages for a channel (merge-latest on socket event or
   * visibility change). Resets the sequence so only the freshest request wins.
   * Preserves already-loaded older history rather than replacing the window.
   */
  const refreshChannelMessages = useCallback(
    (spaceId: string, channelId: string) => {
      void fetchChannelMessages(spaceId, channelId, undefined, { mergeLatest: true });
    },
    [fetchChannelMessages],
  );

  /**
   * Fetch a window of messages centered on `messageId` (for reply/pin jumps to
   * targets outside the loaded buffer) and merge them into the channel store,
   * keeping newest-first ordering and preserving the existing older cursor so
   * pagination continues to work. Returns the fetched messages, or null on
   * failure.
   */
  const fetchMessagesAround = useCallback(
    async (
      spaceId: string,
      channelId: string,
      messageId: string,
      options?: { before?: number; after?: number },
    ): Promise<PublicSpaceMessage[] | null> => {
      try {
        const res = await api.spaces.getMessagesAround(spaceId, channelId, messageId, options);
        if (!res.success || !res.data) return null;
        const fetched = res.data.messages;
        setMessagesByChannel((prev) => {
          const existing = prev[channelId];
          const merged = mergeMessagesNewestFirst(existing?.messages ?? [], fetched);
          return {
            ...prev,
            [channelId]: {
              messages: merged,
              olderCursor: existing?.olderCursor ?? null,
              loading: existing?.loading ?? false,
            },
          };
        });
        return fetched;
      } catch {
        return null;
      }
    },
    [api, setMessagesByChannel],
  );

  return {
    fetchSpaces,
    resolveSpace,
    clearActiveSpace,
    fetchChannelMessages,
    refreshChannelMessages,
    fetchMessagesAround,
  };
}

function deduplicateMessages(messages: PublicSpaceMessage[]): PublicSpaceMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

/**
 * Merge two message lists into a single newest-first, de-duplicated list.
 * Used when splicing an around-fetch window into the existing buffer. Ordering
 * is by `createdAt` (newest first), tie-broken by descending id so ObjectId
 * ordering stays stable for messages created within the same millisecond.
 */
function mergeMessagesNewestFirst(
  existing: PublicSpaceMessage[],
  incoming: PublicSpaceMessage[],
): PublicSpaceMessage[] {
  const merged = deduplicateMessages([...existing, ...incoming]);
  merged.sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
  return merged;
}
