import { describe, expect, test } from 'bun:test';
import type { PublicMessage } from '@adieuu/shared';
import { decryptMessageBatch } from './messageDecryptionPipeline';

function makeMessage(overrides: Partial<PublicMessage> = {}): PublicMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conv-1',
    fromIdentityId: 'sender-1',
    ciphertext: 'cipher',
    nonce: 'nonce',
    wrappedKeys: [],
    signature: 'sig',
    cryptoProfile: 'default',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createBaseParams(messages: PublicMessage[]) {
  const deletedPersisted: string[] = [];
  return {
    params: {
      messages,
      conversationId: 'conv-1',
      identityId: 'me-1',
      wrappingKey: null,
      ecdhPrivateKey: null,
      kemPrivateKey: null,
      signingKeyCache: {},
      existingMessages: [],
      sessionKeyCache: new Map<string, Uint8Array>(),
      fetchSigningKey: async () => null,
      resolveParticipants: () => undefined,
      findAndDecryptSignedPreKey: async () => null,
      findAndDecryptOneTimePreKey: async () => null,
      deleteOneTimePreKey: async () => undefined,
      getPersistedSessionKey: async () => null,
      storeSessionKey: async () => undefined,
      deletePersistedSessionKey: async (messageId: string) => {
        deletedPersisted.push(messageId);
      },
      notifyOtpkConsumed: () => undefined,
    },
    deletedPersisted,
  };
}

describe('messageDecryptionPipeline', () => {
  test('preserves already decrypted messages on no-cursor refetch', async () => {
    const msg = makeMessage({ id: 'msg-1' });
    const { params } = createBaseParams([msg]);
    params.existingMessages = [{ ...msg, decryptedContent: 'hello', signatureVerified: true }];
    const out = await decryptMessageBatch(params);
    expect(out).toHaveLength(1);
    expect(out[0]?.decryptedContent).toBe('hello');
    expect(out[0]?.signatureVerified).toBe(true);
  });

  test('cleans up deleted messages and removes persisted session key', async () => {
    const msg = makeMessage({ id: 'msg-deleted', deleted: true });
    const { params, deletedPersisted } = createBaseParams([msg]);
    params.sessionKeyCache.set('msg-deleted', new Uint8Array([1, 2, 3]));
    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptedContent).toBeUndefined();
    expect(params.sessionKeyCache.has('msg-deleted')).toBe(false);
    expect(deletedPersisted).toEqual(['msg-deleted']);
  });

  test('returns decryption error when device keys are unavailable', async () => {
    const msg = makeMessage({
      id: 'msg-2',
      wrappedKeys: [{ identityId: 'me-1', deviceId: 'd1', preKeyType: 'static', wrappedKey: 'abc' }],
    });
    const { params } = createBaseParams([msg]);
    params.fetchSigningKey = async () => 'sender-signing-key';
    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptionError).toBe('Device keys unavailable');
  });
});
