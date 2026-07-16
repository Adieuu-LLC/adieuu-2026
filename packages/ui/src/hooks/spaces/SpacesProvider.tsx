import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type PublicIdentity, type PublicSpace, type PublicSpaceChannel, type PublicSpaceMessage } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useIdentity } from '../useIdentity';
import { useChatSocket } from '../useChatSocket';
import { onSpacesChanged } from '../../services/spacesMembershipEvents';
import { SpacesContext } from './context';
import { useSpaceDataFetching } from './useSpaceDataFetching';
import { useSpaceSend } from './useSpaceSend';
import { useSpacesSocketEffects } from './useSpacesSocketEffects';
import type { SpaceChannelMessagesState, SpacesContextValue } from './types';

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus, identity } = useIdentity();
  const isLoggedIn = identityStatus === 'logged_in';
  const { subscribe, onStateChange } = useChatSocket();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [spaces, setSpaces] = useState<PublicSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);

  const [activeSpaceInternal, setActiveSpaceInternal] = useState<PublicSpace | null>(null);
  const [activeSpaceLoading, setActiveSpaceLoading] = useState(false);
  const [activeSpaceError, setActiveSpaceError] = useState<'not_found' | 'error' | null>(null);

  const [channels, setChannels] = useState<PublicSpaceChannel[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, SpaceChannelMessagesState>>({});
  const [sending, setSending] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, PublicIdentity>>({});

  const activeSpaceIdRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const identityIdRef = useRef<string | undefined>(identity?.id);

  activeSpaceIdRef.current = activeSpaceInternal?.id ?? null;
  activeChannelIdRef.current = activeChannelId;
  identityIdRef.current = identity?.id;

  const {
    fetchSpaces,
    resolveSpace,
    clearActiveSpace,
    fetchChannelMessages,
    refreshChannelMessages,
  } = useSpaceDataFetching({
    api,
    isLoggedIn,
    setSpaces,
    setSpacesLoading,
    setActiveSpace: setActiveSpaceInternal,
    setActiveSpaceLoading,
    setActiveSpaceError,
    setChannels,
    setMessagesByChannel,
  });

  const resolvedProfileIds = useRef<Set<string>>(new Set());

  const resolveProfiles = useCallback(
    async (ids: string[]) => {
      const missing = ids.filter((id) => !resolvedProfileIds.current.has(id));
      if (missing.length === 0) return;

      for (const id of missing) resolvedProfileIds.current.add(id);

      const fetched: Record<string, PublicIdentity> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const resp = await api.identity.getProfile(id);
            if (resp.data) {
              fetched[id] = resp.data;
            }
          } catch {
            resolvedProfileIds.current.delete(id);
          }
        }),
      );

      if (Object.keys(fetched).length > 0) {
        setParticipantProfiles((prev) => ({ ...prev, ...fetched }));
      }
    },
    [api],
  );

  const refreshSpacesRef = useRef(fetchSpaces);
  refreshSpacesRef.current = fetchSpaces;

  const refreshChannelMessagesRef = useRef(refreshChannelMessages);
  refreshChannelMessagesRef.current = refreshChannelMessages;

  useEffect(() => {
    void fetchSpaces();
  }, [fetchSpaces]);

  useEffect(() => onSpacesChanged(() => void fetchSpaces()), [fetchSpaces]);

  const setActiveSpace = useCallback(
    (slug: string | null) => {
      if (slug === null) {
        clearActiveSpace();
        setActiveChannelIdState(null);
        return;
      }
      void resolveSpace(slug);
    },
    [resolveSpace, clearActiveSpace],
  );

  const setActiveChannel = useCallback(
    (channelId: string | null) => {
      setActiveChannelIdState(channelId);
      const spaceId = activeSpaceIdRef.current;
      if (channelId && spaceId) {
        void fetchChannelMessages(spaceId, channelId);
      }
    },
    [fetchChannelMessages],
  );

  // When the space resolves after a channel was already selected (direct
  // navigation to /s/:slug/c/:channelId), fetch the channel's messages.
  const prevSpaceIdForChannelFetch = useRef<string | null>(null);
  useEffect(() => {
    const spaceId = activeSpaceInternal?.id ?? null;
    if (
      spaceId &&
      spaceId !== prevSpaceIdForChannelFetch.current &&
      activeChannelId &&
      !messagesByChannel[activeChannelId]?.messages.length
    ) {
      void fetchChannelMessages(spaceId, activeChannelId);
    }
    prevSpaceIdForChannelFetch.current = spaceId;
  }, [activeSpaceInternal?.id, activeChannelId, messagesByChannel, fetchChannelMessages]);

  // Auto-resolve profiles for message senders whenever channel messages change.
  useEffect(() => {
    const ids = new Set<string>();
    for (const state of Object.values(messagesByChannel)) {
      for (const msg of state.messages) {
        ids.add(msg.fromIdentityId);
      }
    }
    if (ids.size > 0) {
      void resolveProfiles([...ids]);
    }
  }, [messagesByChannel, resolveProfiles]);

  const { sendMessage } = useSpaceSend({
    api,
    activeSpaceIdRef,
    activeChannelIdRef,
    setSending,
    setMessagesByChannel,
  });

  const loadOlderMessages = useCallback(async () => {
    const spaceId = activeSpaceIdRef.current;
    const channelId = activeChannelIdRef.current;
    if (!spaceId || !channelId) return;
    const state = messagesByChannel[channelId];
    if (!state?.olderCursor || state.loading) return;
    await fetchChannelMessages(spaceId, channelId, state.olderCursor);
  }, [messagesByChannel, fetchChannelMessages]);

  useSpacesSocketEffects({
    isLoggedIn,
    subscribe,
    onStateChange,
    setSpaces,
    setMessagesByChannel,
    activeSpaceIdRef,
    activeChannelIdRef,
    identityIdRef,
    refreshSpacesRef,
    refreshChannelMessagesRef,
  });

  const activeChannelState = activeChannelId ? messagesByChannel[activeChannelId] : undefined;

  const value = useMemo<SpacesContextValue>(
    () => ({
      spaces,
      spacesLoading,
      activeSpace: activeSpaceInternal,
      activeSpaceLoading,
      activeSpaceError,
      channels,
      activeChannelId,
      activeMessages: activeChannelState?.messages ?? [],
      activeMessagesLoading: activeChannelState?.loading ?? false,
      activeMessagesOlderCursor: activeChannelState?.olderCursor ?? null,
      sending,
      participantProfiles,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      refresh: fetchSpaces,
    }),
    [
      spaces,
      spacesLoading,
      activeSpaceInternal,
      activeSpaceLoading,
      activeSpaceError,
      channels,
      activeChannelId,
      activeChannelState,
      sending,
      participantProfiles,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      fetchSpaces,
    ],
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
