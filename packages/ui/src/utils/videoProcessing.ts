/**
 * Client-side video utilities for E2E conversation media.
 *
 * Extracts a representative frame as a JPEG for the anonymised scan copy
 * (Rekognition) and reads dimensions from metadata. No server round-trip.
 */

const DEFAULT_THUMBNAIL_MAX_DIM = 512;
const DEFAULT_THUMBNAIL_QUALITY = 0.8;

/**
 * Read intrinsic width/height and duration from a video file (metadata only).
 */
export async function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to read video metadata'));
      video.src = url;
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error('Invalid video dimensions');
    }
    console.info("vid dims", width, height);
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
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = url;
    });

    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.1, video.duration * 0.1)
        : 0;

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Failed to seek video'));
      video.currentTime = seekTime;
    });

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
