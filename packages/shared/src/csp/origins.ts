/**
 * Build-time origins for Content Security Policy directives.
 *
 * Read from `process.env` at Vite config / build time (these files are
 * evaluated by Node, not bundled into client code). Each app's CSP
 * manifest imports from here so origins are defined once.
 *
 * Environment variables:
 *   VITE_MEDIA_S3_ORIGIN      - S3 origin for the general media bucket
 *   VITE_E2E_MEDIA_S3_ORIGIN  - S3 origin for the E2E encrypted media bucket
 *   VITE_LIVEKIT_URL          - LiveKit signaling WebSocket URL (wss://...)
 *
 * All default to the production Adieuu values when unset. The HTTP origin
 * for LiveKit is derived automatically from the WebSocket URL.
 *
 * @module csp/origins
 */

const PROD_MEDIA_S3_ORIGIN =
  'https://adieuu-production-media-998185172444.s3.us-east-1.amazonaws.com';

const PROD_E2E_MEDIA_S3_ORIGIN =
  'https://adieuu-production-e2e-media-998185172444.s3.us-east-1.amazonaws.com';

const PROD_LIVEKIT_WS_ORIGIN = 'wss://livestream.adieuu.com';

export const mediaS3Origin =
  process.env.VITE_MEDIA_S3_ORIGIN || PROD_MEDIA_S3_ORIGIN;

export const e2eMediaS3Origin =
  process.env.VITE_E2E_MEDIA_S3_ORIGIN || PROD_E2E_MEDIA_S3_ORIGIN;

export const livekitWsOrigin =
  process.env.VITE_LIVEKIT_URL || PROD_LIVEKIT_WS_ORIGIN;

export const livekitHttpOrigin = livekitWsOrigin
  .replace(/^wss:\/\//, 'https://')
  .replace(/^ws:\/\//, 'http://');
