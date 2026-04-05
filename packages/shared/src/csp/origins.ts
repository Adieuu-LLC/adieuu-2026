/**
 * Build-time S3 origins for Content Security Policy directives.
 *
 * Read from `process.env` at Vite config / build time (these files are
 * evaluated by Node, not bundled into client code). Each app's CSP
 * manifest imports from here so bucket URLs are defined once.
 *
 * Environment variables:
 *   VITE_MEDIA_S3_ORIGIN      - S3 origin for the general media bucket
 *   VITE_E2E_MEDIA_S3_ORIGIN  - S3 origin for the E2E encrypted media bucket
 *
 * Both default to the production Adieuu buckets when unset.
 *
 * @module csp/origins
 */

const PROD_MEDIA_S3_ORIGIN =
  'https://adieuu-production-media-998185172444.s3.us-east-1.amazonaws.com';

const PROD_E2E_MEDIA_S3_ORIGIN =
  'https://adieuu-production-e2e-media-998185172444.s3.us-east-1.amazonaws.com';

export const mediaS3Origin =
  process.env.VITE_MEDIA_S3_ORIGIN || PROD_MEDIA_S3_ORIGIN;

export const e2eMediaS3Origin =
  process.env.VITE_E2E_MEDIA_S3_ORIGIN || PROD_E2E_MEDIA_S3_ORIGIN;
