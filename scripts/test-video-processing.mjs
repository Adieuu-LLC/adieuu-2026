#!/usr/bin/env node
/**
 * Browser smoke test for packages/ui video dimension + thumbnail helpers (no upload).
 * Requires: repo-root snek.mp4, bun, and Playwright Chromium (pnpm exec playwright install chromium).
 *
 * If `ffmpeg` is on PATH, the sample is transcoded to H.264 first so the test
 * matches what Chromium can decode (HEVC-in-MP4 often fails on Linux).
 *
 * Usage: pnpm run test:video-processing
 */

import { createServer } from 'node:http';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const uiEntry = join(repoRoot, 'packages/ui/src/utils/videoProcessing.ts');
const bundlePath = join(repoRoot, 'packages/ui/dist/video-processing-test-bundle.js');
const snekPath = join(repoRoot, 'snek.mp4');

if (!existsSync(snekPath)) {
  console.error('Missing snek.mp4 at repo root. Copy your sample MP4 there and retry.');
  process.exit(1);
}

mkdirSync(dirname(bundlePath), { recursive: true });
const build = spawnSync(
  'bun',
  ['build', uiEntry, '--outfile', bundlePath, '--target', 'browser', '--format', 'esm'],
  { cwd: repoRoot, stdio: 'inherit' }
);
if (build.status !== 0) {
  process.exit(1);
}

let samplePath = snekPath;
let sampleLabel = 'original';

const tmp264 = join(tmpdir(), `video-processing-test-${process.pid}.mp4`);
const transcode = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    snekPath,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '28',
    '-movflags',
    '+faststart',
    '-an',
    tmp264,
  ],
  { stdio: 'ignore' }
);
if (transcode.status === 0 && existsSync(tmp264)) {
  samplePath = tmp264;
  sampleLabel = 'ffmpeg H.264 transcode (for Chromium compatibility)';
  console.log(`Using ${sampleLabel}.`);
} else {
  console.warn(
    'ffmpeg not available or transcode failed; testing original file (HEVC may fail in Chromium on Linux).'
  );
}

const buf = readFileSync(samplePath);
if (samplePath === tmp264) {
  try {
    rmSync(tmp264);
  } catch {
    /* ignore */
  }
}

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>
<script type="module">
  import * as VP from '/bundle.js';
  globalThis.__VP = VP;
</script>
</body></html>`;

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0] ?? '/';
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (path === '/bundle.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync(bundlePath));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__VP != null, null, { timeout: 30_000 });

  const b64 = buf.toString('base64');
  const result = await page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const u8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
    const blob = new Blob([u8], { type: 'video/mp4' });
    const file = new File([blob], 'sample.mp4', { type: 'video/mp4' });
    const mod = globalThis.__VP;
    const dims = await mod.getVideoDimensions(file);
    const thumb = await mod.generateVideoFrameThumbnail(file);
    return {
      dims,
      thumbSize: thumb.size,
      thumbType: thumb.type,
    };
  }, b64);

  console.log('OK', sampleLabel);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
