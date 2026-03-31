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
  type GroupInvitePreview,
  type PublicIdentity,
  type ChatIncomingMessage,
  type SendMessageParams,
  type ClaimedDevicePreKeys,
  type SerializedWrappedKey,
  type FormerMember,
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
  forwardSecrecy?: boolean;
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
    options?: { expiresInSeconds?: number; useForwardSecrecy?: boolean }
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
  leaveGroup: (
    conversationId: string,
    options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
  ) => Promise<boolean>;
  renameGroup: (conversationId: string, newName: string) => Promise<boolean>;
  promoteToAdmin: (conversationId: string, identityId: string) => Promise<boolean>;
  terminateGroup: (conversationId: string) => Promise<boolean>;

  // Invites
  acceptInvite: (inviteId: string) => Promise<boolean>;
  declineInvite: (inviteId: string) => Promise<boolean>;
  getInvitePreview: (inviteId: string) => Promise<GroupInvitePreview | null>;

  // Former members
  getFormerMembers: (conversationId: string) => Promise<FormerMember[]>;

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
   *
   * When `useForwardSecrecy` is false, pre-key claiming is skipped entirely
   * and all devices use static key wrapping. E2EE is still maintained.
   */
  const fetchRecipientKeys = useCallback(
    async (participantIds: string[], useForwardSecrecy = true): Promise<RecipientKeys[]> => {
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
    async (conversationId: string, cursor?: string, silent?: boolean) => {
      if (!isLoggedIn || !identity) return;

      if (!silent) {
        setMessagesState((prev) => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] ?? { messages: [], cursor: null, loading: true }),
            loading: true,
          },
        }));
      }

      try {
        const resp = await api.conversations.getMessages(conversationId, 50, cursor);
        if (resp.data) {
          let ecdhPrivateKey: Uint8Array | null = null;
          let kemPrivateKey: Uint8Array | null = null;
          let myRoutingTag: string | undefined;

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
                myRoutingTag = decrypted.routingTag;
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

              // ---- Three-tier wrapped key routing ----
              // All candidate wrapped keys for this identity
              const candidates = m.wrappedKeys.filter(
                (wk: SerializedWrappedKey) => wk.identityId === identity.id
              );
              if (candidates.length === 0) {
                return { ...m, decryptionError: `No wrapped key for identity ${identity.id.slice(0, 8)}...` };
              }

              // Resolve the correct wrapped key for THIS device:
              //   1. FS messages: match by signedPreKeyId (SPK exists locally)
              //   2. Static messages with routingTag: match by tag
              //   3. Fallback: try each candidate via trial decryption
              let resolvedWrappedKey: SerializedWrappedKey | undefined;
              let preKeyPrivateKeys: {
                spkEcdhPrivate?: Uint8Array;
                spkKemPrivate?: Uint8Array;
                otpkEcdhPrivate?: Uint8Array;
                otpkKemPrivate?: Uint8Array;
              } | undefined;

              // Tier 1: FS messages — match by SPK presence
              const fsCandidates = candidates.filter(
                (wk) => (wk.preKeyType === 'spk' || wk.preKeyType === 'otpk') && wk.signedPreKeyId
              );
              if (fsCandidates.length > 0 && wrappingKey) {
                for (const candidate of fsCandidates) {
                  try {
                    let spkKeys = spkCache.get(candidate.signedPreKeyId!);
                    if (!spkKeys) {
                      const decryptedSpk = await findAndDecryptSignedPreKey(
                        candidate.signedPreKeyId!,
                        identity.id,
                        wrappingKey
                      );
                      if (decryptedSpk) {
                        spkKeys = { ecdh: decryptedSpk.ecdhPrivateKey, kem: decryptedSpk.kemPrivateKey };
                        spkCache.set(candidate.signedPreKeyId!, spkKeys);
                      }
                    }

                    if (spkKeys) {
                      resolvedWrappedKey = candidate;
                      preKeyPrivateKeys = {
                        spkEcdhPrivate: spkKeys.ecdh,
                        spkKemPrivate: spkKeys.kem,
                      };

                      if (candidate.preKeyType === 'otpk' && candidate.oneTimePreKeyId) {
                        let otpkKeys = otpkCache.get(candidate.oneTimePreKeyId);
                        if (!otpkKeys) {
                          const decryptedOtpk = await findAndDecryptOneTimePreKey(
                            candidate.oneTimePreKeyId,
                            identity.id,
                            wrappingKey
                          );
                          if (decryptedOtpk) {
                            otpkKeys = { ecdh: decryptedOtpk.ecdhPrivateKey, kem: decryptedOtpk.kemPrivateKey };
                            otpkCache.set(candidate.oneTimePreKeyId, otpkKeys);
                          }
                        }
                        if (otpkKeys) {
                          preKeyPrivateKeys.otpkEcdhPrivate = otpkKeys.ecdh;
                          preKeyPrivateKeys.otpkKemPrivate = otpkKeys.kem;
                        }
                      }
                      break;
                    }
                  } catch (err) {
                    console.warn('[Conversations] decrypt: SPK lookup failed for candidate', candidate.signedPreKeyId, err);
                  }
                }
              }

              // Tier 2: Static messages — match by routing tag
              if (!resolvedWrappedKey && myRoutingTag) {
                const staticCandidates = candidates.filter(
                  (wk) => wk.preKeyType === 'static' && wk.routingTag
                );
                const tagMatch = staticCandidates.find((wk) => wk.routingTag === myRoutingTag);
                if (tagMatch) {
                  resolvedWrappedKey = tagMatch;
                }
              }

              // Tier 3: Fallback — try each remaining candidate via trial decryption
              if (!resolvedWrappedKey) {
                for (const candidate of candidates) {
                  if (candidate.preKeyType !== 'static') continue;
                  try {
                    const result = decryptMessage(
                      m,
                      identity.id,
                      ecdhPrivateKey,
                      kemPrivateKey,
                      senderSigningKey,
                      undefined,
                      candidate
                    );
                    return {
                      ...m,
                      decryptedContent: result.plaintext,
                      signatureVerified: result.verified,
                      forwardSecrecy: false,
                    };
                  } catch {
                    // Wrong device's wrapped key — try next candidate
                  }
                }

                // No candidate worked
                const fsAttempted = fsCandidates.length > 0;
                const spkIds = fsCandidates.map((c) => c.signedPreKeyId?.slice(0, 8)).join(', ');
                return {
                  ...m,
                  decryptionError: fsAttempted
                    ? `SPK ${spkIds}... not found locally`
                    : 'No matching wrapped key for this device',
                };
              }

              try {
                const result = decryptMessage(
                  m,
                  identity.id,
                  ecdhPrivateKey,
                  kemPrivateKey,
                  senderSigningKey,
                  preKeyPrivateKeys,
                  resolvedWrappedKey
                );
                return {
                  ...m,
                  decryptedContent: result.plaintext,
                  signatureVerified: result.verified,
                  forwardSecrecy: resolvedWrappedKey.preKeyType !== 'static',
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

          if (conversationId === activeConversationIdRef.current) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
              )
            );
          }
        }
    } catch (err) {
      console.error('[useConversations] fetchMessages failed', { conversationId, cursor }, err);
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
        let hadUnread = false;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === id) {
              hadUnread = c.unreadCount > 0;
              return { ...c, unreadCount: 0 };
            }
            return c;
          })
        );
        if (!messagesState[id] || hadUnread) {
          fetchMessages(id, undefined, true);
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
      options?: { expiresInSeconds?: number; useForwardSecrecy?: boolean }
    ): Promise<PublicMessage | null> => {
      if (!isLoggedIn || !identity) return null;

      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return null;

      const useFs = options?.useForwardSecrecy ?? true;
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
        };

        const resp = await api.conversations.sendMessage(conversationId, params);

        if (resp.data) {
          const displayMsg: DisplayMessage = {
            ...resp.data,
            decryptedContent: plaintext,
            signatureVerified: true,
            forwardSecrecy: useFs,
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
    async (
      conversationId: string,
      options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
    ): Promise<boolean> => {
      try {
        const resp = await api.conversations.leave(conversationId, options);
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

  const promoteToAdmin = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.promoteToAdmin(conversationId, identityId);
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

  const terminateGroup = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.terminateGroup(conversationId);
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

  const resolveParticipantsRef = useRef(resolveParticipants);
  resolveParticipantsRef.current = resolveParticipants;

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

          void resolveParticipantsRef.current(conv.participants).then((freshProfiles) => {
            const profiles = { ...participantProfilesRef.current, ...freshProfiles };
            const creatorProfile = profiles[conv.createdBy];
            const creatorName = creatorProfile?.displayName ?? creatorProfile?.username;
            fireNotificationRef.current(
              tRef.current('conversations.notifications.newConversation', { defaultValue: 'New conversation' }),
              creatorName
                ? tRef.current('conversations.notifications.newConversationBody', { name: creatorName, defaultValue: `${creatorName} started a conversation` })
                : tRef.current('conversations.notifications.newConversationGeneric', { defaultValue: 'Someone started a conversation with you' })
            );
          });
          break;
        }

        case 'conversation_updated': {
          const { conversationId, action, identityId: eventIdentityId } = message.data;
          if (action === 'removed') {
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            setActiveConversationId((prev) =>
              prev === conversationId ? null : prev
            );

            fireNotificationRef.current(
              tRef.current('conversations.notifications.youWereRemoved', { defaultValue: 'Removed from group' }),
              tRef.current('conversations.notifications.youWereRemovedBody', { defaultValue: 'You were removed from a group conversation' })
            );
          } else {
            fetchConversationsRef.current();

            if (conversationId === activeConversationIdRef.current) {
              fetchMessagesRef.current(conversationId, undefined, true);
            }
          }

          if (action === 'member_added' && eventIdentityId) {
            void resolveParticipantsRef.current([eventIdentityId]).then((freshProfiles) => {
              const profiles = { ...participantProfilesRef.current, ...freshProfiles };
              const profile = profiles[eventIdentityId];
              const name = profile?.displayName ?? profile?.username;
              fireNotificationRef.current(
                tRef.current('conversations.notifications.memberAdded', { defaultValue: 'Member added' }),
                name
                  ? tRef.current('conversations.notifications.memberAddedBody', { name, defaultValue: `${name} was added to the group` })
                  : tRef.current('conversations.notifications.memberAddedGeneric', { defaultValue: 'A new member was added to the group' })
              );
            });
          } else if (action === 'member_left' && eventIdentityId) {
            const profiles = participantProfilesRef.current;
            const profile = profiles[eventIdentityId];
            const name = profile?.displayName ?? profile?.username;
            fireNotificationRef.current(
              tRef.current('conversations.notifications.memberLeft', { defaultValue: 'Member left' }),
              name
                ? tRef.current('conversations.notifications.memberLeftBody', { name, defaultValue: `${name} left the group` })
                : tRef.current('conversations.notifications.memberLeftGeneric', { defaultValue: 'A member left the group' })
            );
          } else if (action === 'member_removed' && eventIdentityId) {
            const profiles = participantProfilesRef.current;
            const profile = profiles[eventIdentityId];
            const name = profile?.displayName ?? profile?.username;
            fireNotificationRef.current(
              tRef.current('conversations.notifications.memberRemoved', { defaultValue: 'Member removed' }),
              name
                ? tRef.current('conversations.notifications.memberRemovedBody', { name, defaultValue: `${name} was removed from the group` })
                : tRef.current('conversations.notifications.memberRemovedGeneric', { defaultValue: 'A member was removed from the group' })
            );
          } else if (action === 'renamed') {
            fireNotificationRef.current(
              tRef.current('conversations.notifications.groupRenamed', { defaultValue: 'Group renamed' }),
              tRef.current('conversations.notifications.groupRenamedBody', { defaultValue: 'The group name was updated' })
            );
          } else if (action === 'admin_promoted' && eventIdentityId) {
            const profiles = participantProfilesRef.current;
            const profile = profiles[eventIdentityId];
            const name = profile?.displayName ?? profile?.username;
            fireNotificationRef.current(
              tRef.current('conversations.notifications.adminPromoted', { defaultValue: 'New admin' }),
              name
                ? tRef.current('conversations.notifications.adminPromotedBody', { name, defaultValue: `${name} was promoted to admin` })
                : tRef.current('conversations.notifications.adminPromotedGeneric', { defaultValue: 'A member was promoted to admin' })
            );
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
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
              )
            );
            fetchMessagesRef.current(conversationId, undefined, true);
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

          void resolveParticipantsRef.current([invite.invitedByIdentityId]);

          void resolveParticipantsRef.current([invite.invitedByIdentityId]).then((freshProfiles) => {
            const profiles = { ...participantProfilesRef.current, ...freshProfiles };
            const inviterProfile = profiles[invite.invitedByIdentityId];
            const inviterDisplayName = inviterProfile?.displayName ?? inviterProfile?.username;
            const othersCount = invite.memberCount - 1;
            const body = invite.hasGroupName
              ? tRef.current('conversations.notifications.groupInviteNameHidden', { defaultValue: "You've been invited to a group (name hidden until you join)" })
              : inviterDisplayName
                ? (othersCount > 0
                  ? tRef.current('conversations.notifications.groupInviteFromBody', {
                      name: inviterDisplayName,
                      count: othersCount,
                      defaultValue: `${inviterDisplayName} + ${othersCount} others invited you`,
                    })
                  : tRef.current('conversations.notifications.groupInviteFromSolo', {
                      name: inviterDisplayName,
                      defaultValue: `${inviterDisplayName} is inviting you`,
                    }))
                : tRef.current('conversations.notifications.groupInviteGeneric', { defaultValue: "You've been invited to a group" });
            fireNotificationRef.current(
              tRef.current('conversations.notifications.groupInvite', { defaultValue: 'Group invitation' }),
              body
            );
          });
          break;
        }

        case 'group_invite_accepted': {
          fetchConversationsRef.current();
          const joinerName = message.data.displayName ?? message.data.username;
          fireNotificationRef.current(
            tRef.current('conversations.notifications.memberJoined', { defaultValue: 'Member joined' }),
            joinerName
              ? tRef.current('conversations.notifications.memberJoinedBody', { name: joinerName, defaultValue: `${joinerName} joined the group` })
              : tRef.current('conversations.notifications.memberJoinedGeneric', { defaultValue: 'A new member joined the group' })
          );
          break;
        }

        case 'group_terminated': {
          const { conversationId, terminatedBy } = message.data;
          setConversations((prev) => prev.filter((c) => c.id !== conversationId));
          setActiveConversationId((prev) =>
            prev === conversationId ? null : prev
          );

          const adminName = terminatedBy.displayName ?? terminatedBy.username ?? terminatedBy.id.slice(0, 8);
          fireNotificationRef.current(
            tRef.current('conversations.notifications.groupTerminated', { defaultValue: 'Group deleted' }),
            tRef.current('conversations.notifications.groupTerminatedBody', {
              name: adminName,
              defaultValue: `${adminName} deleted the group`,
            })
          );
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

  // Clear state on definitive logout (isLoggedIn going true -> false).
  const wasLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn && wasLoggedInRef.current) {
      setConversations([]);
      setMessagesState({});
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
    promoteToAdmin,
    terminateGroup,
    acceptInvite,
    declineInvite,
    getInvitePreview,
    getFormerMembers,
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
