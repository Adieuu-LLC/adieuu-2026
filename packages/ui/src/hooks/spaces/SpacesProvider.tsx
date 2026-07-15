import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type PublicSpace, type PublicSpaceChannel, type PublicSpaceMessage } from '@adieuu/shared';
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
      if (channelId && activeSpaceInternal) {
        void fetchChannelMessages(activeSpaceInternal.id, channelId);
      }
    },
    [activeSpaceInternal, fetchChannelMessages],
  );

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
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      fetchSpaces,
    ],
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
