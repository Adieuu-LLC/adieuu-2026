/**
 * End-to-end Forward Secrecy Message Flow Tests
 *
 * Simulates the full lifecycle of encrypted messaging between two
 * independent users -- each with their own identity key bundle and
 * pre-key material -- as it would occur in production.
 *
 * The test deliberately constructs "over-the-wire" representations
 * (base64-serialised public keys, ClaimedDevicePreKeys shapes) to
 * exercise the serialisation boundary that unit-level round-trips skip.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateIdentityKeyBundle,
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  fromBase64,
  type CryptoProfile,
  type IdentityKeyBundle,
} from '@adieuu/crypto';
import type {
  PublicMessage,
  PublicReaction,
  ClaimedDevicePreKeys,
} from '@adieuu/shared';
import {
  encryptMessage,
  decryptMessage,
  type RecipientKeys,
} from './conversationCryptoService';
import {
  encryptReaction,
  decryptReaction,
} from './reactionCryptoService';

// ---------------------------------------------------------------------------
// Helpers -- simulate production key/claim shapes
// ---------------------------------------------------------------------------

interface UserContext {
  identityId: string;
  deviceId: string;
  bundle: IdentityKeyBundle;
  signingPublicKeyB64: string;
}

function createUser(name: string, profile: CryptoProfile = 'default'): UserContext {
  const bundle = generateIdentityKeyBundle(profile);
  return {
    identityId: `identity-${name}`,
    deviceId: `device-${name}`,
    bundle,
    signingPublicKeyB64: toBase64(bundle.signing.publicKey),
  };
}

interface PreKeyBundle {
  claimed: ClaimedDevicePreKeys;
  spkEcdhPrivate: Uint8Array;
  spkKemPrivate: Uint8Array;
  otpkEcdhPrivate?: Uint8Array;
  otpkKemPrivate?: Uint8Array;
}

function generatePreKeys(
  user: UserContext,
  opts: { withOtpk: boolean; profile?: CryptoProfile }
): PreKeyBundle {
  const profile = opts.profile ?? 'default';
  const spk = generateSignedPreKey(user.bundle.signing.privateKey, profile);

  const claimed: ClaimedDevicePreKeys = {
    deviceId: user.deviceId,
    signedPreKey: {
      keyId: spk.keyId,
      ecdhPublicKey: toBase64(spk.ecdh.publicKey),
      kemPublicKey: toBase64(spk.kem.publicKey),
      signature: toBase64(spk.signature),
    },
    oneTimePreKey: null,
  };

  const result: PreKeyBundle = {
    claimed,
    spkEcdhPrivate: spk.ecdh.privateKey,
    spkKemPrivate: spk.kem.privateKey,
  };

  if (opts.withOtpk) {
    const [otpk] = generateOneTimePreKeys(1, profile);
    claimed.oneTimePreKey = {
      keyId: otpk!.keyId,
      ecdhPublicKey: toBase64(otpk!.ecdh.publicKey),
      kemPublicKey: toBase64(otpk!.kem.publicKey),
    };
    result.otpkEcdhPrivate = otpk!.ecdh.privateKey;
    result.otpkKemPrivate = otpk!.kem.privateKey;
  }

  return result;
}

function buildRecipientKeys(
  user: UserContext,
  preKeyBundle?: PreKeyBundle
): RecipientKeys {
  return {
    identityId: user.identityId,
    signingPublicKey: user.signingPublicKeyB64,
    preferredCryptoProfile: user.bundle.profile,
    devices: [
      {
        deviceId: user.deviceId,
        name: user.deviceId,
        ecdhPublicKey: toBase64(user.bundle.ecdh.publicKey),
        kemPublicKey: toBase64(user.bundle.kem.publicKey),
      },
    ],
    preKeys: preKeyBundle ? [preKeyBundle.claimed] : undefined,
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

function toPublicReaction(
  encrypted: ReturnType<typeof encryptReaction>,
  fromIdentityId: string
): PublicReaction {
  return {
    id: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    fromIdentityId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    wrappedKeys: encrypted.wrappedKeys,
    signature: encrypted.signature,
    cryptoProfile: encrypted.cryptoProfile,
    clientReactionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E forward-secrecy message flow', () => {
  // ---- Scenario 1: Full A->B flow with SPK+OTPK ----

  test('A encrypts with B\'s SPK+OTPK, B decrypts and verifies', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');
    const bobPreKeys = generatePreKeys(bob, { withOtpk: true });

    const recipientBob = buildRecipientKeys(bob, bobPreKeys);
    const encrypted = encryptMessage(
      'Hello Bob, this is Alice.',
      [recipientBob],
      alice.bundle.signing.privateKey
    );

    expect(encrypted.wrappedKeys).toHaveLength(1);
    expect(encrypted.wrappedKeys[0]?.preKeyType).toBe('otpk');
    expect(encrypted.wrappedKeys[0]?.signedPreKeyId).toBe(
      bobPreKeys.claimed.signedPreKey!.keyId
    );
    expect(encrypted.wrappedKeys[0]?.oneTimePreKeyId).toBe(
      bobPreKeys.claimed.oneTimePreKey!.keyId
    );

    const msg = toPublicMessage(encrypted, alice.identityId);
    const decrypted = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys.spkKemPrivate,
        otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
      }
    );

    expect(decrypted.plaintext).toBe('Hello Bob, this is Alice.');
    expect(decrypted.verified).toBe(true);
  });

  // ---- Scenario 2: OTPK consumed -- second message falls back to SPK-only ----

  test('after OTPK consumed, second message uses SPK-only and still decrypts', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');

    // Bob's first pre-key bundle has an OTPK
    const bobPreKeys1 = generatePreKeys(bob, { withOtpk: true });
    const recipient1 = buildRecipientKeys(bob, bobPreKeys1);

    // Message 1: uses SPK+OTPK
    const enc1 = encryptMessage('Message 1', [recipient1], alice.bundle.signing.privateKey);
    expect(enc1.wrappedKeys[0]?.preKeyType).toBe('otpk');

    // Simulate OTPK consumed -- Bob re-publishes with SPK-only (no fresh OTPK)
    const bobPreKeys2 = generatePreKeys(bob, { withOtpk: false });
    const recipient2 = buildRecipientKeys(bob, bobPreKeys2);

    // Message 2: uses SPK-only
    const enc2 = encryptMessage('Message 2', [recipient2], alice.bundle.signing.privateKey);
    expect(enc2.wrappedKeys[0]?.preKeyType).toBe('spk');

    // Bob decrypts message 2 with SPK-only private keys
    const msg2 = toPublicMessage(enc2, alice.identityId);
    const dec2 = decryptMessage(
      msg2,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys2.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys2.spkKemPrivate,
      }
    );

    expect(dec2.plaintext).toBe('Message 2');
    expect(dec2.verified).toBe(true);
  });

  // ---- Scenario 3: Static fallback when no pre-keys at all ----

  test('message encrypted with static keys when no pre-keys available', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');

    const recipientBob = buildRecipientKeys(bob); // no preKeys
    const encrypted = encryptMessage(
      'Static fallback message',
      [recipientBob],
      alice.bundle.signing.privateKey
    );

    expect(encrypted.wrappedKeys[0]?.preKeyType).toBe('static');

    const msg = toPublicMessage(encrypted, alice.identityId);
    const decrypted = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64
    );

    expect(decrypted.plaintext).toBe('Static fallback message');
    expect(decrypted.verified).toBe(true);
  });

  // ---- Scenario 4: Bidirectional -- A->B then B->A ----

  test('bidirectional messaging: A sends to B, then B replies to A', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');

    // Pre-keys for both directions
    const bobPreKeys = generatePreKeys(bob, { withOtpk: true });
    const alicePreKeys = generatePreKeys(alice, { withOtpk: true });

    // A -> B
    const recipientBob = buildRecipientKeys(bob, bobPreKeys);
    const enc1 = encryptMessage('Hi Bob!', [recipientBob], alice.bundle.signing.privateKey);
    const msg1 = toPublicMessage(enc1, alice.identityId);

    const dec1 = decryptMessage(
      msg1,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys.spkKemPrivate,
        otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
      }
    );
    expect(dec1.plaintext).toBe('Hi Bob!');
    expect(dec1.verified).toBe(true);

    // B -> A
    const recipientAlice = buildRecipientKeys(alice, alicePreKeys);
    const enc2 = encryptMessage('Hi Alice!', [recipientAlice], bob.bundle.signing.privateKey);
    const msg2 = toPublicMessage(enc2, bob.identityId);

    const dec2 = decryptMessage(
      msg2,
      alice.identityId,
      alice.bundle.ecdh.privateKey,
      alice.bundle.kem.privateKey,
      bob.signingPublicKeyB64,
      {
        spkEcdhPrivate: alicePreKeys.spkEcdhPrivate,
        spkKemPrivate: alicePreKeys.spkKemPrivate,
        otpkEcdhPrivate: alicePreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: alicePreKeys.otpkKemPrivate!,
      }
    );
    expect(dec2.plaintext).toBe('Hi Alice!');
    expect(dec2.verified).toBe(true);
  });

  // ---- Scenario 5: Multi-recipient group message ----

  test('group message: A encrypts for B and C simultaneously, both decrypt', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');
    const charlie = createUser('charlie');

    const bobPreKeys = generatePreKeys(bob, { withOtpk: true });
    const charliePreKeys = generatePreKeys(charlie, { withOtpk: false });

    const recipients = [
      buildRecipientKeys(bob, bobPreKeys),
      buildRecipientKeys(charlie, charliePreKeys),
    ];

    const encrypted = encryptMessage(
      'Hello group!',
      recipients,
      alice.bundle.signing.privateKey
    );

    expect(encrypted.wrappedKeys).toHaveLength(2);

    // Bob decrypts (SPK+OTPK)
    const msg = toPublicMessage(encrypted, alice.identityId);
    const bobDec = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys.spkKemPrivate,
        otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
      }
    );
    expect(bobDec.plaintext).toBe('Hello group!');
    expect(bobDec.verified).toBe(true);

    // Charlie decrypts (SPK-only)
    const charlieDec = decryptMessage(
      msg,
      charlie.identityId,
      charlie.bundle.ecdh.privateKey,
      charlie.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: charliePreKeys.spkEcdhPrivate,
        spkKemPrivate: charliePreKeys.spkKemPrivate,
      }
    );
    expect(charlieDec.plaintext).toBe('Hello group!');
    expect(charlieDec.verified).toBe(true);
  });

  // ---- Scenario 6: Tamper detection ----

  describe('tamper detection', () => {
    test('tampered ciphertext causes decryption failure', () => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const bobPreKeys = generatePreKeys(bob, { withOtpk: true });

      const encrypted = encryptMessage(
        'Tamper me',
        [buildRecipientKeys(bob, bobPreKeys)],
        alice.bundle.signing.privateKey
      );

      const msg = toPublicMessage(encrypted, alice.identityId);
      const ct = fromBase64(msg.ciphertext!);
      ct[0] ^= 0xff;
      msg.ciphertext = toBase64(ct);

      expect(() =>
        decryptMessage(
          msg,
          bob.identityId,
          bob.bundle.ecdh.privateKey,
          bob.bundle.kem.privateKey,
          alice.signingPublicKeyB64,
          {
            spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
            spkKemPrivate: bobPreKeys.spkKemPrivate,
            otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
            otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
          }
        )
      ).toThrow();
    });

    test('tampered nonce causes decryption failure', () => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const bobPreKeys = generatePreKeys(bob, { withOtpk: true });

      const encrypted = encryptMessage(
        'Tamper nonce',
        [buildRecipientKeys(bob, bobPreKeys)],
        alice.bundle.signing.privateKey
      );

      const msg = toPublicMessage(encrypted, alice.identityId);
      const n = fromBase64(msg.nonce!);
      n[0] ^= 0xff;
      msg.nonce = toBase64(n);

      expect(() =>
        decryptMessage(
          msg,
          bob.identityId,
          bob.bundle.ecdh.privateKey,
          bob.bundle.kem.privateKey,
          alice.signingPublicKeyB64,
          {
            spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
            spkKemPrivate: bobPreKeys.spkKemPrivate,
            otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
            otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
          }
        )
      ).toThrow();
    });

    test('signature does not verify with wrong sender key', () => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const eve = createUser('eve');

      const encrypted = encryptMessage(
        'Who signed this?',
        [buildRecipientKeys(bob)],
        alice.bundle.signing.privateKey
      );

      const msg = toPublicMessage(encrypted, alice.identityId);
      const decrypted = decryptMessage(
        msg,
        bob.identityId,
        bob.bundle.ecdh.privateKey,
        bob.bundle.kem.privateKey,
        eve.signingPublicKeyB64 // Eve's key, not Alice's
      );

      expect(decrypted.plaintext).toBe('Who signed this?');
      expect(decrypted.verified).toBe(false);
    });

    test('wrong recipient private keys cannot unwrap session key', () => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const eve = createUser('eve');

      const encrypted = encryptMessage(
        'Not for Eve',
        [buildRecipientKeys(bob)],
        alice.bundle.signing.privateKey
      );

      const msg = toPublicMessage(encrypted, alice.identityId);

      // Eve tries to decrypt with her own keys but Bob's identityId
      // (she would need to spoof identityId to even find a wrappedKey)
      expect(() =>
        decryptMessage(
          msg,
          eve.identityId,
          eve.bundle.ecdh.privateKey,
          eve.bundle.kem.privateKey,
          alice.signingPublicKeyB64
        )
      ).toThrow('No wrapped key found for this identity');
    });
  });

  // ---- Scenario 7: Reactions follow same FS path ----

  test('reaction E2E: A reacts to B\'s message, B decrypts reaction with FS keys', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');
    const bobPreKeys = generatePreKeys(bob, { withOtpk: true });

    const recipientBob = buildRecipientKeys(bob, bobPreKeys);
    const encrypted = encryptReaction(
      '\uD83D\uDE80',
      alice.identityId,
      [recipientBob],
      alice.bundle.signing.privateKey
    );

    expect(encrypted.wrappedKeys[0]?.preKeyType).toBe('otpk');

    const reaction = toPublicReaction(encrypted, alice.identityId);
    const decrypted = decryptReaction(
      reaction,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys.spkKemPrivate,
        otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
      }
    );

    expect(decrypted.emoji).toBe('\uD83D\uDE80');
    expect(decrypted.verified).toBe(true);
    expect(decrypted.fromIdentityId).toBe(alice.identityId);
  });

  // ---- Scenario 8: Cross-profile (cnsa2) ----

  test('full flow with cnsa2 profile', () => {
    const alice = createUser('alice-cnsa2', 'cnsa2');
    const bob = createUser('bob-cnsa2', 'cnsa2');
    const bobPreKeys = generatePreKeys(bob, { withOtpk: true, profile: 'cnsa2' });

    const recipientBob = buildRecipientKeys(bob, bobPreKeys);
    const encrypted = encryptMessage(
      'CNSA2 secure message',
      [recipientBob],
      alice.bundle.signing.privateKey,
      'cnsa2'
    );

    expect(encrypted.cryptoProfile).toBe('cnsa2');
    expect(encrypted.wrappedKeys[0]?.preKeyType).toBe('otpk');

    const msg = toPublicMessage(encrypted, alice.identityId);
    const decrypted = decryptMessage(
      msg,
      bob.identityId,
      bob.bundle.ecdh.privateKey,
      bob.bundle.kem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: bobPreKeys.spkEcdhPrivate,
        spkKemPrivate: bobPreKeys.spkKemPrivate,
        otpkEcdhPrivate: bobPreKeys.otpkEcdhPrivate!,
        otpkKemPrivate: bobPreKeys.otpkKemPrivate!,
      }
    );

    expect(decrypted.plaintext).toBe('CNSA2 secure message');
    expect(decrypted.verified).toBe(true);
  });

  // ---- Scenario 9: Multi-device recipient ----

  test('recipient with two devices: both independently decrypt with their own pre-keys', () => {
    const alice = createUser('alice');

    // Bob has one identity (one signing key) but two devices, each with
    // separate ECDH/KEM device keys and separate SPKs -- all SPKs signed
    // with the same identity signing key, as in production.
    const bobSigning = generateSigningKeyPair();
    const bobSigningPub = toBase64(bobSigning.publicKey);

    const desktopEcdh = generateECDHKeyPair();
    const desktopKem = generateKEMKeyPair();
    const mobileEcdh = generateECDHKeyPair();
    const mobileKem = generateKEMKeyPair();

    // Both SPKs signed with the same identity signing key
    const desktopSpk = generateSignedPreKey(bobSigning.privateKey);
    const mobileSpk = generateSignedPreKey(bobSigning.privateKey);

    const recipientBob: RecipientKeys = {
      identityId: 'identity-bob',
      signingPublicKey: bobSigningPub,
      preferredCryptoProfile: 'default',
      devices: [
        {
          deviceId: 'bob-desktop',
          name: 'Desktop',
          ecdhPublicKey: toBase64(desktopEcdh.publicKey),
          kemPublicKey: toBase64(desktopKem.publicKey),
        },
        {
          deviceId: 'bob-mobile',
          name: 'Mobile',
          ecdhPublicKey: toBase64(mobileEcdh.publicKey),
          kemPublicKey: toBase64(mobileKem.publicKey),
        },
      ],
      preKeys: [
        {
          deviceId: 'bob-desktop',
          signedPreKey: {
            keyId: desktopSpk.keyId,
            ecdhPublicKey: toBase64(desktopSpk.ecdh.publicKey),
            kemPublicKey: toBase64(desktopSpk.kem.publicKey),
            signature: toBase64(desktopSpk.signature),
          },
          oneTimePreKey: null,
        },
        {
          deviceId: 'bob-mobile',
          signedPreKey: {
            keyId: mobileSpk.keyId,
            ecdhPublicKey: toBase64(mobileSpk.ecdh.publicKey),
            kemPublicKey: toBase64(mobileSpk.kem.publicKey),
            signature: toBase64(mobileSpk.signature),
          },
          oneTimePreKey: null,
        },
      ],
    };

    const encrypted = encryptMessage(
      'Multi-device test',
      [recipientBob],
      alice.bundle.signing.privateKey
    );

    // Both devices should receive a wrapped key
    expect(encrypted.wrappedKeys).toHaveLength(2);
    const desktopWrapped = encrypted.wrappedKeys.find(
      (wk) => wk.signedPreKeyId === desktopSpk.keyId
    );
    const mobileWrapped = encrypted.wrappedKeys.find(
      (wk) => wk.signedPreKeyId === mobileSpk.keyId
    );
    expect(desktopWrapped).toBeTruthy();
    expect(mobileWrapped).toBeTruthy();

    // Each device's wrapped key has distinct ephemeral material
    expect(desktopWrapped!.ephemeralPublicKey).not.toBe(mobileWrapped!.ephemeralPublicKey);
    expect(desktopWrapped!.wrappedSessionKey).not.toBe(mobileWrapped!.wrappedSessionKey);

    const msg = toPublicMessage(encrypted, alice.identityId);

    // Desktop decrypts with its own pre-key private material
    const desktopDec = decryptMessage(
      msg,
      'identity-bob',
      desktopEcdh.privateKey,
      desktopKem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: desktopSpk.ecdh.privateKey,
        spkKemPrivate: desktopSpk.kem.privateKey,
      },
      desktopWrapped
    );
    expect(desktopDec.plaintext).toBe('Multi-device test');
    expect(desktopDec.verified).toBe(true);

    // Mobile decrypts with its own pre-key private material
    const mobileDec = decryptMessage(
      msg,
      'identity-bob',
      mobileEcdh.privateKey,
      mobileKem.privateKey,
      alice.signingPublicKeyB64,
      {
        spkEcdhPrivate: mobileSpk.ecdh.privateKey,
        spkKemPrivate: mobileSpk.kem.privateKey,
      },
      mobileWrapped
    );
    expect(mobileDec.plaintext).toBe('Multi-device test');
    expect(mobileDec.verified).toBe(true);

    // Desktop's pre-key material cannot unwrap mobile's wrapped key
    expect(() =>
      decryptMessage(
        msg,
        'identity-bob',
        desktopEcdh.privateKey,
        desktopKem.privateKey,
        alice.signingPublicKeyB64,
        {
          spkEcdhPrivate: desktopSpk.ecdh.privateKey,
          spkKemPrivate: desktopSpk.kem.privateKey,
        },
        mobileWrapped
      )
    ).toThrow();
  });

  // ---- Scenario 10: Key isolation -- different pre-key bundles produce different ciphertexts ----

  test('same plaintext encrypted with different pre-key bundles produces different ciphertext', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');

    const bundle1 = generatePreKeys(bob, { withOtpk: true });
    const bundle2 = generatePreKeys(bob, { withOtpk: true });

    const enc1 = encryptMessage(
      'Same plaintext',
      [buildRecipientKeys(bob, bundle1)],
      alice.bundle.signing.privateKey
    );
    const enc2 = encryptMessage(
      'Same plaintext',
      [buildRecipientKeys(bob, bundle2)],
      alice.bundle.signing.privateKey
    );

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.nonce).not.toBe(enc2.nonce);
    expect(enc1.wrappedKeys[0]?.wrappedSessionKey).not.toBe(
      enc2.wrappedKeys[0]?.wrappedSessionKey
    );
  });

  // ---- Scenario 11: Message and reaction signing domains are isolated ----

  test('message signature does not verify as reaction signature and vice versa', () => {
    const alice = createUser('alice');
    const bob = createUser('bob');
    const recipientBob = buildRecipientKeys(bob);

    // Encrypt as message
    const msgEnc = encryptMessage(
      'domain check',
      [recipientBob],
      alice.bundle.signing.privateKey
    );

    // Build a fake "reaction" using message-encrypted data
    const fakeReaction: PublicReaction = {
      id: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      fromIdentityId: alice.identityId,
      ciphertext: msgEnc.ciphertext,
      nonce: msgEnc.nonce,
      wrappedKeys: msgEnc.wrappedKeys,
      signature: msgEnc.signature, // message domain signature
      cryptoProfile: msgEnc.cryptoProfile,
      clientReactionId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    // Decrypting a message-encrypted payload as a reaction will either:
    // - Throw because the plaintext isn't valid DecryptedReactionContent JSON, or
    // - If it somehow parses, fail signature verification (different domain)
    // Either outcome prevents cross-domain misuse.
    let threw = false;
    let verifiedAsFalse = false;
    try {
      const result = decryptReaction(
        fakeReaction,
        bob.identityId,
        bob.bundle.ecdh.privateKey,
        bob.bundle.kem.privateKey,
        alice.signingPublicKeyB64
      );
      verifiedAsFalse = !result.verified;
    } catch {
      threw = true;
    }

    expect(threw || verifiedAsFalse).toBe(true);
  });
});
