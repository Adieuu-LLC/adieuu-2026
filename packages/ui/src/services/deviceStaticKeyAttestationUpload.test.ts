/**
 * Tests for static device-key attestation building.
 *
 * The attestation is an Ed25519 signature by the identity signing key over
 * the device's static public keys; the server verifies it at registration
 * as proof of possession (a stolen public-key bundle cannot be re-registered
 * by an attacker who lacks the identity signing key).
 */

import { describe, expect, test } from 'bun:test';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  verifyDeviceStaticKeyAttestation,
  toBase64,
  fromBase64,
} from '@adieuu/crypto';
import { buildDeviceStaticKeyAttestationB64 } from './deviceStaticKeyAttestationUpload';

function makeDevice() {
  const signing = generateSigningKeyPair();
  const ecdh = generateECDHKeyPair();
  const kem = generateKEMKeyPair();
  return {
    signing,
    deviceId: crypto.randomUUID(),
    ecdhPublicKeyB64: toBase64(ecdh.publicKey),
    kemPublicKeyB64: toBase64(kem.publicKey),
    ecdhPublicKey: ecdh.publicKey,
    kemPublicKey: kem.publicKey,
  };
}

describe('buildDeviceStaticKeyAttestationB64', () => {
  test('produces a signature verifiable against the identity signing key', () => {
    const device = makeDevice();

    const attestationB64 = buildDeviceStaticKeyAttestationB64({
      signingPrivateKey: device.signing.privateKey,
      deviceId: device.deviceId,
      ecdhPublicKey: device.ecdhPublicKeyB64,
      kemPublicKey: device.kemPublicKeyB64,
    });

    const valid = verifyDeviceStaticKeyAttestation(
      device.signing.publicKey,
      fromBase64(attestationB64),
      {
        profile: 'default',
        deviceId: device.deviceId,
        ecdhPublicKey: device.ecdhPublicKey,
        kemPublicKey: device.kemPublicKey,
      }
    );
    expect(valid).toBe(true);
  });

  test('does not verify against a different identity signing key', () => {
    const device = makeDevice();
    const otherIdentity = generateSigningKeyPair();

    const attestationB64 = buildDeviceStaticKeyAttestationB64({
      signingPrivateKey: device.signing.privateKey,
      deviceId: device.deviceId,
      ecdhPublicKey: device.ecdhPublicKeyB64,
      kemPublicKey: device.kemPublicKeyB64,
    });

    const valid = verifyDeviceStaticKeyAttestation(
      otherIdentity.publicKey,
      fromBase64(attestationB64),
      {
        profile: 'default',
        deviceId: device.deviceId,
        ecdhPublicKey: device.ecdhPublicKey,
        kemPublicKey: device.kemPublicKey,
      }
    );
    expect(valid).toBe(false);
  });

  test('binds the deviceId: attestation for one device does not verify for another', () => {
    const device = makeDevice();

    const attestationB64 = buildDeviceStaticKeyAttestationB64({
      signingPrivateKey: device.signing.privateKey,
      deviceId: device.deviceId,
      ecdhPublicKey: device.ecdhPublicKeyB64,
      kemPublicKey: device.kemPublicKeyB64,
    });

    const valid = verifyDeviceStaticKeyAttestation(
      device.signing.publicKey,
      fromBase64(attestationB64),
      {
        profile: 'default',
        deviceId: crypto.randomUUID(),
        ecdhPublicKey: device.ecdhPublicKey,
        kemPublicKey: device.kemPublicKey,
      }
    );
    expect(valid).toBe(false);
  });

  test('binds the public keys: substituted ECDH key fails verification', () => {
    const device = makeDevice();
    const substituted = generateECDHKeyPair();

    const attestationB64 = buildDeviceStaticKeyAttestationB64({
      signingPrivateKey: device.signing.privateKey,
      deviceId: device.deviceId,
      ecdhPublicKey: device.ecdhPublicKeyB64,
      kemPublicKey: device.kemPublicKeyB64,
    });

    const valid = verifyDeviceStaticKeyAttestation(
      device.signing.publicKey,
      fromBase64(attestationB64),
      {
        profile: 'default',
        deviceId: device.deviceId,
        ecdhPublicKey: substituted.publicKey,
        kemPublicKey: device.kemPublicKey,
      }
    );
    expect(valid).toBe(false);
  });

  test('handles a missing KEM public key (empty bytes bound in preimage)', () => {
    const device = makeDevice();

    const attestationB64 = buildDeviceStaticKeyAttestationB64({
      signingPrivateKey: device.signing.privateKey,
      deviceId: device.deviceId,
      ecdhPublicKey: device.ecdhPublicKeyB64,
    });

    const valid = verifyDeviceStaticKeyAttestation(
      device.signing.publicKey,
      fromBase64(attestationB64),
      {
        profile: 'default',
        deviceId: device.deviceId,
        ecdhPublicKey: device.ecdhPublicKey,
        kemPublicKey: new Uint8Array(0),
      }
    );
    expect(valid).toBe(true);
  });
});
