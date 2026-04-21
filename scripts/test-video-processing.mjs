#!/usr/bin/env node
/**
 * Browser smoke tests for packages/ui video dimension + thumbnail helpers (no upload).
 * Runs every file in repo-root `video-tests/` (gitignored sample assets).
 *
 * Requires: bun, Playwright Chromium (`pnpm exec playwright install chromium`).
 * Optional: ffmpeg on PATH — retries failures by transcoding to H.264 MP4 (mirrors app behaviour).
 *
 * If `video-tests` is missing or empty, exits 0 (skips; fine for CI without local assets).
 *
 * Usage: pnpm run test:video-processing
 */

import { createServer } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const videoTestsDir = join(repoRoot, 'video-tests');
const uiEntry = join(repoRoot, 'packages/ui/src/utils/videoProcessing.ts');
const bundlePath = join(repoRoot, 'packages/ui/dist/video-processing-test-bundle.js');

/** ffmpeg retry output — served from temp, not written under video-tests */
const transientSamples = new Map();

function mimeFromFilename(name) {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    ogx: 'video/ogg',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };
  return map[ext] ?? 'application/octet-stream';
}

function listSampleFiles() {
  if (!existsSync(videoTestsDir)) return [];
  return readdirSync(videoTestsDir).filter(
    (f) => !f.startsWith('.') && !f.endsWith('.md')
  );
}

const sampleFiles = listSampleFiles();
if (sampleFiles.length === 0) {
  console.log(
    'test:video-processing: skip (no files in video-tests/ — add samples locally or see scripts/test-video-processing.mjs).'
  );
  process.exit(0);
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

const allowedNames = new Set(sampleFiles);

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>
<script type="module">
  import * as VP from '/bundle.js';
  globalThis.__VP = VP;
</script>
</body></html>`;

const server = createServer((req, res) => {
  const rawPath = req.url?.split('?')[0] ?? '/';
  if (rawPath === '/' || rawPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (rawPath === '/bundle.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync(bundlePath));
    return;
  }
  if (rawPath.startsWith('/samples/')) {
    const name = decodeURIComponent(rawPath.slice('/samples/'.length));
    if (basename(name) !== name) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (transientSamples.has(name)) {
      const full = transientSamples.get(name);
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      const stream = createReadStream(full);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
      return;
    }

    if (!allowedNames.has(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const full = join(videoTestsDir, name);
    if (!existsSync(full)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeFromFilename(name) });
    const stream = createReadStream(full);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
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

function transcodeToH264Mp4(inputPath, outputPath) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { stdio: 'ignore' }
  );
  return r.status === 0 && existsSync(outputPath);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(180_000);

const results = [];

try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__VP != null, null, { timeout: 30_000 });

  for (const fileName of sampleFiles.sort()) {
    const fullPath = join(videoTestsDir, fileName);
    const mime = mimeFromFilename(fileName);
    let label = 'raw';
    let ok = false;
    let detail = null;
    let errMsg = null;

    const runInBrowser = async (name, type) => {
      return page.evaluate(
        async ({ sampleName, contentType }) => {
          const r = await fetch(`/samples/${encodeURIComponent(sampleName)}`);
          if (!r.ok) throw new Error(`fetch ${r.status}`);
          const ab = await r.arrayBuffer();
          const file = new File([ab], sampleName, { type: contentType });
          const mod = globalThis.__VP;
          const dims = await mod.getVideoDimensions(file);
          const thumb = await mod.generateVideoFrameThumbnail(file);
          return {
            dims,
            thumbSize: thumb.size,
            thumbType: thumb.type,
          };
        },
        { sampleName: name, contentType: type }
      );
    };

    try {
      detail = await runInBrowser(fileName, mime);
      ok = true;
    } catch (e) {
      errMsg = e?.message ?? String(e);
      const tmpOut = join(
        tmpdir(),
        `vp-retry-${process.pid}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.mp4`
      );
      if (transcodeToH264Mp4(fullPath, tmpOut)) {
        const retryName = `__transcode_retry_${process.pid}.mp4`;
        transientSamples.set(retryName, tmpOut);
        try {
          detail = await runInBrowser(retryName, 'video/mp4');
          ok = true;
          label = 'after ffmpeg → H.264 MP4';
        } catch (e2) {
          errMsg = e2?.message ?? String(e2);
        } finally {
          transientSamples.delete(retryName);
          try {
            rmSync(tmpOut, { force: true });
          } catch {
            /* ignore */
          }
        }
      }
    }

    results.push({ fileName, ok, label, detail, err: ok ? null : errMsg });
    const status = ok ? 'OK' : 'FAIL';
    console.log(
      `[${status}] ${fileName} (${label})` +
        (ok && detail
          ? ` dims=${detail.dims.width}x${detail.dims.height} duration≈${detail.dims.durationSeconds.toFixed(2)}s thumb=${detail.thumbSize}b`
          : '') +
        (!ok ? ` ${errMsg}` : '')
    );
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} sample(s) failed after raw decode and optional ffmpeg retry.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} sample(s) passed.`);
