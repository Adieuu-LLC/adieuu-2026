/**
 * Browser video element loading until intrinsic dimensions are available.
 * Some MP4s never expose videoWidth/height until after a seek or a muted play()
 * forces the decoder to run; passive events alone can time out.
 */

export type VideoLoadOptions = {
  /** Default 30s */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

function waitForNextEvent(
  target: EventTarget,
  event: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      target.removeEventListener(event, on);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const on = () => {
      clearTimeout(t);
      target.removeEventListener(event, on);
      resolve();
    };
    target.addEventListener(event, on, { once: true });
  });
}

function hasIntrinsicSize(video: HTMLVideoElement): boolean {
  return video.videoWidth > 0 && video.videoHeight > 0;
}

/**
 * Seek slightly off zero so decoders that need a timeline sample can produce a frame.
 */
async function nudgeSeek(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;
  try {
    video.currentTime = 0.001;
  } catch {
    return;
  }
  try {
    await waitForNextEvent(video, 'seeked', Math.min(timeoutMs, 8000));
  } catch {
    /* seek may be a no-op on some files */
  }
}

/**
 * Many browsers only populate intrinsic size after playback has started (muted autoplay).
 */
async function decodeWithMutedPlay(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch {
    return;
  }
  try {
    video.pause();
  } catch {
    /* ignore */
  }
}

/**
 * Wait until `videoWidth` / `videoHeight` are non-zero, using a short sequence of
 * metadata → seek nudge → muted play → optional loadeddata/canplay waits.
 */
export async function waitUntilVideoHasIntrinsicSize(
  video: HTMLVideoElement,
  blobUrl: string,
  options?: VideoLoadOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  const timeLeft = () => Math.max(0, deadline - Date.now());

  const ensureTime = () => {
    if (timeLeft() <= 0) {
      throw new Error('Timed out reading video dimensions');
    }
  };

  let rejectOnError: (e: Error) => void;
  const errorPromise = new Promise<never>((_, reject) => {
    rejectOnError = reject;
  });

  const onError = () => {
    rejectOnError(new Error('Failed to read video metadata'));
  };
  video.addEventListener('error', onError, { once: true });

  const run = async (): Promise<void> => {
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.src = blobUrl;

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForNextEvent(video, 'loadedmetadata', timeLeft());
    }
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    await nudgeSeek(video, timeLeft());
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    await decodeWithMutedPlay(video);
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        await waitForNextEvent(video, 'loadeddata', Math.min(8000, timeLeft()));
      } catch {
        /* optional */
      }
    }
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    await decodeWithMutedPlay(video);
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    try {
      await waitForNextEvent(video, 'canplay', Math.min(8000, timeLeft()));
    } catch {
      /* optional */
    }
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    await decodeWithMutedPlay(video);
    ensureTime();
    if (hasIntrinsicSize(video)) return;

    throw new Error('Timed out reading video dimensions');
  };

  try {
    await Promise.race([run(), errorPromise]);
  } finally {
    video.removeEventListener('error', onError);
  }
}
