import { describe, expect, test } from 'bun:test';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  fromBase64,
  verify,
  concatBytes,
  toBytes,
  randomBytes,
} from '@adieuu/crypto';
import type { SerializedWrappedKey, PublicMessage } from '@adieuu/shared';
import {
  encryptMessage,
  decryptMessage,
  encryptGroupName,
  decryptGroupName,
  encryptMemberSettings,
  decryptMemberSettings,
  type RecipientKeys,
} from './conversationCryptoService';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRecipient(opts?: {
  preKeys?: boolean;
  otpk?: boolean;
  missingKem?: boolean;
}): {
  recipient: RecipientKeys;
  ecdhPrivateKey: Uint8Array;
  kemPrivateKey: Uint8Array;
  spkEcdhPrivate?: Uint8Array;
  spkKemPrivate?: Uint8Array;
  otpkEcdhPrivate?: Uint8Array;
  otpkKemPrivate?: Uint8Array;
} {
  const signing = generateSigningKeyPair();
  const ecdh = generateECDHKeyPair();
  const kem = generateKEMKeyPair();
  const identityId = `identity-${crypto.randomUUID().slice(0, 8)}`;
  const deviceId = `device-${crypto.randomUUID().slice(0, 8)}`;

  const device = {
    deviceId,
    name: deviceId,
    ecdhPublicKey: toBase64(ecdh.publicKey),
    kemPublicKey: opts?.missingKem ? undefined : toBase64(kem.publicKey),
  };

  const result: ReturnType<typeof makeRecipient> = {
    recipient: {
      identityId,
      signingPublicKey: toBase64(signing.publicKey),
      preferredCryptoProfile: 'default',
      devices: [device],
    },
    ecdhPrivateKey: ecdh.privateKey,
    kemPrivateKey: kem.privateKey,
  };

  if (opts?.preKeys) {
    const spk = generateSignedPreKey(signing.privateKey);
    const preKeyEntry = {
      deviceId,
      signedPreKey: {
        keyId: spk.keyId,
        ecdhPublicKey: toBase64(spk.ecdh.publicKey),
        kemPublicKey: toBase64(spk.kem.publicKey),
        signature: toBase64(spk.signature),
      },
      oneTimePreKey: null as { keyId: string; ecdhPublicKey: string; kemPublicKey: string } | null,
    };

    result.spkEcdhPrivate = spk.ecdh.privateKey;
    result.spkKemPrivate = spk.kem.privateKey;

    if (opts.otpk) {
      const [otpk] = generateOneTimePreKeys(1);
      preKeyEntry.oneTimePreKey = {
        keyId: otpk!.keyId,
        ecdhPublicKey: toBase64(otpk!.ecdh.publicKey),
        kemPublicKey: toBase64(otpk!.kem.publicKey),
      };
      result.otpkEcdhPrivate = otpk!.ecdh.privateKey;
      result.otpkKemPrivate = otpk!.kem.privateKey;
    }

    result.recipient.preKeys = [preKeyEntry];
  }

  return result;
}

function makeSender() {
  const signing = generateSigningKeyPair();
  return {
    signingPrivateKey: signing.privateKey,
    signingPublicKey: toBase64(signing.publicKey),
  };
}

function toPublicMessage(
  encrypted: ReturnType<typeof encryptMessage>,
  fromIdentityId: string
): PublicMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    fromIdentityId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    wrappedKeys: encrypted.wrappedKeys,
    signature: encrypted.signature,
    cryptoProfile: encrypted.cryptoProfile,
    clientMessageId: crypto.randomUUID(),
    deleted: false,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conversationCryptoService', () => {
  describe('encryptMessage', () => {
    test('produces valid ciphertext, nonce, wrappedKeys, signature, and cryptoProfile', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);

      expect(result.ciphertext).toBeTruthy();
      expect(result.nonce).toBeTruthy();
      expect(result.wrappedKeys.length).toBeGreaterThan(0);
      expect(result.signature).toBeTruthy();
      expect(result.cryptoProfile).toBe('default');
    });

    test('wraps session key for each recipient device', () => {
      const sender = makeSender();
      const r1 = makeRecipient();
      const r2 = makeRecipient();

      const result = encryptMessage('hello', [r1.recipient, r2.recipient], sender.signingPrivateKey);

      const ids = result.wrappedKeys.map((wk) => wk.identityId);
      expect(ids).toContain(r1.recipient.identityId);
      expect(ids).toContain(r2.recipient.identityId);
      expect(result.wrappedKeys.length).toBe(2);
    });

    test('generates unique wrappedKey entries per device on a multi-device recipient', () => {
      const sender = makeSender();
      const signing = generateSigningKeyPair();
      const ecdh1 = generateECDHKeyPair();
      const kem1 = generateKEMKeyPair();
      const ecdh2 = generateECDHKeyPair();
      const kem2 = generateKEMKeyPair();

      const recipient: RecipientKeys = {
        identityId: 'multi-device-id',
        signingPublicKey: toBase64(signing.publicKey),
        preferredCryptoProfile: 'default',
        devices: [
          { deviceId: 'dev-a', name: 'A', ecdhPublicKey: toBase64(ecdh1.publicKey), kemPublicKey: toBase64(kem1.publicKey) },
          { deviceId: 'dev-b', name: 'B', ecdhPublicKey: toBase64(ecdh2.publicKey), kemPublicKey: toBase64(kem2.publicKey) },
        ],
      };

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);
      expect(result.wrappedKeys.length).toBe(2);

      const k1 = result.wrappedKeys[0]!;
      const k2 = result.wrappedKeys[1]!;
      expect(k1.ephemeralPublicKey).not.toBe(k2.ephemeralPublicKey);
    });

    test('handles SPK+OTPK pre-key wrapping', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient({ preKeys: true, otpk: true });

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);
      expect(result.wrappedKeys[0]?.preKeyType).toBe('otpk');
      expect(result.wrappedKeys[0]?.signedPreKeyId).toBeTruthy();
      expect(result.wrappedKeys[0]?.oneTimePreKeyId).toBeTruthy();
    });

    test('falls back to static key wrapping when no pre-keys are claimed', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);
      expect(result.wrappedKeys[0]?.preKeyType).toBe('static');
    });

    test('skips devices missing kemPublicKey', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient({ missingKem: true });

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);
      expect(result.wrappedKeys.length).toBe(0);
    });

    test('skips pre-key wrapping when signed pre-key signature is invalid', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient({ preKeys: true });
      recipient.preKeys![0]!.signedPreKey.signature = toBase64(randomBytes(64));

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);
      expect(result.wrappedKeys.length).toBe(0);
    });

    test('produces verifiable Ed25519 signature', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();
      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey);

      const dataToVerify = concatBytes(
        toBytes('adieuu-msg-v1'),
        fromBase64(result.ciphertext),
        fromBase64(result.nonce),
        toBytes(JSON.stringify(result.wrappedKeys))
      );
      const sigPub = fromBase64(sender.signingPublicKey);
      expect(verify(sigPub, dataToVerify, fromBase64(result.signature))).toBe(true);
    });

    test('respects senderCryptoProfile parameter', () => {
      const sender = makeSender();
      // cnsa2 requires ML-KEM-1024 key pairs
      const signing = generateSigningKeyPair();
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair('cnsa2');

      const recipient: RecipientKeys = {
        identityId: 'cnsa2-recipient',
        signingPublicKey: toBase64(signing.publicKey),
        preferredCryptoProfile: 'cnsa2',
        devices: [{
          deviceId: 'cnsa2-device',
          name: 'cnsa2-device',
          ecdhPublicKey: toBase64(ecdh.publicKey),
          kemPublicKey: toBase64(kem.publicKey),
        }],
      };

      const result = encryptMessage('hello', [recipient], sender.signingPrivateKey, 'cnsa2');
      expect(result.cryptoProfile).toBe('cnsa2');
      expect(result.wrappedKeys.length).toBe(1);
    });
  });

  describe('decryptMessage', () => {
    test('round-trip: encrypt then decrypt recovers original plaintext', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('round trip test', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const result = decryptMessage(
        msg, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.plaintext).toBe('round trip test');
    });

    test('signature verification succeeds for valid messages', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('signed msg', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const result = decryptMessage(
        msg, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.verified).toBe(true);
    });

    test('signature verification fails for tampered ciphertext', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('tamper test', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const tamperedCiphertext = fromBase64(msg.ciphertext!);
      tamperedCiphertext[0] ^= 0xff;
      msg.ciphertext = toBase64(tamperedCiphertext);

      expect(() => {
        decryptMessage(
          msg, r.recipient.identityId,
          r.ecdhPrivateKey, r.kemPrivateKey,
          sender.signingPublicKey
        );
      }).toThrow();
    });

    test('decryption with SPK-only pre-keys', () => {
      const sender = makeSender();
      const r = makeRecipient({ preKeys: true });
      const encrypted = encryptMessage('spk only', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const result = decryptMessage(
        msg, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey,
        { spkEcdhPrivate: r.spkEcdhPrivate!, spkKemPrivate: r.spkKemPrivate! }
      );

      expect(result.plaintext).toBe('spk only');
      expect(result.verified).toBe(true);
    });

    test('throws when pre-key wrapped message is decrypted without pre-key private keys', () => {
      const sender = makeSender();
      const r = makeRecipient({ preKeys: true });
      const encrypted = encryptMessage('spk only', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      expect(() =>
        decryptMessage(
          msg,
          r.recipient.identityId,
          r.ecdhPrivateKey,
          r.kemPrivateKey,
          sender.signingPublicKey
        )
      ).toThrow('Pre-key private keys required to decrypt this message');
    });

    test('decryption with SPK+OTPK pre-keys', () => {
      const sender = makeSender();
      const r = makeRecipient({ preKeys: true, otpk: true });
      const encrypted = encryptMessage('spk+otpk', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const result = decryptMessage(
        msg, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey,
        {
          spkEcdhPrivate: r.spkEcdhPrivate!,
          spkKemPrivate: r.spkKemPrivate!,
          otpkEcdhPrivate: r.otpkEcdhPrivate!,
          otpkKemPrivate: r.otpkKemPrivate!,
        }
      );

      expect(result.plaintext).toBe('spk+otpk');
      expect(result.verified).toBe(true);
    });

    test('decryption with static device keys', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('static', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      const result = decryptMessage(
        msg, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.plaintext).toBe('static');
    });

    test('throws when no matching wrappedKey exists for the recipient', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('no match', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');

      expect(() => {
        decryptMessage(
          msg, 'wrong-identity-id',
          r.ecdhPrivateKey, r.kemPrivateKey,
          sender.signingPublicKey
        );
      }).toThrow('No wrapped key found for this identity');
    });

    test('throws on deleted message', () => {
      const msg: PublicMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        fromIdentityId: 'sender-id',
        deleted: true,
        cryptoProfile: 'default',
        clientMessageId: 'cm-1',
        createdAt: new Date().toISOString(),
      };

      expect(() => {
        decryptMessage(
          msg, 'my-id',
          new Uint8Array(32), new Uint8Array(32),
          'AAAA'
        );
      }).toThrow('Cannot decrypt a deleted message');
    });

    test('treats incomplete message payload as deleted/unavailable', () => {
      const msg: PublicMessage = {
        id: 'msg-2',
        conversationId: 'conv-2',
        fromIdentityId: 'sender-id',
        deleted: false,
        nonce: 'AAAA',
        wrappedKeys: [],
        signature: 'AAAA',
        cryptoProfile: 'default',
        clientMessageId: 'cm-2',
        createdAt: new Date().toISOString(),
      };

      expect(() =>
        decryptMessage(msg, 'my-id', new Uint8Array(32), new Uint8Array(32), 'AAAA')
      ).toThrow('Cannot decrypt a deleted message');
    });

    test('uses cachedSessionKey when provided (ignores wrapped key lookup)', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('cached path', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');
      const first = decryptMessage(
        msg,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey
      );

      const missingWrapped: PublicMessage = { ...msg, wrappedKeys: [] };
      const cached = decryptMessage(
        missingWrapped,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey,
        undefined,
        undefined,
        first.sessionKey
      );
      expect(cached.plaintext).toBe('cached path');
    });

    test('uses resolvedWrappedKey override when provided', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('resolved key path', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');
      const resolved = msg.wrappedKeys[0]!;

      const result = decryptMessage(
        msg,
        'not-the-identity-in-wrapped-key',
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey,
        undefined,
        resolved
      );
      expect(result.plaintext).toBe('resolved key path');
    });

    test('returns verified=false when signature is malformed but payload decrypts', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const encrypted = encryptMessage('signature failure path', [r.recipient], sender.signingPrivateKey);
      const msg = toPublicMessage(encrypted, 'sender-id');
      msg.signature = 'not-base64-signature';

      const result = decryptMessage(
        msg,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey
      );
      expect(result.plaintext).toBe('signature failure path');
      expect(result.verified).toBe(false);
    });
  });

  describe('encryptGroupName / decryptGroupName', () => {
    test('round-trip: encrypt then decrypt recovers group name', () => {
      const convId = crypto.randomUUID();
      const name = 'My Group Chat';
      const { encryptedName, nameNonce } = encryptGroupName(name, convId);
      const result = decryptGroupName(encryptedName, nameNonce, convId);
      expect(result).toBe(name);
    });

    test('deterministic: same conversationId + name produces same ciphertext (KDF only)', () => {
      const convId = crypto.randomUUID();
      const a = encryptGroupName('Same Name', convId);
      const b = encryptGroupName('Same Name', convId);
      // Different nonces mean different ciphertexts -- this is expected since
      // each call uses a fresh random nonce.
      expect(a.nameNonce).not.toBe(b.nameNonce);
    });

    test('different conversationIds produce different ciphertexts for the same name', () => {
      const a = encryptGroupName('Shared Name', 'conv-a');
      const b = encryptGroupName('Shared Name', 'conv-b');
      expect(a.encryptedName).not.toBe(b.encryptedName);
    });

    test('handles unicode group names', () => {
      const convId = crypto.randomUUID();
      const name = 'Cafe du Monde \u2615\uD83C\uDF1F';
      const { encryptedName, nameNonce } = encryptGroupName(name, convId);
      const result = decryptGroupName(encryptedName, nameNonce, convId);
      expect(result).toBe(name);
    });

    test('respects crypto profile parameter', () => {
      const convId = crypto.randomUUID();
      const name = 'CNSA2 Group';
      const { encryptedName, nameNonce } = encryptGroupName(name, convId, 'cnsa2');
      const result = decryptGroupName(encryptedName, nameNonce, convId, 'cnsa2');
      expect(result).toBe(name);
    });
  });

  describe('encryptMemberSettings / decryptMemberSettings', () => {
    test('round-trips member settings map', () => {
      const conversationId = crypto.randomUUID();
      const settings = {
        alice: { nickname: 'Al', color: '#f00' },
        bob: { nickname: 'Bobby' },
      };
      const encrypted = encryptMemberSettings(settings, conversationId);
      const decrypted = decryptMemberSettings(
        encrypted.encryptedMemberSettings,
        encrypted.memberSettingsNonce,
        conversationId
      );
      expect(decrypted).toEqual(settings);
    });

    test('fails to decrypt with wrong conversationId', () => {
      const encrypted = encryptMemberSettings({ alice: { nickname: 'A' } }, 'conv-a');
      expect(() =>
        decryptMemberSettings(
          encrypted.encryptedMemberSettings,
          encrypted.memberSettingsNonce,
          'conv-b'
        )
      ).toThrow();
    });
  });
});
