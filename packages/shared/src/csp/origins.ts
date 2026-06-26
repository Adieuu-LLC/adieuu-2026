/**
 * Build-time origins for Content Security Policy directives.
 *
 * Read from `process.env` at Vite config / build time (these files are
 * evaluated by Node, not bundled into client code). Each app's CSP
 * manifest imports from here so origins are defined once.
 *
 * Environment variables:
 *   VITE_API_ORIGIN        - HTTPS origin for the API (e.g. https://api.example.com)
 *   VITE_DOWNLOADS_BASE_URL - HTTPS origin for desktop downloads CDN
 *   VITE_MEDIA_ORIGIN      - CloudFront origin for media uploads/processed media
 *   VITE_E2E_MEDIA_ORIGIN  - CloudFront origin for E2E encrypted media
 *   VITE_LIVEKIT_URL       - LiveKit signaling WebSocket URL (wss://...)
 *
 * All variables default to the production Adieuu domains when unset.
 * The WSS origin for API and HTTP origin for LiveKit are derived automatically.
 *
 * @module csp/origins
 */

const PROD_API_ORIGIN = 'https://api.adieuu.com';
const PROD_DOWNLOADS_ORIGIN = 'https://downloads.adieuu.com';
const PROD_MEDIA_ORIGIN = 'https://media.adieuu.com';
const PROD_E2E_MEDIA_ORIGIN = 'https://e2e-media.adieuu.com';
const PROD_LIVEKIT_WS_ORIGIN = 'wss://livestream.adieuu.com';

export const apiOrigin =
  process.env.VITE_API_ORIGIN || PROD_API_ORIGIN;

export const apiWsOrigin = apiOrigin
  .replace(/^https:\/\//, 'wss://')
  .replace(/^http:\/\//, 'ws://');

export const downloadsOrigin =
  (process.env.VITE_DOWNLOADS_BASE_URL || PROD_DOWNLOADS_ORIGIN).replace(/\/+$/, '');

export const mediaOrigin =
  process.env.VITE_MEDIA_ORIGIN || process.env.VITE_MEDIA_S3_ORIGIN || PROD_MEDIA_ORIGIN;

export const e2eMediaOrigin =
  process.env.VITE_E2E_MEDIA_ORIGIN || process.env.VITE_E2E_MEDIA_S3_ORIGIN || PROD_E2E_MEDIA_ORIGIN;

/** @deprecated Use {@link mediaOrigin} instead. */
export const mediaS3Origin = mediaOrigin;
/** @deprecated Use {@link e2eMediaOrigin} instead. */
export const e2eMediaS3Origin = e2eMediaOrigin;

export const livekitWsOrigin =
  process.env.VITE_LIVEKIT_URL || PROD_LIVEKIT_WS_ORIGIN;

export const livekitHttpOrigin = livekitWsOrigin
  .replace(/^wss:\/\//, 'https://')
  .replace(/^ws:\/\//, 'http://');
