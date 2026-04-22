/**
 * S3 layout for conversation moderation scan copies.
 * Nested: uploads/conv_scan/{scanHash}/{scanMediaId}.ext — batch-moderated after API writes .sealed.
 * Legacy flat: uploads/conv_scan/{scanMediaId}.ext — processed on each PutObject (unchanged).
 */

export const CONV_SCAN_NESTED_KEY_PREFIX_RE = /^uploads\/conv_scan\/[0-9a-f]{64}\//;

export function isNestedConvScanS3Key(s3Key: string): boolean {
  return CONV_SCAN_NESTED_KEY_PREFIX_RE.test(s3Key);
}

export function convScanSealObjectKey(scanHash: string): string {
  return `uploads/conv_scan/${scanHash}/.sealed`;
}

export function convScanManifestObjectKey(scanHash: string): string {
  return `uploads/conv_scan/${scanHash}/manifest.json`;
}
