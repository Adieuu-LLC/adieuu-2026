/**
 * Audio & Video device / volume preferences in localStorage — no React.
 * Hooks in `useAvPreferences` subscribe via `useSyncExternalStore`; plain
 * modules (e.g. `livekitRoomHandle`) read the getters directly so they never
 * pull in the React graph or the heavy LiveKit bundle.
 *
 * Preferences are device-scoped (localStorage), mirroring notification sounds.
 */

export const MAX_AV_GAIN = 2;
const DEFAULT_VOLUME = 1;

const STORAGE_KEY_MIC = 'adieuu.app.av.micDeviceId';
const STORAGE_KEY_CAMERA = 'adieuu.app.av.cameraDeviceId';
const STORAGE_KEY_SPEAKER = 'adieuu.app.av.speakerDeviceId';
const STORAGE_KEY_INPUT_VOLUME = 'adieuu.app.av.inputVolume';
const STORAGE_KEY_OUTPUT_VOLUME = 'adieuu.app.av.outputVolume';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

function clampGain(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(MAX_AV_GAIN, Math.max(0, n));
}

function getDeviceId(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function setDeviceId(key: string, deviceId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (deviceId === null || deviceId === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, deviceId);
    }
  } catch {
    return;
  }
  emit();
}

function getVolume(key: string): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const v = localStorage.getItem(key);
    if (v === null) return DEFAULT_VOLUME;
    if (v.includes('.')) {
      const f = parseFloat(v);
      return Number.isFinite(f) ? clampGain(f) : DEFAULT_VOLUME;
    }
    const units = parseInt(v, 10);
    if (!Number.isFinite(units)) return DEFAULT_VOLUME;
    return clampGain(units / 100);
  } catch {
    return DEFAULT_VOLUME;
  }
}

function setVolume(key: string, gain: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const units = Math.round(clampGain(gain) * 100);
    localStorage.setItem(key, String(units));
  } catch {
    return;
  }
  emit();
}

export function getAvMicDeviceId(): string | null {
  return getDeviceId(STORAGE_KEY_MIC);
}
export function setAvMicDeviceId(deviceId: string | null): void {
  setDeviceId(STORAGE_KEY_MIC, deviceId);
}

export function getAvCameraDeviceId(): string | null {
  return getDeviceId(STORAGE_KEY_CAMERA);
}
export function setAvCameraDeviceId(deviceId: string | null): void {
  setDeviceId(STORAGE_KEY_CAMERA, deviceId);
}

export function getAvSpeakerDeviceId(): string | null {
  return getDeviceId(STORAGE_KEY_SPEAKER);
}
export function setAvSpeakerDeviceId(deviceId: string | null): void {
  setDeviceId(STORAGE_KEY_SPEAKER, deviceId);
}

/** Microphone input gain (0–2, i.e. 0–200%). */
export function getAvInputVolume(): number {
  return getVolume(STORAGE_KEY_INPUT_VOLUME);
}
export function setAvInputVolume(gain: number): void {
  setVolume(STORAGE_KEY_INPUT_VOLUME, gain);
}

/** Speaker / output gain (0–2, i.e. 0–200%). Applied to remote participants. */
export function getAvOutputVolume(): number {
  return getVolume(STORAGE_KEY_OUTPUT_VOLUME);
}
export function setAvOutputVolume(gain: number): void {
  setVolume(STORAGE_KEY_OUTPUT_VOLUME, gain);
}

export interface AvPreferenceSnapshot {
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  speakerDeviceId: string | null;
  inputVolume: number;
  outputVolume: number;
}

export function subscribeAvPreferences(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY_MIC ||
      e.key === STORAGE_KEY_CAMERA ||
      e.key === STORAGE_KEY_SPEAKER ||
      e.key === STORAGE_KEY_INPUT_VOLUME ||
      e.key === STORAGE_KEY_OUTPUT_VOLUME ||
      e.key === null
    ) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}
