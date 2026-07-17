import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type PublicIdentity, type PublicSpace, type PublicSpaceChannel, type PublicSpaceMessage } from '@adieuu/shared';
import { useNavigate } from 'react-router-dom';
import { useAppConfig, usePlatformCapabilities } from '../../config';
import { useIdentity } from '../useIdentity';
import { useChatSocket } from '../useChatSocket';
import { useToast } from '../../components/Toast';
import {
  useNotificationSoundPreference,
  useMentionNotificationSoundPreference,
} from '../useNotificationSoundPreference';
import { useClaimAchievement } from '../useClaimAchievement';
import { fireSpaceNotification } from '../../utils/spaceNotifications';
import { onSpacesChanged } from '../../services/spacesMembershipEvents';
import type { SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';
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
  const navigate = useNavigate();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const soundPref = useNotificationSoundPreference();
  const mentionSoundPref = useMentionNotificationSoundPreference();
  const claimAchievement = useClaimAchievement();

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
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, SpaceChannelUnreadState>>({});

  const socketCallbacksRef = useRef<{
    onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
    onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
    onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
  }>({});

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
      if (channelId) {
        setUnreadByChannel((prev) => {
          if (!prev[channelId]) return prev;
          const { [channelId]: _, ...rest } = prev;
          return rest;
        });
      }
      const spaceId = activeSpaceIdRef.current;
      if (channelId && spaceId) {
        void fetchChannelMessages(spaceId, channelId);
      }
    },
    [fetchChannelMessages],
  );

  const clearChannelUnread = useCallback(
    (channelId: string) => {
      setUnreadByChannel((prev) => {
        if (!prev[channelId]) return prev;
        const { [channelId]: _, ...rest } = prev;
        return rest;
      });
    },
    [],
  );

  const registerSocketCallbacks = useCallback(
    (callbacks: {
      onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
      onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
      onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
    }) => {
      socketCallbacksRef.current = callbacks;
    },
    [],
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

  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  const fireNotification = useCallback(
    (title: string, body: string, options: { isMention?: boolean; channelId: string; spaceId?: string; spaceSlug?: string; onClick?: () => void }) => {
      const slug = options.spaceSlug
        ?? (options.spaceId ? spacesRef.current.find((s) => s.id === options.spaceId)?.slug : undefined)
        ?? activeSpaceInternal?.slug;
      const navTo = options.onClick ?? (() => {
        if (slug) navigate(`/s/${slug}/c/${options.channelId}`);
      });
      fireSpaceNotification(
        title,
        body,
        { onClick: navTo, nativeTag: 'space-channel-event', isMention: options.isMention },
        { toast, soundPref, mentionSoundPref, notifications, audio, onWilhelmScream: () => claimAchievement('wilhelm_scream') },
      );
    },
    [toast, soundPref, mentionSoundPref, notifications, audio, claimAchievement, navigate, activeSpaceInternal?.slug],
  );

  const fireNotificationRef = useRef(fireNotification);
  fireNotificationRef.current = fireNotification;

  const channelNamesRef = useRef<Record<string, string>>({});
  channelNamesRef.current = useMemo(
    () => Object.fromEntries(channels.map((ch) => [ch.id, ch.name])),
    [channels],
  );

  const activeChannelMessagesRef = useRef<PublicSpaceMessage[]>([]);
  activeChannelMessagesRef.current = activeChannelId
    ? messagesByChannel[activeChannelId]?.messages ?? []
    : [];

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
    socketCallbacksRef,
    setUnreadByChannel,
    fireNotificationRef,
    channelNamesRef,
    activeChannelMessagesRef,
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
      unreadByChannel,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      refresh: fetchSpaces,
      clearChannelUnread,
      registerSocketCallbacks,
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
      unreadByChannel,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      fetchSpaces,
      clearChannelUnread,
      registerSocketCallbacks,
    ],
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
