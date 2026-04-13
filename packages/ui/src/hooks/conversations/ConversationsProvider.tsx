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
  type GroupInvitePreview,
  type PublicIdentity,
  type SendMessageParams,
  type ClaimedDevicePreKeys,
  type FormerMember,
  type PublicMessage,
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
  encryptMessage,
  encryptGroupName,
  decryptGroupName,
  decryptMemberSettings,
  type RecipientKeys,
  type MemberSettingsMap,
} from '../../services/conversationCryptoService';
import { getPersistedSessionKey } from '../../services/preKeyStorage';
import {
  addMemberAction,
  listPendingGroupInvitesAction,
  revokeGroupInviteAction,
  leaveGroupAction,
  promoteToAdminAction,
  removeMemberAction,
  renameGroupAction,
  terminateGroupAction,
  updateMemberSettingsAction,
} from '../../services/conversationGroupActions';
import { getSessionKeysForMessages as loadSessionKeysForMessages } from '../../services/sessionKeyRetrieval';
import {
  EMPTY_MEMBER_SETTINGS,
  EMPTY_MESSAGES,
  type ConversationMessagesState,
  type DecryptedConversation,
  type DisplayMessage,
  type ConversationsContextValue,
  type SendMessageErrorResult,
} from './types';
import { ConversationsContext } from './context';
import { useConversationParticipantProfiles } from './useConversationParticipantProfiles';
import { useConversationDataFetching } from './useConversationDataFetching';
import { useConversationsSocketEffects } from './useConversationsSocketEffects';
import { useConversationsAuthLifecycleEffects } from './useConversationsAuthLifecycleEffects';

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
    async (participantIds: string[], useForwardSecrecy = false): Promise<RecipientKeys[]> => {
      const recipients: RecipientKeys[] = [];

      for (const pid of participantIds) {
        try {
          const keysResp = await api.identity.getPublicKeys(pid);
          if (!keysResp.data) continue;

          let preKeys: ClaimedDevicePreKeys[] = [];
          if (useForwardSecrecy) {
            try {
              const claimResp = await api.identity.claimPreKeys(pid);
              if (claimResp.data?.devices) {
                preKeys = claimResp.data.devices;
              }
            } catch {
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
        } catch {
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
    fetchMessages,
    fetchMessagesAround,
    ensureReplyParentHydration,
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
        },
      }));
      await fetchMessages(conversationId, undefined, true);
    },
    [isLoggedIn, identity, fetchMessages],
  );

  // -------------------------------------------------------------------------
  // Conversation operations
  // -------------------------------------------------------------------------

  const createDM = useCallback(
    async (
      participantId: string,
      options?: { forceNew?: boolean; topic?: string }
    ): Promise<PublicConversation | null> => {
      try {
        const { forceNew, topic } = options ?? {};
        const resp = await api.conversations.create({
          type: 'dm',
          participants: [participantId],
          forceNew: forceNew === true ? true : undefined,
        });
        if (!resp.data) return null;

        let conv: PublicConversation = resp.data;
        const trimmedTopic = topic?.trim();
        if (trimmedTopic) {
          const encrypted = encryptGroupName(trimmedTopic, conv.id);
          const nameResp = await api.conversations.updateName(
            conv.id,
            encrypted.encryptedName,
            encrypted.nameNonce
          );
          if (nameResp.data) {
            conv = {
              ...nameResp.data,
              encryptedName: nameResp.data.encryptedName ?? encrypted.encryptedName,
              nameNonce: nameResp.data.nameNonce ?? encrypted.nameNonce,
            };
          }
        }

        const decrypted = toDecrypted(conv);
        setConversations((prev) => {
          if (prev.some((c) => c.id === decrypted.id)) return prev;
          return [decrypted, ...prev];
        });
        void resolveParticipants(decrypted.participants);
        return conv;
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted, resolveParticipants, encryptGroupName]
  );

  const createGroup = useCallback(
    async (
      participantIds: string[],
      conversationTopicOrName?: string
    ): Promise<PublicConversation | null> => {
      try {
        let encryptedName: string | undefined;
        let nameNonce: string | undefined;

        // We'll encrypt the name after we get the conversationId --
        // but we need the ID to derive the key. So we create the
        // conversation first with a placeholder, then update the name.
        const resp = await api.conversations.create({
          type: 'group',
          participants: participantIds,
        });

        if (resp.data && conversationTopicOrName) {
          const encrypted = encryptGroupName(conversationTopicOrName, resp.data.id);
          await api.conversations.updateName(resp.data.id, encrypted.encryptedName, encrypted.nameNonce);
          encryptedName = encrypted.encryptedName;
          nameNonce = encrypted.nameNonce;
        }

        if (resp.data) {
          const conv = {
            ...resp.data,
            encryptedName,
            nameNonce,
          };
          const decrypted = toDecrypted(conv);
          setConversations((prev) => [decrypted, ...prev]);
          void resolveParticipants(decrypted.participants);
          return conv;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted, resolveParticipants]
  );

  // -------------------------------------------------------------------------
  // Message operations
  // -------------------------------------------------------------------------

  const sendTextMessage = useCallback(
    async (
      conversationId: string,
      plaintext: string,
      options?: {
        expiresInSeconds?: number;
        useForwardSecrecy?: boolean;
        replyToMessageId?: string;
        e2eMediaIds?: string[];
        mentionedIdentityIds?: string[];
        skipMessageStateUpdate?: boolean;
      }
    ): Promise<PublicMessage | SendMessageErrorResult | null> => {
      if (!isLoggedIn || !identity) return null;

      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return null;

      const useFs = options?.useForwardSecrecy ?? false;
      const expiresInSeconds = options?.expiresInSeconds;

      setSending(true);
      try {
        const signingKey = getSigningKey();
        if (!signingKey) throw new Error('No signing key available');

        const recipients = await fetchRecipientKeys(conversation.participants, useFs);
        if (recipients.length === 0) throw new Error('No recipient keys available');

        const cryptoProfile = identity.preferredCryptoProfile ?? 'default';
        const encrypted = encryptMessage(
          plaintext,
          recipients,
          signingKey,
          cryptoProfile as 'default' | 'cnsa2'
        );

        const clientMessageId = crypto.randomUUID();

        const params: SendMessageParams = {
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientMessageId,
          expiresInSeconds,
          ...(options?.replyToMessageId ? { replyToMessageId: options.replyToMessageId } : {}),
          ...(options?.e2eMediaIds?.length ? { e2eMediaIds: options.e2eMediaIds } : {}),
          ...(options?.mentionedIdentityIds?.length ? { mentionedIdentityIds: options.mentionedIdentityIds } : {}),
        };

        const resp = await api.conversations.sendMessage(conversationId, params);

        if (resp.data) {
          const displayMsg: DisplayMessage = {
            ...resp.data,
            decryptedContent: plaintext,
            signatureVerified: true,
            forwardSecrecy: useFs,
          };

          if (!options?.skipMessageStateUpdate) {
            setMessagesState((prev) => ({
              ...prev,
              [conversationId]: {
                ...(prev[conversationId] ?? {
                  messages: [],
                  olderCursor: null,
                  newerPaginationAfterId: null,
                  hasNewerPages: false,
                  loading: false,
                }),
                messages: [displayMsg, ...(prev[conversationId]?.messages ?? [])],
                newerPaginationAfterId: displayMsg.id,
                hasNewerPages: false,
              },
            }));
          }

          // Update conversation's lastMessage timestamp
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? { ...c, lastMessageAt: resp.data!.createdAt, lastMessageId: resp.data!.id }
                : c
            ).sort((a, b) => {
              const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return bTime - aTime;
            })
          );

          return resp.data;
        }

        if (resp.error?.code === 'FORBIDDEN') {
          return { errorCode: 'BLOCKED' };
        }
      } catch (err) {
        console.error('[Conversations] Failed to send message:', err);
      } finally {
        setSending(false);
      }
      return null;
    },
    [isLoggedIn, identity, conversations, getSigningKey, fetchRecipientKeys, api]
  );

  // -------------------------------------------------------------------------
  // Group management
  // -------------------------------------------------------------------------

  const addMember = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await addMemberAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const removeMember = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await removeMemberAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const leaveGroup = useCallback(
    async (
      conversationId: string,
      options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
    ): Promise<boolean> => {
      const ok = await leaveGroupAction(api, conversationId, options);
      if (!ok) return false;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      return true;
    },
    [api, activeConversationId]
  );

  const promoteToAdmin = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await promoteToAdminAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const onPendingInvitesChanged = useCallback((conversationId: string) => {
    setPendingInvitesRefreshSignal({ conversationId, nonce: Date.now() });
  }, []);

  const listPendingGroupInvites = useCallback(
    async (conversationId: string) => listPendingGroupInvitesAction(api, conversationId),
    [api]
  );

  const revokeGroupInvite = useCallback(
    async (conversationId: string, inviteId: string): Promise<boolean> => {
      const ok = await revokeGroupInviteAction(api, conversationId, inviteId);
      if (ok) {
        setPendingInvitesRefreshSignal({ conversationId, nonce: Date.now() });
      }
      return ok;
    },
    [api]
  );

  const terminateGroup = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const ok = await terminateGroupAction(api, conversationId);
      if (!ok) return false;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      return true;
    },
    [api, activeConversationId]
  );

  const renameGroup = useCallback(
    async (conversationId: string, newName: string): Promise<boolean> => {
      const result = await renameGroupAction(api, conversationId, newName);
      if (!result.ok) return false;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                encryptedName: result.encryptedName,
                nameNonce: result.nameNonce,
                decryptedName: newName,
              }
            : c
        )
      );
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api]
  );

  const updateConversationMemberSettings = useCallback(
    async (conversationId: string, settings: MemberSettingsMap): Promise<boolean> => {
      const result = await updateMemberSettingsAction(api, conversationId, settings);
      if (!result.ok) return false;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                encryptedMemberSettings: result.encryptedMemberSettings,
                memberSettingsNonce: result.memberSettingsNonce,
                decryptedMemberSettings: settings,
              }
            : c
        )
      );
      return true;
    },
    [api]
  );

  const updateGifsDisabled = useCallback(
    async (conversationId: string, gifsDisabled: boolean): Promise<boolean> => {
      const resp = await api.conversations.updateGifsDisabled(conversationId, gifsDisabled);
      if (!resp.success || !resp.data) return false;
      const updated = toDecrypted(resp.data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...updated, unreadCount: c.unreadCount } : c
        )
      );
      return true;
    },
    [api, toDecrypted]
  );

  // -------------------------------------------------------------------------
  // Message deletion
  // -------------------------------------------------------------------------

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string, forEveryone: boolean): Promise<boolean> => {
      try {
        const resp = forEveryone
          ? await api.conversations.deleteMessageForEveryone(conversationId, messageId)
          : await api.conversations.deleteMessageForSelf(conversationId, messageId);

        if (resp.success) {
          setMessagesState((prev) => {
            const state = prev[conversationId];
            if (!state) return prev;
            return {
              ...prev,
              [conversationId]: {
                ...state,
                messages: state.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, deleted: true, decryptedContent: undefined, ciphertext: undefined }
                    : m
                ),
              },
            };
          });
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api]
  );

  // -------------------------------------------------------------------------
  // Invites
  // -------------------------------------------------------------------------

  const acceptInvite = useCallback(
    async (inviteId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.acceptInvite(inviteId);
        if (resp.success) {
          setInvites((prev) => prev.filter((i) => i.id !== inviteId));
          await fetchConversations();
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api, fetchConversations]
  );

  const declineInvite = useCallback(
    async (inviteId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.declineInvite(inviteId);
        if (resp.success) {
          setInvites((prev) => prev.filter((i) => i.id !== inviteId));
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api]
  );

  const invitePreviewCache = useRef<Record<string, GroupInvitePreview>>({});

  const getInvitePreview = useCallback(
    async (inviteId: string): Promise<GroupInvitePreview | null> => {
      if (invitePreviewCache.current[inviteId]) {
        return invitePreviewCache.current[inviteId];
      }
      try {
        const resp = await api.conversations.getInvitePreview(inviteId);
        if (resp.data) {
          invitePreviewCache.current[inviteId] = resp.data;
          return resp.data;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api]
  );

  // -------------------------------------------------------------------------
  // Former members
  // -------------------------------------------------------------------------

  const getFormerMembers = useCallback(
    async (conversationId: string): Promise<FormerMember[]> => {
      try {
        const resp = await api.conversations.getFormerMembers(conversationId);
        if (resp.data) {
          return resp.data;
        }
      } catch {
        // Error
      }
      return [];
    },
    [api]
  );

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

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;

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
      invites,
      participantProfiles,
      memberSettings: activeConversation?.decryptedMemberSettings ?? EMPTY_MEMBER_SETTINGS,
      loading,
      messagesLoading: activeState?.loading ?? false,
      sending,
      setActiveConversation,
      setIsAtBottom,
      markConversationRead,
      createDM,
      createGroup,
      sendTextMessage,
      loadOlder,
      loadNewer,
      jumpToLatestMessages,
      fetchMessagesAround,
      replyParentHydrationMap: activeConversationId
        ? replyParentHydration[activeConversationId] ?? {}
        : {},
      ensureReplyParentHydration,
      deleteMessage,
      addMember,
      removeMember,
      leaveGroup,
      renameGroup,
      updateMemberSettings: updateConversationMemberSettings,
      updateGifsDisabled,
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
    setActiveConversation, setIsAtBottom, markConversationRead,
    createDM, createGroup, sendTextMessage, loadOlder, loadNewer, jumpToLatestMessages,
    fetchMessagesAround, ensureReplyParentHydration,
    deleteMessage, addMember, removeMember, leaveGroup, renameGroup,
    updateConversationMemberSettings, updateGifsDisabled, promoteToAdmin, terminateGroup,
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
