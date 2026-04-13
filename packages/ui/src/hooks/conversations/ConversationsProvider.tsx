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
  type ChatIncomingMessage,
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
import { sidebarActions } from '../../utils/sidebarActions';
import {
  encryptMessage,
  encryptGroupName,
  decryptGroupName,
  decryptMemberSettings,
  type RecipientKeys,
  type MemberSettingsMap,
} from '../../services/conversationCryptoService';
import { getPersistedSessionKey } from '../../services/preKeyStorage';
import { loadReactionNotificationsEnabled } from '../useReactionNotificationPreference';
import { decryptMessageBatch } from '../../services/messageDecryptionPipeline';
import { handleConversationSocketMessage } from '../../services/conversationSocketHandlers';
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
  DEFAULT_MESSAGE_PAGE_LIMIT,
  REPLY_JUMP_CONTEXT_AFTER,
  REPLY_JUMP_CONTEXT_BEFORE,
  REPLY_QUOTE_HYDRATION_AFTER,
  REPLY_QUOTE_HYDRATION_BEFORE,
} from '../../pages/conversations/conversationScrollUtils';
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
import { loadDecryptKeysQuiet, loadDecryptKeysVerbose } from './conversationDecryptKeys';
import { buildDecryptMessageBatchSharedFields } from './decryptMessageBatchShared';
import { applyFetchedMessagesToConversationState } from './messageStateUpdates';

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

  /** Dedupe reaction toasts when both `reaction_added` and `notification_created` fire. */
  const reactionNotifDedupeRef = useRef(new Set<string>());

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
  const signingKeyCache = useRef<Record<string, string>>({});
  const resolvedProfileIds = useRef<Set<string>>(new Set());
  const messagesStateRef = useRef(messagesState);
  const conversationsRef = useRef(conversations);
  const sessionKeyCache = useRef(new Map<string, Uint8Array>());
  useEffect(() => { messagesStateRef.current = messagesState; }, [messagesState]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const isAtBottomRef = useRef(true);
  const setIsAtBottom = useCallback((value: boolean) => {
    isAtBottomRef.current = value;
  }, []);

  // -------------------------------------------------------------------------
  // Participant identity resolution
  // -------------------------------------------------------------------------

  /**
   * Resolves participant IDs to PublicIdentity profiles and caches
   * their signing public keys for message decryption/verification.
   *
   * Uses a ref-based "already requested" set rather than depending on
   * participantProfiles state, so this callback's identity is stable
   * and doesn't cause cascading re-renders/reconnections.
   */
  const resolveParticipants = useCallback(
    async (ids: string[]): Promise<Record<string, PublicIdentity>> => {
      const missing = ids.filter((id) => !resolvedProfileIds.current.has(id));
      if (missing.length === 0) return {};

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
            // Skip unreachable identities -- allow retry later
            resolvedProfileIds.current.delete(id);
          }

          try {
            if (!signingKeyCache.current[id]) {
              const keysResp = await api.identity.getPublicKeys(id);
              if (keysResp.data) {
                signingKeyCache.current[id] = keysResp.data.signingPublicKey;
              }
            }
          } catch {
            // Signing keys unavailable
          }
        })
      );

      if (Object.keys(fetched).length > 0) {
        setParticipantProfiles((prev) => ({ ...prev, ...fetched }));
      }

      return fetched;
    },
    [api]
  );

  /**
   * Force-refresh a single participant's profile by invalidating
   * the cache entry and re-fetching through the server's privacy filter.
   * Used when the server signals that an identity's profile has changed.
   */
  const refreshParticipantProfile = useCallback(
    async (identityId: string): Promise<void> => {
      resolvedProfileIds.current.delete(identityId);
      try {
        const resp = await api.identity.getProfile(identityId);
        if (resp.data) {
          setParticipantProfiles((prev) => ({ ...prev, [identityId]: resp.data! }));
        }
      } catch {
        // Profile may have become inaccessible (privacy change); remove it
        setParticipantProfiles((prev) => {
          const next = { ...prev };
          delete next[identityId];
          return next;
        });
      }
    },
    [api]
  );

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

  const fetchConversations = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const resp = await api.conversations.list(100);
      if (resp.data?.conversations) {
        const decrypted = resp.data.conversations.map(toDecrypted);

        setConversations((prev) => {
          const prevUnread = new Map(prev.map((c) => [c.id, c.unreadCount]));
          return decrypted.map((c) => ({
            ...c,
            unreadCount: prevUnread.get(c.id) ?? c.unreadCount,
          }));
        });

        const allParticipantIds = [
          ...new Set(decrypted.flatMap((c) => c.participants)),
        ];
        resolveParticipants(allParticipantIds);
      }
    } catch (err) {
      console.error('[useConversations] fetchConversations failed', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, api, toDecrypted, resolveParticipants]);

  const fetchMessages = useCallback(
    async (
      conversationId: string,
      paginationCursor?: string,
      silent?: boolean,
      mergeLatest?: boolean,
      direction?: 'older' | 'newer'
    ) => {
      if (!isLoggedIn || !identity) return;

      if (!silent && !mergeLatest) {
        setMessagesState((prev) => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] ?? {
              messages: [],
              olderCursor: null,
              newerPaginationAfterId: null,
              hasNewerPages: false,
              loading: true,
            }),
            loading: true,
          },
        }));
      }

      try {
        const limit = mergeLatest ? 1 : DEFAULT_MESSAGE_PAGE_LIMIT;
        const resp = await api.conversations.getMessages(conversationId, {
          limit,
          ...(mergeLatest
            ? {}
            : paginationCursor != null && direction
              ? { cursor: paginationCursor, direction }
              : {}),
        });
        if (resp.data) {
          const deviceId = getCurrentDeviceId();
          const wrappingKey = getWrappingKey();
          const keys = await loadDecryptKeysVerbose(identity.id, deviceId, wrappingKey);
          const shared = buildDecryptMessageBatchSharedFields({
            identityId: identity.id,
            wrappingKey,
            keys,
            signingKeyCache: signingKeyCache.current,
            sessionKeyCache: sessionKeyCache.current,
            api,
            resolveParticipants,
          });

          const newMessages = await decryptMessageBatch({
            ...shared,
            messages: resp.data.messages,
            conversationId,
            pagingCursor: mergeLatest ? undefined : paginationCursor,
            existingMessages: messagesStateRef.current[conversationId]?.messages ?? [],
          });

          const unreadCount =
            conversationsRef.current.find((c) => c.id === conversationId)?.unreadCount ?? 0;
          setMessagesState((prev) =>
            applyFetchedMessagesToConversationState(prev, {
              conversationId,
              mergeLatest: !!mergeLatest,
              newMessages,
              direction,
              cursor: resp.data!.cursor,
              hasNewerPagesFromApi: resp.data!.hasNewerPages,
              unreadCount,
              isAtBottom: isAtBottomRef.current,
            })
          );

          if (
            conversationId === activeConversationIdRef.current &&
            document.hasFocus() &&
            isAtBottomRef.current
          ) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
              )
            );
          }
        }
    } catch (err) {
      console.error('[useConversations] fetchMessages failed', { conversationId, paginationCursor, direction, mergeLatest }, err);
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
          loading: false,
        },
      }));
    }
    },
    [isLoggedIn, identity, api, getCurrentDeviceId, getWrappingKey, resolveParticipants]
  );

  const fetchMessagesAround = useCallback(
    async (
      conversationId: string,
      centerMessageId: string,
      options?: { before?: number; after?: number },
    ): Promise<boolean> => {
      if (!isLoggedIn || !identity) return false;
      const before = options?.before ?? REPLY_JUMP_CONTEXT_BEFORE;
      const after = options?.after ?? REPLY_JUMP_CONTEXT_AFTER;

      setMessagesState((prev) => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] ?? {
            messages: [],
            olderCursor: null,
            newerPaginationAfterId: null,
            hasNewerPages: false,
            loading: true,
          }),
          loading: true,
        },
      }));

      try {
        const resp = await api.conversations.getMessagesAround(conversationId, centerMessageId, {
          before,
          after,
        });
        if (!resp.data) {
          toast.error(
            t('conversations.loadMessageContextFailed', 'Could not load messages'),
            typeof resp.error === 'string' ? resp.error : undefined,
          );
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
              loading: false,
            },
          }));
          return false;
        }

        const deviceId = getCurrentDeviceId();
        const wrappingKey = getWrappingKey();
        const keys = await loadDecryptKeysQuiet(identity.id, deviceId, wrappingKey);
        const shared = buildDecryptMessageBatchSharedFields({
          identityId: identity.id,
          wrappingKey,
          keys,
          signingKeyCache: signingKeyCache.current,
          sessionKeyCache: sessionKeyCache.current,
          api,
          resolveParticipants,
        });

        const newMessages = await decryptMessageBatch({
          ...shared,
          messages: resp.data.messages,
          conversationId,
          pagingCursor: undefined,
          existingMessages: [],
        });

        const unreadCount =
          conversationsRef.current.find((c) => c.id === conversationId)?.unreadCount ?? 0;
        setMessagesState((prev) =>
          applyFetchedMessagesToConversationState(prev, {
            conversationId,
            mergeLatest: false,
            newMessages,
            cursor: resp.data!.cursor,
            hasNewerPagesFromApi: resp.data!.hasNewerPages,
            unreadCount,
            isAtBottom: isAtBottomRef.current,
          })
        );

        if (
          conversationId === activeConversationIdRef.current &&
          document.hasFocus() &&
          isAtBottomRef.current
        ) {
          setConversations((prev) =>
            prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
          );
        }
        return true;
      } catch (err) {
        console.error('[useConversations] fetchMessagesAround failed', { conversationId, centerMessageId }, err);
        toast.error(t('conversations.loadMessageContextFailed', 'Could not load messages'));
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
            loading: false,
          },
        }));
        return false;
      }
    },
    [
      isLoggedIn,
      identity,
      api,
      getCurrentDeviceId,
      getWrappingKey,
      resolveParticipants,
      toast,
      t,
    ],
  );

  const ensureReplyParentHydration = useCallback(
    async (conversationId: string, parentMessageId: string): Promise<void> => {
      if (!isLoggedIn || !identity) return;

      if (messagesStateRef.current[conversationId]?.messages.some((m) => m.id === parentMessageId)) {
        return;
      }
      if (replyParentHydrationRef.current[conversationId]?.[parentMessageId]) {
        return;
      }

      const inflightKey = `${conversationId}:${parentMessageId}`;
      if (replyHydrationInflightRef.current.has(inflightKey)) {
        return;
      }
      replyHydrationInflightRef.current.add(inflightKey);

      try {
        const resp = await api.conversations.getMessagesAround(conversationId, parentMessageId, {
          before: REPLY_QUOTE_HYDRATION_BEFORE,
          after: REPLY_QUOTE_HYDRATION_AFTER,
        });
        if (!resp.data?.messages?.length) {
          return;
        }

        const deviceId = getCurrentDeviceId();
        const wrappingKey = getWrappingKey();
        const keys = await loadDecryptKeysQuiet(identity.id, deviceId, wrappingKey);
        const shared = buildDecryptMessageBatchSharedFields({
          identityId: identity.id,
          wrappingKey,
          keys,
          signingKeyCache: signingKeyCache.current,
          sessionKeyCache: sessionKeyCache.current,
          api,
          resolveParticipants,
        });

        const main = messagesStateRef.current[conversationId]?.messages ?? [];
        const hydrated = replyParentHydrationRef.current[conversationId] ?? {};
        const existingById = new Map<string, DisplayMessage>();
        for (const m of main) {
          existingById.set(m.id, m);
        }
        for (const m of Object.values(hydrated)) {
          if (!existingById.has(m.id)) {
            existingById.set(m.id, m);
          }
        }
        const existingMessages = Array.from(existingById.values());

        const newMessages = await decryptMessageBatch({
          ...shared,
          messages: resp.data.messages,
          conversationId,
          pagingCursor: undefined,
          existingMessages,
        });

        setReplyParentHydration((prev) => {
          const conv = { ...(prev[conversationId] ?? {}) };
          for (const m of newMessages) {
            conv[m.id] = m as DisplayMessage;
          }
          return {
            ...prev,
            [conversationId]: conv,
          };
        });
      } catch (err) {
        console.error(
          '[useConversations] ensureReplyParentHydration failed',
          { conversationId, parentMessageId },
          err,
        );
      } finally {
        replyHydrationInflightRef.current.delete(inflightKey);
      }
    },
    [isLoggedIn, identity, api, getCurrentDeviceId, getWrappingKey, resolveParticipants],
  );

  const fetchInvites = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const resp = await api.conversations.listInvites();
      if (resp.data?.invites) {
        setInvites(resp.data.invites);

        const inviterIds = [
          ...new Set(resp.data.invites.map((i) => i.invitedByIdentityId)),
        ];
        if (inviterIds.length > 0) {
          resolveParticipants(inviterIds);
        }
      }
    } catch (err) {
      console.error('[useConversations] fetchInvites failed', err);
    }
  }, [isLoggedIn, api, resolveParticipants]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchConversations(), fetchInvites()]);
  }, [fetchConversations, fetchInvites]);

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

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

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

  useEffect(() => {
    if (!isLoggedIn) return;

    const runReactionNotifOnce = (reactionId: string, fn: () => void) => {
      if (reactionNotifDedupeRef.current.has(reactionId)) return;
      reactionNotifDedupeRef.current.add(reactionId);
      setTimeout(() => {
        reactionNotifDedupeRef.current.delete(reactionId);
      }, 60_000);
      fn();
    };

    const unsubMessage = subscribe((message: ChatIncomingMessage) => {
      handleConversationSocketMessage(message, {
        setConversations: (updater) =>
          setConversations((prev) => updater(prev as never) as never),
        setMessagesState: (updater) =>
          setMessagesState((prev) => updater(prev as never) as never),
        setActiveConversationId,
        setInvites,
        activeConversationId: activeConversationIdRef.current,
        isAtBottom: isAtBottomRef.current,
        hasFocus: document.hasFocus(),
        identityId: identityRef.current?.id,
        messagesState: messagesStateRef.current,
        participantProfiles: participantProfilesRef.current,
        decryptGroupName,
        fetchConversations: () => fetchConversationsRef.current(),
        fetchMessages: (conversationId, paginationCursor, silent, mergeLatest, direction) =>
          void fetchMessagesRef.current(conversationId, paginationCursor, silent, mergeLatest, direction),
        fireNotification: (title, body, options) =>
          fireNotificationRef.current(title, body, options),
        navigate: (path) => navigateRef.current(path),
        resolveParticipants: (participantIds) =>
          resolveParticipantsRef.current(participantIds),
        t: (key, options) => String(tRef.current(key, options as never)),
        runReactionNotifOnce,
        loadReactionNotificationsEnabled,
        openInvites: () => sidebarActions.openInvites(),
        refreshParticipantProfile: (identityId) =>
          void refreshParticipantProfileRef.current(identityId),
        onPendingInvitesChanged: (cid) => onPendingInvitesChangedRef.current(cid),
      });
    });

    const unsubState = onStateChange((state) => {
      if (state === 'connected') {
        refreshRef.current();

        const activeId = activeConversationIdRef.current;
        if (activeId) {
          fetchMessagesRef.current(activeId, undefined, true);
        }
      }
    });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const activeId = activeConversationIdRef.current;
      if (activeId) {
        fetchMessagesRef.current(activeId, undefined, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      unsubMessage();
      unsubState();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isLoggedIn, subscribe, onStateChange]);

  // Clear state on definitive logout (isLoggedIn going true -> false).
  const wasLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn && wasLoggedInRef.current) {
      setConversations([]);
      setMessagesState({});
      setReplyParentHydration({});
      setInvites([]);
      setActiveConversationId(null);
    }
    wasLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  // Initial data fetch -- only depends on isLoggedIn to avoid
  // re-firing when the refresh callback reference changes.
  useEffect(() => {
    if (isLoggedIn) {
      refreshRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  // If the active conversation was set before login (e.g. hard refresh on
  // /conversations/:id), fetchMessages would have bailed. Retry once
  // isLoggedIn becomes true and there's still no messages state.
  useEffect(() => {
    if (isLoggedIn && activeConversationId && !messagesState[activeConversationId]) {
      fetchMessages(activeConversationId);
    }
  }, [isLoggedIn, activeConversationId, messagesState, fetchMessages]);

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
