/**
 * Production CSP manifest for the web client.
 *
 * Merges per-package requirements from `@adieuu/crypto` and `@adieuu/ui`
 * with app-specific origins (API, WebSocket, media CDN, downloads).
 * The Vite CSP plugin consumes this at build time to produce the final
 * policy string injected into index.html.
 *
 * All imports use relative paths so the file can be evaluated by
 * esbuild (Vite config context) without requiring workspace packages
 * to be pre-built.
 *
 * @module web/csp
 */

import { mergeCspManifests } from '../../../packages/shared/src/csp/merge';
import { mediaOrigin, e2eMediaOrigin, livekitWsOrigin, livekitHttpOrigin } from '../../../packages/shared/src/csp/origins';
import { cryptoCspManifest } from '../../../packages/crypto/src/csp';
import { uiCspManifest } from '../../../packages/ui/src/csp';

const webCspManifest: Record<string, string[]> = {
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
    'https://api.adieuu.com',
    'wss://api.adieuu.com',
    livekitWsOrigin,
    livekitHttpOrigin,
    mediaOrigin,
    e2eMediaOrigin,
    'https://downloads.adieuu.com',
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
  'worker-src': ["'self'"],
};

export const cspManifest = mergeCspManifests(
  webCspManifest,
  cryptoCspManifest,
  uiCspManifest,
);
