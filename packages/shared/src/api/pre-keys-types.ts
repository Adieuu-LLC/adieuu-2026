/**
 * Pre-key types (forward secrecy) used by Identity API and conversation crypto.
 */

/**
 * Public signed pre-key (returned when claiming).
 */
export interface PublicSignedPreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
  signature: string;
}

/**
 * Public one-time pre-key (returned when claiming).
 */
export interface PublicOneTimePreKey {
  keyId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
}

/**
 * Claimed pre-keys for a single device.
 */
export interface ClaimedDevicePreKeys {
  deviceId: string;
  signedPreKey: PublicSignedPreKey | null;
  oneTimePreKey: PublicOneTimePreKey | null;
}

/**
 * Parameters for uploading pre-keys.
 */
export interface UploadPreKeysParams {
  signedPreKey?: {
    keyId: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
    signature: string;
  };
  oneTimePreKeys?: Array<{
    keyId: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
  }>;
  signedPreKeyExpiresInDays?: number;
}

/**
 * Parameters for claiming pre-keys.
 */
export interface ClaimPreKeysParams {
  deviceIds?: string[];
}

/**
 * Response from the pre-key count endpoint.
 */
export interface PreKeyCountResponse {
  signedPreKey: { keyId: string; expiresAt: string | null } | null;
  oneTimePreKeysRemaining: number;
  otpkDigest: string;
  consumedOtpkKeyIds: string[];
}
