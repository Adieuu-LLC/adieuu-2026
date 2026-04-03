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
    'https://adieuu-production-media-998185172444.s3.us-east-1.amazonaws.com',
  ],
  'connect-src': [
    "'self'",
    'https://api.adieuu.com',
    'wss://api.adieuu.com',
    'https://adieuu-production-media-998185172444.s3.us-east-1.amazonaws.com',
    'https://downloads.adieuu.com',
  ],
  'media-src': ["'self'"],
};

export const cspManifest = mergeCspManifests(
  webCspManifest,
  cryptoCspManifest,
  uiCspManifest,
);
