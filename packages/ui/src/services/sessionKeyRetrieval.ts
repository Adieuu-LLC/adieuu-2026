import { toBase64 } from '@adieuu/crypto';

export interface SessionKeyRetrievalParams {
  messageIds: string[];
  identityId: string;
  wrappingKey: Uint8Array | null;
  sessionKeyCache: Map<string, Uint8Array>;
  getPersistedSessionKey: (
    messageId: string,
    identityId: string,
    wrappingKey: Uint8Array
  ) => Promise<Uint8Array | null>;
}

export async function getSessionKeysForMessages(
  params: SessionKeyRetrievalParams
): Promise<Record<string, string>> {
  const { messageIds, identityId, wrappingKey, sessionKeyCache, getPersistedSessionKey } =
    params;
  const result: Record<string, string> = {};

  for (const msgId of messageIds) {
    let sessionKey = sessionKeyCache.get(msgId);
    if (!sessionKey && wrappingKey) {
      const persisted = await getPersistedSessionKey(msgId, identityId, wrappingKey);
      if (persisted) {
        sessionKey = persisted;
        sessionKeyCache.set(msgId, persisted);
      }
    }
    if (sessionKey) {
      result[msgId] = toBase64(sessionKey);
    }
  }

  return result;
}
