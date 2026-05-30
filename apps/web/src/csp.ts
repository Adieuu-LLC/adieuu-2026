/**
 * Production CSP manifest for the web client.
 *
 * Merges per-package requirements from `@adieuu/crypto` and `@adieuu/ui`
 * with app-specific origins (API, WebSocket, S3 media, downloads).
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
import { mediaS3Origin, e2eMediaS3Origin, livekitWsOrigin } from '../../../packages/shared/src/csp/origins';
import { cryptoCspManifest } from '../../../packages/crypto/src/csp';
import { uiCspManifest } from '../../../packages/ui/src/csp';

const webCspManifest: Record<string, string[]> = {
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
    livekitWsOrigin,
    mediaS3Origin,
    e2eMediaS3Origin,
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
  'media-src': ["'self'"],
};

export const cspManifest = mergeCspManifests(
  webCspManifest,
  cryptoCspManifest,
  uiCspManifest,
);
