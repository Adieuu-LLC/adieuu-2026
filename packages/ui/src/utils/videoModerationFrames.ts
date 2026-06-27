/**
 * Multi-frame moderation sampling for conversation video.
 * Short clips use one JPEG grid; long clips use several segment grids (multiple conv_scan parts).
 */

import {
  captureVideoFrameJpegsAtUniqueSeekTimes,
  getVideoDimensions,
  mergeSeekTimesForVideoCapture,
  type VideoLoadOptions,
} from './videoProcessing';

export type ModerationFrameTimeOptions = {
  minFrames?: number;
  maxFrames?: number;
  /** Target spacing between samples (product range ~5–10s). */
  intervalSec?: number;
  earlySeekSec?: number;
  /**
   * Random offset applied per sample in `[-jitterSec, +jitterSec]` (seconds).
   * Use `0` for a fixed grid (tests, reproducibility).
   */
  jitterSec?: number;
  /** Uniform [0,1); inject in tests for deterministic jitter. */
  random?: () => number;
};

/** Defaults for {@link buildModerationFrameTimes} (exported for tests and tuning). */
export const DEFAULT_MODERATION_FRAME_TIME_OPTIONS = {
  minFrames: 3,
  maxFrames: 12,
  intervalSec: 7,
  earlySeekSec: 0.1,
} as const;

/** Default half-width of per-sample time jitter (seconds); plan ~5–10s windows with jitter. */
export const DEFAULT_MODERATION_FRAME_JITTER_SEC = 2;

/**
 * Above this duration (seconds), moderation uses multiple JPEG grids (one conv_scan part each)
 * so long clips get coverage across the timeline. Must stay within Lambda batch limits (~32 images).
 */
export const LONG_VIDEO_MODERATION_SPLIT_AFTER_SEC = 90;

/** Target segment length when splitting (seconds). */
export const MODERATION_SCAN_PART_TARGET_DURATION_SEC = 45;

export const MODERATION_SCAN_MAX_PARTS = 8;

/**
 * How many scan JPEG parts to generate for a video of this length.
 * Short clips use one composite; longer clips use several segment grids.
 */
export function moderationVideoScanPartCountForDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  if (durationSeconds <= LONG_VIDEO_MODERATION_SPLIT_AFTER_SEC) {
    return 1;
  }
  return Math.min(
    MODERATION_SCAN_MAX_PARTS,
    Math.ceil(durationSeconds / MODERATION_SCAN_PART_TARGET_DURATION_SEC)
  );
}

function clampSeek(t: number, durationSeconds: number): number {
  return Math.min(Math.max(0, t), Math.max(0, durationSeconds - 0.05));
}

/**
 * Deterministic seek timestamps for moderation stills (~every {@link ModerationFrameTimeOptions.intervalSec}s,
 * at least {@link ModerationFrameTimeOptions.minFrames} when possible, capped at {@link ModerationFrameTimeOptions.maxFrames}).
 */
export function buildModerationFrameTimes(
  durationSeconds: number,
  options?: ModerationFrameTimeOptions
): number[] {
  const o = { ...DEFAULT_MODERATION_FRAME_TIME_OPTIONS, ...options };
  const jitterSec = options?.jitterSec ?? DEFAULT_MODERATION_FRAME_JITTER_SEC;
  const rng = jitterSec > 0 ? (options?.random ?? Math.random) : () => 0.5;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Invalid video duration');
  }

  const end = Math.max(o.earlySeekSec, durationSeconds - 0.05);
  const times: number[] = [];
  let t = Math.min(o.earlySeekSec, end);
  while (t <= end + 1e-9 && times.length < o.maxFrames) {
    const jitter = jitterSec > 0 ? (rng() * 2 - 1) * jitterSec : 0;
    times.push(clampSeek(t + jitter, durationSeconds));
    t += o.intervalSec;
  }

  if (times.length === 0) {
    return [clampSeek(Math.min(0.05, durationSeconds / 2), durationSeconds)];
  }

  let guard = 0;
  while (times.length < o.minFrames && times.length < o.maxFrames && guard < o.maxFrames * 2) {
    guard += 1;
    const k = times.length + 1;
    const candidate = clampSeek(
      (durationSeconds * k) / (o.minFrames + 1),
      durationSeconds
    );
    if (!times.some((x) => Math.abs(x - candidate) < 0.2)) {
      times.push(candidate);
    } else {
      break;
    }
  }

  times.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of times) {
    if (merged.length === 0 || Math.abs(merged[merged.length - 1]! - x) >= 0.25) {
      merged.push(x);
    }
  }

  let fillGuard = 0;
  while (merged.length < o.minFrames && merged.length < o.maxFrames && fillGuard < o.maxFrames * 2) {
    fillGuard += 1;
    const candidate = clampSeek(durationSeconds * 0.5, durationSeconds);
    if (!merged.some((x) => Math.abs(x - candidate) < 0.2)) {
      merged.push(candidate);
      merged.sort((a, b) => a - b);
    } else {
      break;
    }
  }

  return merged.slice(0, o.maxFrames);
}

/**
 * Lay out frame JPEGs in a grid → one JPEG for a single scan upload.
 */
export async function composeModerationScanFrameGrid(
  frames: Blob[],
  options?: { maxCellDim?: number; jpegQuality?: number }
): Promise<Blob> {
  const maxCell = options?.maxCellDim ?? 256;
  const quality = options?.jpegQuality ?? 0.82;
  if (frames.length === 0) {
    throw new Error('No moderation frames');
  }
  if (frames.length === 1) {
    return frames[0]!;
  }

  const bitmaps = await Promise.all(frames.map((b) => createImageBitmap(b)));
  try {
    const n = bitmaps.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    let cellW = 0;
    let cellH = 0;
    for (const bmp of bitmaps) {
      const scale = Math.min(1, maxCell / Math.max(bmp.width, bmp.height));
      cellW = Math.max(cellW, Math.round(bmp.width * scale));
      cellH = Math.max(cellH, Math.round(bmp.height * scale));
    }
    const canvas = new OffscreenCanvas(cols * cellW, rows * cellH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D canvas context');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < bitmaps.length; i++) {
      const bmp = bitmaps[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const scale = Math.min(1, maxCell / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const x = col * cellW + (cellW - w) / 2;
      const y = row * cellH + (cellH - h) / 2;
      ctx.drawImage(bmp, x, y, w, h);
    }
    return await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } finally {
    for (const b of bitmaps) {
      b.close();
    }
  }
}

export type BuildVideoModerationScanCompositeOptions = VideoLoadOptions &
  ModerationFrameTimeOptions & {
    gridMaxCellDim?: number;
    gridJpegQuality?: number;
    thumbMaxDim?: number;
    thumbQuality?: number;
  };

export type BuildVideoModerationScanPayloadsOptions = BuildVideoModerationScanCompositeOptions & {
  /** When set (e.g. in tests), skips duration-based part count. */
  partCountOverride?: number;
  /**
   * When set, skips a redundant video load to read duration (e.g. already obtained from
   * {@link getVideoDimensionsAndScanThumbnail} in the E2E upload path).
   */
  precomputedVideoDurationSeconds?: number;
};

export type VideoModerationScanPayload = {
  body: Blob;
  contentType: 'image/jpeg';
};

/**
 * Builds one or more JPEG grids (timeline segments) for conv_scan image moderation.
 * Long videos use multiple parts; see {@link moderationVideoScanPartCountForDuration}.
 */
export async function buildVideoModerationScanPayloads(
  file: File,
  options?: BuildVideoModerationScanPayloadsOptions
): Promise<VideoModerationScanPayload[]> {
  const {
    partCountOverride,
    precomputedVideoDurationSeconds,
    gridMaxCellDim,
    gridJpegQuality,
    thumbMaxDim,
    thumbQuality,
    minFrames,
    maxFrames,
    intervalSec,
    earlySeekSec,
    jitterSec,
    random,
    ...loadOpts
  } = options ?? {};

  const durationSeconds =
    precomputedVideoDurationSeconds !== undefined
      ? precomputedVideoDurationSeconds
      : (await getVideoDimensions(file, loadOpts)).durationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Invalid video duration');
  }
  const partCount =
    partCountOverride ?? moderationVideoScanPartCountForDuration(durationSeconds);

  const captureOpts = {
    ...loadOpts,
    maxThumbnailDim: thumbMaxDim,
    thumbnailQuality: thumbQuality,
  };

  const perPartMerged: number[][] = [];
  for (let i = 0; i < partCount; i++) {
    const t0 = (durationSeconds * i) / partCount;
    const t1 = (durationSeconds * (i + 1)) / partCount;
    const segDur = Math.max(t1 - t0, 0.05);

    const timeOpts =
      partCount === 1
        ? { minFrames, maxFrames, intervalSec, earlySeekSec, jitterSec, random }
        : {
            minFrames: 2,
            maxFrames: 6,
            intervalSec: 7,
            earlySeekSec: 0.05,
            jitterSec,
            random,
          };

    const mergedTimeOpts = { ...DEFAULT_MODERATION_FRAME_TIME_OPTIONS, ...timeOpts };

    const localTimes = buildModerationFrameTimes(segDur, mergedTimeOpts);
    const absoluteTimes = localTimes.map((t) =>
      Math.min(Math.max(0, t0 + t), durationSeconds - 0.05)
    );
    perPartMerged.push(mergeSeekTimesForVideoCapture(absoluteTimes, durationSeconds));
  }

  const allUniqueSeeks = [...new Set(perPartMerged.flat())].sort((a, b) => a - b);
  const frameMap = await captureVideoFrameJpegsAtUniqueSeekTimes(
    file,
    allUniqueSeeks,
    captureOpts
  );

  const payloads: VideoModerationScanPayload[] = [];
  for (let i = 0; i < partCount; i++) {
    const merged = perPartMerged[i]!;
    const thumbs = merged.map((t) => {
      const b = frameMap.get(t);
      if (!b) {
        throw new Error('Missing video frame for moderation sample');
      }
      return b;
    });
    const body = await composeModerationScanFrameGrid(thumbs, {
      maxCellDim: gridMaxCellDim,
      jpegQuality: gridJpegQuality,
    });
    payloads.push({ body, contentType: 'image/jpeg' });
  }

  return payloads;
}

/**
 * Builds one JPEG (grid of sampled frames) for conv_scan image moderation.
 * Prefer {@link buildVideoModerationScanPayloads} when uploading (multi-part for long video).
 */
export async function buildVideoModerationScanComposite(
  file: File,
  options?: BuildVideoModerationScanCompositeOptions
): Promise<Blob> {
  const payloads = await buildVideoModerationScanPayloads(file, {
    ...options,
    partCountOverride: 1,
  });
  return payloads[0]!.body;
}
