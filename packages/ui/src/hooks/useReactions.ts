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
  type SerializedWrappedKey,
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
import {
  findAndDecryptSignedPreKey,
  findAndDecryptOneTimePreKey,
  deleteOneTimePreKey,
  getPersistedSessionKey,
  storeSessionKey,
  deletePersistedSessionKey,
} from '../services/preKeyStorage';
import { notifyOtpkConsumed } from '../services/preKeyService';

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

/**
 * Merge API-fetched reactions with existing state by reaction id.
 * A refetch may decrypt fewer reactions (e.g. after OTPK consumption); without
 * merging, the spread would overwrite and drop reactions only present from WS.
 */
function mergeReactionsByMessageId(
  prev: Record<string, DecryptedReaction[]>,
  fetched: Record<string, DecryptedReaction[]>
): Record<string, DecryptedReaction[]> {
  const merged = { ...prev };
  for (const [messageId, fetchedList] of Object.entries(fetched)) {
    const prevList = prev[messageId] ?? [];
    const byId = new Map<string, DecryptedReaction>();
    for (const r of prevList) {
      byId.set(r.id, r);
    }
    for (const r of fetchedList) {
      const existing = byId.get(r.id);
      // Refetch may fail signature verification if wrappedKeys JSON order differs from
      // the live WS payload; never replace a verified decrypt with an unverified one.
      if (existing && existing.verified && !r.verified) {
        continue;
      }
      byId.set(r.id, r);
    }
    merged[messageId] = Array.from(byId.values());
  }
  return merged;
}

function sameConversationRoute(
  reactionConvId: string,
  routeConvId: string | null
): boolean {
  if (!routeConvId) return false;
  return reactionConvId.toLowerCase() === routeConvId.toLowerCase();
}

/** Storage id for reaction session keys (distinct from message ids, which share the same hex shape). */
function reactionSessionStorageKey(reactionId: string): string {
  return `reaction:${reactionId}`;
}

/**
 * Persist FS reaction session keys like FS messages — otherwise OTPK deletion makes
 * reactions unreadable after refresh (reactions use their own random session key).
 */
async function persistReactionFsSessionKey(
  reactionId: string,
  identityId: string,
  sessionKey: Uint8Array,
  wrappingKey: Uint8Array | null | undefined,
  resolvedWrappedKey: SerializedWrappedKey | undefined
): Promise<void> {
  if (!wrappingKey || !resolvedWrappedKey || resolvedWrappedKey.preKeyType === 'static') {
    return;
  }
  await storeSessionKey(
    reactionSessionStorageKey(reactionId),
    identityId,
    sessionKey,
    wrappingKey,
    resolvedWrappedKey.signedPreKeyId
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useReactions(conversationId: string | null) {
  const { identity, getSigningKey, getCurrentDeviceId, getWrappingKey } =
    useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { subscribe, onStateChange } = useChatSocket();

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
  const reactionSessionKeyCache = useRef(new Map<string, Uint8Array>());
  const byMessageRef = useRef(state.byMessage);
  byMessageRef.current = state.byMessage;

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
        routingTag: decrypted.routingTag,
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

      const wrappingKey = getWrappingKey();
      const senderIds = [...new Set(publicReactions.map((r) => r.fromIdentityId))];
      const signingKeys = await resolveSigningKeys(senderIds);

      const spkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
      const otpkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
      const deletedOtpkIds = new Set<string>();
      const results: DecryptedReaction[] = [];

      for (const reaction of publicReactions) {
        try {
          const signingKey = signingKeys[reaction.fromIdentityId];
          if (!signingKey) continue;

          // Layer 2: In-memory cache, then persistent (FS reactions need this after OTPK consumption)
          let cachedKey = reactionSessionKeyCache.current.get(reaction.id);
          if (!cachedKey && wrappingKey) {
            const persisted = await getPersistedSessionKey(
              reactionSessionStorageKey(reaction.id),
              identity.id,
              wrappingKey
            );
            if (persisted) {
              reactionSessionKeyCache.current.set(reaction.id, persisted);
              cachedKey = persisted;
            }
          }
          if (cachedKey) {
            try {
              const result = decryptReaction(
                reaction,
                identity.id,
                keys.ecdhPrivateKey,
                keys.kemPrivateKey,
                signingKey,
                undefined,
                undefined,
                cachedKey
              );
              results.push(result);
              continue;
            } catch {
              reactionSessionKeyCache.current.delete(reaction.id);
              void deletePersistedSessionKey(
                reactionSessionStorageKey(reaction.id),
                identity.id
              ).catch((err) =>
                console.error('[Reactions] Failed to clear bad persisted session key', err)
              );
            }
          }

          const candidates = reaction.wrappedKeys.filter(
            (wk) => wk.identityId === identity.id
          );
          if (candidates.length === 0) continue;

          let resolvedWrappedKey: SerializedWrappedKey | undefined;
          let preKeyPrivateKeys:
            | {
                spkEcdhPrivate?: Uint8Array;
                spkKemPrivate?: Uint8Array;
                otpkEcdhPrivate?: Uint8Array;
                otpkKemPrivate?: Uint8Array;
              }
            | undefined;

          // Tier 1: FS candidates — match by local SPK presence
          const fsCandidates = candidates.filter(
            (wk) => (wk.preKeyType === 'spk' || wk.preKeyType === 'otpk') && wk.signedPreKeyId
          );
          let fsSpkMissing = false;
          let fsOtpkMissing = false;
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
                  const candidatePreKeys: typeof preKeyPrivateKeys = {
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
                      candidatePreKeys.otpkEcdhPrivate = otpkKeys.ecdh;
                      candidatePreKeys.otpkKemPrivate = otpkKeys.kem;
                    } else {
                      fsOtpkMissing = true;
                      console.warn('[Reactions] decrypt: OTPK not found locally, skipping candidate',
                        candidate.oneTimePreKeyId, 'spk', candidate.signedPreKeyId);
                      continue;
                    }
                  }

                  resolvedWrappedKey = candidate;
                  preKeyPrivateKeys = candidatePreKeys;
                  break;
                } else {
                  fsSpkMissing = true;
                }
              } catch (err) {
                console.warn('[Reactions] decrypt: pre-key lookup failed for candidate', candidate.signedPreKeyId, err);
              }
            }
          }

          // Tier 2: Static candidates — match by routing tag
          if (!resolvedWrappedKey && keys.routingTag) {
            const staticCandidates = candidates.filter(
              (wk) => wk.preKeyType === 'static' && wk.routingTag
            );
            const tagMatch = staticCandidates.find((wk) => wk.routingTag === keys.routingTag);
            if (tagMatch) {
              resolvedWrappedKey = tagMatch;
            }
          }

          // Tier 3: Fallback — trial decryption of remaining static candidates
          if (!resolvedWrappedKey) {
            for (const candidate of candidates) {
              if (candidate.preKeyType !== 'static') continue;
              try {
                const result = decryptReaction(
                  reaction,
                  identity.id,
                  keys.ecdhPrivateKey,
                  keys.kemPrivateKey,
                  signingKey,
                  undefined,
                  candidate
                );
                reactionSessionKeyCache.current.set(reaction.id, result.sessionKey);
                results.push(result);
                resolvedWrappedKey = candidate;
                break;
              } catch {
                // Trial decryption failed, try next candidate
              }
            }
            if (resolvedWrappedKey) continue;
          }

          if (!resolvedWrappedKey) {
            if (fsCandidates.length > 0) {
              const reason = fsOtpkMissing && !fsSpkMissing ? 'OTPK missing' :
                fsSpkMissing ? 'SPK missing' : 'lookup error';
              console.warn('[Reactions] decrypt: all FS candidates failed for reaction',
                reaction.id?.slice(0, 8), `(${reason})`);
            }
            continue;
          }

          const decrypted = decryptReaction(
            reaction,
            identity.id,
            keys.ecdhPrivateKey,
            keys.kemPrivateKey,
            signingKey,
            preKeyPrivateKeys,
            resolvedWrappedKey
          );

          reactionSessionKeyCache.current.set(reaction.id, decrypted.sessionKey);

          await persistReactionFsSessionKey(
            reaction.id,
            identity.id,
            decrypted.sessionKey,
            wrappingKey,
            resolvedWrappedKey
          ).catch((err) =>
            console.error('[Reactions] FS session key persist failed:', err)
          );

          if (
            resolvedWrappedKey.preKeyType === 'otpk' &&
            resolvedWrappedKey.oneTimePreKeyId &&
            !deletedOtpkIds.has(resolvedWrappedKey.oneTimePreKeyId)
          ) {
            deletedOtpkIds.add(resolvedWrappedKey.oneTimePreKeyId);
            deleteOneTimePreKey(resolvedWrappedKey.oneTimePreKeyId, identity.id)
              .catch((err) => console.error('[Reactions] OTPK cleanup failed:', err));
            notifyOtpkConsumed();
          }

          results.push(decrypted);
        } catch {
          // Skip reactions we cannot decrypt
        }
      }

      return results;
    },
    [identity, getPrivateKeys, resolveSigningKeys, getWrappingKey]
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
            byMessage: mergeReactionsByMessageId(prev.byMessage, byMessage),
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
          reactionSessionKeyCache.current.delete(reactionId);
          if (identity) {
            void deletePersistedSessionKey(
              reactionSessionStorageKey(reactionId),
              identity.id
            ).catch((err) =>
              console.error('[Reactions] Session key delete on remove failed', err)
            );
          }
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
    [conversationId, api, identity]
  );

  // ---- Group reactions for display ----

  const getGroupedReactions = useCallback(
    (messageId: string): GroupedReaction[] => {
      const reactions = (state.byMessage[messageId] ?? []).filter(
        (r) => r.verified !== false
      );
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
        if (!sameConversationRoute(reaction.conversationId, conversationIdRef.current)) {
          return;
        }

        const id = identityRef.current?.id;
        if (!id) return;
        if (reaction.fromIdentityId === id) return;

        void (async () => {
          const keys = await getPrivateKeys();
          if (!keys) return;

          try {
            const signingKeys = await resolveSigningKeys([reaction.fromIdentityId]);
            const senderSigningKey = signingKeys[reaction.fromIdentityId];
            if (!senderSigningKey) return;

            const wrappingKeyEarly = getWrappingKey();
            let cachedSk = reactionSessionKeyCache.current.get(reaction.id);
            if (!cachedSk && wrappingKeyEarly) {
              const persisted = await getPersistedSessionKey(
                reactionSessionStorageKey(reaction.id),
                id,
                wrappingKeyEarly
              );
              if (persisted) {
                reactionSessionKeyCache.current.set(reaction.id, persisted);
                cachedSk = persisted;
              }
            }
            if (cachedSk) {
              try {
                const result = decryptReaction(
                  reaction,
                  id,
                  keys.ecdhPrivateKey,
                  keys.kemPrivateKey,
                  senderSigningKey,
                  undefined,
                  undefined,
                  cachedSk
                );
                setState((prev) => {
                  const existing = prev.byMessage[reaction.messageId] ?? [];
                  if (existing.some((r) => r.id === result.id)) return prev;
                  return {
                    ...prev,
                    byMessage: {
                      ...prev.byMessage,
                      [reaction.messageId]: [...existing, result],
                    },
                  };
                });
                return;
              } catch {
                reactionSessionKeyCache.current.delete(reaction.id);
                void deletePersistedSessionKey(reactionSessionStorageKey(reaction.id), id).catch(
                  (err) => console.error('[Reactions] WS: clear bad persisted session key', err)
                );
              }
            }

            const candidates = reaction.wrappedKeys.filter(
              (wk) => wk.identityId === id
            );
            if (candidates.length === 0) return;

            let resolvedWrappedKey: SerializedWrappedKey | undefined;
            let preKeyPrivateKeys:
              | {
                  spkEcdhPrivate?: Uint8Array;
                  spkKemPrivate?: Uint8Array;
                  otpkEcdhPrivate?: Uint8Array;
                  otpkKemPrivate?: Uint8Array;
                }
              | undefined;

            // Tier 1: FS candidates — match by local SPK presence
            const wrappingKey = getWrappingKey();
            const fsCandidates = candidates.filter(
              (wk) => (wk.preKeyType === 'spk' || wk.preKeyType === 'otpk') && wk.signedPreKeyId
            );
            if (fsCandidates.length > 0 && wrappingKey) {
              for (const candidate of fsCandidates) {
                try {
                  const decryptedSpk = await findAndDecryptSignedPreKey(
                    candidate.signedPreKeyId!,
                    id,
                    wrappingKey
                  );
                  if (decryptedSpk) {
                    const candidatePreKeys: typeof preKeyPrivateKeys = {
                      spkEcdhPrivate: decryptedSpk.ecdhPrivateKey,
                      spkKemPrivate: decryptedSpk.kemPrivateKey,
                    };

                    if (candidate.preKeyType === 'otpk' && candidate.oneTimePreKeyId) {
                      const decryptedOtpk = await findAndDecryptOneTimePreKey(
                        candidate.oneTimePreKeyId,
                        id,
                        wrappingKey
                      );
                      if (decryptedOtpk) {
                        candidatePreKeys.otpkEcdhPrivate = decryptedOtpk.ecdhPrivateKey;
                        candidatePreKeys.otpkKemPrivate = decryptedOtpk.kemPrivateKey;
                      } else {
                        console.warn('[Reactions] WS decrypt: OTPK not found locally, skipping candidate',
                          candidate.oneTimePreKeyId, 'spk', candidate.signedPreKeyId);
                        continue;
                      }
                    }

                    resolvedWrappedKey = candidate;
                    preKeyPrivateKeys = candidatePreKeys;
                    break;
                  }
                } catch (err) {
                  console.warn('[Reactions] WS decrypt: pre-key lookup failed for candidate', candidate.signedPreKeyId, err);
                }
              }
            }

            // Tier 2: Static candidates — match by routing tag
            if (!resolvedWrappedKey && keys.routingTag) {
              const staticCandidates = candidates.filter(
                (wk) => wk.preKeyType === 'static' && wk.routingTag
              );
              const tagMatch = staticCandidates.find((wk) => wk.routingTag === keys.routingTag);
              if (tagMatch) {
                resolvedWrappedKey = tagMatch;
              }
            }

            // Tier 3: Fallback — trial decryption of remaining static candidates
            let decrypted: (DecryptedReaction & { sessionKey: Uint8Array }) | undefined;
            if (!resolvedWrappedKey) {
              for (const candidate of candidates) {
                if (candidate.preKeyType !== 'static') continue;
                try {
                  decrypted = decryptReaction(
                    reaction,
                    id,
                    keys.ecdhPrivateKey,
                    keys.kemPrivateKey,
                    senderSigningKey,
                    undefined,
                    candidate
                  );
                  break;
                } catch {
                  // Trial decryption failed, try next candidate
                }
              }
            }

            if (!decrypted) {
              if (!resolvedWrappedKey) {
                if (fsCandidates.length > 0) {
                  console.warn('[Reactions] WS decrypt: all FS candidates failed for reaction', reaction.id?.slice(0, 8));
                }
                return;
              }
              decrypted = decryptReaction(
                reaction,
                id,
                keys.ecdhPrivateKey,
                keys.kemPrivateKey,
                senderSigningKey,
                preKeyPrivateKeys,
                resolvedWrappedKey
              );
            }

            reactionSessionKeyCache.current.set(reaction.id, decrypted.sessionKey);

            const wrappingKeyForPersist = getWrappingKey();
            await persistReactionFsSessionKey(
              reaction.id,
              id,
              decrypted.sessionKey,
              wrappingKeyForPersist ?? undefined,
              resolvedWrappedKey
            ).catch((err) =>
              console.error('[Reactions] WS: FS session key persist failed:', err)
            );

            if (
              resolvedWrappedKey &&
              resolvedWrappedKey.preKeyType === 'otpk' &&
              resolvedWrappedKey.oneTimePreKeyId
            ) {
              deleteOneTimePreKey(resolvedWrappedKey.oneTimePreKeyId, id)
                .catch((err) => console.error('[Reactions] WS OTPK cleanup failed:', err));
              notifyOtpkConsumed();
            }

            const result = decrypted;
            setState((prev) => {
              const existing = prev.byMessage[reaction.messageId] ?? [];
              if (existing.some((r) => r.id === result.id)) return prev;
              return {
                ...prev,
                byMessage: {
                  ...prev.byMessage,
                  [reaction.messageId]: [...existing, result],
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
        if (!sameConversationRoute(convId, conversationIdRef.current)) return;

        reactionSessionKeyCache.current.delete(reactionId);
        const sid = identityRef.current?.id;
        if (sid) {
          void deletePersistedSessionKey(reactionSessionStorageKey(reactionId), sid).catch((err) =>
            console.error('[Reactions] Session key delete on reaction_removed failed', err)
          );
        }

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
          const list = prev.byMessage[messageId] ?? [];
          const sid = identityRef.current?.id;
          if (sid) {
            for (const r of list) {
              reactionSessionKeyCache.current.delete(r.id);
              void deletePersistedSessionKey(reactionSessionStorageKey(r.id), sid).catch((err) =>
                console.error('[Reactions] Session key delete on message deleted failed', err)
              );
            }
          }
          const updated = { ...prev.byMessage };
          delete updated[messageId];
          return { ...prev, byMessage: updated };
        });
      }
    });

    return unsubscribe;
  }, [subscribe, getPrivateKeys, resolveSigningKeys, getWrappingKey]);

  // ---- Refetch reactions on WebSocket reconnect ----

  const fetchReactionsRef = useRef(fetchReactions);
  fetchReactionsRef.current = fetchReactions;

  useEffect(() => {
    const unsub = onStateChange((socketState) => {
      if (socketState !== 'connected') return;
      const messageIds = Object.keys(byMessageRef.current);
      if (messageIds.length === 0) return;
      fetchReactionsRef.current(messageIds);
    });
    return unsub;
  }, [onStateChange]);

  // ---- Clear on conversation change ----

  useEffect(() => {
    setState({ byMessage: {}, loading: false });
    reactionSessionKeyCache.current.clear();
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
