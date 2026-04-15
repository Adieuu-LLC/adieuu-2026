import { describe, expect, test } from 'bun:test';
import { generateIdentityKeyBundle, extractPublicKeys } from '../keys';
import { generateSignedPreKey } from '../prekeys';
import {
  computeSafetyFingerprintDigestV2,
  encodeSafetyFingerprintPreimageV2,
  formatSafetyFingerprintDisplay,
} from './fingerprint';
import { concatBytes, toBase64 } from '../utils';

describe('safety fingerprint v2', () => {
  test('computeSafetyFingerprintDigestV2 is deterministic and verifies SPK', () => {
    const bundle = generateIdentityKeyBundle('default');
    const spk = generateSignedPreKey(bundle.signing.privateKey, 'default');
    const signingPubB64 = toBase64(bundle.signing.publicKey);
    const input = {
      profile: 'default' as const,
      signingPublicKeyB64: signingPubB64,
      deviceId: 'device-1',
      signedPreKey: {
        keyId: spk.keyId,
        ecdhPublicKey: toBase64(spk.ecdh.publicKey),
        kemPublicKey: toBase64(spk.kem.publicKey),
        signature: toBase64(spk.signature),
      },
    };
    const a = computeSafetyFingerprintDigestV2(input);
    const b = computeSafetyFingerprintDigestV2(input);
    expect(a.length).toBe(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test('throws when SPK signature is wrong', () => {
    const bundle = generateIdentityKeyBundle('default');
    const spk = generateSignedPreKey(bundle.signing.privateKey, 'default');
    const signingPubB64 = toBase64(bundle.signing.publicKey);
    expect(() =>
      computeSafetyFingerprintDigestV2({
        profile: 'default',
        signingPublicKeyB64: signingPubB64,
        deviceId: 'device-1',
        signedPreKey: {
          keyId: spk.keyId,
          ecdhPublicKey: toBase64(spk.ecdh.publicKey),
          kemPublicKey: toBase64(spk.kem.publicKey),
          signature: toBase64(new Uint8Array(64)), // garbage
        },
      })
    ).toThrow(/verification failed/);
  });

  test('formatSafetyFingerprintDisplay groups hex', () => {
    const digest = new Uint8Array(16).fill(0xab);
    const s = formatSafetyFingerprintDisplay(digest);
    expect(s.split(' ').length).toBe(8);
  });

  test('encodeSafetyFingerprintPreimageV2 differs by device', () => {
    const bundle = generateIdentityKeyBundle('default');
    const pub = extractPublicKeys(bundle);
    const spk = generateSignedPreKey(bundle.signing.privateKey, 'default');
    const spkPub = {
      keyId: spk.keyId,
      ecdhPublicKey: spk.ecdh.publicKey,
      kemPublicKey: spk.kem.publicKey,
      signature: spk.signature,
    };
    const p1 = encodeSafetyFingerprintPreimageV2({
      profile: 'default',
      signingPublicKey: pub.signing,
      deviceId: 'a',
      signedPreKey: spkPub,
    });
    const p2 = encodeSafetyFingerprintPreimageV2({
      profile: 'default',
      signingPublicKey: pub.signing,
      deviceId: 'b',
      signedPreKey: spkPub,
    });
    expect(p1.length).not.toBe(0);
    expect(Buffer.from(p1).equals(Buffer.from(p2))).toBe(false);
  });

  test('length-prefixed preimage supports non-32-byte signing key material', () => {
    const bundle = generateIdentityKeyBundle('default');
    const spk = generateSignedPreKey(bundle.signing.privateKey, 'default');
    const spkPub = {
      keyId: spk.keyId,
      ecdhPublicKey: spk.ecdh.publicKey,
      kemPublicKey: spk.kem.publicKey,
      signature: spk.signature,
    };
    const normal = encodeSafetyFingerprintPreimageV2({
      profile: 'default',
      signingPublicKey: bundle.signing.publicKey,
      deviceId: 'd',
      signedPreKey: spkPub,
    });
    const padded = encodeSafetyFingerprintPreimageV2({
      profile: 'default',
      signingPublicKey: concatBytes(bundle.signing.publicKey, new Uint8Array([1, 2, 3])),
      deviceId: 'd',
      signedPreKey: spkPub,
    });
    expect(normal.length).not.toBe(padded.length);
  });
});
