/**
 * CloudFront signed URL generation utility.
 *
 * When the CloudFront signing infrastructure is deployed (via
 * `enable_cloudfront_signed_urls = true` in Terraform), this module generates
 * signed URLs for PUT/GET operations through CloudFront custom domains,
 * hiding the underlying S3 bucket URLs from clients.
 *
 * Falls back to S3 presigned URLs when CloudFront signing is not configured.
 */

import { getSignedUrl as getCfSignedUrl } from '@aws-sdk/cloudfront-signer';
import { config } from '../config';

export interface CloudFrontSignedUrlOptions {
  /** Full S3 key (e.g. uploads/avatar/abc123.jpg) */
  s3Key: string;
  /** Which CloudFront domain to use */
  distribution: 'media' | 'e2e-media';
  /** Expiry in seconds from now */
  expiresInSeconds: number;
}

/**
 * Returns true when CloudFront signed URL infrastructure is available.
 * When false, callers should fall back to S3 presigned URLs.
 */
export function isCloudFrontSigningEnabled(): boolean {
  return !!(
    config.cloudfront?.signingKeyPairId &&
    config.cloudfront?.signingPrivateKey &&
    config.cloudfront?.mediaUploadDomain
  );
}

function getDomain(distribution: 'media' | 'e2e-media'): string {
  return distribution === 'media'
    ? config.cloudfront.mediaUploadDomain
    : config.cloudfront.e2eMediaDomain;
}

/**
 * Generate a CloudFront signed URL for a given S3 key.
 * The signed URL allows the bearer to perform any HTTP method on the path
 * (method restriction is handled by CloudFront cache behavior config).
 */
export function generateCloudFrontSignedUrl(options: CloudFrontSignedUrlOptions): string {
  const { s3Key, distribution, expiresInSeconds } = options;
  const domain = getDomain(distribution);

  if (!domain) {
    throw new Error(
      `CloudFront domain not configured for distribution: ${distribution}`
    );
  }

  const url = `https://${domain}/${s3Key}`;
  const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  return getCfSignedUrl({
    url,
    keyPairId: config.cloudfront.signingKeyPairId,
    privateKey: config.cloudfront.signingPrivateKey,
    dateLessThan,
  });
}
