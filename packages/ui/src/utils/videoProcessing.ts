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

const DEFAULT_THUMBNAIL_MAX_DIM = 512;
const DEFAULT_THUMBNAIL_QUALITY = 0.8;

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

    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.1, video.duration * 0.1)
        : 0;

    await new Promise<void>((resolve, reject) => {
      if (Math.abs(video.currentTime - seekTime) < 1e-4) {
        queueMicrotask(() => resolve());
        return;
      }
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Failed to seek video'));
      video.currentTime = seekTime;
    });

    await waitForSeekPaintReady(video);

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
  } finally {
    URL.revokeObjectURL(url);
  }
}
