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
    options?: { limit?: number; cursor?: string },
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
    async (spaceId: string, channelId: string, cursor?: string) => {
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
        const res = await api.spaces.getMessages(spaceId, channelId, {
          limit: MESSAGES_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });
        if (seq !== channelMsgSeq.current) return;
        if (res.success && res.data) {
          setMessagesByChannel((prev) => {
            const existing = prev[channelId];
            const oldMessages = cursor ? (existing?.messages ?? []) : [];
            const merged = cursor
              ? deduplicateMessages([...oldMessages, ...res.data!.messages])
              : res.data!.messages;
            return {
              ...prev,
              [channelId]: {
                messages: merged,
                olderCursor: res.data!.cursor,
                loading: false,
              },
            };
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
   */
  const refreshChannelMessages = useCallback(
    (spaceId: string, channelId: string) => {
      void fetchChannelMessages(spaceId, channelId);
    },
    [fetchChannelMessages],
  );

  return {
    fetchSpaces,
    resolveSpace,
    clearActiveSpace,
    fetchChannelMessages,
    refreshChannelMessages,
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
