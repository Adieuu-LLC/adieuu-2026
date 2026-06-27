import { describe, expect, test } from 'bun:test';
import { generateSigningKeyPair } from '../keys/generate';
import { randomBytes, toBase64 } from '../utils';
import {
  computeDeviceTrustFingerprintDigestV3,
  encodeDeviceStaticKeyAttestationPreimage,
  encodeDeviceTrustFingerprintPreimageV3,
  signDeviceStaticKeyAttestation,
  verifyDeviceStaticKeyAttestation,
} from './device-trust-fingerprint';

describe('device static key attestation', () => {
  test('preimage is deterministic and differs by deviceId', () => {
    const ecdh = randomBytes(32);
    const kem = randomBytes(1184);
    const a = encodeDeviceStaticKeyAttestationPreimage({
      profile: 'default',
      deviceId: 'd1',
      ecdhPublicKey: ecdh,
      kemPublicKey: kem,
    });
    const b = encodeDeviceStaticKeyAttestationPreimage({
      profile: 'default',
      deviceId: 'd1',
      ecdhPublicKey: ecdh,
      kemPublicKey: kem,
    });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);

    const c = encodeDeviceStaticKeyAttestationPreimage({
      profile: 'default',
      deviceId: 'd2',
      ecdhPublicKey: ecdh,
      kemPublicKey: kem,
    });
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  test('missing KEM uses empty chunk consistently', () => {
    const ecdh = randomBytes(32);
    const withEmpty = encodeDeviceStaticKeyAttestationPreimage({
      profile: 'default',
      deviceId: 'd',
      ecdhPublicKey: ecdh,
      kemPublicKey: new Uint8Array(0),
    });
    const withEmpty2 = encodeDeviceStaticKeyAttestationPreimage({
      profile: 'default',
      deviceId: 'd',
      ecdhPublicKey: ecdh,
      kemPublicKey: new Uint8Array(0),
    });
    expect(Buffer.from(withEmpty).equals(Buffer.from(withEmpty2))).toBe(true);
  });

  test('sign and verify round-trip', () => {
    const keys = generateSigningKeyPair();
    const material = {
      profile: 'default' as const,
      deviceId: 'dev-uuid',
      ecdhPublicKey: randomBytes(32),
      kemPublicKey: randomBytes(1184),
    };
    const sig = signDeviceStaticKeyAttestation(keys.privateKey, material);
    expect(verifyDeviceStaticKeyAttestation(keys.publicKey, sig, material)).toBe(true);
  });

  test('wrong signing key fails verify', () => {
    const keys = generateSigningKeyPair();
    const other = generateSigningKeyPair();
    const material = {
      profile: 'default' as const,
      deviceId: 'dev',
      ecdhPublicKey: randomBytes(32),
      kemPublicKey: new Uint8Array(0),
    };
    const sig = signDeviceStaticKeyAttestation(keys.privateKey, material);
    expect(verifyDeviceStaticKeyAttestation(other.publicKey, sig, material)).toBe(false);
  });
});

describe('device trust fingerprint v3', () => {
  test('computeDeviceTrustFingerprintDigestV3 matches after attestation', () => {
    const keys = generateSigningKeyPair();
    const ecdh = randomBytes(32);
    const kem = randomBytes(1184);
    const deviceId = 'device-1';
    const profile = 'default' as const;
    const material = { profile, deviceId, ecdhPublicKey: ecdh, kemPublicKey: kem };
    const sig = signDeviceStaticKeyAttestation(keys.privateKey, material);

    const input = {
      profile,
      signingPublicKeyB64: toBase64(keys.publicKey),
      deviceId,
      ecdhPublicKeyB64: toBase64(ecdh),
      kemPublicKeyB64: toBase64(kem),
      staticKeyAttestationB64: toBase64(sig),
    };
    const d1 = computeDeviceTrustFingerprintDigestV3(input);
    const d2 = computeDeviceTrustFingerprintDigestV3(input);
    expect(d1.length).toBe(32);
    expect(Buffer.from(d1).equals(Buffer.from(d2))).toBe(true);
  });

  test('throws when attestation is wrong', () => {
    const keys = generateSigningKeyPair();
    const ecdh = randomBytes(32);
    const material = {
      profile: 'default' as const,
      deviceId: 'd',
      ecdhPublicKey: ecdh,
      kemPublicKey: new Uint8Array(0),
    };
    const badSig = new Uint8Array(64);

    expect(() =>
      computeDeviceTrustFingerprintDigestV3({
        profile: 'default',
        signingPublicKeyB64: toBase64(keys.publicKey),
        deviceId: 'd',
        ecdhPublicKeyB64: toBase64(ecdh),
        staticKeyAttestationB64: toBase64(badSig),
      })
    ).toThrow(/attestation verification failed/);
  });

  test('v3 preimage differs from attestation preimage for same keys', () => {
    const keys = generateSigningKeyPair();
    const ecdh = randomBytes(32);
    const kem = new Uint8Array(0);
    const deviceId = 'x';
    const profile = 'default' as const;
    const att = encodeDeviceStaticKeyAttestationPreimage({
      profile,
      deviceId,
      ecdhPublicKey: ecdh,
      kemPublicKey: kem,
    });
    const v3 = encodeDeviceTrustFingerprintPreimageV3({
      profile,
      signingPublicKey: keys.publicKey,
      deviceId,
      ecdhPublicKey: ecdh,
      kemPublicKey: kem,
    });
    expect(Buffer.from(att).equals(Buffer.from(v3))).toBe(false);
  });
});
