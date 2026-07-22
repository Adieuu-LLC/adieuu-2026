import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createApiClient,
  type PublicIdentity,
  type PublicSpace,
  type PublicSpaceChannel,
  type PublicSpaceChannelCategory,
  type PublicSpaceMessage,
  type SpacePermission,
  type UpdateSpaceChannelLayoutParams,
} from '@adieuu/shared';
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
import { MAX_SPACE_LOADED_MESSAGES, trimSpaceMessages } from './spaceScrollUtils';
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
  const [categories, setCategories] = useState<PublicSpaceChannelCategory[]>([]);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, SpaceChannelMessagesState>>({});
  const [sending, setSending] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, PublicIdentity>>({});
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, SpaceChannelUnreadState>>({});
  const [unreadBySpace, setUnreadBySpace] = useState<Record<string, number>>({});
  const [activeSpacePermissions, setActiveSpacePermissions] = useState<SpacePermission[]>([]);
  const [activeSpaceRoleIds, setActiveSpaceRoleIds] = useState<string[]>([]);
  const [isActiveSpaceAdmin, setIsActiveSpaceAdmin] = useState(false);
  const [activeSpacePermissionsLoading, setActiveSpacePermissionsLoading] = useState(false);
  const [rolePermissionPreview, setRolePermissionPreview] = useState<{
    roleId: string;
    permissions: SpacePermission[];
  } | null>(null);

  const socketCallbacksRef = useRef<{
    onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
    onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
    onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
  }>({});

  const activeSpaceIdRef = useRef<string | null>(null);
  const activeSpaceSlugRef = useRef<string | null>(null);
  const activeSpaceLoadingRef = useRef(false);
  const channelsLengthRef = useRef(0);
  const activeChannelIdRef = useRef<string | null>(null);
  const identityIdRef = useRef<string | undefined>(identity?.id);

  activeSpaceIdRef.current = activeSpaceInternal?.id ?? null;
  activeSpaceSlugRef.current = activeSpaceInternal?.slug ?? null;
  activeSpaceLoadingRef.current = activeSpaceLoading;
  channelsLengthRef.current = channels.length;
  activeChannelIdRef.current = activeChannelId;
  identityIdRef.current = identity?.id;

  const {
    fetchSpaces,
    resolveSpace,
    clearActiveSpace,
    fetchChannelMessages,
    refreshChannelMessages,
    fetchMessagesAround: fetchMessagesAroundInternal,
  } = useSpaceDataFetching({
    api,
    isLoggedIn,
    setSpaces,
    setSpacesLoading,
    setActiveSpace: setActiveSpaceInternal,
    setActiveSpaceLoading,
    setActiveSpaceError,
    setChannels,
    setCategories,
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
        setActiveSpacePermissions([]);
        setActiveSpaceRoleIds([]);
        setIsActiveSpaceAdmin(false);
        setActiveSpacePermissionsLoading(false);
        setRolePermissionPreview(null);
        return;
      }
      // Skip full reload when the same Space is already loaded (refs avoid
      // changing this callback identity when channels finish loading).
      if (
        activeSpaceSlugRef.current === slug &&
        !activeSpaceLoadingRef.current &&
        channelsLengthRef.current > 0
      ) {
        const spaceId = activeSpaceIdRef.current;
        if (spaceId) {
          setUnreadBySpace((prev) => {
            if (!prev[spaceId]) return prev;
            const { [spaceId]: _, ...rest } = prev;
            return rest;
          });
        }
        return;
      }
      const matchedSpace = spacesRef.current.find((s) => s.slug === slug);
      if (matchedSpace) {
        setUnreadBySpace((prev) => {
          if (!prev[matchedSpace.id]) return prev;
          const { [matchedSpace.id]: _, ...rest } = prev;
          return rest;
        });
      }
      void resolveSpace(slug);
    },
    [resolveSpace, clearActiveSpace],
  );

  // Resolve viewer permissions whenever the active Space changes.
  useEffect(() => {
    const spaceId = activeSpaceInternal?.id;
    setRolePermissionPreview(null);
    if (!isLoggedIn || !spaceId) {
      setActiveSpacePermissions([]);
      setActiveSpaceRoleIds([]);
      setIsActiveSpaceAdmin(false);
      setActiveSpacePermissionsLoading(false);
      return;
    }

    let cancelled = false;
    setActiveSpacePermissionsLoading(true);
    void api.spaces.getMyPermissions(spaceId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setActiveSpacePermissions(res.data.permissions);
        setActiveSpaceRoleIds(res.data.roleIds ?? []);
        setIsActiveSpaceAdmin(res.data.isAdmin);
      } else {
        setActiveSpacePermissions([]);
        setActiveSpaceRoleIds([]);
        setIsActiveSpaceAdmin(false);
      }
      setActiveSpacePermissionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [api, isLoggedIn, activeSpaceInternal?.id]);

  const hasActiveSpacePermission = useCallback(
    (permission: SpacePermission) => {
      if (rolePermissionPreview) {
        return rolePermissionPreview.permissions.includes(permission);
      }
      return activeSpacePermissions.includes(permission);
    },
    [rolePermissionPreview, activeSpacePermissions],
  );

  const canAccessSpaceManage = useMemo(
    () =>
      activeSpacePermissions.some(
        (p) =>
          p === 'manageMetadata' ||
          p === 'manageRoles' ||
          p === 'manageEncryption' ||
          p === 'manageWebhooks',
      ),
    [activeSpacePermissions],
  );

  const removeSpaceLocally = useCallback(
    (spaceId: string) => {
      setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
      setUnreadBySpace((prev) => {
        if (!prev[spaceId]) return prev;
        const { [spaceId]: _, ...rest } = prev;
        return rest;
      });
      if (activeSpaceIdRef.current === spaceId) {
        clearActiveSpace();
        setActiveChannelIdState(null);
        setActiveSpacePermissions([]);
        setActiveSpaceRoleIds([]);
        setIsActiveSpaceAdmin(false);
        setActiveSpacePermissionsLoading(false);
      }
    },
    [clearActiveSpace],
  );

  const addChannelLocally = useCallback((channel: PublicSpaceChannel) => {
    setChannels((prev) => {
      if (prev.some((c) => c.id === channel.id)) {
        return prev.map((c) => (c.id === channel.id ? channel : c));
      }
      return [...prev, channel].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    });
  }, []);

  const addCategoryLocally = useCallback((category: PublicSpaceChannelCategory) => {
    setCategories((prev) => {
      if (prev.some((c) => c.id === category.id)) {
        return prev.map((c) => (c.id === category.id ? category : c));
      }
      return [...prev, category].sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      );
    });
  }, []);

  const removeCategoryLocally = useCallback((categoryId: string) => {
    const removed = categories.find((c) => c.id === categoryId);
    const promoteTo = removed?.parentCategoryId ?? null;
    setCategories((prev) =>
      prev
        .filter((c) => c.id !== categoryId)
        .map((c) =>
          c.parentCategoryId === categoryId ? { ...c, parentCategoryId: promoteTo } : c,
        ),
    );
    setChannels((prev) =>
      prev.map((ch) =>
        ch.categoryId === categoryId ? { ...ch, categoryId: promoteTo } : ch,
      ),
    );
  }, [categories]);

  const applyChannelLayout = useCallback(
    async (
      layout: UpdateSpaceChannelLayoutParams,
      options?: { knownCategories?: readonly PublicSpaceChannelCategory[] },
    ): Promise<boolean> => {
      const spaceId = activeSpaceIdRef.current;
      if (!spaceId) return false;

      const prevCategories = categories;
      const prevChannels = channels;

      const categoryById = new Map(categories.map((c) => [c.id, c]));
      for (const cat of options?.knownCategories ?? []) {
        categoryById.set(cat.id, cat);
      }
      const channelById = new Map(channels.map((c) => [c.id, c]));

      const nextCategories: PublicSpaceChannelCategory[] = [];
      const nextChannels: PublicSpaceChannel[] = [];

      for (const group of layout.groups) {
        group.items.forEach((item, position) => {
          if (item.type === 'channel') {
            const ch = channelById.get(item.id);
            if (ch) {
              nextChannels.push({
                ...ch,
                categoryId: group.parentCategoryId,
                position,
              });
            }
          } else {
            const cat = categoryById.get(item.id);
            if (cat) {
              nextCategories.push({
                ...cat,
                parentCategoryId: group.parentCategoryId,
                position,
              });
            }
          }
        });
      }

      setCategories(nextCategories);
      setChannels(nextChannels);

      try {
        const res = await api.spaces.updateChannelLayout(spaceId, layout);
        if (!res.success || !res.data) {
          setCategories(prevCategories);
          setChannels(prevChannels);
          return false;
        }
        setCategories(res.data.categories);
        setChannels(res.data.channels);
        return true;
      } catch {
        setCategories(prevCategories);
        setChannels(prevChannels);
        return false;
      }
    },
    [api, categories, channels],
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
        try {
          const key = `adieuu:lastChannel:${spaceId}`;
          localStorage.setItem(key, channelId);
        } catch { /* quota / SSR */ }
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

  const markSpaceRead = useCallback((spaceId: string) => {
    setUnreadBySpace((prev) => {
      if (!prev[spaceId]) return prev;
      const { [spaceId]: _, ...rest } = prev;
      return rest;
    });
    setUnreadByChannel((prev) => {
      let changed = false;
      const next: Record<string, SpaceChannelUnreadState> = {};
      for (const [channelId, state] of Object.entries(prev)) {
        if (state.spaceId === spaceId) {
          changed = true;
          continue;
        }
        next[channelId] = state;
      }
      return changed ? next : prev;
    });
  }, []);

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
    showError: (msg: string) => toast.error(msg),
  });

  const loadOlderMessages = useCallback(async () => {
    const spaceId = activeSpaceIdRef.current;
    const channelId = activeChannelIdRef.current;
    if (!spaceId || !channelId) return;
    const state = messagesByChannel[channelId];
    if (!state?.olderCursor || state.loading) return;
    await fetchChannelMessages(spaceId, channelId, state.olderCursor, { direction: 'older' });
  }, [messagesByChannel, fetchChannelMessages]);

  const loadNewerMessages = useCallback(async () => {
    const spaceId = activeSpaceIdRef.current;
    const channelId = activeChannelIdRef.current;
    if (!spaceId || !channelId) return;
    const state = messagesByChannel[channelId];
    if (!state?.hasNewerPages || state.loading) return;
    const head = state.messages[0];
    if (!head) return;
    await fetchChannelMessages(spaceId, channelId, head.id, { direction: 'newer' });
  }, [messagesByChannel, fetchChannelMessages]);

  const jumpToLatestMessages = useCallback(
    async (channelId: string) => {
      const spaceId = activeSpaceIdRef.current;
      if (!spaceId || !channelId) return;
      // Wipe the window synchronously so the refetch takes the initial-load
      // (replace) path and lands on the live tip, rather than merging the latest
      // page onto a detached history window.
      setMessagesByChannel((prev) => ({
        ...prev,
        [channelId]: {
          messages: [],
          olderCursor: null,
          hasNewerPages: false,
          loading: true,
        },
      }));
      await fetchChannelMessages(spaceId, channelId);
    },
    [fetchChannelMessages, setMessagesByChannel],
  );

  const resolveProfilesPublic = useCallback(
    (ids: string[]) => {
      void resolveProfiles(ids);
    },
    [resolveProfiles],
  );

  const fetchMessagesAround = useCallback(
    (messageId: string, options?: { before?: number; after?: number }) => {
      const spaceId = activeSpaceIdRef.current;
      const channelId = activeChannelIdRef.current;
      if (!spaceId || !channelId) return Promise.resolve(null);
      return fetchMessagesAroundInternal(spaceId, channelId, messageId, options);
    },
    [fetchMessagesAroundInternal],
  );

  // Bounded buffer, trimmed in whichever direction the user is scrolling away
  // from (messages are newest-first: index 0 = newest, last = oldest).
  //
  // Fetch-driven growth is already hard-capped at merge time in
  // useSpaceDataFetching; this is the safety net for socket-driven growth (live
  // messages are prepended without a fetch):
  //  - At the live tail: keep the newest window and advance the older cursor to
  //    the new oldest so older pagination continues; head stays latest.
  //  - Scrolled up (reading history): keep the oldest window, evicting the
  //    newest overflow, and flag `hasNewerPages` so those evicted messages can
  //    be reloaded from the buffer head via newer-pagination on scroll-down.
  const trimActiveChannelBuffer = useCallback((atBottom: boolean) => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    setMessagesByChannel((prev) => {
      const st = prev[channelId];
      if (!st || st.messages.length <= MAX_SPACE_LOADED_MESSAGES) return prev;
      if (atBottom) {
        const trimmed = trimSpaceMessages(st.messages, 'newest');
        const newOldest = trimmed[trimmed.length - 1];
        return {
          ...prev,
          [channelId]: {
            ...st,
            messages: trimmed,
            olderCursor: newOldest ? newOldest.id : st.olderCursor,
            hasNewerPages: false,
          },
        };
      }
      const trimmed = trimSpaceMessages(st.messages, 'oldest');
      return {
        ...prev,
        [channelId]: {
          ...st,
          messages: trimmed,
          hasNewerPages: true,
        },
      };
    });
  }, [setMessagesByChannel]);

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

  const participantProfilesRef = useRef<Record<string, PublicIdentity>>({});
  participantProfilesRef.current = participantProfiles;

  const activeChannelMessagesRef = useRef<PublicSpaceMessage[]>([]);
  activeChannelMessagesRef.current = activeChannelId
    ? messagesByChannel[activeChannelId]?.messages ?? []
    : [];

  const removeSpaceLocallyRef = useRef(removeSpaceLocally);
  removeSpaceLocallyRef.current = removeSpaceLocally;

  const handleSpaceDeleted = useCallback(
    (spaceId: string) => {
      const wasActive = activeSpaceIdRef.current === spaceId;
      removeSpaceLocallyRef.current(spaceId);
      if (wasActive) {
        navigate('/spaces');
      }
    },
    [navigate],
  );

  useSpacesSocketEffects({
    isLoggedIn,
    subscribe,
    onStateChange,
    setSpaces,
    setChannels,
    setCategories,
    setMessagesByChannel,
    activeSpaceIdRef,
    activeChannelIdRef,
    identityIdRef,
    refreshSpacesRef,
    refreshChannelMessagesRef,
    socketCallbacksRef,
    setUnreadByChannel,
    setUnreadBySpace,
    fireNotificationRef,
    channelNamesRef,
    participantProfilesRef,
    activeChannelMessagesRef,
    onSpaceDeleted: handleSpaceDeleted,
  });

  const activeChannelState = activeChannelId ? messagesByChannel[activeChannelId] : undefined;

  // While listMine is in flight, treat as member so the join CTA / interstitial
  // path does not flash for Spaces the user already belongs to.
  const isActiveSpaceMember = useMemo(() => {
    if (!activeSpaceInternal) return false;
    if (spaces.some((s) => s.id === activeSpaceInternal.id)) return true;
    return spacesLoading;
  }, [activeSpaceInternal, spaces, spacesLoading]);

  const value = useMemo<SpacesContextValue>(
    () => ({
      spaces,
      spacesLoading,
      activeSpace: activeSpaceInternal,
      activeSpaceLoading,
      activeSpaceError,
      isActiveSpaceMember,
      activeSpacePermissions,
      isActiveSpaceAdmin,
      hasActiveSpacePermission,
      canAccessSpaceManage,
      activeSpacePermissionsLoading,
      rolePermissionPreview,
      setRolePermissionPreview,
      channels,
      categories,
      activeSpaceRoleIds,
      addChannelLocally,
      addCategoryLocally,
      removeCategoryLocally,
      applyChannelLayout,
      activeChannelId,
      activeMessages: activeChannelState?.messages ?? [],
      activeMessagesLoading: activeChannelState?.loading ?? false,
      activeMessagesOlderCursor: activeChannelState?.olderCursor ?? null,
      activeMessagesHasNewerPages: activeChannelState?.hasNewerPages ?? false,
      sending,
      participantProfiles,
      unreadByChannel,
      unreadBySpace,
      resolveProfiles: resolveProfilesPublic,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      loadNewerMessages,
      jumpToLatestMessages,
      fetchMessagesAround,
      trimActiveChannelBuffer,
      refresh: fetchSpaces,
      removeSpaceLocally,
      clearChannelUnread,
      markSpaceRead,
      registerSocketCallbacks,
    }),
    [
      spaces,
      spacesLoading,
      activeSpaceInternal,
      activeSpaceLoading,
      activeSpaceError,
      isActiveSpaceMember,
      activeSpacePermissions,
      isActiveSpaceAdmin,
      hasActiveSpacePermission,
      canAccessSpaceManage,
      activeSpacePermissionsLoading,
      rolePermissionPreview,
      channels,
      categories,
      activeSpaceRoleIds,
      addChannelLocally,
      addCategoryLocally,
      removeCategoryLocally,
      applyChannelLayout,
      activeChannelId,
      activeChannelState,
      sending,
      participantProfiles,
      unreadByChannel,
      unreadBySpace,
      resolveProfilesPublic,
      setActiveSpace,
      setActiveChannel,
      sendMessage,
      loadOlderMessages,
      loadNewerMessages,
      jumpToLatestMessages,
      fetchMessagesAround,
      trimActiveChannelBuffer,
      removeSpaceLocally,
      fetchSpaces,
      clearChannelUnread,
      markSpaceRead,
      registerSocketCallbacks,
    ],
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
