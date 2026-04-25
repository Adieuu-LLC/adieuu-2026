/**
 * Conversations provider: state, messaging, and group management with WebSocket updates.
 *
 * PRIVACY: Messages are E2E encrypted before leaving the device. The server only sees
 * ciphertext; decryption happens exclusively client-side.
 *
 * @module hooks/conversations/ConversationsProvider
 */

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import {
  createApiClient,
  type PublicConversation,
  type PublicGroupInvite,
  type PublicIdentity,
  type ClaimedDevicePreKeys,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '../useIdentity';
import { useChatSocket } from '../useChatSocket';
import { useAppConfig, usePlatformCapabilities } from '../../config';
import { useToast } from '../../components/Toast';
import {
  useNotificationSoundPreference,
  useTtlNotificationSoundPreference,
  useMentionNotificationSoundPreference,
} from '../useNotificationSoundPreference';
import { fireConversationNotification } from '../../utils/conversationNotifications';
import {
  decryptGroupName,
  decryptMemberSettings,
  type RecipientKeys,
  type MemberSettingsMap,
} from '../../services/conversationCryptoService';
import { getPersistedSessionKey } from '../../services/preKeyStorage';
import { getSessionKeysForMessages as loadSessionKeysForMessages } from '../../services/sessionKeyRetrieval';
import {
  EMPTY_MEMBER_SETTINGS,
  EMPTY_MESSAGES,
  type ConversationMessagesState,
  type DecryptedConversation,
  type DisplayMessage,
  type ConversationsContextValue,
} from './types';
import { ConversationsContext } from './context';
import { useConversationParticipantProfiles } from './useConversationParticipantProfiles';
import { useConversationDataFetching } from './useConversationDataFetching';
import { useConversationsSocketEffects } from './useConversationsSocketEffects';
import { useConversationsAuthLifecycleEffects } from './useConversationsAuthLifecycleEffects';
import { useConversationCreateAndSend } from './useConversationCreateAndSend';
import { useConversationGroupInvitesAndDelete } from './useConversationGroupInvitesAndDelete';

// ============================================================================
// Provider
// ============================================================================

interface ConversationsProviderProps {
  children: ReactNode;
}

export function ConversationsProvider({ children }: ConversationsProviderProps) {
  const { status: identityStatus, identity, getSigningKey, getCurrentDeviceId, getWrappingKey } =
    useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe, onStateChange } = useChatSocket();
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const soundPref = useNotificationSoundPreference();
  const ttlSoundPref = useTtlNotificationSoundPreference();
  const mentionSoundPref = useMentionNotificationSoundPreference();
  const navigate = useNavigate();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const isLoggedIn = identityStatus === 'logged_in' && !!identity;

  const identityRef = useRef(identity);
  identityRef.current = identity;

  // State
  const [conversations, setConversations] = useState<DecryptedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesState, setMessagesState] = useState<Record<string, ConversationMessagesState>>({});
  /** Reply-quote parents fetched outside the main buffer (per conversation). */
  const [replyParentHydration, setReplyParentHydration] = useState<
    Record<string, Record<string, DisplayMessage>>
  >({});
  const replyParentHydrationRef = useRef(replyParentHydration);
  useEffect(() => {
    replyParentHydrationRef.current = replyParentHydration;
  }, [replyParentHydration]);
  const replyHydrationInflightRef = useRef(new Set<string>());
  const [invites, setInvites] = useState<PublicGroupInvite[]>([]);
  const [pendingInvitesRefreshSignal, setPendingInvitesRefreshSignal] = useState<{
    conversationId: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    setReplyParentHydration({});
  }, [activeConversationId]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [participantProfiles, setParticipantProfiles] = useState<Record<string, PublicIdentity>>({});
  const { signingKeyCache, resolveParticipants, refreshParticipantProfile } =
    useConversationParticipantProfiles(api, setParticipantProfiles);
  const messagesStateRef = useRef(messagesState);
  const conversationsRef = useRef(conversations);
  const sessionKeyCache = useRef(new Map<string, Uint8Array>());
  useEffect(() => { messagesStateRef.current = messagesState; }, [messagesState]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const isAtBottomRef = useRef(true);
  const setIsAtBottom = useCallback((value: boolean) => {
    isAtBottomRef.current = value;
  }, []);

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const decryptConversationName = useCallback(
    (conv: PublicConversation): string | undefined => {
      if (!conv.encryptedName || !conv.nameNonce) return undefined;
      try {
        return decryptGroupName(conv.encryptedName, conv.nameNonce, conv.id);
      } catch {
        return undefined;
      }
    },
    []
  );

  const decryptConversationMemberSettings = useCallback(
    (conv: PublicConversation): MemberSettingsMap | undefined => {
      if (!conv.encryptedMemberSettings || !conv.memberSettingsNonce) return undefined;
      try {
        return decryptMemberSettings(conv.encryptedMemberSettings, conv.memberSettingsNonce, conv.id);
      } catch {
        return undefined;
      }
    },
    []
  );

  const toDecrypted = useCallback(
    (conv: PublicConversation): DecryptedConversation => ({
      ...conv,
      decryptedName: decryptConversationName(conv),
      decryptedMemberSettings: decryptConversationMemberSettings(conv),
      unreadCount: 0,
    }),
    [decryptConversationName, decryptConversationMemberSettings]
  );

  /**
   * Fetch recipient keys (identity public keys + pre-keys) for all participants
   * in a conversation, needed for encrypting outbound messages.
   *
   * When `useForwardSecrecy` is false, pre-key claiming is skipped entirely
   * and all devices use static key wrapping. E2EE is still maintained.
   */
  const fetchRecipientKeys = useCallback(
    async (
      participantIds: string[],
      useForwardSecrecy = false,
      signal?: AbortSignal
    ): Promise<RecipientKeys[]> => {
      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      };
      const recipients: RecipientKeys[] = [];

      for (const pid of participantIds) {
        try {
          throwIfAborted();
          const keysResp = await api.identity.getPublicKeys(
            pid,
            signal ? { signal } : undefined
          );
          if (!keysResp.data) continue;

          let preKeys: ClaimedDevicePreKeys[] = [];
          if (useForwardSecrecy) {
            try {
              throwIfAborted();
              const claimResp = await api.identity.claimPreKeys(
                pid,
                undefined,
                signal ? { signal } : undefined
              );
              if (claimResp.data?.devices) {
                preKeys = claimResp.data.devices;
              }
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') throw err;
              // Pre-keys unavailable -- will use static key wrapping
            }
          }

          recipients.push({
            identityId: pid,
            signingPublicKey: keysResp.data.signingPublicKey,
            preferredCryptoProfile: keysResp.data.preferredCryptoProfile as 'default' | 'cnsa2',
            devices: keysResp.data.devices,
            preKeys,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          // Skip participants whose keys can't be fetched
        }
      }

      return recipients;
    },
    [api]
  );

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const {
    fetchConversations,
    fetchConversationById,
    fetchMessages,
    fetchMessagesAround,
    refreshMessageInConversation,
    ensureReplyParentHydration,
    loadPinnedMessagesPage,
    fetchInvites,
    refresh,
  } = useConversationDataFetching({
    isLoggedIn,
    identity,
    api,
    getCurrentDeviceId,
    getWrappingKey,
    toDecrypted,
    resolveParticipants,
    setLoading,
    setConversations,
    setMessagesState,
    setInvites,
    setReplyParentHydration,
    signingKeyCache,
    sessionKeyCache,
    messagesStateRef,
    conversationsRef,
    activeConversationIdRef,
    isAtBottomRef,
    replyParentHydrationRef,
    replyHydrationInflightRef,
    toast,
    t,
  });

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;
  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;
  const refreshMessageInConversationRef = useRef(refreshMessageInConversation);
  refreshMessageInConversationRef.current = refreshMessageInConversation;

  // -------------------------------------------------------------------------
  // Active conversation
  // -------------------------------------------------------------------------

  const setActiveConversation = useCallback(
    (id: string | null) => {
      setActiveConversationId(id);
      if (id) {
        const hasUnread = conversations.some((c) => c.id === id && c.unreadCount > 0);
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
        );
        if (hasUnread) {
          setMessagesState((prev) => ({
            ...prev,
            [id]: {
              messages: [],
              olderCursor: null,
              newerPaginationAfterId: null,
              hasNewerPages: false,
              loading: true,
              showManualLoadOlder: false,
              showManualLoadNewer: false,
            },
          }));
        }
        fetchMessages(id, undefined, true);
      }
    },
    [conversations, fetchMessages]
  );

  const loadOlder = useCallback(async () => {
    if (!activeConversationId) return;
    const state = messagesState[activeConversationId];
    if (!state?.olderCursor || state.loading) return;
    await fetchMessages(activeConversationId, state.olderCursor, false, false, 'older');
  }, [activeConversationId, messagesState, fetchMessages]);

  const loadNewer = useCallback(async () => {
    if (!activeConversationId) return;
    const state = messagesState[activeConversationId];
    const head = state?.messages[0];
    if (!state?.hasNewerPages || state.loading) return;
    const anchorId = head?.id;
    if (!anchorId) return;
    await fetchMessages(activeConversationId, anchorId, false, false, 'newer');
  }, [activeConversationId, messagesState, fetchMessages]);

  const jumpToLatestMessages = useCallback(
    async (conversationId: string) => {
      if (!isLoggedIn || !identity) return;
      setMessagesState((prev) => ({
        ...prev,
        [conversationId]: {
          messages: [],
          olderCursor: null,
          newerPaginationAfterId: null,
          hasNewerPages: false,
          loading: true,
          showManualLoadOlder: false,
          showManualLoadNewer: false,
        },
      }));
      await fetchMessages(conversationId, undefined, true);
    },
    [isLoggedIn, identity, fetchMessages],
  );

  const { createDM, createGroup, sendTextMessage, editTextMessage } = useConversationCreateAndSend({
    isLoggedIn,
    identity,
    api,
    conversations,
    getSigningKey,
    fetchRecipientKeys,
    toDecrypted,
    resolveParticipants,
    setConversations,
    setMessagesState,
    setSending,
  });

  const {
    addMember,
    removeMember,
    leaveGroup,
    promoteToAdmin,
    onPendingInvitesChanged,
    listPendingGroupInvites,
    revokeGroupInvite,
    terminateGroup,
    renameGroup,
    updateConversationMemberSettings,
    updateGifsDisabled,
    updateMessageSearchCachePolicy,
    pinMessage,
    unpinMessage,
    deleteMessage,
    acceptInvite,
    declineInvite,
    getInvitePreview,
    getFormerMembers,
  } = useConversationGroupInvitesAndDelete({
    api,
    fetchConversations,
    fetchMessagesRef,
    activeConversationIdRef,
    setConversations,
    setActiveConversationId,
    activeConversationId,
    setPendingInvitesRefreshSignal,
    setInvites,
    setMessagesState,
    toDecrypted,
  });

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  const fireNotification = useCallback(
    (title: string, body: string, opts?: { isViewingConvo?: boolean; onClick?: () => void; expiresAt?: string; isMention?: boolean }) => {
      fireConversationNotification(
        title,
        body,
        {
          onClick: opts?.onClick,
          isViewingConversation: opts?.isViewingConvo,
          nativeTag: 'conversation-event',
          expiresAt: opts?.expiresAt,
          isMention: opts?.isMention,
        },
        { toast, soundPref, ttlSoundPref, mentionSoundPref, notifications, audio }
      );
    },
    [toast, soundPref, ttlSoundPref, mentionSoundPref, audio, notifications]
  );

  // -------------------------------------------------------------------------
  // WebSocket events (via shared ChatSocket)
  // -------------------------------------------------------------------------

  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c
      )
    );
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const fireNotificationRef = useRef(fireNotification);
  fireNotificationRef.current = fireNotification;

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const resolveParticipantsRef = useRef(resolveParticipants);
  resolveParticipantsRef.current = resolveParticipants;

  const refreshParticipantProfileRef = useRef(refreshParticipantProfile);
  refreshParticipantProfileRef.current = refreshParticipantProfile;

  const onPendingInvitesChangedRef = useRef(onPendingInvitesChanged);
  onPendingInvitesChangedRef.current = onPendingInvitesChanged;

  const participantProfilesRef = useRef(participantProfiles);
  participantProfilesRef.current = participantProfiles;

  const tRef = useRef(t);
  tRef.current = t;

  useConversationsSocketEffects({
    isLoggedIn,
    subscribe,
    onStateChange,
    setConversations,
    setMessagesState,
    setActiveConversationId,
    setInvites,
    identityRef,
    activeConversationIdRef,
    isAtBottomRef,
    messagesStateRef,
    participantProfilesRef,
    fetchConversationsRef,
    fetchMessagesRef,
    refreshMessageInConversationRef,
    refreshRef,
    fireNotificationRef,
    navigateRef,
    resolveParticipantsRef,
    refreshParticipantProfileRef,
    onPendingInvitesChangedRef,
    tRef,
    decryptGroupName,
  });

  useConversationsAuthLifecycleEffects({
    isLoggedIn,
    setConversations,
    setMessagesState,
    setReplyParentHydration,
    setInvites,
    setActiveConversationId,
    refreshRef,
    activeConversationId,
    messagesState,
    fetchMessages,
  });

  // -------------------------------------------------------------------------
  // Report evidence: session key retrieval
  // -------------------------------------------------------------------------

  const getSessionKeysForMessages = useCallback(
    async (messageIds: string[]): Promise<Record<string, string>> => {
      if (!identity) return {};
      return loadSessionKeysForMessages({
        messageIds,
        identityId: identity.id,
        wrappingKey: getWrappingKey(),
        sessionKeyCache: sessionKeyCache.current,
        getPersistedSessionKey,
      });
    },
    [identity, getWrappingKey],
  );

  const computeAtLiveTail = useCallback((conversationId: string) => {
    const state = messagesStateRef.current[conversationId];
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    const hadNewerPages = state?.hasNewerPages ?? false;
    const headBefore = state?.messages[0]?.id;
    const lastBefore = conv?.lastMessageId;
    return (
      !hadNewerPages &&
      (lastBefore == null ? headBefore == null : headBefore === lastBefore)
    );
  }, []);

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------

  const value: ConversationsContextValue = useMemo(() => {
    const activeState = activeConversationId ? messagesState[activeConversationId] : undefined;
    const activeConversation = activeConversationId
      ? conversations.find((c) => c.id === activeConversationId)
      : undefined;

    return {
      conversations,
      activeConversationId,
      activeMessages: activeState?.messages ?? EMPTY_MESSAGES,
      activeMessagesOlderCursor: activeState?.olderCursor ?? null,
      activeMessagesHasNewerPages: activeState?.hasNewerPages ?? false,
      activeShowManualLoadOlder: activeState?.showManualLoadOlder ?? false,
      activeShowManualLoadNewer: activeState?.showManualLoadNewer ?? false,
      invites,
      participantProfiles,
      memberSettings: activeConversation?.decryptedMemberSettings ?? EMPTY_MEMBER_SETTINGS,
      loading,
      messagesLoading: activeState?.loading ?? false,
      sending,
      setActiveConversation,
      setIsAtBottom,
      fetchConversationById,
      markConversationRead,
      createDM,
      createGroup,
      sendTextMessage,
      editTextMessage,
      computeAtLiveTail,
      loadOlder,
      loadNewer,
      jumpToLatestMessages,
      fetchMessagesAround,
      replyParentHydrationMap: activeConversationId
        ? replyParentHydration[activeConversationId] ?? {}
        : {},
      ensureReplyParentHydration,
      loadPinnedMessagesPage,
      deleteMessage,
      addMember,
      removeMember,
      leaveGroup,
      renameGroup,
      updateMemberSettings: updateConversationMemberSettings,
      updateGifsDisabled,
      updateMessageSearchCachePolicy,
      pinMessage,
      unpinMessage,
      promoteToAdmin,
      terminateGroup,
      acceptInvite,
      declineInvite,
      getInvitePreview,
      getFormerMembers,
      pendingInvitesRefreshSignal,
      listPendingGroupInvites,
      revokeGroupInvite,
      prefetchParticipantProfiles: resolveParticipants,
      fetchRecipientKeys,
      getSessionKeysForMessages,
      refresh,
    };
  }, [
    conversations, activeConversationId, messagesState, replyParentHydration, invites,
    pendingInvitesRefreshSignal,
    participantProfiles, loading, sending,
    setActiveConversation, setIsAtBottom, fetchConversationById, markConversationRead,
    createDM, createGroup, sendTextMessage, editTextMessage, computeAtLiveTail, loadOlder, loadNewer, jumpToLatestMessages,
    fetchMessagesAround, ensureReplyParentHydration, loadPinnedMessagesPage,
    deleteMessage, addMember, removeMember, leaveGroup, renameGroup,
    updateConversationMemberSettings, updateGifsDisabled, updateMessageSearchCachePolicy, pinMessage, unpinMessage, promoteToAdmin, terminateGroup,
    acceptInvite, declineInvite, getInvitePreview, getFormerMembers,
    listPendingGroupInvites, revokeGroupInvite, resolveParticipants,
    fetchRecipientKeys, getSessionKeysForMessages, refresh,
  ]);

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}
