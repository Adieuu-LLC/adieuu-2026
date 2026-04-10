/**
 * Pure notification-sound gating and loudness normalization — no imports from app
 * constants or I/O. Unit tests import this file only so Bun never has to evaluate
 * `notificationSound.ts` (which pulls in large static data and browser APIs).
 */

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

/**
 * Whether a notification sound should play given preferences and focus state.
 * `soundId` is typed as string here so this module needs no shared type imports.
 */
export function shouldPlayNotificationSound(
  enabled: boolean,
  soundId: string,
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
