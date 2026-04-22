/**
 * Optional v1 manifest for multi-part conv_scan sessions (seal request + S3 object).
 * Catches honest-client defects (wrong part list); does not prove frames match ciphertext.
 */

export type ConvScanSealManifestPartV1 = {
  mediaId: string;
  /** Lowercase hex SHA-256 of uploaded scan part bytes (audit / future verification). */
  contentSha256?: string;
};

export type ConvScanSealManifestV1 = {
  version: 1;
  parts: ConvScanSealManifestPartV1[];
};
