/**
 * Hooks for DM messaging.
 *
 * Provides hooks for sending encrypted DM messages and fetching
 * conversation messages with decryption.
 */

import { useState, useCallback, useMemo } from 'react';
import { createApiClient, type DmMessage, type DmMessageTombstone, type DmConversation } from '@adieuu/shared';
import { deriveConversationId, type CryptoProfile, fromBase64 } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  encryptDmMessage,
  decryptDmMessage,
  generateClientMessageId,
  encryptSenderId,
  decryptSenderHint,
  type DecryptedMessageContent,
  type RecipientPublicKeys,
} from '../services/dmMessageService';
import {
  getStoredDeviceKeys,
  decryptDeviceKeys,
  type DecryptedDeviceKeys,
} from '../services/deviceKeyStorage';
import {
  getCachedParticipant,
  cacheParticipant,
} from '../services/participantCache';

// ============================================================================
// Types
// ============================================================================

export interface SendDmMessageInput {
  /** Recipient's identity ID */
  toIdentityId: string;
  /** Message text */
  text: string;
  /** Optional message expiry in seconds */
  expiresInSeconds?: number;
  /** Optional reply to message ID */
  replyToId?: string;
}

export interface SendDmMessageResult {
  success: boolean;
  message?: DmMessage;
  error?: string;
}

export interface DecryptedDmMessage {
  /** Original message data */
  raw: DmMessage;
  /** Decrypted content (null if decryption failed) */
  decrypted: DecryptedMessageContent | null;
  /** Decryption error if any */
  decryptionError?: string;
}

export interface UseSendDmMessageResult {
  /** Send a message */
  sendMessage: (input: SendDmMessageInput) => Promise<SendDmMessageResult>;
  /** Whether currently sending */
  isSending: boolean;
  /** Last error */
  error: string | null;
}

export interface UseDmConversationResult {
  /** Get or create a conversation with an identity */
  getOrCreateConversation: (toIdentityId: string) => Promise<{
    success: boolean;
    conversation?: DmConversation;
    error?: string;
  }>;
  /** Get a conversation by ID */
  getConversation: (conversationId: string) => Promise<{
    success: boolean;
    conversation?: DmConversation;
    error?: string;
  }>;
  /** Whether loading */
  isLoading: boolean;
  /** Last error */
  error: string | null;
}

export interface UseDmMessagesOptions {
  /** Conversation ID */
  conversationId: string;
  /** Number of messages to fetch per page */
  limit?: number;
  /** Whether to fetch immediately */
  immediate?: boolean;
}

export interface UseDmMessagesResult {
  /** Decrypted messages */
  messages: DecryptedDmMessage[];
  /** Whether loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether there are more messages to load */
  hasMore: boolean;
  /** Fetch the next page of messages */
  fetchMore: () => Promise<void>;
  /** Refresh messages from the beginning */
  refresh: () => Promise<void>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for sending encrypted DM messages.
 */
export function useSendDmMessage(): UseSendDmMessageResult {
  const { apiBaseUrl } = useAppConfig();
  const {
    status,
    identity,
    getSigningKey,
    getCurrentDeviceId,
    getWrappingKey,
  } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (input: SendDmMessageInput): Promise<SendDmMessageResult> => {
      if (status !== 'logged_in' || !identity) {
        return { success: false, error: 'Not logged in' };
      }

      const signingKey = getSigningKey();
      if (!signingKey) {
        return { success: false, error: 'Signing key not available' };
      }

      const deviceId = getCurrentDeviceId();
      if (!deviceId) {
        return { success: false, error: 'Device ID not available' };
      }

      const wrappingKey = getWrappingKey();
      if (!wrappingKey) {
        return { success: false, error: 'Session not unlocked' };
      }

      setIsSending(true);
      setError(null);

      try {
        // 1. Get or create conversation
        const convResponse = await api.dm.getOrCreateConversation(input.toIdentityId);
        if (!convResponse.success || !convResponse.data) {
          const errMsg = convResponse.error?.message ?? 'Failed to get conversation';
          setError(errMsg);
          return { success: false, error: errMsg };
        }
        const conversation = convResponse.data.conversation;
        const cryptoProfile = conversation.activeCryptoProfile as CryptoProfile;

        // 2. Get recipient's public keys (all devices)
        const recipientKeysResponse = await api.identity.getPublicKeys(input.toIdentityId);
        if (!recipientKeysResponse.success || !recipientKeysResponse.data) {
          const errMsg = recipientKeysResponse.error?.message ?? 'Failed to get recipient keys';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        // 2b. Cache participant info for conversation list display
        if (recipientKeysResponse.data.signingPublicKey) {
          await cacheParticipant({
            conversationId: conversation.conversationId,
            otherIdentityId: input.toIdentityId,
            signingPublicKey: recipientKeysResponse.data.signingPublicKey,
            cachedAt: Date.now(),
            myIdentityId: identity.id,
          });
        }

        // 3. Get sender's own device keys for encryption (so sender can read own messages)
        const senderKeysResponse = await api.identity.getPublicKeys(identity.id);
        if (!senderKeysResponse.success || !senderKeysResponse.data) {
          const errMsg = senderKeysResponse.error?.message ?? 'Failed to get own keys';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        // 4. Build recipient keys list (all recipient devices + all sender devices)
        const recipientKeys: Array<{
          identityId: string;
          deviceId?: string;
          publicKeys: RecipientPublicKeys;
        }> = [];

        // Add recipient devices
        for (const device of recipientKeysResponse.data.devices) {
          // Skip devices without KEM key (old devices not supporting E2E)
          if (!device.kemPublicKey) continue;

          recipientKeys.push({
            identityId: input.toIdentityId,
            deviceId: device.deviceId,
            publicKeys: {
              ecdh: fromBase64(device.ecdhPublicKey),
              kem: fromBase64(device.kemPublicKey),
              profile: cryptoProfile,
            },
          });
        }

        // Add sender devices (for multi-device read)
        for (const device of senderKeysResponse.data.devices) {
          // Skip devices without KEM key (old devices not supporting E2E)
          if (!device.kemPublicKey) continue;

          recipientKeys.push({
            identityId: identity.id,
            deviceId: device.deviceId,
            publicKeys: {
              ecdh: fromBase64(device.ecdhPublicKey),
              kem: fromBase64(device.kemPublicKey),
              profile: cryptoProfile,
            },
          });
        }

        // 5. Generate client message ID (needed for sender hint nonce)
        const clientMessageId = generateClientMessageId();

        // 6. Encrypt the message
        const encrypted = encryptDmMessage({
          text: input.text,
          fromIdentityId: identity.id,
          fromDeviceId: deviceId,
          recipientKeys,
          signingPrivateKey: signingKey,
          cryptoProfile,
        });

        // 7. Encrypt sender ID for pre-verification discovery
        const encryptedSenderIdValue = encryptSenderId(
          conversation.conversationId,
          identity.id,
          clientMessageId,
          cryptoProfile
        );

        // 8. Send to API
        const sendResponse = await api.dm.sendMessage({
          conversationId: conversation.conversationId,
          toIdentityId: input.toIdentityId,
          encryptedSenderId: encryptedSenderIdValue,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientMessageId,
          expiresInSeconds: input.expiresInSeconds,
          replyToId: input.replyToId,
        });

        if (!sendResponse.success || !sendResponse.data) {
          const errMsg = sendResponse.error?.message ?? 'Failed to send message';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        return { success: true, message: sendResponse.data.message };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsSending(false);
      }
    },
    [api, status, identity, getSigningKey, getCurrentDeviceId, getWrappingKey]
  );

  return { sendMessage, isSending, error };
}

/**
 * Hook for managing DM conversations.
 */
export function useDmConversation(): UseDmConversationResult {
  const { apiBaseUrl } = useAppConfig();
  const { status } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getOrCreateConversation = useCallback(
    async (toIdentityId: string) => {
      if (status !== 'logged_in') {
        return { success: false, error: 'Not logged in' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await api.dm.getOrCreateConversation(toIdentityId);
        if (!response.success || !response.data) {
          const errMsg = response.error?.message ?? 'Failed to get conversation';
          setError(errMsg);
          return { success: false, error: errMsg };
        }
        return { success: true, conversation: response.data.conversation };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to get conversation';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [api, status]
  );

  const getConversation = useCallback(
    async (conversationId: string) => {
      if (status !== 'logged_in') {
        return { success: false, error: 'Not logged in' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await api.dm.getConversation(conversationId);
        if (!response.success || !response.data) {
          const errMsg = response.error?.message ?? 'Failed to get conversation';
          setError(errMsg);
          return { success: false, error: errMsg };
        }
        return { success: true, conversation: response.data.conversation };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to get conversation';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [api, status]
  );

  return { getOrCreateConversation, getConversation, isLoading, error };
}

/**
 * Helper to check if a message is a tombstone (deleted).
 */
function isTombstone(msg: DmMessage | DmMessageTombstone): msg is DmMessageTombstone {
  return 'deleted' in msg && msg.deleted === true;
}

/**
 * Hook for fetching and decrypting DM messages.
 */
export function useDmMessages(options: UseDmMessagesOptions): UseDmMessagesResult {
  const { apiBaseUrl } = useAppConfig();
  const {
    status,
    identity,
    getWrappingKey,
    getCurrentDeviceId,
  } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [messages, setMessages] = useState<DecryptedDmMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const decryptMessages = useCallback(
    async (
      rawMessages: (DmMessage | DmMessageTombstone)[],
      deviceKeys: DecryptedDeviceKeys
    ): Promise<DecryptedDmMessage[]> => {
      const results: DecryptedDmMessage[] = [];

      for (const msg of rawMessages) {
        if (isTombstone(msg)) {
          results.push({
            raw: msg as unknown as DmMessage,
            decrypted: null,
            decryptionError: 'Message deleted',
          });
          continue;
        }

        try {
          let senderId: string;
          let senderSigningPublicKey: string | undefined;

          // Determine the sender
          if (msg.toIdentityId === identity!.id) {
            // This is a received message - decrypt the sender hint
            try {
              senderId = decryptSenderHint(
                msg.conversationId,
                msg.encryptedSenderId,
                msg.clientMessageId,
                msg.cryptoProfile
              );
            } catch {
              results.push({
                raw: msg,
                decrypted: null,
                decryptionError: 'Failed to decrypt sender hint',
              });
              continue;
            }

            // Try to get signing key from cache first
            const cached = await getCachedParticipant(identity!.id, msg.conversationId);
            if (cached && cached.otherIdentityId === senderId) {
              senderSigningPublicKey = cached.signingPublicKey;
            } else {
              // Fetch from API and cache
              const senderKeysResponse = await api.identity.getPublicKeys(senderId);
              if (senderKeysResponse.success && senderKeysResponse.data) {
                senderSigningPublicKey = senderKeysResponse.data.signingPublicKey;

                // Cache the participant info
                await cacheParticipant({
                  conversationId: msg.conversationId,
                  otherIdentityId: senderId,
                  signingPublicKey: senderSigningPublicKey,
                  cachedAt: Date.now(),
                  myIdentityId: identity!.id,
                });
              }
            }
          } else {
            // This is a sent message - we are the sender
            senderId = identity!.id;
            const senderKeysResponse = await api.identity.getPublicKeys(identity!.id);
            if (senderKeysResponse.success && senderKeysResponse.data) {
              senderSigningPublicKey = senderKeysResponse.data.signingPublicKey;
            }
          }

          if (!senderSigningPublicKey) {
            results.push({
              raw: msg,
              decrypted: null,
              decryptionError: 'Could not fetch sender signing key',
            });
            continue;
          }

          const decrypted = decryptDmMessage({
            ciphertext: msg.ciphertext,
            nonce: msg.nonce,
            wrappedKeys: msg.wrappedKeys,
            signature: msg.signature,
            recipientIdentityId: identity!.id,
            recipientDeviceId: deviceKeys.deviceId,
            ecdhPrivateKey: deviceKeys.ecdhPrivateKey,
            kemPrivateKey: deviceKeys.kemPrivateKey,
            senderSigningPublicKey,
            cryptoProfile: msg.cryptoProfile,
          });

          results.push({ raw: msg, decrypted });
        } catch (err) {
          results.push({
            raw: msg,
            decrypted: null,
            decryptionError: err instanceof Error ? err.message : 'Decryption failed',
          });
        }
      }

      return results;
    },
    [api, identity]
  );

  const fetchMessages = useCallback(
    async (fromCursor: string | null, append: boolean) => {
      if (status !== 'logged_in' || !identity) {
        return;
      }

      const wrappingKey = getWrappingKey();
      const deviceId = getCurrentDeviceId();
      if (!wrappingKey || !deviceId) {
        setError('Session not unlocked');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get device keys for decryption
        const storedKeys = await getStoredDeviceKeys(deviceId);
        if (!storedKeys) {
          setError('Device keys not found');
          return;
        }
        const deviceKeys = await decryptDeviceKeys(storedKeys, wrappingKey);

        try {
          // Fetch messages from API
          const response = await api.dm.getMessages(options.conversationId, {
            limit: options.limit ?? 50,
            cursor: fromCursor ?? undefined,
          });

          if (!response.success || !response.data) {
            setError(response.error?.message ?? 'Failed to fetch messages');
            return;
          }

          // Decrypt messages
          const decrypted = await decryptMessages(response.data.messages, deviceKeys);

          if (append) {
            setMessages((prev) => [...prev, ...decrypted]);
          } else {
            setMessages(decrypted);
          }

          setCursor(response.data.cursor);
          setHasMore(response.data.hasMore);
        } finally {
          // Clear device keys from memory after use
          // Note: In a production app, we might want to cache these for the session
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      } finally {
        setIsLoading(false);
      }
    },
    [
      api,
      status,
      identity,
      getWrappingKey,
      getCurrentDeviceId,
      options.conversationId,
      options.limit,
      decryptMessages,
    ]
  );

  const refresh = useCallback(async () => {
    setCursor(null);
    setHasMore(true);
    await fetchMessages(null, false);
  }, [fetchMessages]);

  const fetchMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    await fetchMessages(cursor, true);
  }, [cursor, hasMore, isLoading, fetchMessages]);

  // Removed auto-fetch on mount since it causes issues with React StrictMode
  // Users should call refresh() explicitly when they want to load messages

  return { messages, isLoading, error, hasMore, fetchMore, refresh };
}

/**
 * Utility to derive conversation ID on the client.
 * Re-exported for convenience.
 */
export { deriveConversationId };
