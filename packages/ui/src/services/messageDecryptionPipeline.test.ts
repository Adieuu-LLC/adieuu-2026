import { describe, expect, test } from 'bun:test';
import type { PublicMessage, MessageSignatureContext } from '@adieuu/shared';
import {
  generateIdentityKeyBundle,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
} from '@adieuu/crypto';
import { encryptMessage, decryptMessage, type RecipientKeys } from './conversationCryptoService';
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
    clientMessageId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    deleted: false,
    revisionCount: 0,
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

// Helpers for crypto-based tests

interface TestUser {
  identityId: string;
  deviceId: string;
  bundle: ReturnType<typeof generateIdentityKeyBundle>;
  signingPublicKeyB64: string;
}

function createTestUser(name: string): TestUser {
  const bundle = generateIdentityKeyBundle('default');
  return {
    identityId: `identity-${name}`,
    deviceId: `device-${name}`,
    bundle,
    signingPublicKeyB64: toBase64(bundle.signing.publicKey),
  };
}

function buildRecipient(user: TestUser, preKeys?: { claimed: unknown }): RecipientKeys {
  return {
    identityId: user.identityId,
    signingPublicKey: user.signingPublicKeyB64,
    preferredCryptoProfile: 'default',
    devices: [
      {
        deviceId: user.deviceId,
        name: user.deviceId,
        ecdhPublicKey: toBase64(user.bundle.ecdh.publicKey),
        kemPublicKey: toBase64(user.bundle.kem.publicKey),
      },
    ],
    preKeys: preKeys ? [preKeys.claimed as RecipientKeys['preKeys'] extends (infer U)[] | undefined ? U : never] : undefined,
  };
}

function makeMsgContext(fromIdentityId: string): MessageSignatureContext {
  return {
    conversationId: 'conv-1',
    fromIdentityId,
    clientMessageId: crypto.randomUUID(),
  };
}

function toPublicMsg(
  encrypted: ReturnType<typeof encryptMessage>,
  context: MessageSignatureContext
): PublicMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: context.conversationId,
    fromIdentityId: context.fromIdentityId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    wrappedKeys: encrypted.wrappedKeys,
    signature: encrypted.signature,
    cryptoProfile: encrypted.cryptoProfile,
    clientMessageId: context.clientMessageId,
    createdAt: new Date().toISOString(),
    deleted: false,
    revisionCount: 0,
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

  test('cached session key: static-wrapped message has forwardSecrecy=false', async () => {
    const alice = createTestUser('alice');
    const bob = createTestUser('bob');

    const recipient = buildRecipient(bob);
    const context = makeMsgContext(alice.identityId);
    const encrypted = encryptMessage('static test', [recipient], alice.bundle.signing.privateKey, context);
    const msg = toPublicMsg(encrypted, context);

    // First-pass decrypt to obtain the session key
    const first = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64
    );
    expect(first.plaintext).toBe('static test');
    expect(msg.wrappedKeys[0]?.preKeyType).toBe('static');

    // Feed into pipeline with the session key pre-cached
    const { params } = createBaseParams([msg]);
    params.identityId = bob.identityId;
    params.ecdhPrivateKey = bob.bundle.ecdh.privateKey;
    params.kemPrivateKey = bob.bundle.kem.privateKey;
    params.signingKeyCache[alice.identityId] = alice.signingPublicKeyB64;
    params.sessionKeyCache.set(msg.id, first.sessionKey);

    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptedContent).toBe('static test');
    expect(out[0]?.forwardSecrecy).toBe(false);
  });

  test('cached session key: SPK-wrapped message has forwardSecrecy=true', async () => {
    const alice = createTestUser('alice');
    const bob = createTestUser('bob');

    const spk = generateSignedPreKey(bob.bundle.signing.privateKey, 'default');
    const claimed = {
      deviceId: bob.deviceId,
      signedPreKey: {
        keyId: spk.keyId,
        ecdhPublicKey: toBase64(spk.ecdh.publicKey),
        kemPublicKey: toBase64(spk.kem.publicKey),
        signature: toBase64(spk.signature),
      },
      oneTimePreKey: null,
    };

    const recipient = buildRecipient(bob, { claimed });
    const context = makeMsgContext(alice.identityId);
    const encrypted = encryptMessage('spk test', [recipient], alice.bundle.signing.privateKey, context);
    const msg = toPublicMsg(encrypted, context);

    expect(msg.wrappedKeys[0]?.preKeyType).toBe('spk');

    const first = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      { spkEcdhPrivate: spk.ecdh.privateKey, spkKemPrivate: spk.kem.privateKey }
    );
    expect(first.plaintext).toBe('spk test');

    const { params } = createBaseParams([msg]);
    params.identityId = bob.identityId;
    params.ecdhPrivateKey = bob.bundle.ecdh.privateKey;
    params.kemPrivateKey = bob.bundle.kem.privateKey;
    params.signingKeyCache[alice.identityId] = alice.signingPublicKeyB64;
    params.sessionKeyCache.set(msg.id, first.sessionKey);

    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptedContent).toBe('spk test');
    expect(out[0]?.forwardSecrecy).toBe(true);
  });

  test('cached session key: OTPK-wrapped message has forwardSecrecy=true', async () => {
    const alice = createTestUser('alice');
    const bob = createTestUser('bob');

    const spk = generateSignedPreKey(bob.bundle.signing.privateKey, 'default');
    const [otpk] = generateOneTimePreKeys(1, 'default');

    const claimed = {
      deviceId: bob.deviceId,
      signedPreKey: {
        keyId: spk.keyId,
        ecdhPublicKey: toBase64(spk.ecdh.publicKey),
        kemPublicKey: toBase64(spk.kem.publicKey),
        signature: toBase64(spk.signature),
      },
      oneTimePreKey: {
        keyId: otpk!.keyId,
        ecdhPublicKey: toBase64(otpk!.ecdh.publicKey),
        kemPublicKey: toBase64(otpk!.kem.publicKey),
      },
    };

    const recipient = buildRecipient(bob, { claimed });
    const context = makeMsgContext(alice.identityId);
    const encrypted = encryptMessage('otpk test', [recipient], alice.bundle.signing.privateKey, context);
    const msg = toPublicMsg(encrypted, context);

    expect(msg.wrappedKeys[0]?.preKeyType).toBe('otpk');

    const first = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: spk.ecdh.privateKey,
        spkKemPrivate: spk.kem.privateKey,
        otpkEcdhPrivate: otpk!.ecdh.privateKey,
        otpkKemPrivate: otpk!.kem.privateKey,
      }
    );
    expect(first.plaintext).toBe('otpk test');

    const { params } = createBaseParams([msg]);
    params.identityId = bob.identityId;
    params.ecdhPrivateKey = bob.bundle.ecdh.privateKey;
    params.kemPrivateKey = bob.bundle.kem.privateKey;
    params.signingKeyCache[alice.identityId] = alice.signingPublicKeyB64;
    params.sessionKeyCache.set(msg.id, first.sessionKey);

    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptedContent).toBe('otpk test');
    expect(out[0]?.forwardSecrecy).toBe(true);
  });

  test('static fallback decryption sets forwardSecrecy=false', async () => {
    const alice = createTestUser('alice');
    const bob = createTestUser('bob');

    const recipient = buildRecipient(bob);
    const context = makeMsgContext(alice.identityId);
    const encrypted = encryptMessage('fallback test', [recipient], alice.bundle.signing.privateKey, context);
    const msg = toPublicMsg(encrypted, context);

    const { params } = createBaseParams([msg]);
    params.identityId = bob.identityId;
    params.ecdhPrivateKey = bob.bundle.ecdh.privateKey;
    params.kemPrivateKey = bob.bundle.kem.privateKey;
    params.signingKeyCache[alice.identityId] = alice.signingPublicKeyB64;

    const out = await decryptMessageBatch(params);
    expect(out[0]?.decryptedContent).toBe('fallback test');
    expect(out[0]?.signatureVerified).toBe(true);
    expect(out[0]?.forwardSecrecy).toBe(false);
  });
});
