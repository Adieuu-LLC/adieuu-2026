import { describe, expect, test } from 'bun:test';
import type { SerializedWrappedKey } from '../api/conversations-types';
import {
  MESSAGE_SIGN_DOMAIN_V1,
  MESSAGE_SIGN_DOMAIN_V2,
  REACTION_SIGN_DOMAIN_V1,
  REACTION_SIGN_DOMAIN_V2,
  serializeWrappedKeysForSignature,
  buildMessageSignaturePreimageV2,
  buildReactionSignaturePreimageV2,
} from './signatureBinding';

function makeWrappedKey(overrides: Partial<SerializedWrappedKey> = {}): SerializedWrappedKey {
  return {
    identityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    ephemeralPublicKey: 'ephB64==',
    kemCiphertext: 'kemB64==',
    wrappedSessionKey: 'wskB64==',
    wrappingNonce: 'nonceB64==',
    preKeyType: 'static',
    ...overrides,
  };
}

describe('signatureBinding', () => {
  describe('domains', () => {
    test('v1 and v2 domains are distinct for messages and reactions', () => {
      const domains = [
        MESSAGE_SIGN_DOMAIN_V1,
        MESSAGE_SIGN_DOMAIN_V2,
        REACTION_SIGN_DOMAIN_V1,
        REACTION_SIGN_DOMAIN_V2,
      ];
      expect(new Set(domains).size).toBe(4);
    });
  });

  describe('serializeWrappedKeysForSignature', () => {
    test('is invariant to input object key order', () => {
      const canonical = makeWrappedKey({ preKeyType: 'otpk', signedPreKeyId: 'spk-1', oneTimePreKeyId: 'otpk-1' });

      // Same fields, deliberately different insertion order (as a server-side
      // parser like zod might produce).
      const reordered = JSON.parse(
        JSON.stringify({
          oneTimePreKeyId: canonical.oneTimePreKeyId,
          wrappingNonce: canonical.wrappingNonce,
          preKeyType: canonical.preKeyType,
          identityId: canonical.identityId,
          signedPreKeyId: canonical.signedPreKeyId,
          wrappedSessionKey: canonical.wrappedSessionKey,
          kemCiphertext: canonical.kemCiphertext,
          ephemeralPublicKey: canonical.ephemeralPublicKey,
        })
      ) as SerializedWrappedKey;

      expect(serializeWrappedKeysForSignature([reordered])).toBe(
        serializeWrappedKeysForSignature([canonical])
      );
    });

    test('omits absent optional fields entirely', () => {
      const json = serializeWrappedKeysForSignature([makeWrappedKey()]);
      expect(json).not.toContain('signedPreKeyId');
      expect(json).not.toContain('oneTimePreKeyId');
      expect(json).not.toContain('spkKemCiphertext');
      expect(json).not.toContain('otpkKemCiphertext');
      expect(json).not.toContain('routingTag');
      expect(json).not.toContain('wrapVersion');
    });

    test('includes wrapVersion when present', () => {
      const withVersion = serializeWrappedKeysForSignature([makeWrappedKey({ wrapVersion: 2 })]);
      const without = serializeWrappedKeysForSignature([makeWrappedKey()]);
      expect(withVersion).toContain('"wrapVersion":2');
      expect(withVersion).not.toBe(without);
    });

    test('drops unknown extra fields (server-added fields cannot alter the preimage)', () => {
      const withExtra = {
        ...makeWrappedKey(),
        injectedByServer: 'evil',
      } as unknown as SerializedWrappedKey;
      expect(serializeWrappedKeysForSignature([withExtra])).toBe(
        serializeWrappedKeysForSignature([makeWrappedKey()])
      );
    });

    test('preserves entry order (order is signature-relevant)', () => {
      const a = makeWrappedKey({ identityId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
      const b = makeWrappedKey({ identityId: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
      expect(serializeWrappedKeysForSignature([a, b])).not.toBe(
        serializeWrappedKeysForSignature([b, a])
      );
    });
  });

  describe('buildMessageSignaturePreimageV2', () => {
    const context = {
      conversationId: 'c'.repeat(24),
      fromIdentityId: 'f'.repeat(24),
      clientMessageId: '1e0e7c1c-9ad9-4a79-a1f4-98b915cb2f7b',
    };

    test('binds every context field (changing any field changes the preimage)', () => {
      const base = buildMessageSignaturePreimageV2(context, 'ct', 'n', []);

      expect(
        buildMessageSignaturePreimageV2({ ...context, conversationId: 'd'.repeat(24) }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(
        buildMessageSignaturePreimageV2({ ...context, fromIdentityId: 'e'.repeat(24) }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(
        buildMessageSignaturePreimageV2({ ...context, clientMessageId: crypto.randomUUID() }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(buildMessageSignaturePreimageV2(context, 'ct2', 'n', [])).not.toBe(base);
      expect(buildMessageSignaturePreimageV2(context, 'ct', 'n2', [])).not.toBe(base);
      expect(
        buildMessageSignaturePreimageV2(context, 'ct', 'n', [makeWrappedKey()])
      ).not.toBe(base);
    });

    test('starts with the v2 message domain', () => {
      const preimage = buildMessageSignaturePreimageV2(context, 'ct', 'n', []);
      expect(preimage.startsWith(`${MESSAGE_SIGN_DOMAIN_V2}\n`)).toBe(true);
    });

    test('is deterministic', () => {
      const keys = [makeWrappedKey({ wrapVersion: 2 })];
      expect(buildMessageSignaturePreimageV2(context, 'ct', 'n', keys)).toBe(
        buildMessageSignaturePreimageV2(context, 'ct', 'n', keys)
      );
    });
  });

  describe('buildReactionSignaturePreimageV2', () => {
    const context = {
      conversationId: 'c'.repeat(24),
      messageId: 'a'.repeat(24),
      fromIdentityId: 'f'.repeat(24),
      clientReactionId: '9a4a4c3e-9c53-49d2-9f6c-2f0e6d3f6b11',
    };

    test('binds every context field', () => {
      const base = buildReactionSignaturePreimageV2(context, 'ct', 'n', []);

      expect(
        buildReactionSignaturePreimageV2({ ...context, conversationId: 'd'.repeat(24) }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(
        buildReactionSignaturePreimageV2({ ...context, messageId: 'b'.repeat(24) }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(
        buildReactionSignaturePreimageV2({ ...context, fromIdentityId: 'e'.repeat(24) }, 'ct', 'n', [])
      ).not.toBe(base);
      expect(
        buildReactionSignaturePreimageV2({ ...context, clientReactionId: crypto.randomUUID() }, 'ct', 'n', [])
      ).not.toBe(base);
    });

    test('starts with the v2 reaction domain', () => {
      const preimage = buildReactionSignaturePreimageV2(context, 'ct', 'n', []);
      expect(preimage.startsWith(`${REACTION_SIGN_DOMAIN_V2}\n`)).toBe(true);
    });

    test('message and reaction preimages never collide for identical inputs', () => {
      const msgPreimage = buildMessageSignaturePreimageV2(
        {
          conversationId: context.conversationId,
          fromIdentityId: context.fromIdentityId,
          clientMessageId: context.clientReactionId,
        },
        'ct',
        'n',
        []
      );
      const reactionPreimage = buildReactionSignaturePreimageV2(context, 'ct', 'n', []);
      expect(msgPreimage).not.toBe(reactionPreimage);
    });
  });
});
