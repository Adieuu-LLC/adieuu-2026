/**
 * Conversations Hook
 *
 * Provides conversation state, messaging, and group management operations
 * with real-time WebSocket updates.
 *
 * PRIVACY: Messages are E2E encrypted before leaving the device. The
 * server only sees ciphertext. Decryption happens exclusively client-side.
 *
 * @module hooks/useConversations
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import {
  createApiClient,
  ChatClient,
  type PublicConversation,
  type PublicMessage,
  type PublicGroupInvite,
  type ChatIncomingMessage,
  type SendMessageParams,
  type ClaimedDevicePreKeys,
} from '@adieuu/shared';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import {
  encryptMessage,
  decryptMessage,
  encryptGroupName,
  decryptGroupName,
  type RecipientKeys,
  type DecryptedMessage,
} from '../services/conversationCryptoService';
import {
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
} from '../services/deviceKeyStorage';

// ============================================================================
// Types
// ============================================================================

export interface DecryptedConversation extends PublicConversation {
  decryptedName?: string;
  unreadCount: number;
}

export interface DisplayMessage extends PublicMessage {
  decryptedContent?: string;
  signatureVerified?: boolean;
  decryptionError?: string;
}

interface ConversationMessagesState {
  messages: DisplayMessage[];
  cursor: string | null;
  loading: boolean;
}

interface ConversationsContextValue {
  conversations: DecryptedConversation[];
  activeConversationId: string | null;
  activeMessages: DisplayMessage[];
  activeMessagesCursor: string | null;
  invites: PublicGroupInvite[];

  loading: boolean;
  messagesLoading: boolean;
  sending: boolean;

  setActiveConversation: (id: string | null) => void;

  // Conversation operations
  createDM: (participantId: string) => Promise<PublicConversation | null>;
  createGroup: (
    participantIds: string[],
    groupName?: string
  ) => Promise<PublicConversation | null>;

  // Message operations
  sendTextMessage: (
    conversationId: string,
    plaintext: string,
    expiresInSeconds?: number
  ) => Promise<PublicMessage | null>;
  loadMoreMessages: () => Promise<void>;

  // Group management
  addMember: (conversationId: string, identityId: string) => Promise<boolean>;
  removeMember: (conversationId: string, identityId: string) => Promise<boolean>;
  leaveGroup: (conversationId: string) => Promise<boolean>;
  renameGroup: (conversationId: string, newName: string) => Promise<boolean>;

  // Invites
  acceptInvite: (inviteId: string) => Promise<boolean>;
  declineInvite: (inviteId: string) => Promise<boolean>;

  refresh: () => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ConversationsProviderProps {
  children: ReactNode;
}

export function ConversationsProvider({ children }: ConversationsProviderProps) {
  const { status: identityStatus, identity, getSigningKey, getCurrentDeviceId, getWrappingKey } =
    useIdentity();
  const { apiBaseUrl, chatWsUrl } = useAppConfig();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const isLoggedIn = identityStatus === 'logged_in' && !!identity;

  // State
  const [conversations, setConversations] = useState<DecryptedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesState, setMessagesState] = useState<Record<string, ConversationMessagesState>>({});
  const [invites, setInvites] = useState<PublicGroupInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const chatClientRef = useRef<ChatClient | null>(null);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const decryptConversationName = useCallback(
    (conv: PublicConversation): string | undefined => {
      if (conv.type !== 'group' || !conv.encryptedName || !conv.nameNonce) return undefined;
      try {
        return decryptGroupName(conv.encryptedName, conv.nameNonce, conv.id);
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
      unreadCount: 0,
    }),
    [decryptConversationName]
  );

  /**
   * Fetch recipient keys (identity public keys + pre-keys) for all participants
   * in a conversation, needed for encrypting outbound messages.
   */
  const fetchRecipientKeys = useCallback(
    async (participantIds: string[]): Promise<RecipientKeys[]> => {
      const recipients: RecipientKeys[] = [];

      for (const pid of participantIds) {
        try {
          const keysResp = await api.identity.getPublicKeys(pid);
          if (!keysResp.data) continue;

          let preKeys: ClaimedDevicePreKeys[] = [];
          try {
            const claimResp = await api.identity.claimPreKeys(pid);
            if (claimResp.data?.devices) {
              preKeys = claimResp.data.devices;
            }
          } catch {
            // Pre-keys unavailable -- will use static key wrapping
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
        setConversations(resp.data.conversations.map(toDecrypted));
      }
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, api, toDecrypted]);

  const fetchMessages = useCallback(
    async (conversationId: string, cursor?: string) => {
      if (!isLoggedIn || !identity) return;

      setMessagesState((prev) => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] ?? { messages: [], cursor: null, loading: true }),
          loading: true,
        },
      }));

      try {
        const resp = await api.conversations.getMessages(conversationId, 50, cursor);
        if (resp.data) {
          const newMessages: DisplayMessage[] = resp.data.messages.map((m) => {
            if (m.deleted) {
              return { ...m, decryptedContent: undefined, signatureVerified: undefined };
            }
            return { ...m };
          });

          setMessagesState((prev) => {
            const existing = prev[conversationId]?.messages ?? [];
            const merged = cursor ? [...existing, ...newMessages] : newMessages;
            return {
              ...prev,
              [conversationId]: {
                messages: merged,
                cursor: resp.data!.cursor,
                loading: false,
              },
            };
          });
        }
      } catch {
        setMessagesState((prev) => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] ?? { messages: [], cursor: null, loading: false }),
            loading: false,
          },
        }));
      }
    },
    [isLoggedIn, identity, api]
  );

  const fetchInvites = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const resp = await api.conversations.listInvites();
      if (resp.data?.invites) {
        setInvites(resp.data.invites);
      }
    } catch {
      // Silent failure
    }
  }, [isLoggedIn, api]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchConversations(), fetchInvites()]);
  }, [fetchConversations, fetchInvites]);

  // -------------------------------------------------------------------------
  // Active conversation
  // -------------------------------------------------------------------------

  const setActiveConversation = useCallback(
    (id: string | null) => {
      setActiveConversationId(id);
      if (id && !messagesState[id]) {
        fetchMessages(id);
      }
    },
    [messagesState, fetchMessages]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!activeConversationId) return;
    const state = messagesState[activeConversationId];
    if (!state?.cursor || state.loading) return;
    await fetchMessages(activeConversationId, state.cursor);
  }, [activeConversationId, messagesState, fetchMessages]);

  // -------------------------------------------------------------------------
  // Conversation operations
  // -------------------------------------------------------------------------

  const createDM = useCallback(
    async (participantId: string): Promise<PublicConversation | null> => {
      try {
        const resp = await api.conversations.create({
          type: 'dm',
          participants: [participantId],
        });
        if (resp.data) {
          const decrypted = toDecrypted(resp.data);
          setConversations((prev) => {
            if (prev.some((c) => c.id === decrypted.id)) return prev;
            return [decrypted, ...prev];
          });
          return resp.data;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted]
  );

  const createGroup = useCallback(
    async (
      participantIds: string[],
      groupName?: string
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

        if (resp.data && groupName) {
          const encrypted = encryptGroupName(groupName, resp.data.id);
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
          return conv;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted]
  );

  // -------------------------------------------------------------------------
  // Message operations
  // -------------------------------------------------------------------------

  const sendTextMessage = useCallback(
    async (
      conversationId: string,
      plaintext: string,
      expiresInSeconds?: number
    ): Promise<PublicMessage | null> => {
      if (!isLoggedIn || !identity) return null;

      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return null;

      setSending(true);
      try {
        const signingKey = getSigningKey();
        if (!signingKey) throw new Error('No signing key available');

        const recipients = await fetchRecipientKeys(conversation.participants);
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
        };

        const resp = await api.conversations.sendMessage(conversationId, params);

        if (resp.data) {
          const displayMsg: DisplayMessage = {
            ...resp.data,
            decryptedContent: plaintext,
            signatureVerified: true,
          };

          setMessagesState((prev) => ({
            ...prev,
            [conversationId]: {
              ...(prev[conversationId] ?? { messages: [], cursor: null, loading: false }),
              messages: [displayMsg, ...(prev[conversationId]?.messages ?? [])],
            },
          }));

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
      try {
        const resp = await api.conversations.addMember(conversationId, identityId);
        if (resp.success) {
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

  const removeMember = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.removeMember(conversationId, identityId);
        if (resp.success) {
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

  const leaveGroup = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.leave(conversationId);
        if (resp.success) {
          setConversations((prev) => prev.filter((c) => c.id !== conversationId));
          if (activeConversationId === conversationId) {
            setActiveConversationId(null);
          }
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api, activeConversationId]
  );

  const renameGroup = useCallback(
    async (conversationId: string, newName: string): Promise<boolean> => {
      try {
        const encrypted = encryptGroupName(newName, conversationId);
        const resp = await api.conversations.updateName(
          conversationId,
          encrypted.encryptedName,
          encrypted.nameNonce
        );
        if (resp.success) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? { ...c, encryptedName: encrypted.encryptedName, nameNonce: encrypted.nameNonce, decryptedName: newName }
                : c
            )
          );
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

  // -------------------------------------------------------------------------
  // WebSocket events
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isLoggedIn || !chatWsUrl) return;

    const config = { wsUrl: chatWsUrl };

    const handleMessage = (message: ChatIncomingMessage) => {
      switch (message.type) {
        case 'conversation_created': {
          const conv = message.data.conversation;
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            const decrypted: DecryptedConversation = {
              ...conv,
              decryptedName:
                conv.type === 'group' && conv.encryptedName && conv.nameNonce
                  ? (() => {
                      try {
                        return decryptGroupName(conv.encryptedName!, conv.nameNonce!, conv.id);
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined,
              unreadCount: 0,
            };
            return [decrypted, ...prev];
          });
          break;
        }

        case 'conversation_updated': {
          const { conversationId, action } = message.data;
          if (action === 'removed') {
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            if (activeConversationId === conversationId) {
              setActiveConversationId(null);
            }
          } else {
            fetchConversations();
          }
          break;
        }

        case 'conversation_message': {
          const { conversationId, messageId } = message.data;

          // Increment unread count if not the active conversation
          if (conversationId !== activeConversationId) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c
              )
            );
          }

          // Fetch the new message if this is the active conversation
          if (conversationId === activeConversationId) {
            fetchMessages(conversationId);
          }

          // Bubble conversation to top
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === conversationId);
            if (idx <= 0) return prev;
            const conv = prev[idx]!;
            const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            return [{ ...conv, lastMessageAt: message.data.createdAt, lastMessageId: messageId }, ...rest];
          });
          break;
        }

        case 'group_invite_received': {
          const invite = message.data.invite;
          setInvites((prev) => {
            if (prev.some((i) => i.id === invite.id)) return prev;
            return [invite, ...prev];
          });
          break;
        }

        case 'group_invite_accepted': {
          fetchConversations();
          break;
        }
      }
    };

    const client = new ChatClient(config, {
      onMessage: handleMessage,
      onStateChange: (state) => {
        if (state === 'connected') {
          refresh();
        }
      },
    });

    chatClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      chatClientRef.current = null;
    };
  }, [isLoggedIn, chatWsUrl, activeConversationId, fetchConversations, fetchMessages, refresh]);

  // Initial data fetch
  useEffect(() => {
    if (isLoggedIn) {
      refresh();
    } else {
      setConversations([]);
      setMessagesState({});
      setInvites([]);
      setActiveConversationId(null);
    }
  }, [isLoggedIn, refresh]);

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------

  const activeState = activeConversationId ? messagesState[activeConversationId] : undefined;

  const value: ConversationsContextValue = {
    conversations,
    activeConversationId,
    activeMessages: activeState?.messages ?? [],
    activeMessagesCursor: activeState?.cursor ?? null,
    invites,
    loading,
    messagesLoading: activeState?.loading ?? false,
    sending,
    setActiveConversation,
    createDM,
    createGroup,
    sendTextMessage,
    loadMoreMessages,
    addMember,
    removeMember,
    leaveGroup,
    renameGroup,
    acceptInvite,
    declineInvite,
    refresh,
  };

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useConversations(): ConversationsContextValue {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationsProvider');
  }
  return context;
}
