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
  type PublicConversation,
  type PublicMessage,
  type PublicGroupInvite,
  type PublicIdentity,
  type ChatIncomingMessage,
  type SendMessageParams,
  type ClaimedDevicePreKeys,
  type SerializedWrappedKey,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useIdentity } from './useIdentity';
import { useChatSocket } from './useChatSocket';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { useToast } from '../components/Toast';
import { useNotificationSoundPreference } from './useNotificationSoundPreference';
import { getNativeNotificationsEnabled } from './useNativeNotificationsPreference';
import { playNotificationSound, type FocusVisibilitySnapshot } from '../utils/notificationSound';
import {
  encryptMessage,
  decryptMessage,
  encryptGroupName,
  decryptGroupName,
  type RecipientKeys,
} from '../services/conversationCryptoService';
import {
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
} from '../services/deviceKeyStorage';
import {
  findAndDecryptSignedPreKey,
  findAndDecryptOneTimePreKey,
} from '../services/preKeyStorage';

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
  participantProfiles: Record<string, PublicIdentity>;

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
  deleteMessage: (
    conversationId: string,
    messageId: string,
    forEveryone: boolean
  ) => Promise<boolean>;

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
  const { apiBaseUrl } = useAppConfig();
  const { subscribe, onStateChange } = useChatSocket();
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const soundPref = useNotificationSoundPreference();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const isLoggedIn = identityStatus === 'logged_in' && !!identity;

  // State
  const [conversations, setConversations] = useState<DecryptedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesState, setMessagesState] = useState<Record<string, ConversationMessagesState>>({});
  const [invites, setInvites] = useState<PublicGroupInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [participantProfiles, setParticipantProfiles] = useState<Record<string, PublicIdentity>>({});
  const signingKeyCache = useRef<Record<string, string>>({});
  const resolvedProfileIds = useRef<Set<string>>(new Set());

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
    },
    [api]
  );

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
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, api, toDecrypted, resolveParticipants]);

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
          let ecdhPrivateKey: Uint8Array | null = null;
          let kemPrivateKey: Uint8Array | null = null;

          const deviceId = getCurrentDeviceId();
          const wrappingKey = getWrappingKey();

          if (!deviceId) {
            console.warn('[Conversations] decrypt: no deviceId available');
          }
          if (!wrappingKey) {
            console.warn('[Conversations] decrypt: no wrappingKey available');
          }

          if (deviceId && wrappingKey) {
            try {
              const storedKeys = await getDeviceKeysForIdentity(identity.id);
              if (storedKeys.length === 0) {
                console.warn('[Conversations] decrypt: no stored device keys for identity', identity.id);
              }
              const myDeviceKeys = storedKeys.find((k) => k.deviceId === deviceId);
              if (!myDeviceKeys) {
                console.warn('[Conversations] decrypt: no stored key matches deviceId', deviceId,
                  'available:', storedKeys.map((k) => k.deviceId));
              } else {
                const decrypted = await decryptDeviceKeys(myDeviceKeys, wrappingKey);
                ecdhPrivateKey = decrypted.ecdhPrivateKey;
                kemPrivateKey = decrypted.kemPrivateKey;
              }
            } catch (err) {
              console.error('[Conversations] decrypt: failed to load device keys:', err);
            }
          }

          const senderIds = [...new Set(resp.data.messages.map((m) => m.fromIdentityId))];
          const missingSenderKeys = senderIds.filter(
            (id) => !signingKeyCache.current[id]
          );
          if (missingSenderKeys.length > 0) {
            await Promise.all(
              missingSenderKeys.map(async (sid) => {
                try {
                  const keysResp = await api.identity.getPublicKeys(sid);
                  if (keysResp.data) {
                    signingKeyCache.current[sid] = keysResp.data.signingPublicKey;
                  } else {
                    console.warn('[Conversations] decrypt: getPublicKeys returned no data for', sid);
                  }
                } catch (err) {
                  console.warn('[Conversations] decrypt: failed to fetch signing key for', sid, err);
                }
              })
            );
          }

          resolveParticipants(senderIds);

          // Cache for decrypted pre-key private keys (avoid redundant
          // IndexedDB lookups when multiple messages use the same SPK).
          const spkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
          const otpkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();

          const newMessages: DisplayMessage[] = await Promise.all(
            resp.data.messages.map(async (m): Promise<DisplayMessage> => {
              if (m.deleted) {
                return { ...m, decryptedContent: undefined, signatureVerified: undefined };
              }

              if (m.messageType === 'system') {
                return { ...m, decryptedContent: undefined, signatureVerified: undefined };
              }

              if (!ecdhPrivateKey || !kemPrivateKey) {
                return { ...m, decryptionError: 'Device keys unavailable' };
              }

              const senderSigningKey = signingKeyCache.current[m.fromIdentityId];
              if (!senderSigningKey) {
                return { ...m, decryptionError: 'Sender signing key unavailable' };
              }

              if (!m.wrappedKeys || m.wrappedKeys.length === 0) {
                return { ...m, decryptionError: 'No wrapped keys on message' };
              }

              const myWrappedKey = m.wrappedKeys.find(
                (wk: SerializedWrappedKey) => wk.identityId === identity.id
              );
              if (!myWrappedKey) {
                return { ...m, decryptionError: `No wrapped key for identity ${identity.id.slice(0, 8)}...` };
              }

              // Resolve pre-key private keys when the message used forward secrecy
              let preKeyPrivateKeys: {
                spkEcdhPrivate?: Uint8Array;
                spkKemPrivate?: Uint8Array;
                otpkEcdhPrivate?: Uint8Array;
                otpkKemPrivate?: Uint8Array;
              } | undefined;

              if (
                (myWrappedKey.preKeyType === 'spk' || myWrappedKey.preKeyType === 'otpk') &&
                myWrappedKey.signedPreKeyId &&
                wrappingKey
              ) {
                try {
                  let spkKeys = spkCache.get(myWrappedKey.signedPreKeyId);
                  if (!spkKeys) {
                    const decryptedSpk = await findAndDecryptSignedPreKey(
                      myWrappedKey.signedPreKeyId,
                      identity.id,
                      wrappingKey
                    );
                    if (decryptedSpk) {
                      spkKeys = { ecdh: decryptedSpk.ecdhPrivateKey, kem: decryptedSpk.kemPrivateKey };
                      spkCache.set(myWrappedKey.signedPreKeyId, spkKeys);
                    }
                  }

                  if (!spkKeys) {
                    return { ...m, decryptionError: `SPK ${myWrappedKey.signedPreKeyId.slice(0, 8)}... not found locally` };
                  }

                  preKeyPrivateKeys = {
                    spkEcdhPrivate: spkKeys.ecdh,
                    spkKemPrivate: spkKeys.kem,
                  };

                  if (myWrappedKey.preKeyType === 'otpk' && myWrappedKey.oneTimePreKeyId) {
                    let otpkKeys = otpkCache.get(myWrappedKey.oneTimePreKeyId);
                    if (!otpkKeys) {
                      const decryptedOtpk = await findAndDecryptOneTimePreKey(
                        myWrappedKey.oneTimePreKeyId,
                        identity.id,
                        wrappingKey
                      );
                      if (decryptedOtpk) {
                        otpkKeys = { ecdh: decryptedOtpk.ecdhPrivateKey, kem: decryptedOtpk.kemPrivateKey };
                        otpkCache.set(myWrappedKey.oneTimePreKeyId, otpkKeys);
                      }
                    }

                    if (otpkKeys) {
                      preKeyPrivateKeys.otpkEcdhPrivate = otpkKeys.ecdh;
                      preKeyPrivateKeys.otpkKemPrivate = otpkKeys.kem;
                    }
                  }
                } catch (err) {
                  console.error('[Conversations] decrypt: pre-key lookup failed for message', m.id, err);
                  return { ...m, decryptionError: `Pre-key lookup failed: ${String(err)}` };
                }
              }

              try {
                const result = decryptMessage(
                  m,
                  identity.id,
                  ecdhPrivateKey,
                  kemPrivateKey,
                  senderSigningKey,
                  preKeyPrivateKeys
                );
                return {
                  ...m,
                  decryptedContent: result.plaintext,
                  signatureVerified: result.verified,
                };
              } catch (err) {
                console.error('[Conversations] decrypt: failed for message', m.id, err);
                return { ...m, decryptionError: String(err) };
              }
            })
          );

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
    [isLoggedIn, identity, api, getCurrentDeviceId, getWrappingKey, resolveParticipants]
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
      if (id) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
        );
        if (!messagesState[id]) {
          fetchMessages(id);
        }
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

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  const fireNotification = useCallback(
    (title: string, body: string, isViewingConvo = false) => {
      toast.info(title, body);

      const snapshot: FocusVisibilitySnapshot = {
        hasFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
      };

      void playNotificationSound({
        enabled: soundPref.enabled,
        soundId: soundPref.soundId,
        customPath: soundPref.customPath,
        suppressWhenFocused: soundPref.suppressWhenFocused,
        isViewingConversation: isViewingConvo,
        snapshot,
        volume: soundPref.volume,
        loadCustomSound: audio?.loadSoundFromPath,
      });

      if (getNativeNotificationsEnabled() && notifications.hasPermission()) {
        notifications.show(title, body, { tag: 'conversation-event' });
      }
    },
    [toast, soundPref, audio, notifications]
  );

  // -------------------------------------------------------------------------
  // WebSocket events (via shared ChatSocket)
  // -------------------------------------------------------------------------

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const fireNotificationRef = useRef(fireNotification);
  fireNotificationRef.current = fireNotification;

  const participantProfilesRef = useRef(participantProfiles);
  participantProfilesRef.current = participantProfiles;

  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isLoggedIn) return;

    const unsubMessage = subscribe((message: ChatIncomingMessage) => {
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

          const profiles = participantProfilesRef.current;
          const creatorProfile = profiles[conv.createdBy];
          const creatorName = creatorProfile?.displayName ?? creatorProfile?.username;
          fireNotificationRef.current(
            tRef.current('conversations.notifications.newConversation', { defaultValue: 'New conversation' }),
            creatorName
              ? tRef.current('conversations.notifications.newConversationBody', { name: creatorName, defaultValue: `${creatorName} started a conversation` })
              : tRef.current('conversations.notifications.newConversationGeneric', { defaultValue: 'Someone started a conversation with you' })
          );
          break;
        }

        case 'conversation_updated': {
          const { conversationId, action } = message.data;
          if (action === 'removed') {
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            setActiveConversationId((prev) =>
              prev === conversationId ? null : prev
            );
          } else {
            fetchConversationsRef.current();
          }
          break;
        }

        case 'conversation_message': {
          const { conversationId, messageId, fromIdentityId } = message.data;
          const activeId = activeConversationIdRef.current;
          const isViewing = conversationId === activeId;

          if (!isViewing) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c
              )
            );
          }

          if (isViewing) {
            fetchMessagesRef.current(conversationId);
          }

          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === conversationId);
            if (idx === -1) return prev;
            const conv = prev[idx]!;
            const updated = { ...conv, lastMessageAt: message.data.createdAt, lastMessageId: messageId };
            const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            return [updated, ...rest];
          });

          const profiles = participantProfilesRef.current;
          const senderProfile = profiles[fromIdentityId];
          const senderName = senderProfile?.displayName ?? senderProfile?.username;
          fireNotificationRef.current(
            tRef.current('conversations.notifications.newMessage', { defaultValue: 'New message' }),
            senderName
              ? tRef.current('conversations.notifications.newMessageBody', { name: senderName, defaultValue: `Message from ${senderName}` })
              : tRef.current('conversations.notifications.newMessageGeneric', { defaultValue: 'You received a new message' }),
            isViewing
          );
          break;
        }

        case 'conversation_message_deleted': {
          const { conversationId, messageId } = message.data;
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
          break;
        }

        case 'group_invite_received': {
          const invite = message.data.invite;
          setInvites((prev) => {
            if (prev.some((i) => i.id === invite.id)) return prev;
            return [invite, ...prev];
          });

          fireNotificationRef.current(
            tRef.current('conversations.notifications.groupInvite', { defaultValue: 'Group invitation' }),
            invite.groupName
              ? tRef.current('conversations.notifications.groupInviteBody', { name: invite.groupName, defaultValue: `You've been invited to ${invite.groupName}` })
              : tRef.current('conversations.notifications.groupInviteGeneric', { defaultValue: 'You\'ve been invited to a group' })
          );
          break;
        }

        case 'group_invite_accepted': {
          fetchConversationsRef.current();
          break;
        }
      }
    });

    const unsubState = onStateChange((state) => {
      if (state === 'connected') {
        refreshRef.current();
      }
    });

    return () => {
      unsubMessage();
      unsubState();
    };
  }, [isLoggedIn, subscribe, onStateChange]);

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
    participantProfiles,
    loading,
    messagesLoading: activeState?.loading ?? false,
    sending,
    setActiveConversation,
    createDM,
    createGroup,
    sendTextMessage,
    loadMoreMessages,
    deleteMessage,
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
