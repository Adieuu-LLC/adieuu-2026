/**
 * Transcode non-MP4 browser video to H.264/AAC MP4 for server acceptance.
 * Loads ffmpeg.wasm on first use: prefers same-origin `public/ffmpeg-core/` (see postinstall
 * copy script); fetches from unpkg if the local load fails.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_VERSION = '0.12.6';
const FFMPEG_UNPKG_ESM = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

let loadPromise: Promise<FFmpeg> | null = null;

function resolveFfmpegCoreBaseUrlForBrowser(): string {
  if (typeof window === 'undefined') {
    return FFMPEG_UNPKG_ESM;
  }
  try {
    const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
    const basePath = env?.BASE_URL ?? '/';
    return new URL('ffmpeg-core/', new URL(basePath, window.location.origin).href).href;
  } catch {
    return FFMPEG_UNPKG_ESM;
  }
}

async function loadFfmpegFromBase(ffmpeg: FFmpeg, base: string): Promise<void> {
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${withSlash}ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${withSlash}ffmpeg-core.wasm`, 'application/wasm'),
  });
}

async function getLoadedFFmpeg(): Promise<FFmpeg> {
  if (!loadPromise) {
    loadPromise = (async () => {
      if (typeof window === 'undefined') {
        const ffmpeg = new FFmpeg();
        await loadFfmpegFromBase(ffmpeg, FFMPEG_UNPKG_ESM);
        return ffmpeg;
      }
      const localBase = resolveFfmpegCoreBaseUrlForBrowser();
      const first = new FFmpeg();
      try {
        await loadFfmpegFromBase(first, localBase);
        return first;
      } catch {
        const fallback = new FFmpeg();
        await loadFfmpegFromBase(fallback, FFMPEG_UNPKG_ESM);
        return fallback;
      }
    })();
  }
  return loadPromise;
}

/**
 * Preloads the ffmpeg.wasm engine (e.g. when opening the message composer) so the first
 * transcode is not blocked on a large network fetch + wasm compile.
 */
export function preloadFfmpegCore(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  return getLoadedFFmpeg().then(() => undefined);
}

export type TranscodeVideoToMp4Options = {
  /**
   * Re-encode to H.264/AAC even when the container is already MP4 (e.g. HEVC
   * or other codecs the browser cannot decode for dimensions/thumbnails).
   */
  force?: boolean;
  /** Checked between ffmpeg steps; {@link ffmpeg.exec} is not interruptible. */
  signal?: AbortSignal;
};

/**
 * Returns a new File with type video/mp4. Passes through if already MP4 unless
 * {@link TranscodeVideoToMp4Options.force} is true.
 */
function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function transcodeVideoToMp4(
  file: File,
  options?: TranscodeVideoToMp4Options
): Promise<File> {
  const signal = options?.signal;
  throwIfAborted(signal);

  if (!options?.force && file.type === 'video/mp4') {
    return file;
  }
  if (!file.type.startsWith('video/')) {
    return file;
  }

  const ffmpeg = await getLoadedFFmpeg();
  throwIfAborted(signal);
  const ext =
    file.type === 'video/mp4'
      ? '.mp4'
      : (file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ??
        (file.type.includes('webm')
          ? '.webm'
          : file.type.includes('quicktime')
            ? '.mov'
            : '.bin'));
  const inputName = `in${ext}`;
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  throwIfAborted(signal);
  await ffmpeg.exec([
    '-i',
    inputName,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    'out.mp4',
  ]);

  throwIfAborted(signal);
  const data = await ffmpeg.readFile('out.mp4');
  if (typeof data === 'string') {
    throw new Error('ffmpeg readFile returned unexpected text for binary output');
  }
  const raw: Uint8Array =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const bytes = Uint8Array.from(raw);
  const base = file.name.replace(/\.[^.]+$/, '') || 'video';
  return new File([bytes], `${base}.mp4`, { type: 'video/mp4' });
}
