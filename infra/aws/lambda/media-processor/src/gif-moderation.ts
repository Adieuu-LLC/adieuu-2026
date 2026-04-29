/** Rekognition image APIs accept JPEG/PNG only — not animated GIF. */

export function isGifImage(contentType: string, key: string): boolean {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return base === 'image/gif' || key.toLowerCase().endsWith('.gif');
}

/**
 * First frame as JPEG for DetectModerationLabels (animated GIF is not a valid Rekognition format).
 */
export async function gifFirstFrameJpegForModeration(body: Uint8Array): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(body), { pages: 1 })
    .jpeg({ quality: 85 })
    .toBuffer();
}
