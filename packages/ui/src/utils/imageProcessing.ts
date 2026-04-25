/**
 * Client-side image processing utilities for E2E conversation media.
 *
 * Provides:
 * - Thumbnail generation (Canvas-based downscale for scan copies)
 * - EXIF metadata stripping (re-encodes via Canvas to remove metadata)
 * - Image dimension extraction
 *
 * All operations run in the browser; no server round-trip.
 */

const DEFAULT_THUMBNAIL_MAX_DIM = 512;
const DEFAULT_THUMBNAIL_QUALITY = 0.8;
const DEFAULT_STRIP_QUALITY = 0.92;

/**
 * One decode: read dimensions and build a downscaled scan thumbnail JPEG.
 * Prefer over separate {@link getImageDimensions} + {@link generateThumbnail} on the same file.
 */
export async function getImageDimensionsAndThumbnailJpeg(
  file: File,
  maxDim = DEFAULT_THUMBNAIL_MAX_DIM,
  quality = DEFAULT_THUMBNAIL_QUALITY
): Promise<{
  width: number;
  height: number;
  thumbnail: Blob;
}> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Failed to create 2D canvas context');
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { width, height, thumbnail };
}

/**
 * Generate a thumbnail of an image, downscaled to fit within maxDim x maxDim.
 * The output is always JPEG for consistent scan copy size and no alpha channel
 * (Rekognition processes JPEG well).
 *
 * @param file - Source image file
 * @param maxDim - Maximum width/height (default 512)
 * @param quality - JPEG quality 0-1 (default 0.8)
 * @returns A Blob containing the thumbnail JPEG
 */
export async function generateThumbnail(
  file: File,
  maxDim = DEFAULT_THUMBNAIL_MAX_DIM,
  quality = DEFAULT_THUMBNAIL_QUALITY
): Promise<Blob> {
  const { thumbnail } = await getImageDimensionsAndThumbnailJpeg(file, maxDim, quality);
  return thumbnail;
}

/**
 * Strip EXIF and other metadata from an image by re-encoding it through Canvas.
 * The output preserves the original MIME type when possible (JPEG, PNG, WebP).
 * GIF is re-encoded as PNG (Canvas cannot produce animated GIFs).
 *
 * @param file - Source image file
 * @param quality - Encoding quality for lossy formats (default 0.92)
 * @returns A Blob with metadata removed
 */
export async function stripExifMetadata(
  file: File,
  quality = DEFAULT_STRIP_QUALITY
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D canvas context');

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const outputType = file.type === 'image/gif' ? 'image/png' : file.type;
  const needsQuality = outputType === 'image/jpeg' || outputType === 'image/webp';
  const blob = await canvas.convertToBlob({
    type: outputType,
    ...(needsQuality ? { quality } : {}),
  });

  return blob;
}

/**
 * Get the dimensions of an image file without loading it into a visible DOM element.
 *
 * @param file - Image file
 * @returns Width and height in pixels
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}
