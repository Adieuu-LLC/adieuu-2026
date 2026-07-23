import { beforeEach, describe, expect, test } from 'bun:test';
import {
  MAX_AV_GAIN,
  getAvMicDeviceId,
  setAvMicDeviceId,
  getAvCameraDeviceId,
  setAvCameraDeviceId,
  getAvSpeakerDeviceId,
  setAvSpeakerDeviceId,
  getAvInputVolume,
  setAvInputVolume,
  getAvOutputVolume,
  setAvOutputVolume,
} from './avPreferenceStorage';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('avPreferenceStorage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('device ids default to null and round-trip', () => {
    expect(getAvMicDeviceId()).toBeNull();
    expect(getAvCameraDeviceId()).toBeNull();
    expect(getAvSpeakerDeviceId()).toBeNull();

    setAvMicDeviceId('mic-1');
    setAvCameraDeviceId('cam-1');
    setAvSpeakerDeviceId('spk-1');

    expect(getAvMicDeviceId()).toBe('mic-1');
    expect(getAvCameraDeviceId()).toBe('cam-1');
    expect(getAvSpeakerDeviceId()).toBe('spk-1');
  });

  test('clearing a device id restores the default', () => {
    setAvMicDeviceId('mic-1');
    setAvMicDeviceId(null);
    expect(getAvMicDeviceId()).toBeNull();

    setAvMicDeviceId('mic-2');
    setAvMicDeviceId('');
    expect(getAvMicDeviceId()).toBeNull();
  });

  test('volumes default to unity gain (1.0)', () => {
    expect(getAvInputVolume()).toBe(1);
    expect(getAvOutputVolume()).toBe(1);
  });

  test('volumes persist as integer percentage and round-trip', () => {
    setAvInputVolume(0.5);
    setAvOutputVolume(1.5);
    expect(getAvInputVolume()).toBeCloseTo(0.5, 5);
    expect(getAvOutputVolume()).toBeCloseTo(1.5, 5);
    expect(localStorage.getItem('adieuu.app.av.inputVolume')).toBe('50');
    expect(localStorage.getItem('adieuu.app.av.outputVolume')).toBe('150');
  });

  test('volumes clamp to [0, MAX_AV_GAIN]', () => {
    setAvOutputVolume(5);
    expect(getAvOutputVolume()).toBe(MAX_AV_GAIN);
    setAvOutputVolume(-1);
    expect(getAvOutputVolume()).toBe(0);
  });
});
