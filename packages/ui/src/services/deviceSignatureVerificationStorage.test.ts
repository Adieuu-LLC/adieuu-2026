/**
 * Tests for the TOFU (trust-on-first-use) device fingerprint verification
 * store. These records back the "verified" state in the member security UI;
 * losing or corrupting them silently downgrades a peer device to unverified.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  getDeviceSignatureVerification,
  setDeviceSignatureVerification,
  clearDeviceSignatureVerification,
} from './deviceSignatureVerificationStorage';

const DB_NAME = 'adieuu-device-signature-verification';

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('deviceSignatureVerificationStorage (TOFU store)', () => {
  beforeEach(async () => {
    await deleteDb();
  });

  test('returns null for an unknown peer device', async () => {
    const record = await getDeviceSignatureVerification('peer-1', 'device-1');
    expect(record).toBeNull();
  });

  test('set then get round-trips the verified display snapshot', async () => {
    await setDeviceSignatureVerification('peer-1', 'device-1', 'AAAA BBBB CCCC');

    const record = await getDeviceSignatureVerification('peer-1', 'device-1');
    expect(record).not.toBeNull();
    expect(record!.verifiedDisplay).toBe('AAAA BBBB CCCC');
    expect(Date.parse(record!.verifiedAt)).not.toBeNaN();
  });

  test('records are keyed per peer identity AND device', async () => {
    await setDeviceSignatureVerification('peer-1', 'device-1', 'FP-1');

    // Same device ID under a different peer identity must not collide.
    expect(await getDeviceSignatureVerification('peer-2', 'device-1')).toBeNull();
    // Same peer, different device must not collide.
    expect(await getDeviceSignatureVerification('peer-1', 'device-2')).toBeNull();
  });

  test('re-verification overwrites the stored snapshot', async () => {
    await setDeviceSignatureVerification('peer-1', 'device-1', 'OLD-FP');
    await setDeviceSignatureVerification('peer-1', 'device-1', 'NEW-FP');

    const record = await getDeviceSignatureVerification('peer-1', 'device-1');
    expect(record!.verifiedDisplay).toBe('NEW-FP');
  });

  test('clear removes only the targeted record', async () => {
    await setDeviceSignatureVerification('peer-1', 'device-1', 'FP-1');
    await setDeviceSignatureVerification('peer-1', 'device-2', 'FP-2');

    await clearDeviceSignatureVerification('peer-1', 'device-1');

    expect(await getDeviceSignatureVerification('peer-1', 'device-1')).toBeNull();
    const kept = await getDeviceSignatureVerification('peer-1', 'device-2');
    expect(kept!.verifiedDisplay).toBe('FP-2');
  });

  test('stored snapshot mismatch is detectable (key-change scenario)', async () => {
    // Simulates TOFU key-change detection: the caller compares the stored
    // display against a freshly computed one; a rotated key produces a
    // different fingerprint display.
    await setDeviceSignatureVerification('peer-1', 'device-1', 'FP-BEFORE-ROTATION');

    const record = await getDeviceSignatureVerification('peer-1', 'device-1');
    const freshlyComputed = 'FP-AFTER-ROTATION';
    expect(record!.verifiedDisplay === freshlyComputed).toBe(false);
  });
});
