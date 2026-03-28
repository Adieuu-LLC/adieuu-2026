/**
 * Local update test server for electron-updater integration testing.
 *
 * Spins up an HTTP server that mimics the downloads.adieuu.com CloudFront
 * distribution, serving a fake manifest and a small dummy binary. Point the
 * desktop app at it via:
 *
 *   ADIEUU_UPDATE_SERVER_URL=http://localhost:8089 pnpm --filter @adieuu/desktop dev
 *
 * The server generates a manifest whose version is higher than the current
 * app version so electron-updater treats it as an available update.
 *
 * Usage:
 *   bun run scripts/test-update-server.ts                       # defaults
 *   bun run scripts/test-update-server.ts --port 9000           # custom port
 *   bun run scripts/test-update-server.ts --version 99.0.0      # custom version
 *
 * @module scripts/test-update-server
 */

import { createHash } from 'crypto';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', default: '8089' },
    version: { type: 'string', default: '99.0.0' },
  },
});

const PORT = parseInt(args.port ?? '8089', 10);
const FAKE_VERSION = args.version ?? '99.0.0';

const DUMMY_BINARY = Buffer.alloc(1024, 0x42);
const DUMMY_BINARY_NAME = `Adieuu-${FAKE_VERSION}-linux-x86_64.AppImage`;
const DUMMY_SHA512 = createHash('sha512').update(DUMMY_BINARY).digest('base64');

function buildManifest(platform: string): string {
  const filename =
    platform === 'mac'
      ? `Adieuu-${FAKE_VERSION}-mac-x64.zip`
      : platform === 'linux'
        ? DUMMY_BINARY_NAME
        : `Adieuu-${FAKE_VERSION}-win-x64.exe`;

  return [
    `version: ${FAKE_VERSION}`,
    'files:',
    `  - url: ${filename}`,
    `    sha512: ${DUMMY_SHA512}`,
    `    size: ${DUMMY_BINARY.byteLength}`,
    `path: ${filename}`,
    `sha512: ${DUMMY_SHA512}`,
    `releaseDate: ${new Date().toISOString()}`,
  ].join('\n');
}

const manifests: Record<string, string> = {
  'latest.yml': buildManifest('win'),
  'latest-mac.yml': buildManifest('mac'),
  'latest-linux.yml': buildManifest('linux'),
};

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (manifests[path]) {
      console.info(`[200] ${request.method} ${url.pathname} (manifest)`);
      return new Response(manifests[path], {
        status: 200,
        headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
      });
    }

    if (path === DUMMY_BINARY_NAME || path.endsWith('.AppImage') || path.endsWith('.exe') || path.endsWith('.zip') || path.endsWith('.dmg')) {
      console.info(`[200] ${request.method} ${url.pathname} (binary)`);
      return new Response(DUMMY_BINARY, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(DUMMY_BINARY.byteLength),
        },
      });
    }

    console.info(`[404] ${request.method} ${url.pathname}`);
    return new Response('Not Found', { status: 404 });
  },
});

console.info('');
console.info('=== Adieuu Local Update Test Server ===');
console.info('');
console.info(`  Listening:    http://localhost:${server.port}`);
console.info(`  Fake version: ${FAKE_VERSION}`);
console.info(`  Binary:       ${DUMMY_BINARY_NAME} (${DUMMY_BINARY.byteLength} bytes)`);
console.info(`  SHA-512:      ${DUMMY_SHA512.slice(0, 32)}...`);
console.info('');
console.info('  Available manifests:');
for (const name of Object.keys(manifests)) {
  console.info(`    http://localhost:${server.port}/${name}`);
}
console.info('');
console.info('  Point the desktop app here with:');
console.info(`    ADIEUU_UPDATE_SERVER_URL=http://localhost:${server.port} pnpm --filter @adieuu/desktop dev`);
console.info('');
console.info('  Press Ctrl+C to stop.');
console.info('');
