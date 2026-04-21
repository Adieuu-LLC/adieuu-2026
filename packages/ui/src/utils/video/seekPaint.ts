/**
 * After a seek, `seeked` can fire before the frame is ready to paint (black canvas).
 * `requestVideoFrameCallback` can hang on some paused videos — use a short timeout
 * and fall back to double rAF.
 */

const RVFC_FALLBACK_MS = 2500;

export async function waitForSeekPaintReady(video: HTMLVideoElement): Promise<void> {
  const rVfc = video.requestVideoFrameCallback?.bind(video);
  if (rVfc) {
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          rVfc(() => resolve());
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('rVFC timeout')), RVFC_FALLBACK_MS)
        ),
      ]);
      return;
    } catch {
      /* fall through */
    }
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}
