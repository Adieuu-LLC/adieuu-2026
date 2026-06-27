import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import {
  createApiClient,
  type PublicConversation,
  type PublicGroupInvite,
  type PublicIdentity,
  type PublicMessage,
} from '@adieuu/shared';
import { decryptMessageBatch } from '../../services/messageDecryptionPipeline';
import {
  DEFAULT_MESSAGE_PAGE_LIMIT,
  REPLY_JUMP_CONTEXT_AFTER,
  REPLY_JUMP_CONTEXT_BEFORE,
  REPLY_QUOTE_HYDRATION_AFTER,
  REPLY_QUOTE_HYDRATION_BEFORE,
} from '../../pages/conversations/conversationScrollUtils';
import { buildDecryptMessageBatchSharedFields } from './decryptMessageBatchShared';
import { loadDecryptKeysQuiet, loadDecryptKeysVerbose } from './conversationDecryptKeys';
import { applyFetchedMessagesToConversationState } from './messageStateUpdates';
import type {
  ConversationMessagesState,
  DecryptedConversation,
  DisplayMessage,
  MessageEditHistoryEntry,
} from './types';
import { loadShowMessageArtifacts } from '../../services/preKeyService';
import {
  computeManualLoadHints,
  countVisibleInThreadBatch,
} from '../../pages/conversations/messageThreadVisibility';

type ApiClient = ReturnType<typeof createApiClient>;

const PINNED_MESSAGES_PAGE_LIMIT = 10;

export interface ConversationDataFetchingParams {
  isLoggedIn: boolean;
  identity: PublicIdentity | null;
  api: ApiClient;
  getCurrentDeviceId: () => string | null;
  getWrappingKey: () => Uint8Array | null;
  toDecrypted: (conv: PublicConversation) => DecryptedConversation;
  resolveParticipants: (ids: string[]) => Promise<Record<string, PublicIdentity>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setConversations: Dispatch<SetStateAction<DecryptedConversation[]>>;
  setMessagesState: Dispatch<SetStateAction<Record<string, ConversationMessagesState>>>;
  setInvites: Dispatch<SetStateAction<PublicGroupInvite[]>>;
  setReplyParentHydration: Dispatch<
    SetStateAction<Record<string, Record<string, DisplayMessage>>>
  >;
  signingKeyCache: MutableRefObject<Record<string, string>>;
  sessionKeyCache: MutableRefObject<Map<string, Uint8Array>>;
  messagesStateRef: MutableRefObject<Record<string, ConversationMessagesState>>;
  conversationsRef: MutableRefObject<DecryptedConversation[]>;
  activeConversationIdRef: MutableRefObject<string | null>;
  isAtBottomRef: MutableRefObject<boolean>;
  replyParentHydrationRef: MutableRefObject<Record<string, Record<string, DisplayMessage>>>;
  replyHydrationInflightRef: MutableRefObject<Set<string>>;
  toast: { error: (message: string, detail?: string) => void };
  t: TFunction;
}

/**
 * List conversations, paginated messages, reply-context windows, invites, and refresh.
 */
export function useConversationDataFetching(params: ConversationDataFetchingParams) {
  const {
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
  } = params;

  const fetchConversations = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const resp = await api.conversations.list(100);
      if (resp.data?.conversations) {
        const decrypted = resp.data.conversations.map(toDecrypted);

        setConversations((prev) => {
          const prevUnreadCount = new Map(prev.map((c) => [c.id, c.unreadCount]));
          const prevHasUnread = new Map(prev.map((c) => [c.id, c.hasUnread]));
          return decrypted.map((c) => ({
            ...c,
            unreadCount: prevUnreadCount.get(c.id) ?? c.unreadCount,
            hasUnread: prevHasUnread.get(c.id) ?? c.hasUnread,
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
              showManualLoadOlder: false,
              showManualLoadNewer: false,
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
          const nowMs = Date.now();
          const showArt = loadShowMessageArtifacts(identity.id);
          const visibleInBatch = countVisibleInThreadBatch(newMessages, showArt, nowMs);
          setMessagesState((prev) => {
            const next = applyFetchedMessagesToConversationState(prev, {
              conversationId,
              mergeLatest: !!mergeLatest,
              newMessages,
              direction,
              cursor: resp.data!.cursor,
              hasNewerPagesFromApi: resp.data!.hasNewerPages,
              unreadCount,
              isAtBottom: isAtBottomRef.current,
            });
            const st = next[conversationId];
            if (!st) return next;
            const p = prev[conversationId];
            const { showManualLoadOlder, showManualLoadNewer } = computeManualLoadHints({
              prevOlder: p?.showManualLoadOlder ?? false,
              prevNewer: p?.showManualLoadNewer ?? false,
              mergedState: st,
              newMessages,
              direction,
              mergeLatest: !!mergeLatest,
              visibleInBatch,
            });
            return {
              ...next,
              [conversationId]: { ...st, showManualLoadOlder, showManualLoadNewer },
            };
          });

          if (
            conversationId === activeConversationIdRef.current &&
            document.hasFocus() &&
            isAtBottomRef.current
          ) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0, hasUnread: false } : c
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
              showManualLoadOlder: false,
              showManualLoadNewer: false,
            }),
            loading: false,
            showManualLoadOlder: false,
            showManualLoadNewer: false,
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
      options?: {
        before?: number;
        after?: number;
        skipStateUpdate?: boolean;
        silent?: boolean;
      },
    ): Promise<DisplayMessage[] | null> => {
      if (!isLoggedIn || !identity) return null;
      const before = options?.before ?? REPLY_JUMP_CONTEXT_BEFORE;
      const after = options?.after ?? REPLY_JUMP_CONTEXT_AFTER;
      const skipStateUpdate = options?.skipStateUpdate ?? false;
      const silent = options?.silent ?? false;

      if (!skipStateUpdate) {
        setMessagesState((prev) => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] ?? {
              messages: [],
              olderCursor: null,
              newerPaginationAfterId: null,
              hasNewerPages: false,
              loading: true,
              showManualLoadOlder: false,
              showManualLoadNewer: false,
            }),
            loading: true,
          },
        }));
      }

      try {
        const resp = await api.conversations.getMessagesAround(conversationId, centerMessageId, {
          before,
          after,
        });
        if (!resp.data) {
          if (!silent) {
            toast.error(
              t('conversations.loadMessageContextFailed', 'Could not load messages'),
              typeof resp.error === 'string' ? resp.error : undefined,
            );
          }
          if (!skipStateUpdate) {
            setMessagesState((prev) => ({
              ...prev,
              [conversationId]: {
                ...(prev[conversationId] ?? {
                  messages: [],
                  olderCursor: null,
                  newerPaginationAfterId: null,
                  hasNewerPages: false,
                  loading: false,
                  showManualLoadOlder: false,
                  showManualLoadNewer: false,
                }),
                loading: false,
              },
            }));
          }
          return null;
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

        if (!skipStateUpdate) {
          const unreadCount =
            conversationsRef.current.find((c) => c.id === conversationId)?.unreadCount ?? 0;
          setMessagesState((prev) => {
            const next = applyFetchedMessagesToConversationState(prev, {
              conversationId,
              mergeLatest: false,
              newMessages,
              cursor: resp.data!.cursor,
              hasNewerPagesFromApi: resp.data!.hasNewerPages,
              unreadCount,
              isAtBottom: isAtBottomRef.current,
            });
            const st = next[conversationId];
            if (!st) return next;
            return {
              ...next,
              [conversationId]: { ...st, showManualLoadOlder: false, showManualLoadNewer: false },
            };
          });

          if (
            conversationId === activeConversationIdRef.current &&
            document.hasFocus() &&
            isAtBottomRef.current
          ) {
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0, hasUnread: false } : c)),
            );
          }
        }
        return newMessages;
      } catch (err) {
        console.error('[useConversations] fetchMessagesAround failed', { conversationId, centerMessageId }, err);
        if (!silent) {
          toast.error(t('conversations.loadMessageContextFailed', 'Could not load messages'));
        }
        if (!skipStateUpdate) {
          setMessagesState((prev) => ({
            ...prev,
            [conversationId]: {
              ...(prev[conversationId] ?? {
                messages: [],
                olderCursor: null,
                newerPaginationAfterId: null,
                hasNewerPages: false,
                loading: false,
                showManualLoadOlder: false,
                showManualLoadNewer: false,
              }),
              loading: false,
            },
          }));
        }
        return null;
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
    ]
  );

  const loadMessageEditHistory = useCallback(
    async (conversationId: string, message: DisplayMessage): Promise<MessageEditHistoryEntry[] | null> => {
      if (!isLoggedIn || !identity) return null;
      try {
        const resp = await api.conversations.getMessage(conversationId, message.id, {
          include: 'revisionHistory',
        });
        const raw = resp.data;
        if (!raw?.encryptedRevisionHistory?.length) {
          return [];
        }
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
        const toDecrypt: PublicMessage[] = raw.encryptedRevisionHistory.map((rev, i) => ({
          id: `${raw.id}__e2e_rev__${i}`,
          conversationId: raw.conversationId,
          fromIdentityId: raw.fromIdentityId,
          messageType: raw.messageType,
          ciphertext: rev.ciphertext,
          nonce: rev.nonce,
          wrappedKeys: rev.wrappedKeys,
          signature: rev.signature,
          cryptoProfile: rev.cryptoProfile,
          clientMessageId: raw.clientMessageId,
          e2eMediaIds: raw.e2eMediaIds,
          replyToMessageId: raw.replyToMessageId,
          expiresAt: raw.expiresAt,
          deleted: false,
          createdAt: raw.createdAt,
          revisionCount: 0,
        }));
        const decrypted = (await decryptMessageBatch({
          ...shared,
          messages: toDecrypt,
          conversationId,
          pagingCursor: undefined,
          existingMessages: [],
          persistSideEffects: false,
        })) as DisplayMessage[];
        return raw.encryptedRevisionHistory.map((rev, i) => ({
          replacedAt: rev.replacedAt,
          plaintext: decrypted[i]?.decryptedContent,
          decryptionError: decrypted[i]?.decryptionError,
        }));
      } catch (err) {
        console.error(
          '[useConversations] loadMessageEditHistory failed',
          { conversationId, messageId: message.id },
          err
        );
        toast.error(t('conversations.loadEditHistoryFailed'));
        return null;
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
      signingKeyCache,
      sessionKeyCache,
    ]
  );

  const refreshMessageInConversation = useCallback(
    async (conversationId: string, messageId: string) => {
      if (!isLoggedIn || !identity) return;
      try {
        const resp = await api.conversations.getMessage(conversationId, messageId);
        if (!resp.data) return;
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
        const existing = messagesStateRef.current[conversationId]?.messages ?? [];
        const [decrypted] = await decryptMessageBatch({
          ...shared,
          messages: [resp.data as PublicMessage],
          conversationId,
          pagingCursor: undefined,
          existingMessages: existing,
        });
        if (!decrypted) return;
        setMessagesState((p) => {
          const st = p[conversationId];
          if (!st?.messages.some((m) => m.id === messageId)) return p;
          return {
            ...p,
            [conversationId]: {
              ...st,
              messages: st.messages.map((m) => (m.id === messageId ? (decrypted as DisplayMessage) : m)),
            },
          };
        });
      } catch (err) {
        console.error('[useConversations] refreshMessageInConversation failed', { conversationId, messageId }, err);
      }
    },
    [
      isLoggedIn,
      identity,
      api,
      getCurrentDeviceId,
      getWrappingKey,
      resolveParticipants,
      signingKeyCache,
      sessionKeyCache,
      messagesStateRef,
      setMessagesState,
    ]
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
    [isLoggedIn, identity, api, getCurrentDeviceId, getWrappingKey, resolveParticipants]
  );

  /**
   * Fetch one page of pinned messages and decrypt. Reuses messages already in the scroll buffer
   * or reply-hydration cache when possible.
   */
  const loadPinnedMessagesPage = useCallback(
    async (
      conversationId: string,
      cursor?: string | null
    ): Promise<{ messages: DisplayMessage[]; nextCursor: string | null } | null> => {
      if (!isLoggedIn || !identity) return null;
      try {
        const resp = await api.conversations.getPinnedMessages(conversationId, {
          limit: PINNED_MESSAGES_PAGE_LIMIT,
          cursor: cursor ?? undefined,
        });
        if (!resp.data) return null;

        const raw = resp.data.messages;
        const nextCursor = resp.data.nextCursor;

        const stateMsgs = messagesStateRef.current[conversationId]?.messages ?? [];
        const hydrated = replyParentHydrationRef.current[conversationId] ?? {};

        const toDecrypt: PublicMessage[] = [];
        const prefilled = new Map<string, DisplayMessage>();

        for (const m of raw) {
          const local = stateMsgs.find((x) => x.id === m.id) ?? hydrated[m.id];
          if (local) prefilled.set(m.id, local);
          else toDecrypt.push(m);
        }

        let decrypted: DisplayMessage[] = [];
        if (toDecrypt.length > 0) {
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

          decrypted = (await decryptMessageBatch({
            ...shared,
            messages: toDecrypt,
            conversationId,
            pagingCursor: undefined,
            existingMessages: stateMsgs,
          })) as DisplayMessage[];
        }

        const merged = new Map<string, DisplayMessage>([...prefilled]);
        for (const d of decrypted) merged.set(d.id, d);

        const ordered: DisplayMessage[] = [];
        for (const r of raw) {
          const row = merged.get(r.id);
          if (row) ordered.push(row);
        }

        ordered.sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          if (tb !== ta) return tb - ta;
          return b.id.localeCompare(a.id);
        });

        void resolveParticipants([...new Set(ordered.map((m) => m.fromIdentityId))]);

        return { messages: ordered, nextCursor };
      } catch (err) {
        console.error('[useConversations] loadPinnedMessagesPage failed', { conversationId, cursor }, err);
        toast.error(t('conversations.loadPinnedFailed', 'Could not load pinned messages'));
        return null;
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
    ]
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

  const fetchConversationById = useCallback(
    async (conversationId: string) => {
      if (!isLoggedIn) return;
      try {
        const resp = await api.conversations.get(conversationId);
        if (!resp.data) return;
        const next = toDecrypted(resp.data);
        void resolveParticipants(next.participants);
        setConversations((prev) => {
          const i = prev.findIndex((c) => c.id === conversationId);
          if (i === -1) return [...prev, { ...next, unreadCount: 0, hasUnread: false }];
          const prevRow = prev[i]!;
          return prev.map((c) => (c.id === conversationId ? { ...next, unreadCount: prevRow.unreadCount, hasUnread: prevRow.hasUnread } : c));
        });
      } catch (err) {
        console.error('[useConversations] fetchConversationById failed', { conversationId }, err);
      }
    },
    [isLoggedIn, api, toDecrypted, setConversations, resolveParticipants]
  );

  return {
    fetchConversations,
    fetchConversationById,
    fetchMessages,
    fetchMessagesAround,
    loadMessageEditHistory,
    refreshMessageInConversation,
    ensureReplyParentHydration,
    loadPinnedMessagesPage,
    fetchInvites,
    refresh,
  };
}
