/**
 * Copies @ffmpeg/core ESM assets into public/ffmpeg-core/ for same-origin loading
 * (avoids CDN on first transcode). Run from package postinstall.
 */
import { cp, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const coreJs = require.resolve('@ffmpeg/core');
const coreWasm = require.resolve('@ffmpeg/core/wasm');
const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, '..', 'public', 'ffmpeg-core');

async function main() {
  await mkdir(destDir, { recursive: true });
  await cp(coreJs, join(destDir, 'ffmpeg-core.js'));
  await cp(coreWasm, join(destDir, 'ffmpeg-core.wasm'));
  // eslint-disable-next-line no-console -- build script feedback
  console.log('[copy-ffmpeg-core] Wrote', destDir);
}

main().catch((err) => {
  console.error('[copy-ffmpeg-core]', err);
  process.exit(1);
});
