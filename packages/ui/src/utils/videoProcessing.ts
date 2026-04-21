/**
 * Client-side video utilities for E2E conversation media.
 *
 * Extracts a representative frame as a JPEG for the anonymised scan copy
 * (Rekognition) and reads dimensions from metadata. No server round-trip.
 */

const DEFAULT_THUMBNAIL_MAX_DIM = 512;
const DEFAULT_THUMBNAIL_QUALITY = 0.8;
const VIDEO_METADATA_TIMEOUT_MS = 15000;

/**
 * Attach a blob URL to a muted inline video element and wait until the browser
 * exposes non-zero intrinsic dimensions. `loadedmetadata` alone is often too
 * early for MP4 (dimensions stay 0 until the first decoded frame).
 */
async function waitForVideoIntrinsicSize(
  video: HTMLVideoElement,
  blobUrl: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        detach();
        reject(new Error('Timed out reading video dimensions'));
      }
    }, VIDEO_METADATA_TIMEOUT_MS);

    const detach = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', tryResolve);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('canplay', tryResolve);
      video.removeEventListener('seeked', tryResolve);
    };

    const finish = () => {
      if (settled) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        settled = true;
        detach();
        resolve();
      }
    };

    const tryResolve = () => finish();

    const onMetadata = () => {
      finish();
      if (!settled && video.videoWidth === 0) {
        try {
          video.currentTime = 0.001;
        } catch {
          /* ignore seek errors before ready */
        }
      }
    };

    video.onerror = () => {
      if (!settled) {
        settled = true;
        detach();
        reject(new Error('Failed to read video metadata'));
      }
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('loadeddata', tryResolve);
    video.addEventListener('canplay', tryResolve);
    video.addEventListener('seeked', tryResolve);

    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.src = blobUrl;
  });
}

/**
 * After a seek, `seeked` can fire before the frame at `currentTime` is ready to
 * paint; drawing immediately often yields a black canvas. Prefer rVFC, else
 * double rAF (common mitigation across Chromium/WebKit).
 */
async function waitForSeekPaintReady(video: HTMLVideoElement): Promise<void> {
  const rVfc = video.requestVideoFrameCallback?.bind(video);
  if (rVfc) {
    await new Promise<void>((resolve) => {
      rVfc(() => resolve());
    });
    return;
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * Read intrinsic width/height and duration from a video file (metadata only).
 */
export async function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitForVideoIntrinsicSize(video, url);
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
  quality = DEFAULT_THUMBNAIL_QUALITY
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    await waitForVideoIntrinsicSize(video, url);

    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.1, video.duration * 0.1)
        : 0;

    await new Promise<void>((resolve, reject) => {
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
