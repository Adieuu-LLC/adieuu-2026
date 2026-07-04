/**
 * Tests for the E2E device ID registry in deviceInfo.
 *
 * SECURITY: `senderDeviceId` in outgoing payloads must be the E2E crypto
 * device UUID (registered server-side with the device's public keys), never
 * the localStorage browser ID. Peer clients compare it against the sender's
 * registered devices for key-change detection; a browser ID never matches
 * and silently disables that check.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  setActiveE2eDeviceId,
  getActiveE2eDeviceId,
  getSenderDeviceIdForPayload,
  getOrCreateDeviceId,
} from './deviceInfo';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  setActiveE2eDeviceId(null);
});

afterEach(() => {
  setActiveE2eDeviceId(null);
});

describe('deviceInfo E2E device ID registry', () => {
  test('no active device: payload device ID is undefined (no browser-ID fallback)', () => {
    expect(getActiveE2eDeviceId()).toBeNull();
    expect(getSenderDeviceIdForPayload()).toBeUndefined();

    // Even with a browser ID present in localStorage, the payload helper
    // must not fall back to it.
    const browserId = getOrCreateDeviceId();
    expect(browserId).toBeTruthy();
    expect(getSenderDeviceIdForPayload()).toBeUndefined();
  });

  test('set/get round-trip', () => {
    const e2eDeviceId = crypto.randomUUID();
    setActiveE2eDeviceId(e2eDeviceId);

    expect(getActiveE2eDeviceId()).toBe(e2eDeviceId);
    expect(getSenderDeviceIdForPayload()).toBe(e2eDeviceId);
  });

  test('payload device ID is the E2E UUID, distinct from the browser ID', () => {
    const browserId = getOrCreateDeviceId();
    const e2eDeviceId = crypto.randomUUID();
    setActiveE2eDeviceId(e2eDeviceId);

    expect(getSenderDeviceIdForPayload()).toBe(e2eDeviceId);
    expect(getSenderDeviceIdForPayload()).not.toBe(browserId);
  });

  test('clearing on lock/logout removes the payload device ID', () => {
    setActiveE2eDeviceId(crypto.randomUUID());
    expect(getSenderDeviceIdForPayload()).toBeTruthy();

    setActiveE2eDeviceId(null);
    expect(getSenderDeviceIdForPayload()).toBeUndefined();
  });

  test('switching identities replaces the active device ID', () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();

    setActiveE2eDeviceId(first);
    setActiveE2eDeviceId(second);
    expect(getSenderDeviceIdForPayload()).toBe(second);
  });
});
