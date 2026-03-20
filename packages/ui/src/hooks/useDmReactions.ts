/**
 * Hook for DM reactions.
 *
 * Provides functionality for adding and removing encrypted reactions
 * on DM messages, and fetching/decrypting reactions for display.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  createApiClient,
  type DmReaction,
} from '@adieuu/shared';
import {
  type CryptoProfile,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
  fromBase64,
  verifySignedPreKey,
} from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  encryptReaction,
  decryptReaction,
  generateClientReactionId,
  type DecryptedReactionContent,
} from '../services/dmReactionService';
import type {
  RecipientPublicKeys,
  PreKeyRecipientData,
} from '../services/dmMessageService';
import {
  getStoredDeviceKeys,
  decryptDeviceKeys,
} from '../services/deviceKeyStorage';
import {
  getCachedParticipant,
} from '../services/participantCache';

// ============================================================================
// Types
// ============================================================================

export interface DecryptedDmReaction {
  raw: DmReaction;
  decrypted: DecryptedReactionContent | null;
  decryptionError?: string;
}

export interface GroupedReaction {
  emoji: string;
  count: number;
  reactorIds: string[];
  reactionIds: string[];
  includesMe: boolean;
}

interface AddReactionInput {
  messageId: string;
  conversationId: string;
  toIdentityId: string;
  emoji: string;
}

interface AddReactionResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Hook: useDmReactions
// ============================================================================

export function useDmReactions() {
  const { apiBaseUrl } = useAppConfig();
  const {
    status,
    identity,
    getSigningKey,
    getCurrentDeviceId,
    getWrappingKey,
  } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch and decrypt reactions for a batch of message IDs.
   */
  const fetchReactions = useCallback(
    async (
      conversationId: string,
      messageIds: string[]
    ): Promise<DecryptedDmReaction[]> => {
      if (status !== 'logged_in' || !identity || messageIds.length === 0) {
        return [];
      }

      const wrappingKey = getWrappingKey();
      if (!wrappingKey) return [];

      const response = await api.dmReactions.getReactions(conversationId, messageIds);
      if (!response.success || !response.data) return [];

      const deviceId = getCurrentDeviceId();
      if (!deviceId) return [];

      const storedKeys = await getStoredDeviceKeys(deviceId, identity.id);
      if (!storedKeys) return [];

      let deviceKeys;
      try {
        deviceKeys = await decryptDeviceKeys(storedKeys, wrappingKey);
      } catch {
        return [];
      }

      const results: DecryptedDmReaction[] = [];

      for (const reaction of response.data.reactions) {
        try {
          const senderSigningPublicKey = await resolveSenderSigningKey(
            api,
            reaction,
            identity.id,
            conversationId
          );

          if (!senderSigningPublicKey) {
            results.push({
              raw: reaction,
              decrypted: null,
              decryptionError: 'Could not resolve sender signing key',
            });
            continue;
          }

          const decrypted = decryptReaction({
            ciphertext: reaction.ciphertext,
            nonce: reaction.nonce,
            wrappedKeys: reaction.wrappedKeys,
            signature: reaction.signature,
            recipientIdentityId: identity.id,
            recipientDeviceId: getCurrentDeviceId() ?? undefined,
            ecdhPrivateKey: deviceKeys.ecdhPrivateKey,
            kemPrivateKey: deviceKeys.kemPrivateKey,
            senderSigningPublicKey,
            cryptoProfile: reaction.cryptoProfile as CryptoProfile,
          });

          results.push({ raw: reaction, decrypted });
        } catch (err) {
          results.push({
            raw: reaction,
            decrypted: null,
            decryptionError: err instanceof Error ? err.message : 'Decryption failed',
          });
        }
      }

      return results;
    },
    [api, status, identity, getWrappingKey, getCurrentDeviceId]
  );

  /**
   * Add an encrypted reaction to a message.
   */
  const addReaction = useCallback(
    async (input: AddReactionInput): Promise<AddReactionResult> => {
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

      setIsAdding(true);
      setError(null);

      try {
        const convResponse = await api.dm.getConversation(input.conversationId);
        if (!convResponse.success || !convResponse.data) {
          const errMsg = convResponse.error?.message ?? 'Conversation not found';
          setError(errMsg);
          return { success: false, error: errMsg };
        }
        const cryptoProfile = convResponse.data.conversation.activeCryptoProfile as CryptoProfile;

        const recipientKeysResponse = await api.identity.getPublicKeys(input.toIdentityId);
        if (!recipientKeysResponse.success || !recipientKeysResponse.data) {
          const errMsg = recipientKeysResponse.error?.message ?? 'Failed to get recipient keys';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        const senderKeysResponse = await api.identity.getPublicKeys(identity.id);
        if (!senderKeysResponse.success || !senderKeysResponse.data) {
          const errMsg = senderKeysResponse.error?.message ?? 'Failed to get own keys';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        const recipientKeys: Array<{
          identityId: string;
          deviceId: string;
          publicKeys: RecipientPublicKeys;
          preKeyData?: PreKeyRecipientData;
        }> = [];

        const recipientSigningPubKey = recipientKeysResponse.data.signingPublicKey
          ? fromBase64(recipientKeysResponse.data.signingPublicKey)
          : undefined;

        let claimedPreKeys;
        try {
          const claimResponse = await api.identity.claimPreKeys(input.toIdentityId);
          if (claimResponse.success && claimResponse.data) {
            claimedPreKeys = claimResponse.data.devices;
          }
        } catch {
          // Fall back to static wrapping
        }

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

        const encrypted = encryptReaction({
          emoji: input.emoji,
          fromIdentityId: identity.id,
          recipientKeys,
          signingPrivateKey: signingKey,
          cryptoProfile,
        });

        const clientReactionId = generateClientReactionId();

        const sendResponse = await api.dmReactions.addReaction({
          messageId: input.messageId,
          conversationId: input.conversationId,
          toIdentityId: input.toIdentityId,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientReactionId,
        });

        if (!sendResponse.success) {
          const errMsg = sendResponse.error?.message ?? 'Failed to add reaction';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        return { success: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to add reaction';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsAdding(false);
      }
    },
    [api, status, identity, getSigningKey, getCurrentDeviceId]
  );

  /**
   * Remove a reaction by ID.
   */
  const removeReaction = useCallback(
    async (reactionId: string): Promise<{ success: boolean; error?: string }> => {
      if (status !== 'logged_in' || !identity) {
        return { success: false, error: 'Not logged in' };
      }

      try {
        const response = await api.dmReactions.removeReaction(reactionId);
        if (!response.success) {
          return { success: false, error: response.error?.message ?? 'Failed to remove reaction' };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to remove reaction' };
      }
    },
    [api, status, identity]
  );

  return {
    fetchReactions,
    addReaction,
    removeReaction,
    isAdding,
    error,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Groups decrypted reactions by emoji for display.
 */
export function groupReactions(
  reactions: DecryptedDmReaction[],
  currentIdentityId: string
): GroupedReaction[] {
  const groups = new Map<string, GroupedReaction>();

  for (const reaction of reactions) {
    if (!reaction.decrypted?.emoji) continue;

    const emoji = reaction.decrypted.emoji;
    const existing = groups.get(emoji);

    if (existing) {
      existing.count++;
      existing.reactorIds.push(reaction.decrypted.fromIdentityId);
      existing.reactionIds.push(reaction.raw.id);
      if (reaction.decrypted.fromIdentityId === currentIdentityId) {
        existing.includesMe = true;
      }
    } else {
      groups.set(emoji, {
        emoji,
        count: 1,
        reactorIds: [reaction.decrypted.fromIdentityId],
        reactionIds: [reaction.raw.id],
        includesMe: reaction.decrypted.fromIdentityId === currentIdentityId,
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Resolves the signing public key for a reaction's sender.
 * For reactions we sent, we use our own signing key.
 * For reactions from others, we check cached participant data or fetch from API.
 */
async function resolveSenderSigningKey(
  api: ReturnType<typeof createApiClient>,
  reaction: DmReaction,
  myIdentityId: string,
  conversationId: string
): Promise<string | null> {
  const otherIdentityId = reaction.toIdentityId === myIdentityId
    ? null
    : reaction.toIdentityId;

  const cached = await getCachedParticipant(myIdentityId, conversationId);
  if (cached?.signingPublicKey) {
    return cached.signingPublicKey;
  }

  if (otherIdentityId) {
    const keysResponse = await api.identity.getPublicKeys(otherIdentityId);
    if (keysResponse.success && keysResponse.data?.signingPublicKey) {
      return keysResponse.data.signingPublicKey;
    }
  }

  const myKeysResponse = await api.identity.getPublicKeys(myIdentityId);
  if (myKeysResponse.success && myKeysResponse.data?.signingPublicKey) {
    return myKeysResponse.data.signingPublicKey;
  }

  return null;
}
