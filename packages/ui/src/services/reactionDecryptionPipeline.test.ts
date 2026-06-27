import { describe, expect, test } from 'bun:test';
import { decryptReactionsBatch } from './reactionDecryptionPipeline';

describe('reactionDecryptionPipeline', () => {
  test('returns empty when no signing keys are available', async () => {
    const output = await decryptReactionsBatch({
      publicReactions: [
        {
          id: 'r1',
          messageId: 'm1',
          conversationId: 'c1',
          fromIdentityId: 'sender-1',
          wrappedKeys: [],
        } as never,
      ],
      identityId: 'me-1',
      keys: { ecdhPrivateKey: new Uint8Array([1]), kemPrivateKey: new Uint8Array([2]) },
      wrappingKey: null,
      signingKeys: {},
      reactionSessionKeyCache: new Map(),
      findAndDecryptSignedPreKey: async () => null,
      findAndDecryptOneTimePreKey: async () => null,
      deleteOneTimePreKey: async () => undefined,
      getPersistedSessionKey: async () => null,
      deletePersistedSessionKey: async () => undefined,
      notifyOtpkConsumed: () => undefined,
    });
    expect(output).toHaveLength(0);
  });
});
