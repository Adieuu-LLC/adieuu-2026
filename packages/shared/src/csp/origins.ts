/**
 * Build-time origins for Content Security Policy directives.
 *
 * Read from `process.env` at Vite config / build time (these files are
 * evaluated by Node, not bundled into client code). Each app's CSP
 * manifest imports from here so origins are defined once.
 *
 * Environment variables:
 *   VITE_MEDIA_ORIGIN      - CloudFront origin for media uploads/processed media
 *   VITE_E2E_MEDIA_ORIGIN  - CloudFront origin for E2E encrypted media
 *   VITE_LIVEKIT_URL       - LiveKit signaling WebSocket URL (wss://...)
 *
 * All default to the production Adieuu CloudFront domains when unset.
 * The HTTP origin for LiveKit is derived automatically from the WebSocket URL.
 *
 * @module csp/origins
 */

const PROD_MEDIA_ORIGIN = 'https://media.adieuu.com';
const PROD_E2E_MEDIA_ORIGIN = 'https://e2e-media.adieuu.com';
const PROD_LIVEKIT_WS_ORIGIN = 'wss://livestream.adieuu.com';

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
