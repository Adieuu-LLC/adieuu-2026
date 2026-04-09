import { describe, it, expect } from 'bun:test';
import { shouldPlayNotificationSound, computeNormalizationGain } from './notificationSound';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAudioBuffer(channels: Float32Array[], sampleRate = 48000) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (ch: number) => channels[ch],
  } as unknown as AudioBuffer;
}

function sineWave(
  freq: number,
  sampleRate: number,
  durationSec: number,
  amplitude: number,
): Float32Array {
  const len = Math.round(sampleRate * durationSec);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// shouldPlayNotificationSound (existing tests, preserved)
// ---------------------------------------------------------------------------

describe('shouldPlayNotificationSound', () => {
  const visibleFocused = { hasFocus: true, visibilityState: 'visible' as const };
  const unfocused = { hasFocus: false, visibilityState: 'visible' as const };

  it('returns false when disabled', () => {
    expect(
      shouldPlayNotificationSound(false, 'chime', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns false for none', () => {
    expect(
      shouldPlayNotificationSound(true, 'none', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns false for custom without path', () => {
    expect(
      shouldPlayNotificationSound(true, 'custom', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns true for built-in preset when unfocused', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, true, false, unfocused)
    ).toBe(true);
  });

  it('suppresses when viewing focused conversation and suppressWhenFocused is true', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, true, true, visibleFocused)
    ).toBe(false);
  });

  it('plays when suppressWhenFocused is false even if viewing focused conversation', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, false, true, visibleFocused)
    ).toBe(true);
  });

  it('allows custom when path is set', () => {
    expect(
      shouldPlayNotificationSound(true, 'custom', '/x/y.mp3', true, false, unfocused)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeNormalizationGain
// ---------------------------------------------------------------------------

describe('computeNormalizationGain', () => {
  it('returns 1 for a completely silent buffer', () => {
    const buf = mockAudioBuffer([new Float32Array(48000)]);
    expect(computeNormalizationGain(buf)).toBe(1);
  });

  it('returns 1 for an empty buffer (0 samples)', () => {
    const buf = mockAudioBuffer([new Float32Array(0)]);
    expect(computeNormalizationGain(buf)).toBe(1);
  });

  it('returns 1 when all samples fall below the silence gate after K-weighting', () => {
    // Extremely quiet 1 kHz sine — K-weighting boosts ~1-2 dB at 1 kHz,
    // but 0.005 * ~1.15 ≈ 0.006 is still below the 0.01 gate.
    const samples = sineWave(1000, 48000, 1, 0.005);
    const buf = mockAudioBuffer([samples]);
    expect(computeNormalizationGain(buf)).toBe(1);
  });

  it('caps gain at 4 (MAX_NORM_GAIN / +12 dB) for very quiet signals', () => {
    // Quiet 1 kHz sine at amplitude 0.02 — passes gate after K-weighting but
    // produces a K-weighted RMS well below TARGET_RMS, yielding an uncapped
    // gain far above 4.
    const samples = sineWave(1000, 48000, 1, 0.02);
    const buf = mockAudioBuffer([samples]);
    expect(computeNormalizationGain(buf)).toBe(4);
  });

  it('produces gain < 1 for a loud signal', () => {
    const samples = sineWave(1000, 48000, 1, 0.5);
    const buf = mockAudioBuffer([samples]);
    const gain = computeNormalizationGain(buf);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(1);
  });

  it('produces gain > 1 for a moderately quiet signal', () => {
    // Amplitude 0.05 at 1 kHz yields K-weighted RMS around 0.04 — below
    // TARGET_RMS (0.126) but high enough that gain stays under 4.
    const samples = sineWave(1000, 48000, 1, 0.05);
    const buf = mockAudioBuffer([samples]);
    const gain = computeNormalizationGain(buf);
    expect(gain).toBeGreaterThan(1);
    expect(gain).toBeLessThan(4);
  });

  it('silence-gates padding so short bursts are not over-amplified', () => {
    // 10% loud burst + 90% silence vs. 100% continuous tone at same amplitude.
    // Old whole-buffer RMS would produce a much higher gain for the burst
    // because the silence dilutes the measurement. With gating, both should
    // produce similar gains since only the active portion is measured.
    const amplitude = 0.3;
    const rate = 48000;

    const burst = new Float32Array(rate);
    const continuous = sineWave(1000, rate, 1, amplitude);
    const shortSine = sineWave(1000, rate, 0.1, amplitude);
    burst.set(shortSine, 0); // first 10%, rest is zeros

    const burstGain = computeNormalizationGain(mockAudioBuffer([burst]));
    const contGain = computeNormalizationGain(mockAudioBuffer([continuous]));

    // Gains should be in the same ballpark (within 2x) rather than the 3-6x
    // difference the old ungated RMS would produce.
    expect(burstGain / contGain).toBeGreaterThan(0.5);
    expect(burstGain / contGain).toBeLessThan(2);
  });

  it('produces higher gain for bass than treble at the same amplitude (K-weighting)', () => {
    // K-weighting boosts high frequencies, so a 4 kHz tone has higher measured
    // loudness -> lower normalization gain than a 100 Hz tone at equal amplitude.
    const amplitude = 0.2;
    const rate = 48000;
    const bass = sineWave(100, rate, 1, amplitude);
    const treble = sineWave(4000, rate, 1, amplitude);

    const bassGain = computeNormalizationGain(mockAudioBuffer([bass]));
    const trebleGain = computeNormalizationGain(mockAudioBuffer([treble]));

    expect(bassGain).toBeGreaterThan(trebleGain);
  });

  it('handles multi-channel buffers', () => {
    const ch0 = sineWave(1000, 48000, 1, 0.3);
    const ch1 = sineWave(1000, 48000, 1, 0.3);
    const stereo = mockAudioBuffer([ch0, ch1]);
    const mono = mockAudioBuffer([sineWave(1000, 48000, 1, 0.3)]);

    const stereoGain = computeNormalizationGain(stereo);
    const monoGain = computeNormalizationGain(mono);

    // Same signal on both channels should produce the same gain as mono
    // (RMS is averaged across all channel samples).
    expect(Math.abs(stereoGain - monoGain)).toBeLessThan(0.01);
  });

  it('adapts to different sample rates', () => {
    // Same frequency and amplitude at 44100 vs 48000 should yield similar
    // (but not identical due to coefficient differences) normalization gains.
    const gain44 = computeNormalizationGain(
      mockAudioBuffer([sineWave(1000, 44100, 1, 0.2)], 44100),
    );
    const gain48 = computeNormalizationGain(
      mockAudioBuffer([sineWave(1000, 48000, 1, 0.2)], 48000),
    );

    expect(Math.abs(gain44 - gain48) / gain48).toBeLessThan(0.15);
  });

  it('does not apply crest factor penalty to a pure sine wave', () => {
    // Sine crest factor = sqrt(2) ≈ 1.41, well below the threshold of 3.
    // Two sines at different amplitudes should scale proportionally (no penalty
    // distortion), within the normal operating range.
    const rate = 48000;
    const gainA = computeNormalizationGain(mockAudioBuffer([sineWave(1000, rate, 1, 0.15)]));
    const gainB = computeNormalizationGain(mockAudioBuffer([sineWave(1000, rate, 1, 0.30)]));

    // gain is inversely proportional to amplitude for a sine (crest ≈ constant).
    expect(gainA / gainB).toBeGreaterThan(1.8);
    expect(gainA / gainB).toBeLessThan(2.2);
  });

  it('applies crest factor penalty when transient spikes are present', () => {
    const rate = 48000;

    // Sustained tone: pure sine at 1kHz, crest ≈ 1.41 (no penalty).
    const sustained = sineWave(1000, rate, 1, 0.15);

    // Same tone with a single sharp spike injected at 500ms.
    // The spike barely changes the RMS but massively raises the peak,
    // pushing the crest factor well above the 3.0 threshold.
    const withSpike = new Float32Array(sustained);
    for (let i = 24000; i < 24048; i++) {
      withSpike[i] = 0.95;
    }

    const sustainedGain = computeNormalizationGain(mockAudioBuffer([sustained]));
    const spikeGain = computeNormalizationGain(mockAudioBuffer([withSpike]));

    expect(spikeGain).toBeLessThan(sustainedGain);
    // The penalty should be meaningful — at least a 20% reduction.
    expect(spikeGain / sustainedGain).toBeLessThan(0.8);
  });

  it('scales crest penalty proportionally to excess crest factor', () => {
    const rate = 48000;
    const base = sineWave(1000, rate, 1, 0.15);

    // Small spike → moderate excess crest factor
    const smallSpike = new Float32Array(base);
    for (let i = 24000; i < 24048; i++) smallSpike[i] = 0.5;

    // Large spike → large excess crest factor
    const largeSpike = new Float32Array(base);
    for (let i = 24000; i < 24048; i++) largeSpike[i] = 0.98;

    const smallGain = computeNormalizationGain(mockAudioBuffer([smallSpike]));
    const largeGain = computeNormalizationGain(mockAudioBuffer([largeSpike]));

    // Both should be penalised, but the larger spike more so.
    const noSpikeGain = computeNormalizationGain(mockAudioBuffer([base]));
    expect(smallGain).toBeLessThan(noSpikeGain);
    expect(largeGain).toBeLessThan(smallGain);
  });
});
