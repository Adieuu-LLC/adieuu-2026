/**
 * Client-side video utilities for E2E conversation media.
 *
 * Extracts a representative frame as a JPEG for the anonymised scan copy
 * (Rekognition) and reads dimensions from metadata. No server round-trip.
 */

import {
  waitUntilVideoHasIntrinsicSize,
  type VideoLoadOptions,
} from './video/loadVideoForProcessing';
import { waitForSeekPaintReady } from './video/seekPaint';

export type { VideoLoadOptions };

/** Short probe: can this browser decode at least one frame (e.g. H.264) for metadata? */
const PROBE_TIMEOUT_MS = 5000;

const DEFAULT_THUMBNAIL_MAX_DIM = 512;
const DEFAULT_THUMBNAIL_QUALITY = 0.8;

function readValidatedVideoMetadata(video: HTMLVideoElement): {
  width: number;
  height: number;
  durationSeconds: number;
} {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('Invalid video dimensions');
  }
  const durationSeconds = video.duration;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Invalid video duration');
  }
  return { width, height, durationSeconds };
}

async function seekVideoToTime(video: HTMLVideoElement, seekTimeSec: number): Promise<void> {
  const t = Math.min(
    Math.max(0, seekTimeSec),
    Math.max(0, video.duration - 0.05)
  );
  await new Promise<void>((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 1e-4) {
      queueMicrotask(() => resolve());
      return;
    }
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('Failed to seek video'));
    video.currentTime = t;
  });
  await waitForSeekPaintReady(video);
}

async function encodeLoadedVideoFrameToJpeg(
  video: HTMLVideoElement,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    throw new Error('Invalid video dimensions');
  }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const targetWidth = Math.round(w * scale);
  const targetHeight = Math.round(h * scale);

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D canvas context');

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  return await canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/**
 * Seek to a representative frame and encode a JPEG; {@link video} must already
 * have intrinsic dimensions loaded.
 */
async function captureThumbnailFromLoadedVideo(
  video: HTMLVideoElement,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const seekTime =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(0.1, video.duration * 0.1)
      : 0;
  await seekVideoToTime(video, seekTime);
  return encodeLoadedVideoFrameToJpeg(video, maxDim, quality);
}

/**
 * Per-segment seek merge: two samples closer than 250ms re-use the same frame (matches
 * {@link captureVideoFrameThumbnailsAtTimes} and moderation segment logic).
 */
export function mergeSeekTimesForVideoCapture(
  seekTimesSec: number[],
  durationOrEnd: number
): number[] {
  const end = Math.max(0, durationOrEnd - 0.05);
  const sorted = [...seekTimesSec]
    .filter((t) => Number.isFinite(t))
    .map((t) => Math.min(Math.max(0, t), end))
    .sort((a, b) => a - b);

  const merged: number[] = [];
  for (const t of sorted) {
    if (merged.length === 0 || Math.abs(merged[merged.length - 1]! - t) >= 0.25) {
      merged.push(t);
    }
  }
  return merged;
}

/**
 * One decode load: seek to each timestamp (merged with {@link mergeSeekTimesForVideoCapture}).
 * Use for multi-frame moderation composites.
 */
export async function captureVideoFrameThumbnailsAtTimes(
  file: File,
  seekTimesSec: number[],
  options?: VideoLoadOptions & {
    maxThumbnailDim?: number;
    thumbnailQuality?: number;
  }
): Promise<Blob[]> {
  const maxDim = options?.maxThumbnailDim ?? DEFAULT_THUMBNAIL_MAX_DIM;
  const quality = options?.thumbnailQuality ?? DEFAULT_THUMBNAIL_QUALITY;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, options);
    const { durationSeconds } = readValidatedVideoMetadata(video);
    const merged = mergeSeekTimesForVideoCapture(seekTimesSec, durationSeconds);
    return await captureJpegsAtSeekTimesOnLoadedVideo(
      video,
      merged,
      maxDim,
      quality
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Seeks in ascending order; times must be pre-merged (no 250ms de-dupe). One blob per time.
 * Returns a map keyed by each requested seek time (for stable look-up of merged segment lists).
 */
export async function captureVideoFrameJpegsAtUniqueSeekTimes(
  file: File,
  uniqueSeekTimesSec: number[],
  options?: VideoLoadOptions & {
    maxThumbnailDim?: number;
    thumbnailQuality?: number;
  }
): Promise<Map<number, Blob>> {
  const maxDim = options?.maxThumbnailDim ?? DEFAULT_THUMBNAIL_MAX_DIM;
  const quality = options?.thumbnailQuality ?? DEFAULT_THUMBNAIL_QUALITY;
  const map = new Map<number, Blob>();
  const unique = [...new Set(uniqueSeekTimesSec)]
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (unique.length === 0) {
    return map;
  }
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, options);
    readValidatedVideoMetadata(video);
    const end = Math.max(0, video.duration - 0.05);
    for (const t of unique) {
      const safe = Math.min(Math.max(0, t), end);
      await seekVideoToTime(video, safe);
      const blob = await encodeLoadedVideoFrameToJpeg(video, maxDim, quality);
      map.set(t, blob);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return map;
}

/** Used only after intrinsic size is available; caller owns the blob URL. */
async function captureJpegsAtSeekTimesOnLoadedVideo(
  video: HTMLVideoElement,
  mergedSeekTimesSec: number[],
  maxDim: number,
  quality: number
): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const t of mergedSeekTimesSec) {
    await seekVideoToTime(video, t);
    out.push(await encodeLoadedVideoFrameToJpeg(video, maxDim, quality));
  }
  return out;
}

/**
 * True if intrinsic video size becomes available (browser can decode the track).
 * Use before assuming `video/mp4` is H.264 — many phones produce HEVC-in-MP4.
 */
export async function probeVideoPlayableInBrowser(
  file: File,
  options?: VideoLoadOptions
): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, {
      timeoutMs: options?.timeoutMs ?? PROBE_TIMEOUT_MS,
    });
    return video.videoWidth > 0 && video.videoHeight > 0;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Single decode pass: dimensions + moderation JPEG. Prefer this over calling
 * {@link getVideoDimensions} and {@link generateVideoFrameThumbnail} in parallel,
 * which loads and decodes the file twice.
 */
export async function getVideoDimensionsAndScanThumbnail(
  file: File,
  options?: VideoLoadOptions & {
    maxThumbnailDim?: number;
    thumbnailQuality?: number;
  }
): Promise<{
  width: number;
  height: number;
  durationSeconds: number;
  thumbnail: Blob;
}> {
  const maxDim = options?.maxThumbnailDim ?? DEFAULT_THUMBNAIL_MAX_DIM;
  const quality = options?.thumbnailQuality ?? DEFAULT_THUMBNAIL_QUALITY;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, options);
    const dims = readValidatedVideoMetadata(video);
    const thumbnail = await captureThumbnailFromLoadedVideo(video, maxDim, quality);
    return { ...dims, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Read intrinsic width/height and duration from a video file (metadata only).
 */
export async function getVideoDimensions(
  file: File,
  options?: VideoLoadOptions
): Promise<{ width: number; height: number; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, options);
    return readValidatedVideoMetadata(video);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode one frame to a JPEG thumbnail for moderation scanning.
 * Seeks to a short offset so short clips still yield a frame.
 */
export async function generateVideoFrameThumbnail(
  file: File,
  maxDim = DEFAULT_THUMBNAIL_MAX_DIM,
  quality = DEFAULT_THUMBNAIL_QUALITY,
  loadOptions?: VideoLoadOptions
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitUntilVideoHasIntrinsicSize(video, url, loadOptions);
    return await captureThumbnailFromLoadedVideo(video, maxDim, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
