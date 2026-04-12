import type { PublicMessage, SerializedWrappedKey } from '@adieuu/shared';
import { decryptMessage } from './conversationCryptoService';

export interface DisplayMessageLike extends PublicMessage {
  decryptedContent?: string;
  signatureVerified?: boolean;
  decryptionError?: string;
  forwardSecrecy?: boolean;
}

export interface DecryptMessageBatchParams {
  messages: PublicMessage[];
  conversationId: string;
  /** Set when paging (older or newer); skips reusing prior decrypt shortcuts from initial load. */
  pagingCursor?: string;
  identityId: string;
  wrappingKey: Uint8Array | null;
  ecdhPrivateKey: Uint8Array | null;
  kemPrivateKey: Uint8Array | null;
  myRoutingTag?: string;
  signingKeyCache: Record<string, string>;
  existingMessages: DisplayMessageLike[];
  sessionKeyCache: Map<string, Uint8Array>;
  fetchSigningKey: (identityId: string) => Promise<string | null>;
  resolveParticipants: (identityIds: string[]) => void;
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
  storeSessionKey: (
    messageId: string,
    identityId: string,
    sessionKey: Uint8Array,
    wrappingKey: Uint8Array,
    signedPreKeyId?: string
  ) => Promise<void>;
  deletePersistedSessionKey: (messageId: string, identityId: string) => Promise<void>;
  notifyOtpkConsumed: () => void;
}

export async function decryptMessageBatch(params: DecryptMessageBatchParams): Promise<DisplayMessageLike[]> {
  const {
    messages,
    pagingCursor,
    identityId,
    wrappingKey,
    ecdhPrivateKey,
    kemPrivateKey,
    myRoutingTag,
    signingKeyCache,
    existingMessages,
    sessionKeyCache,
    fetchSigningKey,
    resolveParticipants,
    findAndDecryptSignedPreKey,
    findAndDecryptOneTimePreKey,
    deleteOneTimePreKey,
    getPersistedSessionKey,
    storeSessionKey,
    deletePersistedSessionKey,
    notifyOtpkConsumed,
  } = params;

  const senderIds = [...new Set(messages.map((m) => m.fromIdentityId))];
  const missingSenderKeys = senderIds.filter((id) => !signingKeyCache[id]);
  if (missingSenderKeys.length > 0) {
    await Promise.all(
      missingSenderKeys.map(async (sid) => {
        const key = await fetchSigningKey(sid);
        if (key) signingKeyCache[sid] = key;
      })
    );
  }
  resolveParticipants(senderIds);

  const spkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
  const otpkCache = new Map<string, { ecdh: Uint8Array; kem: Uint8Array }>();
  const deletedOtpkIds = new Set<string>();

  const existingById = new Map<string, DisplayMessageLike>();
  if (!pagingCursor) {
    for (const em of existingMessages) {
      if (em.decryptedContent !== undefined) existingById.set(em.id, em);
    }
  }

  return Promise.all(
    messages.map(async (m): Promise<DisplayMessageLike> => {
      if (m.deleted) {
        sessionKeyCache.delete(m.id);
        deletePersistedSessionKey(m.id, identityId).catch(() => undefined);
        return { ...m, decryptedContent: undefined, signatureVerified: undefined };
      }

      if (m.messageType === 'system') {
        return { ...m, decryptedContent: undefined, signatureVerified: undefined };
      }

      const preserved = existingById.get(m.id);
      if (preserved) return preserved;

      let cached = sessionKeyCache.get(m.id);
      if (!cached && wrappingKey) {
        const persisted = await getPersistedSessionKey(m.id, identityId, wrappingKey);
        if (persisted) {
          cached = persisted;
          sessionKeyCache.set(m.id, persisted);
        }
      }
      if (cached && ecdhPrivateKey && kemPrivateKey) {
        const senderSigningKey = signingKeyCache[m.fromIdentityId];
        if (senderSigningKey) {
          try {
            const result = decryptMessage(
              m,
              identityId,
              ecdhPrivateKey,
              kemPrivateKey,
              senderSigningKey,
              undefined,
              undefined,
              cached
            );
            const hasFs = m.wrappedKeys?.some(
              (wk) => wk.identityId === identityId && wk.preKeyType !== 'static'
            ) ?? false;
            return {
              ...m,
              decryptedContent: result.plaintext,
              signatureVerified: result.verified,
              forwardSecrecy: hasFs,
            };
          } catch {
            sessionKeyCache.delete(m.id);
          }
        }
      }

      if (!ecdhPrivateKey || !kemPrivateKey) return { ...m, decryptionError: 'Device keys unavailable' };
      const senderSigningKey = signingKeyCache[m.fromIdentityId];
      if (!senderSigningKey) return { ...m, decryptionError: 'Sender signing key unavailable' };
      if (!m.wrappedKeys || m.wrappedKeys.length === 0) return { ...m, decryptionError: 'No wrapped keys on message' };

      const candidates = m.wrappedKeys.filter((wk: SerializedWrappedKey) => wk.identityId === identityId);
      if (candidates.length === 0) {
        return { ...m, decryptionError: `No wrapped key for identity ${identityId.slice(0, 8)}...` };
      }

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
      let fsLookupError = false;

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
            fsLookupError = true;
          }
        }
      }

      if (!resolvedWrappedKey && myRoutingTag) {
        const staticCandidates = candidates.filter((wk) => wk.preKeyType === 'static' && wk.routingTag);
        const tagMatch = staticCandidates.find((wk) => wk.routingTag === myRoutingTag);
        if (tagMatch) resolvedWrappedKey = tagMatch;
      }

      if (!resolvedWrappedKey) {
        for (const candidate of candidates) {
          if (candidate.preKeyType !== 'static') continue;
          try {
            const result = decryptMessage(
              m,
              identityId,
              ecdhPrivateKey,
              kemPrivateKey,
              senderSigningKey,
              undefined,
              candidate
            );
            sessionKeyCache.set(m.id, result.sessionKey);
            return {
              ...m,
              decryptedContent: result.plaintext,
              signatureVerified: result.verified,
              forwardSecrecy: false,
            };
          } catch {
            // Wrong static wrapped key for this device.
          }
        }

        let decryptionError: string;
        if (fsCandidates.length > 0) {
          const spkIds = fsCandidates.map((c) => c.signedPreKeyId?.slice(0, 8)).join(', ');
          if (fsOtpkMissing && !fsSpkMissing) {
            decryptionError = `forward-secrecy-expired:OTPK not found locally (SPK ${spkIds} present)`;
          } else if (fsSpkMissing && !fsOtpkMissing) {
            decryptionError = `SPK ${spkIds} not found locally`;
          } else if (fsSpkMissing && fsOtpkMissing) {
            decryptionError = `SPK ${spkIds} and OTPK not found locally`;
          } else if (fsLookupError) {
            decryptionError = `Pre-key lookup failed for SPK ${spkIds}`;
          } else {
            decryptionError = `FS key resolution failed (SPK ${spkIds})`;
          }
        } else {
          decryptionError = 'No matching wrapped key for this device';
        }
        return { ...m, decryptionError };
      }

      try {
        const result = decryptMessage(
          m,
          identityId,
          ecdhPrivateKey,
          kemPrivateKey,
          senderSigningKey,
          preKeyPrivateKeys,
          resolvedWrappedKey
        );

        sessionKeyCache.set(m.id, result.sessionKey);
        if (wrappingKey && resolvedWrappedKey.preKeyType !== 'static') {
          storeSessionKey(
            m.id,
            identityId,
            result.sessionKey,
            wrappingKey,
            resolvedWrappedKey.signedPreKeyId
          ).catch(() => undefined);
        }

        if (
          resolvedWrappedKey.preKeyType === 'otpk' &&
          resolvedWrappedKey.oneTimePreKeyId &&
          !deletedOtpkIds.has(resolvedWrappedKey.oneTimePreKeyId)
        ) {
          deletedOtpkIds.add(resolvedWrappedKey.oneTimePreKeyId);
          deleteOneTimePreKey(resolvedWrappedKey.oneTimePreKeyId, identityId).catch(() => undefined);
          notifyOtpkConsumed();
        }

        return {
          ...m,
          decryptedContent: result.plaintext,
          signatureVerified: result.verified,
          forwardSecrecy: resolvedWrappedKey.preKeyType !== 'static',
        };
      } catch (err) {
        return { ...m, decryptionError: String(err) };
      }
    })
  );
}
