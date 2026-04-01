/**
 * Reactions Hook
 *
 * Manages reaction state, encryption/decryption, and API calls for
 * emoji reactions on conversation messages. Subscribes to WebSocket
 * events for real-time reaction updates.
 *
 * @module hooks/useReactions
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  createApiClient,
  type PublicReaction,
  type ChatIncomingMessage,
} from '@adieuu/shared';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useChatSocket } from './useChatSocket';
import {
  encryptReaction,
  decryptReaction,
  type DecryptedReaction,
} from '../services/reactionCryptoService';
import type { RecipientKeys } from '../services/conversationCryptoService';
import {
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
} from '../services/deviceKeyStorage';

// ============================================================================
// Types
// ============================================================================

export interface GroupedReaction {
  emoji: string;
  count: number;
  reactionIds: string[];
  fromIdentityIds: string[];
  isOwn: boolean;
  ownReactionId?: string;
}

interface ReactionsState {
  byMessage: Record<string, DecryptedReaction[]>;
  loading: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useReactions(conversationId: string | null) {
  const { identity, getSigningKey, getCurrentDeviceId, getWrappingKey } =
    useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe } = useChatSocket();

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl]
  );

  const [state, setState] = useState<ReactionsState>({
    byMessage: {},
    loading: false,
  });

  const identityRef = useRef(identity);
  identityRef.current = identity;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  // ---- Crypto helpers ----

  const getPrivateKeys = useCallback(async () => {
    const deviceId = getCurrentDeviceId();
    const wrappingKey = getWrappingKey();
    if (!deviceId || !wrappingKey || !identity) return null;

    try {
      const storedKeys = await getDeviceKeysForIdentity(identity.id);
      const myDeviceKeys = storedKeys?.find((k) => k.deviceId === deviceId);
      if (!myDeviceKeys) return null;

      const decrypted = await decryptDeviceKeys(myDeviceKeys, wrappingKey);
      return {
        ecdhPrivateKey: decrypted.ecdhPrivateKey,
        kemPrivateKey: decrypted.kemPrivateKey,
      };
    } catch {
      return null;
    }
  }, [identity, getCurrentDeviceId, getWrappingKey]);

  const signingKeyCache = useRef<Record<string, string>>({});

  const resolveSigningKeys = useCallback(
    async (identityIds: string[]): Promise<Record<string, string>> => {
      const missing = identityIds.filter((id) => !signingKeyCache.current[id]);
      await Promise.all(
        missing.map(async (id) => {
          try {
            const resp = await api.identity.getPublicKeys(id);
            if (resp.data) {
              signingKeyCache.current[id] = resp.data.signingPublicKey;
            }
          } catch {
            // Signing key unavailable
          }
        })
      );
      return signingKeyCache.current;
    },
    [api]
  );

  const decryptReactions = useCallback(
    async (
      publicReactions: PublicReaction[]
    ): Promise<DecryptedReaction[]> => {
      if (!identity) return [];

      const keys = await getPrivateKeys();
      if (!keys) return [];

      const senderIds = [...new Set(publicReactions.map((r) => r.fromIdentityId))];
      const signingKeys = await resolveSigningKeys(senderIds);

      const results: DecryptedReaction[] = [];

      for (const reaction of publicReactions) {
        try {
          const signingKey = signingKeys[reaction.fromIdentityId];
          if (!signingKey) continue;

          const decrypted = decryptReaction(
            reaction,
            identity.id,
            keys.ecdhPrivateKey,
            keys.kemPrivateKey,
            signingKey
          );
          results.push(decrypted);
        } catch {
          // Skip reactions we cannot decrypt
        }
      }

      return results;
    },
    [identity, getPrivateKeys, resolveSigningKeys]
  );

  // ---- Fetch reactions for messages ----

  const fetchReactions = useCallback(
    async (messageIds: string[]) => {
      if (!conversationId || !identity || messageIds.length === 0) return;

      setState((prev) => ({ ...prev, loading: true }));

      try {
        const resp = await api.reactions.getForMessages(
          conversationId,
          messageIds
        );

        if (resp.success && resp.data?.reactions) {
          const decrypted = await decryptReactions(resp.data.reactions);

          const byMessage: Record<string, DecryptedReaction[]> = {};
          for (const r of decrypted) {
            const existing = byMessage[r.messageId];
            if (existing) {
              existing.push(r);
            } else {
              byMessage[r.messageId] = [r];
            }
          }

          setState((prev) => ({
            byMessage: { ...prev.byMessage, ...byMessage },
            loading: false,
          }));
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [conversationId, identity, api, decryptReactions]
  );

  // ---- Add reaction ----

  const addReaction = useCallback(
    async (
      messageId: string,
      emoji: string,
      recipients: RecipientKeys[]
    ): Promise<boolean> => {
      if (!conversationId || !identity) return false;

      const signingKey = getSigningKey();
      if (!signingKey) return false;

      try {
        const clientReactionId = crypto.randomUUID();
        const encrypted = encryptReaction(
          emoji,
          identity.id,
          recipients,
          signingKey
        );

        const resp = await api.reactions.add(conversationId, messageId, {
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientReactionId,
        });

        if (resp.success && resp.data) {
          const decryptedReaction: DecryptedReaction = {
            id: resp.data.id,
            messageId: resp.data.messageId,
            conversationId: resp.data.conversationId,
            fromIdentityId: identity.id,
            emoji,
            verified: true,
            createdAt: resp.data.createdAt,
          };

          setState((prev) => {
            const existing = prev.byMessage[messageId] ?? [];
            return {
              ...prev,
              byMessage: {
                ...prev.byMessage,
                [messageId]: [...existing, decryptedReaction],
              },
            };
          });

          return true;
        }
      } catch {
        // Reaction failed
      }

      return false;
    },
    [conversationId, identity, getSigningKey, api]
  );

  // ---- Remove reaction ----

  const removeReaction = useCallback(
    async (reactionId: string, messageId: string): Promise<boolean> => {
      if (!conversationId) return false;

      try {
        const resp = await api.reactions.remove(conversationId, reactionId);
        if (resp.success) {
          setState((prev) => {
            const existing = prev.byMessage[messageId] ?? [];
            return {
              ...prev,
              byMessage: {
                ...prev.byMessage,
                [messageId]: existing.filter((r) => r.id !== reactionId),
              },
            };
          });
          return true;
        }
      } catch {
        // Remove failed
      }

      return false;
    },
    [conversationId, api]
  );

  // ---- Group reactions for display ----

  const getGroupedReactions = useCallback(
    (messageId: string): GroupedReaction[] => {
      const reactions = state.byMessage[messageId] ?? [];
      if (reactions.length === 0) return [];

      const groups = new Map<
        string,
        { count: number; reactionIds: string[]; fromIdentityIds: string[] }
      >();

      for (const r of reactions) {
        const existing = groups.get(r.emoji);
        if (existing) {
          existing.count++;
          existing.reactionIds.push(r.id);
          existing.fromIdentityIds.push(r.fromIdentityId);
        } else {
          groups.set(r.emoji, {
            count: 1,
            reactionIds: [r.id],
            fromIdentityIds: [r.fromIdentityId],
          });
        }
      }

      const myId = identityRef.current?.id;

      return Array.from(groups.entries()).map(([emoji, data]) => ({
        emoji,
        count: data.count,
        reactionIds: data.reactionIds,
        fromIdentityIds: data.fromIdentityIds,
        isOwn: myId ? data.fromIdentityIds.includes(myId) : false,
        ownReactionId: myId
          ? reactions.find(
              (r) => r.emoji === emoji && r.fromIdentityId === myId
            )?.id
          : undefined,
      }));
    },
    [state.byMessage]
  );

  // ---- WebSocket events ----

  useEffect(() => {
    const unsubscribe = subscribe((message: ChatIncomingMessage) => {
      if (message.type === 'reaction_added') {
        const { reaction } = message.data;
        if (reaction.conversationId !== conversationIdRef.current) return;

        const id = identityRef.current?.id;
        if (!id) return;
        if (reaction.fromIdentityId === id) return;

        void (async () => {
          const keys = await getPrivateKeys();
          if (!keys) return;

          try {
            const decrypted = decryptReaction(
              reaction,
              id,
              keys.ecdhPrivateKey,
              keys.kemPrivateKey,
              reaction.wrappedKeys[0]
                ? reaction.fromIdentityId
                : reaction.fromIdentityId
            );

            setState((prev) => {
              const existing = prev.byMessage[reaction.messageId] ?? [];
              if (existing.some((r) => r.id === decrypted.id)) return prev;
              return {
                ...prev,
                byMessage: {
                  ...prev.byMessage,
                  [reaction.messageId]: [...existing, decrypted],
                },
              };
            });
          } catch {
            // Cannot decrypt this reaction
          }
        })();
      }

      if (message.type === 'reaction_removed') {
        const { reactionId, messageId, conversationId: convId } = message.data;
        if (convId !== conversationIdRef.current) return;

        setState((prev) => {
          const existing = prev.byMessage[messageId] ?? [];
          return {
            ...prev,
            byMessage: {
              ...prev.byMessage,
              [messageId]: existing.filter((r) => r.id !== reactionId),
            },
          };
        });
      }

      if (message.type === 'conversation_message_deleted') {
        const { messageId } = message.data;
        setState((prev) => {
          if (!prev.byMessage[messageId]) return prev;
          const updated = { ...prev.byMessage };
          delete updated[messageId];
          return { ...prev, byMessage: updated };
        });
      }
    });

    return unsubscribe;
  }, [subscribe, getPrivateKeys]);

  // ---- Clear on conversation change ----

  useEffect(() => {
    setState({ byMessage: {}, loading: false });
  }, [conversationId]);

  return {
    reactions: state.byMessage,
    loading: state.loading,
    fetchReactions,
    addReaction,
    removeReaction,
    getGroupedReactions,
  };
}
