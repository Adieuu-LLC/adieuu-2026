/**
 * Hooks for DM messaging.
 *
 * Provides hooks for sending encrypted DM messages and fetching
 * conversation messages with decryption.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  createApiClient,
  type DmMessage,
  type DmMessageTombstone,
  type DmConversation,
  type ClaimedDevicePreKeys,
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  jsonUtf8ByteLength,
} from '@adieuu/shared';
import { deriveConversationId, verifySignedPreKey, type CryptoProfile, type SignedPreKeyPublic, type OneTimePreKeyPublic, fromBase64 } from '@adieuu/crypto';
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
  type PreKeyRecipientData,
  type PreKeyPrivateKeys,
} from '../services/dmMessageService';
import {
  getStoredDeviceKeys,
  decryptDeviceKeys,
  type DecryptedDeviceKeys,
} from '../services/deviceKeyStorage';
import {
  findAndDecryptSignedPreKey,
  findAndDecryptOneTimePreKey,
  deleteOneTimePreKey,
} from '../services/preKeyStorage';
import {
  getFsMessageContent,
  storeFsMessageContent,
} from '../services/localMessageStorage';
import {
  getCachedParticipant,
  cacheParticipant,
} from '../services/participantCache';
import { encryptLastReadId } from '../services/readStateService';
import {
  maybeGetFsCachedMessage,
  persistFsMessageAndMaybeDeleteOtpk,
} from './useDmMessages.fs-cache';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a message has expired based on its expiresAt field.
 */
function isMessageExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Get the soonest expiration time from a list of messages.
 * Returns null if no messages have expiration times.
 */
function getSoonestExpiration(messages: DecryptedDmMessage[]): number | null {
  const now = Date.now();
  let soonest: number | null = null;

  for (const msg of messages) {
    const expiresAt = msg.raw.expiresAt;
    if (!expiresAt) continue;

    const expiresAtMs = new Date(expiresAt).getTime();
    if (expiresAtMs > now) {
      if (soonest === null || expiresAtMs < soonest) {
        soonest = expiresAtMs;
      }
    }
  }

  return soonest;
}

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
  /** Whether to use forward secrecy (pre-key wrapping) for this message. Defaults to true. */
  forwardSecrecy?: boolean;
}

export interface SendDmMessageResult {
  success: boolean;
  message?: DmMessage;
  error?: string;
}

export interface DecryptedDmMessage {
  /** Original message data */
  raw: DmMessage;
  /** Decrypted content (null if decryption failed or deleted) */
  decrypted: DecryptedMessageContent | null;
  /** Whether this message is a tombstone (deleted for everyone) */
  isDeleted?: boolean;
  /** Decryption error if any (not set for deleted messages) */
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
  /** Decrypt and prepend a single new message (skips duplicates) */
  appendNewMessage: (rawMessage: DmMessage) => Promise<boolean>;
  /** Remove a message from the local list by ID */
  removeMessage: (messageId: string) => void;
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

        const fsEnabled = input.forwardSecrecy ?? true;

        // 2. Get recipient's public keys (all devices) -- needed for static
        // fallback and for devices without pre-keys
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

        // 2c. If FS enabled, claim pre-keys for recipient devices
        let claimedPreKeys: ClaimedDevicePreKeys[] | undefined;
        if (fsEnabled) {
          try {
            const claimResponse = await api.identity.claimPreKeys(input.toIdentityId);
            if (claimResponse.success && claimResponse.data) {
              claimedPreKeys = claimResponse.data.devices;
            } else {
              console.warn('[DM] Pre-key claim returned no data, falling back to static wrapping');
            }
          } catch (err) {
            console.warn('[DM] Failed to claim pre-keys, falling back to static wrapping', err);
          }
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
          deviceId: string;
          publicKeys: RecipientPublicKeys;
          preKeyData?: PreKeyRecipientData;
        }> = [];

        // Add recipient devices -- use pre-key wrapping where available
        const recipientSigningPubKey = recipientKeysResponse.data.signingPublicKey
          ? fromBase64(recipientKeysResponse.data.signingPublicKey)
          : undefined;

        for (const device of recipientKeysResponse.data.devices) {
          if (!device.kemPublicKey) continue;

          let preKeyData: PreKeyRecipientData | undefined;

          if (claimedPreKeys && recipientSigningPubKey) {
            const claimed = claimedPreKeys.find((c) => c.deviceId === device.deviceId);
            if (claimed?.signedPreKey) {
              const spkPublic: SignedPreKeyPublic = {
                keyId: claimed.signedPreKey.keyId,
                ecdhPublicKey: fromBase64(claimed.signedPreKey.ecdhPublicKey),
                kemPublicKey: fromBase64(claimed.signedPreKey.kemPublicKey),
                signature: fromBase64(claimed.signedPreKey.signature),
              };

              if (verifySignedPreKey(spkPublic, recipientSigningPubKey)) {
                preKeyData = {
                  signedPreKey: spkPublic,
                  signedPreKeyId: claimed.signedPreKey.keyId,
                };
                if (claimed.oneTimePreKey) {
                  const otpkPublic: OneTimePreKeyPublic = {
                    keyId: claimed.oneTimePreKey.keyId,
                    ecdhPublicKey: fromBase64(claimed.oneTimePreKey.ecdhPublicKey),
                    kemPublicKey: fromBase64(claimed.oneTimePreKey.kemPublicKey),
                  };
                  preKeyData.oneTimePreKey = otpkPublic;
                  preKeyData.oneTimePreKeyId = claimed.oneTimePreKey.keyId;
                }
              } else {
                console.warn(`[DM] SPK signature verification failed for device ${device.deviceId}, using static wrapping`);
              }
            }
          }

          recipientKeys.push({
            identityId: input.toIdentityId,
            deviceId: device.deviceId,
            publicKeys: {
              ecdh: fromBase64(device.ecdhPublicKey),
              kem: fromBase64(device.kemPublicKey),
              profile: cryptoProfile,
            },
            preKeyData,
          });
        }

        // Add sender devices (always static wrapping -- sender doesn't consume own OTPKs)
        for (const device of senderKeysResponse.data.devices) {
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

        // 8. Send to API (preflight: UTF-8 JSON size must match server router / WAF limit).
        // apps/web and apps/desktop both use this hook via the shared App shell — no separate desktop path.
        const sendPayload = {
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
        };
        const payloadBytes = jsonUtf8ByteLength(sendPayload);
        if (payloadBytes > DEFAULT_MAX_REQUEST_BODY_BYTES) {
          const errMsg = `Message is too large to send (${(payloadBytes / 1024).toFixed(1)} KiB; max ${(DEFAULT_MAX_REQUEST_BODY_BYTES / 1024).toFixed(0)} KiB). Try a shorter message or fewer devices.`;
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        const sendResponse = await api.dm.sendMessage(sendPayload);

        if (!sendResponse.success || !sendResponse.data) {
          const errMsg = sendResponse.error?.message ?? 'Failed to send message';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        // Auto-mark our own sent message as read to prevent false unread indicators
        const sentMessage = sendResponse.data.message;
        if (sentMessage.id) {
          try {
            const encryptedReadState = encryptLastReadId(
              conversation.conversationId,
              sentMessage.id,
              cryptoProfile
            );
            await api.dm.updateReadState(conversation.conversationId, encryptedReadState);
          } catch {
            // Non-critical: failing to update read state doesn't affect the message send
          }
        }

        return { success: true, message: sentMessage };
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
      deviceKeys: DecryptedDeviceKeys,
      wrappingKey: Uint8Array
    ): Promise<DecryptedDmMessage[]> => {
      const results: DecryptedDmMessage[] = [];

      for (const msg of rawMessages) {
        if (isTombstone(msg)) {
          results.push({
            raw: msg as unknown as DmMessage,
            decrypted: null,
            isDeleted: true,
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

          // Look up pre-key private keys if this message uses FS wrapping
          let preKeyPrivateKeys: PreKeyPrivateKeys | undefined;
          const targetWrappedKey = msg.wrappedKeys.find(
            (wk) => wk.identityId === identity!.id && wk.deviceId === deviceKeys.deviceId
          ) ?? msg.wrappedKeys.find(
            (wk) => wk.identityId === identity!.id
          );
          const isFsWrapped = Boolean(
            targetWrappedKey?.preKeyType && targetWrappedKey.preKeyType !== 'static'
          );

          if (isFsWrapped && msg.id) {
            const cached = await maybeGetFsCachedMessage({
              isFsWrapped,
              messageId: msg.id,
              conversationId: msg.conversationId,
              wrappingKey,
              getFsMessageContentFn: getFsMessageContent,
            });
            if (cached) {
              results.push({ raw: msg, decrypted: cached });
              continue;
            }
          }

          if (isFsWrapped) {
            if (!targetWrappedKey) {
              results.push({
                raw: msg,
                decrypted: null,
                decryptionError: 'FS wrapped key not found for this recipient',
              });
              continue;
            }

            if (!targetWrappedKey.signedPreKeyId) {
              results.push({
                raw: msg,
                decrypted: null,
                decryptionError: 'FS message missing signedPreKeyId',
              });
              continue;
            }

            const spkKeys = await findAndDecryptSignedPreKey(
              targetWrappedKey.signedPreKeyId,
              identity!.id,
              wrappingKey
            );

            if (!spkKeys) {
              results.push({
                raw: msg,
                decrypted: null,
                decryptionError: 'SPK private key not found (may have been rotated/deleted)',
              });
              continue;
            }

            preKeyPrivateKeys = {
              spkEcdhPrivateKey: spkKeys.ecdhPrivateKey,
              spkKemPrivateKey: spkKeys.kemPrivateKey,
            };

            if (targetWrappedKey.preKeyType === 'otpk' && targetWrappedKey.oneTimePreKeyId) {
              const otpkKeys = await findAndDecryptOneTimePreKey(
                targetWrappedKey.oneTimePreKeyId,
                identity!.id,
                wrappingKey
              );

              if (otpkKeys) {
                preKeyPrivateKeys.otpkEcdhPrivateKey = otpkKeys.ecdhPrivateKey;
                preKeyPrivateKeys.otpkKemPrivateKey = otpkKeys.kemPrivateKey;
              } else {
                console.warn(`[DM] OTPK ${targetWrappedKey.oneTimePreKeyId} not found, attempting SPK-only decrypt`);
              }
            }
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
            preKeyPrivateKeys,
          });

          if (isFsWrapped && msg.id) {
            await persistFsMessageAndMaybeDeleteOtpk({
              isFsWrapped,
              messageId: msg.id,
              conversationId: msg.conversationId,
              decrypted,
              wrappingKey,
              targetWrappedKey,
              identityId: identity!.id,
              storeFsMessageContentFn: storeFsMessageContent,
              deleteOneTimePreKeyFn: deleteOneTimePreKey,
              logWarn: (message, err) => {
                console.warn(message, err);
              },
            });
          }

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
        const storedKeys = await getStoredDeviceKeys(deviceId, identity.id);
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
          const decrypted = await decryptMessages(response.data.messages, deviceKeys, wrappingKey);

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

  const conversationIdRef = useRef(options.conversationId);
  conversationIdRef.current = options.conversationId;

  const appendNewMessage = useCallback(
    async (rawMessage: DmMessage): Promise<boolean> => {
      if (rawMessage.conversationId !== conversationIdRef.current) {
        console.warn('[DM] appendNewMessage: skipped — message belongs to a different conversation');
        return false;
      }

      if (status !== 'logged_in' || !identity) {
        console.warn('[DM] appendNewMessage: skipped — not logged in or no identity');
        return false;
      }

      const wrappingKey = getWrappingKey();
      const deviceId = getCurrentDeviceId();
      if (!wrappingKey || !deviceId) {
        console.warn('[DM] appendNewMessage: skipped — wrapping key or device ID unavailable');
        return false;
      }

      try {
        const storedKeys = await getStoredDeviceKeys(deviceId, identity.id);
        if (!storedKeys) {
          console.warn('[DM] appendNewMessage: skipped — device keys not found in storage');
          return false;
        }
        const deviceKeys = await decryptDeviceKeys(storedKeys, wrappingKey);

        const [decrypted] = await decryptMessages([rawMessage], deviceKeys, wrappingKey);
        if (decrypted) {
          setMessages((prev) => {
            if (prev.some((m) => m.raw.id === rawMessage.id)) return prev;
            return [decrypted, ...prev];
          });
          return true;
        }
        console.warn('[DM] appendNewMessage: decryptMessages returned no result');
        return false;
      } catch (err) {
        console.warn('[DM] appendNewMessage: decryption failed', err);
        return false;
      }
    },
    [status, identity, getWrappingKey, getCurrentDeviceId, decryptMessages]
  );

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.raw.id !== messageId));
  }, []);

  // Auto-fetch on mount when immediate is true
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (options.immediate && !hasFetchedRef.current && status === 'logged_in' && identity) {
      hasFetchedRef.current = true;
      fetchMessages(null, false);
    }
  }, [options.immediate, status, identity, fetchMessages]);

  // Clear state and reset hasFetched when conversation changes
  useEffect(() => {
    hasFetchedRef.current = false;
    setMessages([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
  }, [options.conversationId]);

  // Filter out expired messages and track expiration tick
  const [expirationTick, setExpirationTick] = useState(0);

  const visibleMessages = useMemo(() => {
    // Re-filter when expirationTick changes (triggered by timer)
    void expirationTick;
    return messages.filter((msg) => !isMessageExpired(msg.raw.expiresAt));
  }, [messages, expirationTick]);

  // Set up timer to trigger re-render when soonest message expires
  useEffect(() => {
    const soonestExpiration = getSoonestExpiration(visibleMessages);
    if (!soonestExpiration) return;

    const timeUntilExpiration = soonestExpiration - Date.now();
    if (timeUntilExpiration <= 0) {
      // Already expired, trigger immediate re-filter
      setExpirationTick((t) => t + 1);
      return;
    }

    // Add small buffer (100ms) to ensure the message is definitely expired
    const timerId = setTimeout(() => {
      setExpirationTick((t) => t + 1);
    }, timeUntilExpiration + 100);

    return () => clearTimeout(timerId);
  }, [visibleMessages]);

  return { messages: visibleMessages, isLoading, error, hasMore, fetchMore, refresh, appendNewMessage, removeMessage };
}

/**
 * Utility to derive conversation ID on the client.
 * Re-exported for convenience.
 */
export { deriveConversationId };
