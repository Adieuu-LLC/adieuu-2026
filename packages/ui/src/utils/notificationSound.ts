/**
 * Plays optional notification sounds (built-in assets or custom file bytes from disk).
 * No network; custom audio is loaded only via platform capabilities on desktop.
 */

import { MAX_NOTIFICATION_GAIN, type NotificationSoundId } from '../hooks/useNotificationSoundPreference';
import {
  getBuiltinNotificationSoundSrc,
  isBuiltinNotificationSoundId,
} from '../constants/builtinNotificationSounds';

/**
 * Snapshot of document focus and visibility state at the time of a notification event.
 */
export interface FocusVisibilitySnapshot {
  hasFocus: boolean;
  visibilityState: DocumentVisibilityState;
}

/** Target K-weighted RMS ≈ −18 dBFS (common broadcast loudness reference). */
const TARGET_RMS = Math.pow(10, -18 / 20); // ≈ 0.1259

/** Samples below this linear amplitude are excluded from the RMS measurement (≈ −40 dBFS). */
const SILENCE_GATE = 0.01;

/** Maximum normalization boost (+12 dB) to prevent ear-splitting transients on quiet/padded files. */
const MAX_NORM_GAIN = 4;

/**
 * Crest factor (peak / RMS) above which a proportional gain penalty is applied.
 * ~9.5 dB; typical sustained tones sit around 3 dB, sharp transients 12-20 dB.
 */
const CREST_FACTOR_THRESHOLD = 3.0;

/** How aggressively to penalise excess crest factor (0 = ignore, 1 = full dB-for-dB). */
const CREST_PENALTY_RATIO = 0.65;

// ---------------------------------------------------------------------------
// ITU-R BS.1770 K-weighting (two cascaded biquads)
// ---------------------------------------------------------------------------

interface BiquadCoeffs {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
}

/** High-shelf coefficients (Audio EQ Cookbook). */
function highShelfCoeffs(fs: number, f0: number, dBGain: number, Q: number): BiquadCoeffs {
  const A = Math.pow(10, dBGain / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const sqrtA = Math.sqrt(A);

  const a0 = (A + 1) - (A - 1) * cosW + 2 * sqrtA * alpha;
  return {
    b0: (A * ((A + 1) + (A - 1) * cosW + 2 * sqrtA * alpha)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cosW)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cosW - 2 * sqrtA * alpha)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cosW)) / a0,
    a2: ((A + 1) - (A - 1) * cosW - 2 * sqrtA * alpha) / a0,
  };
}

/** Second-order high-pass coefficients (Audio EQ Cookbook). */
function highPassCoeffs(fs: number, f0: number, Q: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);

  const a0 = 1 + alpha;
  return {
    b0: ((1 + cosW) / 2) / a0,
    b1: (-(1 + cosW)) / a0,
    b2: ((1 + cosW) / 2) / a0,
    a1: (-2 * cosW) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(samples: Float32Array, c: BiquadCoeffs): Float32Array {
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  return out;
}

/**
 * Apply BS.1770 K-weighting to PCM samples: a high-shelf pre-filter (head-related
 * transfer approximation) cascaded with a ~38 Hz high-pass (RLB weighting).
 * Coefficients are derived from the standard's analog prototype via the bilinear
 * transform, so they adapt to any sample rate.
 */
function applyKWeighting(samples: Float32Array, sampleRate: number): Float32Array {
  const shelf = highShelfCoeffs(sampleRate, 1681.974450955533, 3.999843853973347, 0.7071752369554196);
  const hp = highPassCoeffs(sampleRate, 38.13547087602444, 0.5003270373238773);
  return applyBiquad(applyBiquad(samples, shelf), hp);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Compute a gain multiplier that normalises an AudioBuffer to TARGET_RMS using
 * K-weighted, silence-gated loudness measurement (simplified ITU-R BS.1770).
 *
 * Improvements over plain RMS:
 *  - K-weighting models human frequency sensitivity (bright transients ≠ bass rumble).
 *  - Silence gating excludes padding/gaps so short sounds aren't over-amplified.
 *  - Gain is capped at MAX_NORM_GAIN to prevent clipping on pathologically quiet files.
 */
/** @internal Exported for unit tests only. */
export function computeNormalizationGain(buffer: AudioBuffer): number {
  const sampleRate = buffer.sampleRate;
  let gatedSumSq = 0;
  let gatedCount = 0;
  let peak = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const raw = buffer.getChannelData(ch);
    const weighted = applyKWeighting(raw, sampleRate);
    for (let i = 0; i < weighted.length; i++) {
      const s = weighted[i]!;
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      if (abs >= SILENCE_GATE) {
        gatedSumSq += s * s;
        gatedCount++;
      }
    }
  }

  if (gatedCount === 0) return 1;
  const rms = Math.sqrt(gatedSumSq / gatedCount);
  if (rms < 1e-6) return 1;

  let gain = Math.min(MAX_NORM_GAIN, TARGET_RMS / rms);

  const crestFactor = peak / rms;
  if (crestFactor > CREST_FACTOR_THRESHOLD) {
    const excessDb = 20 * Math.log10(crestFactor / CREST_FACTOR_THRESHOLD);
    gain *= Math.pow(10, -(excessDb * CREST_PENALTY_RATIO) / 20);
  }

  return gain;
}

/** Decoded built-in asset (Web Audio gain can exceed 1; fetch+decode avoids HTMLAudio volume cap). */
let cachedBuiltinDecoded: { src: string; buffer: AudioBuffer; normGain: number } | null = null;

let cachedCustomPath: string | null = null;
let cachedCustomUrl: string | null = null;
let cachedCustomAudio: HTMLAudioElement | null = null;

/** Decoded custom file for Web Audio playback (reliable after async IPC). */
let cachedCustomDecoded: { path: string; buffer: AudioBuffer; normGain: number } | null = null;

let sharedAudioContext: AudioContext | null = null;

/** Serialises custom sound playback so concurrent calls don't corrupt shared cache. */
let customPlaybackChain: Promise<void> = Promise.resolve();

const AUDIO_LOAD_TIMEOUT_MS = 5000;

function revokeCustomUrl(): void {
  if (cachedCustomUrl) {
    URL.revokeObjectURL(cachedCustomUrl);
    cachedCustomUrl = null;
  }
  cachedCustomAudio = null;
  cachedCustomPath = null;
}

/**
 * Resume (or create) the shared AudioContext.
 *
 * Call during a user gesture (e.g. settings toggle click) to satisfy browser
 * autoplay policy before WS-driven playback needs it.
 */
export async function ensureAudioContextRunning(): Promise<AudioContext | null> {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  if (sharedAudioContext.state === 'suspended') {
    try {
      await sharedAudioContext.resume();
    } catch (err) {
      console.warn('[notificationSound] AudioContext.resume() failed:', err);
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
  _isViewingConversation: boolean,
  snapshot: FocusVisibilitySnapshot | null
): boolean {
  if (!enabled || soundId === 'none') {
    return false;
  }
  if (soundId === 'custom' && (!customPath || customPath.length === 0)) {
    return false;
  }
  if (suppressWhenFocused && snapshot?.hasFocus && snapshot?.visibilityState === 'visible') {
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
        if (!res.ok) {
          console.warn(`[notificationSound] Built-in sound fetch failed: ${res.status} ${src}`);
        } else {
          const ab = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(ab);
          const normGain = computeNormalizationGain(buffer);
          cachedBuiltinDecoded = { src, buffer, normGain };
          playDecodedBuffer(ctx, buffer, gain * normGain);
          return;
        }
      } else {
        playDecodedBuffer(ctx, cachedBuiltinDecoded.buffer, gain * cachedBuiltinDecoded.normGain);
        return;
      }
    } catch (err) {
      console.warn('[notificationSound] Web Audio playback failed for built-in sound:', err);
    }
  }
  try {
    const audio = new Audio(src);
    audio.volume = Math.min(1, gain);
    await audio.play();
  } catch (err) {
    console.warn('[notificationSound] HTMLAudio fallback failed for built-in sound:', err);
  }
}

/**
 * Fallback when decodeAudioData fails (codec) or AudioContext is unavailable: blob URL + <audio>.
 */
async function playCustomHtmlAudio(
  path: string,
  buf: ArrayBuffer,
  gain: number,
  normGain: number
): Promise<void> {
  revokeCustomUrl();
  cachedCustomDecoded = null;
  cachedCustomPath = path;
  const blob = new Blob([new Uint8Array(buf)], { type: mimeTypeForAudioPath(path) });
  cachedCustomUrl = URL.createObjectURL(blob);
  const audioEl = new Audio(cachedCustomUrl);
  audioEl.preload = 'auto';
  cachedCustomAudio = audioEl;

  const effectiveGain = gain * normGain;
  const ctx = await ensureAudioContextRunning();
  if (ctx && effectiveGain > 1) {
    await waitForAudioReady(audioEl);
    try {
      const source = ctx.createMediaElementSource(audioEl);
      const gainNode = ctx.createGain();
      gainNode.gain.value = effectiveGain;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      audioEl.currentTime = 0;
      await audioEl.play();
    } catch (err) {
      console.warn('[notificationSound] Web Audio graph playback failed for custom sound:', err);
    }
    return;
  }

  audioEl.volume = Math.min(1, effectiveGain);
  await waitForAudioReady(audioEl);
  try {
    audioEl.currentTime = 0;
    await audioEl.play();
  } catch (err) {
    console.warn('[notificationSound] HTMLAudio playback failed for custom sound:', err);
  }
}

/** Waits for an audio element to be ready, with a timeout to prevent indefinite hangs. */
function waitForAudioReady(audioEl: HTMLAudioElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      console.warn('[notificationSound] Audio load timed out after', AUDIO_LOAD_TIMEOUT_MS, 'ms');
      finish();
    }, AUDIO_LOAD_TIMEOUT_MS);
    audioEl.addEventListener('canplaythrough', finish, { once: true });
    audioEl.addEventListener('error', finish, { once: true });
    audioEl.load();
  });
}

async function playCustomUnserialized(
  path: string,
  loadCustomSound: (p: string) => Promise<ArrayBuffer | null>,
  volume: number
): Promise<void> {
  const ctx = await ensureAudioContextRunning();

  if (cachedCustomDecoded?.path === path && ctx) {
    playDecodedBuffer(ctx, cachedCustomDecoded.buffer, volume * cachedCustomDecoded.normGain);
    return;
  }

  const buf = await loadCustomSound(path);
  if (!buf || buf.byteLength === 0) {
    console.warn('[notificationSound] Custom sound file is empty or could not be loaded:', path);
    revokeCustomUrl();
    cachedCustomDecoded = null;
    return;
  }

  if (ctx) {
    try {
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const normGain = computeNormalizationGain(audioBuffer);
      cachedCustomDecoded = { path, buffer: audioBuffer, normGain };
      playDecodedBuffer(ctx, audioBuffer, volume * normGain);
      return;
    } catch (err) {
      console.warn('[notificationSound] decodeAudioData failed, falling back to HTMLAudio:', err);
    }
  }

  await playCustomHtmlAudio(path, buf, volume, 1);
}

async function playCustom(
  path: string,
  loadCustomSound: (p: string) => Promise<ArrayBuffer | null>,
  volume: number
): Promise<void> {
  const previous = customPlaybackChain;
  let release: () => void;
  customPlaybackChain = new Promise<void>((r) => { release = r; });
  await previous;
  try {
    await playCustomUnserialized(path, loadCustomSound, volume);
  } finally {
    release!();
  }
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
