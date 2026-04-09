/**
 * Production CSP manifest for the desktop (Electron renderer) client.
 *
 * Merges per-package requirements from `@adieuu/crypto` and `@adieuu/ui`
 * with app-specific origins (API, WebSocket, S3 media, downloads).
 * The Vite CSP plugin consumes this at build time to produce the final
 * policy string injected into the renderer index.html.
 *
 * Dev-mode additions (localhost origins for API and WebSocket) are
 * supplied separately via the plugin's `devExtras` option rather than
 * baked into the production manifest.
 *
 * All imports use relative paths so the file can be evaluated by
 * esbuild (Vite config context) without requiring workspace packages
 * to be pre-built.
 *
 * @module desktop/csp
 */

import { mergeCspManifests } from '../../../packages/shared/src/csp/merge';
import { mediaS3Origin, e2eMediaS3Origin } from '../../../packages/shared/src/csp/origins';
import { cryptoCspManifest } from '../../../packages/crypto/src/csp';
import { uiCspManifest } from '../../../packages/ui/src/csp';

const desktopCspManifest: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'img-src': [
    "'self'",
    'https://media.adieuu.com',
    'https://static.klipy.com',
    mediaS3Origin,
    e2eMediaS3Origin,
  ],
  'connect-src': [
    "'self'",
    'https://api.adieuu.com',
    'wss://api.adieuu.com',
    mediaS3Origin,
    e2eMediaS3Origin,
    'https://downloads.adieuu.com',
  ],
  'media-src': ["'self'"],
};

export const cspManifest = mergeCspManifests(
  desktopCspManifest,
  cryptoCspManifest,
  uiCspManifest,
);

export const devCspExtras: Record<string, string[]> = {
  'connect-src': ['http://localhost:4000', 'ws://localhost:9001'],
};
