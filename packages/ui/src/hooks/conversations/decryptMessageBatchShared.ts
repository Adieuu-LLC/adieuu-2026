import type { DecryptMessageBatchParams } from '../../services/messageDecryptionPipeline';
import {
  findAndDecryptSignedPreKey,
  findAndDecryptOneTimePreKey,
  deleteOneTimePreKey,
  storeSessionKey,
  getPersistedSessionKey,
  deletePersistedSessionKey,
} from '../../services/preKeyStorage';
import { notifyOtpkConsumed } from '../../services/preKeyService';
import type { LoadedDecryptKeys } from './conversationDecryptKeys';

export type DecryptMessageBatchSharedFields = Omit<
  DecryptMessageBatchParams,
  'messages' | 'conversationId' | 'pagingCursor' | 'existingMessages'
>;

/**
 * Shared `decryptMessageBatch` arguments used by conversation message fetch paths.
 * Call sites supply `messages`, `conversationId`, `pagingCursor`, and `existingMessages`.
 */
export function buildDecryptMessageBatchSharedFields(args: {
  identityId: string;
  wrappingKey: Uint8Array | null;
  keys: LoadedDecryptKeys;
  signingKeyCache: Record<string, string>;
  sessionKeyCache: Map<string, Uint8Array>;
  api: {
    identity: {
      getPublicKeys: (id: string) => Promise<{
        data?: { signingPublicKey?: string } | null;
      }>;
    };
  };
  resolveParticipants: (ids: string[]) => void | Promise<Record<string, unknown>>;
}): DecryptMessageBatchSharedFields {
  const {
    identityId,
    wrappingKey,
    keys: { ecdhPrivateKey, kemPrivateKey, myRoutingTag },
    signingKeyCache,
    sessionKeyCache,
    api,
    resolveParticipants,
  } = args;

  return {
    identityId,
    wrappingKey,
    ecdhPrivateKey,
    kemPrivateKey,
    myRoutingTag,
    signingKeyCache,
    sessionKeyCache,
    fetchSigningKey: async (sid) => {
      try {
        const keysResp = await api.identity.getPublicKeys(sid);
        if (keysResp.data?.signingPublicKey) return keysResp.data.signingPublicKey;
      } catch (err) {
        console.warn('[Conversations] decrypt: failed to fetch signing key for', sid, err);
      }
      return null;
    },
    resolveParticipants: (ids) => {
      void resolveParticipants(ids);
    },
    findAndDecryptSignedPreKey,
    findAndDecryptOneTimePreKey,
    deleteOneTimePreKey,
    getPersistedSessionKey,
    storeSessionKey,
    deletePersistedSessionKey,
    notifyOtpkConsumed,
  };
}
