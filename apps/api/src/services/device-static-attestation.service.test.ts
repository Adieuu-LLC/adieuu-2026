/**
 * Tests for server-side static device-key attestation verification.
 *
 * Uses real Ed25519 crypto (no mocks): the server must only accept device
 * registrations whose static keys were endorsed by the identity signing key.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  signDeviceStaticKeyAttestation,
  toBase64,
} from '@adieuu/crypto';
import { verifyDeviceStoredStaticKeyAttestation } from './device-static-attestation.service';
import type { IdentityDevice, IdentityDocument } from '../models/identity';

function makeFixture() {
  const signing = generateSigningKeyPair();
  const ecdh = generateECDHKeyPair();
  const kem = generateKEMKeyPair();
  const deviceId = crypto.randomUUID();

  const identity = {
    signingPublicKey: toBase64(signing.publicKey),
    preferredCryptoProfile: 'default',
  } as IdentityDocument;

  const device: IdentityDevice = {
    deviceId,
    name: 'Phone',
    ecdhPublicKey: toBase64(ecdh.publicKey),
    kemPublicKey: toBase64(kem.publicKey),
    registeredAt: new Date(),
    lastActiveAt: new Date(),
  };

  const signature = toBase64(
    signDeviceStaticKeyAttestation(signing.privateKey, {
      profile: 'default',
      deviceId,
      ecdhPublicKey: ecdh.publicKey,
      kemPublicKey: kem.publicKey,
    })
  );

  return { signing, identity, device, signature };
}

describe('verifyDeviceStoredStaticKeyAttestation', () => {
  test('accepts an attestation signed by the identity signing key', () => {
    const { identity, device, signature } = makeFixture();
    expect(verifyDeviceStoredStaticKeyAttestation(identity, device, signature)).toBe(true);
  });

  test('rejects an attestation signed by a different identity', () => {
    const { device, signature } = makeFixture();
    const otherIdentity = {
      signingPublicKey: toBase64(generateSigningKeyPair().publicKey),
      preferredCryptoProfile: 'default',
    } as IdentityDocument;
    expect(verifyDeviceStoredStaticKeyAttestation(otherIdentity, device, signature)).toBe(false);
  });

  test('rejects when the device public keys were substituted', () => {
    const { identity, device, signature } = makeFixture();
    const substituted: IdentityDevice = {
      ...device,
      ecdhPublicKey: toBase64(generateECDHKeyPair().publicKey),
    };
    expect(verifyDeviceStoredStaticKeyAttestation(identity, substituted, signature)).toBe(false);
  });

  test('rejects when the deviceId was changed', () => {
    const { identity, device, signature } = makeFixture();
    const renamed: IdentityDevice = { ...device, deviceId: crypto.randomUUID() };
    expect(verifyDeviceStoredStaticKeyAttestation(identity, renamed, signature)).toBe(false);
  });

  test('returns false when identity has no signing key', () => {
    const { device, signature } = makeFixture();
    const noKeyIdentity = { signingPublicKey: undefined } as unknown as IdentityDocument;
    expect(verifyDeviceStoredStaticKeyAttestation(noKeyIdentity, device, signature)).toBe(false);
  });

  test('returns false (not throw) on malformed base64 signature', () => {
    const { identity, device } = makeFixture();
    expect(verifyDeviceStoredStaticKeyAttestation(identity, device, '!!!not-base64!!!')).toBe(false);
  });

  test('handles a device without a KEM public key', () => {
    const signing = generateSigningKeyPair();
    const ecdh = generateECDHKeyPair();
    const deviceId = crypto.randomUUID();

    const identity = {
      signingPublicKey: toBase64(signing.publicKey),
      preferredCryptoProfile: 'default',
    } as IdentityDocument;

    const device: IdentityDevice = {
      deviceId,
      name: 'Phone',
      ecdhPublicKey: toBase64(ecdh.publicKey),
      registeredAt: new Date(),
      lastActiveAt: new Date(),
    };

    const signature = toBase64(
      signDeviceStaticKeyAttestation(signing.privateKey, {
        profile: 'default',
        deviceId,
        ecdhPublicKey: ecdh.publicKey,
        kemPublicKey: new Uint8Array(0),
      })
    );

    expect(verifyDeviceStoredStaticKeyAttestation(identity, device, signature)).toBe(true);
  });
});
