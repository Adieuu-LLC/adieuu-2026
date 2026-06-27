import type { PublicReaction, SerializedWrappedKey } from '@adieuu/shared';
import { decryptReaction, type DecryptedReaction } from './reactionCryptoService';
import { storeSessionKey } from './preKeyStorage';

function reactionSessionStorageKey(reactionId: string): string {
  return `reaction:${reactionId}`;
}

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

export interface ReactionDecryptParams {
  publicReactions: PublicReaction[];
  identityId: string;
  keys: { ecdhPrivateKey: Uint8Array; kemPrivateKey: Uint8Array; routingTag?: string };
  wrappingKey: Uint8Array | null;
  signingKeys: Record<string, string>;
  reactionSessionKeyCache: Map<string, Uint8Array>;
  findAndDecryptSignedPreKey: (
    signedPreKeyId: string,
    identityId: string,
    wrappingKey: Uint8Array
  ) => Promise<{ ecdhPrivateKey: Uint8Array; kemPrivateKey: Uint8Array } | null>;
  findAndDecryptOneTimePreKey: (
    oneTimePreKeyId: string,
    identityId: string,
    wrappingKey: Uint8Array
  ) => Promise<{ ecdhPrivateKey: Uint8Array; kemPrivateKey: Uint8Array } | null>;
  deleteOneTimePreKey: (oneTimePreKeyId: string, identityId: string) => Promise<void>;
  getPersistedSessionKey: (
    messageId: string,
    identityId: string,
    wrappingKey: Uint8Array
  ) => Promise<Uint8Array | null>;
  deletePersistedSessionKey: (messageId: string, identityId: string) => Promise<void>;
  notifyOtpkConsumed: () => void;
}

export async function decryptReactionsBatch(
  params: ReactionDecryptParams
): Promise<DecryptedReaction[]> {
  const {
    publicReactions,
    identityId,
    keys,
    wrappingKey,
    signingKeys,
    reactionSessionKeyCache,
    findAndDecryptSignedPreKey,
    findAndDecryptOneTimePreKey,
    deleteOneTimePreKey,
    getPersistedSessionKey,
    deletePersistedSessionKey,
    notifyOtpkConsumed,
  } = params;

  const spkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
  const otpkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
  const deletedOtpkIds = new Set<string>();
  const results: DecryptedReaction[] = [];

  for (const reaction of publicReactions) {
    try {
      const signingKey = signingKeys[reaction.fromIdentityId];
      if (!signingKey) continue;

      let cachedKey = reactionSessionKeyCache.get(reaction.id);
      if (!cachedKey && wrappingKey) {
        const persisted = await getPersistedSessionKey(
          reactionSessionStorageKey(reaction.id),
          identityId,
          wrappingKey
        );
        if (persisted) {
          reactionSessionKeyCache.set(reaction.id, persisted);
          cachedKey = persisted;
        }
      }
      if (cachedKey) {
        try {
          const result = decryptReaction(
            reaction,
            identityId,
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
          reactionSessionKeyCache.delete(reaction.id);
          void deletePersistedSessionKey(reactionSessionStorageKey(reaction.id), identityId);
        }
      }

      const candidates = reaction.wrappedKeys.filter((wk) => wk.identityId === identityId);
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
                identityId,
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
                    identityId,
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
                  continue;
                }
              }
              resolvedWrappedKey = candidate;
              preKeyPrivateKeys = candidatePreKeys;
              break;
            } else {
              fsSpkMissing = true;
            }
          } catch {
            // continue
          }
        }
      }

      if (!resolvedWrappedKey && keys.routingTag) {
        const staticCandidates = candidates.filter(
          (wk) => wk.preKeyType === 'static' && wk.routingTag
        );
        const tagMatch = staticCandidates.find((wk) => wk.routingTag === keys.routingTag);
        if (tagMatch) resolvedWrappedKey = tagMatch;
      }

      if (!resolvedWrappedKey) {
        for (const candidate of candidates) {
          if (candidate.preKeyType !== 'static') continue;
          try {
            const result = decryptReaction(
              reaction,
              identityId,
              keys.ecdhPrivateKey,
              keys.kemPrivateKey,
              signingKey,
              undefined,
              candidate
            );
            reactionSessionKeyCache.set(reaction.id, result.sessionKey);
            results.push(result);
            resolvedWrappedKey = candidate;
            break;
          } catch {
            // continue
          }
        }
        if (resolvedWrappedKey) continue;
      }

      if (!resolvedWrappedKey) {
        if (fsCandidates.length > 0) {
          const reason =
            fsOtpkMissing && !fsSpkMissing
              ? 'OTPK missing'
              : fsSpkMissing
                ? 'SPK missing'
                : 'lookup error';
          console.warn(
            '[Reactions] decrypt: all FS candidates failed for reaction',
            reaction.id?.slice(0, 8),
            `(${reason})`
          );
        }
        continue;
      }

      const decrypted = decryptReaction(
        reaction,
        identityId,
        keys.ecdhPrivateKey,
        keys.kemPrivateKey,
        signingKey,
        preKeyPrivateKeys,
        resolvedWrappedKey
      );
      reactionSessionKeyCache.set(reaction.id, decrypted.sessionKey);
      await persistReactionFsSessionKey(
        reaction.id,
        identityId,
        decrypted.sessionKey,
        wrappingKey,
        resolvedWrappedKey
      );

      if (
        resolvedWrappedKey.preKeyType === 'otpk' &&
        resolvedWrappedKey.oneTimePreKeyId &&
        !deletedOtpkIds.has(resolvedWrappedKey.oneTimePreKeyId)
      ) {
        deletedOtpkIds.add(resolvedWrappedKey.oneTimePreKeyId);
        void deleteOneTimePreKey(resolvedWrappedKey.oneTimePreKeyId, identityId);
        notifyOtpkConsumed();
      }
      results.push(decrypted);
    } catch {
      // skip
    }
  }

  return results;
}
