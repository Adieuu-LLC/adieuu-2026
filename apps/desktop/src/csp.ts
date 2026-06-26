/**
 * Production CSP manifest for the desktop (Electron renderer) client.
 *
 * Merges per-package requirements from `@adieuu/crypto` and `@adieuu/ui`
 * with app-specific origins (API, WebSocket, media CDN, downloads).
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
import { apiOrigin, apiWsOrigin, downloadsOrigin, mediaOrigin, e2eMediaOrigin, livekitWsOrigin, livekitHttpOrigin } from '../../../packages/shared/src/csp/origins';
import { cryptoCspManifest } from '../../../packages/crypto/src/csp';
import { uiCspManifest } from '../../../packages/ui/src/csp';

const desktopCspManifest: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'img-src': [
    "'self'",
    'https:',
    'https://static.klipy.com',
    mediaOrigin,
    e2eMediaOrigin,
  ],
  'connect-src': [
    "'self'",
    apiOrigin,
    apiWsOrigin,
    livekitWsOrigin,
    livekitHttpOrigin,
    mediaOrigin,
    e2eMediaOrigin,
    downloadsOrigin,
    'https://sandbox.verifymyage.com',
    'https://oauth.verifymyage.com',
    'https://verify.verifymyage.com',
  ],
  'form-action': [
    "'self'",
    'https://sandbox.verifymyage.com',
    'https://oauth.verifymyage.com',
    'https://verify.verifymyage.com',
  ],
  'media-src': ["'self'", mediaOrigin, e2eMediaOrigin],
  /**
   * `blob:` (from @adieuu/ui): ffmpeg.wasm workers.
   * `'self'`: Vite worker chunks load from `adieuu://app/assets/worker-*.js` in the
   * packaged shell — they are not blob URLs, so `blob:` alone blocks transcoding.
   */
  'worker-src': ["'self'"],
};

export const cspManifest = mergeCspManifests(
  desktopCspManifest,
  cryptoCspManifest,
  uiCspManifest,
);

export const devCspExtras: Record<string, string[]> = {
  'connect-src': [
    'http://localhost:4000',
    'ws://localhost:9001',
    'ws://localhost:*',
    'wss://localhost:*',
    'wss://localhost',
    'https://localhost',
    'https://localhost:*',
  ],
};
