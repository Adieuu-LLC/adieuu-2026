/**
 * Transcode non-MP4 browser video to H.264/AAC MP4 for server acceptance.
 * Loads ffmpeg.wasm on first use (large download).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_VERSION = '0.12.6';
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

let loadPromise: Promise<FFmpeg> | null = null;

async function getLoadedFFmpeg(): Promise<FFmpeg> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
          'text/javascript'
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
          'application/wasm'
        ),
      });
      return ffmpeg;
    })();
  }
  return loadPromise;
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
