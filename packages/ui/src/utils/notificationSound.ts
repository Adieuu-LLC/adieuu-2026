/**
 * Plays optional notification sounds (built-in assets or custom file bytes from disk).
 * No network; custom audio is loaded only via platform capabilities on desktop.
 */

import { MAX_NOTIFICATION_GAIN, type NotificationSoundId } from '../hooks/useNotificationSoundPreference';
import {
  getBuiltinNotificationSoundSrc,
  isBuiltinNotificationSoundId,
} from '../constants/builtinNotificationSounds';
import {
  shouldSuppressInAppToastForConversation,
  type FocusVisibilitySnapshot,
} from './dmNotificationRules';

/** Decoded built-in asset (Web Audio gain can exceed 1; fetch+decode avoids HTMLAudio volume cap). */
let cachedBuiltinDecoded: { src: string; buffer: AudioBuffer } | null = null;

let cachedCustomPath: string | null = null;
let cachedCustomUrl: string | null = null;
let cachedCustomAudio: HTMLAudioElement | null = null;

/** Decoded custom file for Web Audio playback (reliable after async IPC). */
let cachedCustomDecoded: { path: string; buffer: AudioBuffer } | null = null;

let sharedAudioContext: AudioContext | null = null;

function revokeCustomUrl(): void {
  if (cachedCustomUrl) {
    URL.revokeObjectURL(cachedCustomUrl);
    cachedCustomUrl = null;
  }
  cachedCustomAudio = null;
  cachedCustomPath = null;
}

/** Resume AudioContext before any async work so playback stays allowed after IPC. */
async function ensureAudioContextRunning(): Promise<AudioContext | null> {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  if (sharedAudioContext.state === 'suspended') {
    try {
      await sharedAudioContext.resume();
    } catch {
      return sharedAudioContext;
    }
  }
  return sharedAudioContext;
}

/** `gain` is 0–MAX_NOTIFICATION_GAIN (200% max). */
function playDecodedBuffer(ctx: AudioContext, buffer: AudioBuffer, gain: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);
}

/** MIME hint so Chromium can decode blob URLs for HTMLAudioElement (required for many formats). */
function mimeTypeForAudioPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.opus')) return 'audio/ogg';
  return 'audio/*';
}

/**
 * Whether a notification sound should play given preferences and focus state.
 */
export function shouldPlayNotificationSound(
  enabled: boolean,
  soundId: NotificationSoundId,
  customPath: string | null,
  suppressWhenFocused: boolean,
  isViewingConversation: boolean,
  snapshot: FocusVisibilitySnapshot | null
): boolean {
  if (!enabled || soundId === 'none') {
    return false;
  }
  if (soundId === 'custom' && (!customPath || customPath.length === 0)) {
    return false;
  }
  if (suppressWhenFocused && shouldSuppressInAppToastForConversation(isViewingConversation, snapshot)) {
    return false;
  }
  return true;
}

function getBuiltinSrc(id: Exclude<NotificationSoundId, 'none' | 'custom'>): string {
  return getBuiltinNotificationSoundSrc(id);
}

async function playBuiltin(
  id: Exclude<NotificationSoundId, 'none' | 'custom'>,
  gain: number
): Promise<void> {
  const src = getBuiltinSrc(id);
  const ctx = await ensureAudioContextRunning();
  if (ctx) {
    try {
      if (cachedBuiltinDecoded?.src !== src) {
        const res = await fetch(src);
        if (!res.ok) return;
        const ab = await res.arrayBuffer();
        cachedBuiltinDecoded = { src, buffer: await ctx.decodeAudioData(ab) };
      }
      playDecodedBuffer(ctx, cachedBuiltinDecoded.buffer, gain);
    } catch {
      // Missing asset or decode failure
    }
    return;
  }
  try {
    const audio = new Audio(src);
    audio.volume = Math.min(1, gain);
    await audio.play();
  } catch {
    // Autoplay or missing asset
  }
}

/**
 * Fallback when decodeAudioData fails (codec) or AudioContext is unavailable: blob URL + <audio>.
 */
async function playCustomHtmlAudio(path: string, buf: ArrayBuffer, gain: number): Promise<void> {
  revokeCustomUrl();
  cachedCustomDecoded = null;
  cachedCustomPath = path;
  const blob = new Blob([new Uint8Array(buf)], { type: mimeTypeForAudioPath(path) });
  cachedCustomUrl = URL.createObjectURL(blob);
  const audioEl = new Audio(cachedCustomUrl);
  audioEl.preload = 'auto';
  cachedCustomAudio = audioEl;

  const ctx = await ensureAudioContextRunning();
  if (ctx && gain > 1) {
    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      audioEl.addEventListener('canplaythrough', finish, { once: true });
      audioEl.addEventListener('error', finish, { once: true });
      audioEl.load();
    });
    try {
      const source = ctx.createMediaElementSource(audioEl);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      audioEl.currentTime = 0;
      await audioEl.play();
    } catch {
      // Autoplay or graph error
    }
    return;
  }

  audioEl.volume = Math.min(1, gain);
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    audioEl.addEventListener('canplaythrough', finish, { once: true });
    audioEl.addEventListener('error', finish, { once: true });
    audioEl.load();
  });
  try {
    audioEl.currentTime = 0;
    await audioEl.play();
  } catch {
    // Autoplay policy or decode error
  }
}

async function playCustom(
  path: string,
  loadCustomSound: (p: string) => Promise<ArrayBuffer | null>,
  volume: number
): Promise<void> {
  const ctx = await ensureAudioContextRunning();

  if (cachedCustomDecoded?.path === path && ctx) {
    playDecodedBuffer(ctx, cachedCustomDecoded.buffer, volume);
    return;
  }

  const buf = await loadCustomSound(path);
  if (!buf || buf.byteLength === 0) {
    revokeCustomUrl();
    cachedCustomDecoded = null;
    return;
  }

  if (ctx) {
    try {
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      cachedCustomDecoded = { path, buffer: audioBuffer };
      playDecodedBuffer(ctx, audioBuffer, volume);
      return;
    } catch {
      // decodeAudioData unsupported for this container/codec — try <audio>
    }
  }

  await playCustomHtmlAudio(path, buf, volume);
}

export interface PlayNotificationSoundOptions {
  enabled: boolean;
  soundId: NotificationSoundId;
  customPath: string | null;
  suppressWhenFocused: boolean;
  isViewingConversation: boolean;
  snapshot: FocusVisibilitySnapshot | null;
  /** Notification sound gain (0–2 = 0–200%); only affects this playback path. */
  volume: number;
  /** Required when soundId is 'custom' and path is set */
  loadCustomSound?: (path: string) => Promise<ArrayBuffer | null>;
}

/**
 * Plays the configured notification sound if preferences allow.
 */
export async function playNotificationSound(options: PlayNotificationSoundOptions): Promise<void> {
  const {
    enabled,
    soundId,
    customPath,
    suppressWhenFocused,
    isViewingConversation,
    snapshot,
    loadCustomSound,
    volume,
  } = options;

  if (
    !shouldPlayNotificationSound(
      enabled,
      soundId,
      customPath,
      suppressWhenFocused,
      isViewingConversation,
      snapshot
    )
  ) {
    return;
  }

  const v = Number.isFinite(volume)
    ? Math.min(MAX_NOTIFICATION_GAIN, Math.max(0, volume))
    : 1;
  if (v <= 0) {
    return;
  }

  if (soundId === 'custom') {
    if (!customPath || !loadCustomSound) {
      return;
    }
    await playCustom(customPath, loadCustomSound, v);
    return;
  }

  if (isBuiltinNotificationSoundId(soundId)) {
    await playBuiltin(soundId, v);
  }
}

/**
 * Preview helper for settings: plays regardless of focus suppression.
 */
export async function previewNotificationSound(options: {
  soundId: NotificationSoundId;
  customPath: string | null;
  loadCustomSound?: (path: string) => Promise<ArrayBuffer | null>;
  /** Notification sound gain (0–2). */
  volume: number;
}): Promise<void> {
  const { soundId, customPath, loadCustomSound, volume } = options;
  if (soundId === 'none') return;
  const v = Number.isFinite(volume)
    ? Math.min(MAX_NOTIFICATION_GAIN, Math.max(0, volume))
    : 1;
  if (v <= 0) return;
  if (soundId === 'custom') {
    if (!customPath || !loadCustomSound) return;
    await playCustom(customPath, loadCustomSound, v);
    return;
  }
  if (isBuiltinNotificationSoundId(soundId)) {
    await playBuiltin(soundId, v);
  }
}

/** Clears cached custom audio (e.g. when user picks a new file). */
export function invalidateNotificationSoundCustomCache(): void {
  revokeCustomUrl();
  cachedCustomDecoded = null;
}
