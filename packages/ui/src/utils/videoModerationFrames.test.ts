import { describe, expect, test } from 'bun:test';
import {
  buildModerationFrameTimes,
  LONG_VIDEO_MODERATION_SPLIT_AFTER_SEC,
  MODERATION_SCAN_MAX_PARTS,
  MODERATION_SCAN_PART_TARGET_DURATION_SEC,
  moderationVideoScanPartCountForDuration,
} from './videoModerationFrames';

describe('buildModerationFrameTimes', () => {
  test('throws on invalid duration', () => {
    expect(() => buildModerationFrameTimes(NaN)).toThrow('Invalid video duration');
    expect(() => buildModerationFrameTimes(0)).toThrow('Invalid video duration');
  });

  test('long video: roughly interval-based samples capped at maxFrames', () => {
    const times = buildModerationFrameTimes(120, {
      intervalSec: 7,
      earlySeekSec: 0.1,
      minFrames: 3,
      maxFrames: 12,
      jitterSec: 0,
    });
    expect(times.length).toBe(12);
    expect(times[0]).toBeCloseTo(0.1, 5);
    expect(times[1]).toBeCloseTo(7.1, 5);
    expect(times[11]).toBeLessThanOrEqual(119.95);
  });

  test('jitter shifts samples when rng is fixed', () => {
    const noJit = buildModerationFrameTimes(30, {
      intervalSec: 10,
      earlySeekSec: 0.1,
      minFrames: 2,
      maxFrames: 4,
      jitterSec: 0,
    });
    const withJit = buildModerationFrameTimes(30, {
      intervalSec: 10,
      earlySeekSec: 0.1,
      minFrames: 2,
      maxFrames: 4,
      jitterSec: 2,
      random: () => 1,
    });
    expect(noJit[0]).toBeCloseTo(0.1, 5);
    expect(withJit[0]).toBeCloseTo(Math.min(0.1 + 2, 30 - 0.05), 5);
    expect(withJit[1]! - noJit[1]!).toBeCloseTo(2, 5);
  });

  test('short video: fills toward minFrames', () => {
    const times = buildModerationFrameTimes(2, {
      minFrames: 3,
      maxFrames: 12,
      intervalSec: 7,
      earlySeekSec: 0.1,
      jitterSec: 0,
    });
    expect(times.length).toBeGreaterThanOrEqual(1);
    expect(times.length).toBeLessThanOrEqual(12);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(2 - 0.05);
    }
  });

  test('tiny duration still returns one sample', () => {
    const times = buildModerationFrameTimes(0.2, { jitterSec: 0 });
    expect(times.length).toBeGreaterThanOrEqual(1);
    expect(times.every((t) => t <= 0.15)).toBe(true);
  });
});

describe('moderationVideoScanPartCountForDuration', () => {
  test('single part at or below split threshold', () => {
    expect(moderationVideoScanPartCountForDuration(30)).toBe(1);
    expect(moderationVideoScanPartCountForDuration(LONG_VIDEO_MODERATION_SPLIT_AFTER_SEC)).toBe(1);
  });

  test('multiple parts above threshold by segment length', () => {
    const d = LONG_VIDEO_MODERATION_SPLIT_AFTER_SEC + 1;
    expect(moderationVideoScanPartCountForDuration(d)).toBe(
      Math.min(MODERATION_SCAN_MAX_PARTS, Math.ceil(d / MODERATION_SCAN_PART_TARGET_DURATION_SEC))
    );
  });

  test('caps at MODERATION_SCAN_MAX_PARTS for very long clips', () => {
    const raw = Math.ceil(600 / MODERATION_SCAN_PART_TARGET_DURATION_SEC);
    expect(raw).toBeGreaterThan(MODERATION_SCAN_MAX_PARTS);
    expect(moderationVideoScanPartCountForDuration(600)).toBe(MODERATION_SCAN_MAX_PARTS);
  });

  test('invalid duration yields one part', () => {
    expect(moderationVideoScanPartCountForDuration(NaN)).toBe(1);
    expect(moderationVideoScanPartCountForDuration(0)).toBe(1);
  });
});
