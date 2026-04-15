/**
 * Identity and E2E types.
 */

import type { PublicSignedPreKey } from './pre-keys-types';

/**
 * Crypto profile type for E2E encryption.
 */
export type CryptoProfile = 'default' | 'cnsa2';

/**
 * Visibility level for profile fields.
 */
export type ProfileVisibility = 'public' | 'friends' | 'private';

/**
 * Per-field privacy settings for identity profiles.
 */
export interface ProfilePrivacySettings {
  avatar: ProfileVisibility;
  banner: ProfileVisibility;
  bio: ProfileVisibility;
  lastActiveAt: ProfileVisibility;
  profileColors: ProfileVisibility;
  achievements: ProfileVisibility;
}

/**
 * Customisable profile accent colours.
 */
export interface ProfileColors {
  accent?: string;
  cardBackground?: string;
  background?: string;
}

/**
 * Public identity info (safe for clients).
 */
export interface PublicIdentity {
  /** Unique identity ID */
  id: string;
  /** Username for the identity */
  username: string;
  /** Display name for the identity */
  displayName: string;
  /** Short bio/description (max 160 characters) */
  bio?: string;
  /** URL to avatar image */
  avatarUrl?: string;
  /** URL to banner image */
  bannerUrl?: string;
  /** Profile accent colours */
  profileColors?: ProfileColors;
  /** Per-field privacy settings (only visible to self) */
  privacySettings?: ProfilePrivacySettings;
  /** When the identity was created */
  createdAt: string;
  /** Last time this identity was active */
  lastActiveAt: string;
  /** Whether this identity has been deleted */
  isDeleted: boolean;
  /** Preferred crypto profile for E2E encryption */
  preferredCryptoProfile?: CryptoProfile;
  /** Whether this identity has E2E keys set up */
  hasE2EKeys?: boolean;
  /** Number of registered devices */
  deviceCount?: number;
  /** Whether adding this identity to a group requires their explicit approval */
  requireGroupApproval?: boolean;
}

/**
 * Public device info for E2E encryption.
 * `name` is only set when the authenticated viewer is this identity’s owner; otherwise empty.
 */
export interface PublicDevice {
  deviceId: string;
  /** Friendly label; empty when another user fetches keys (never expose names across identities). */
  name: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
  registeredAt?: string;
  lastActiveAt?: string;
  /** Active signed pre-key for handshakes; present when GET /keys is authorized. */
  signedPreKey?: PublicSignedPreKey | null;
}

/**
 * Public identity session info for session management.
 */
export interface PublicIdentitySession {
  /** Session ID (for revocation) */
  id: string;
  /** When the session was created */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** User agent (browser/device info) */
  userAgent?: string;
  /** IP address (partially masked for privacy) */
  ipAddress?: string;
  /** Whether this is the current session */
  isCurrent?: boolean;
}

/**
 * Identity public keys for E2E encryption.
 */
export interface IdentityPublicKeys {
  identityId: string;
  signingPublicKey: string;
  preferredCryptoProfile: CryptoProfile;
  devices: PublicDevice[];
}

/**
 * Encrypted key bundle from server.
 */
export interface EncryptedKeyBundle {
  encryptedBundle: string;
  salt: string;
  nonce: string;
  useSeparatePassphrase: boolean;
  schemeVersion: number;
}

/**
 * Parameters for initializing E2E encryption.
 */
export interface InitializeE2EParams {
  signingPublicKey: string;
  preferredCryptoProfile?: CryptoProfile;
  device: {
    deviceId: string;
    name: string;
    ecdhPublicKey: string;
    kemPublicKey?: string;
  };
  bundle: {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    useSeparatePassphrase: boolean;
  };
}

/**
 * Parameters for registering a new device.
 */
export interface RegisterDeviceParams {
  deviceId: string;
  name: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
}

/**
 * Parameters for updating an encrypted key bundle.
 */
export interface UpdateKeyBundleParams {
  encryptedBundle: string;
  salt: string;
  nonce: string;
}

/**
 * Parameters for creating an identity.
 */
export interface CreateIdentityParams {
  /** Short-lived signed token from GET /api/auth/session */
  signedToken: string;
  /** Passphrase (min 8 characters) */
  passphrase: string;
  /** Username (3-30 chars, alphanumeric + underscores/hyphens) */
  username: string;
  /** Display name (1-50 chars) */
  displayName: string;
}

/**
 * Parameters for logging into an identity.
 */
export interface LoginIdentityParams {
  /** Short-lived signed token from GET /api/auth/session */
  signedToken: string;
  /** Passphrase to authenticate */
  passphrase: string;
}

/**
 * Response from identity login.
 */
export interface IdentityLoginResponse {
  identity: PublicIdentity;
}

/**
 * Response from identity login failure with attempt info.
 */
export interface IdentityLoginErrorResponse {
  error: string;
  attemptNumber?: number;
  retryAfter?: number;
}

/**
 * Parameters for changing the identity passphrase.
 */
export interface ChangePassphraseParams {
  signedToken: string;
  currentPassphrase: string;
  newPassphrase: string;
  newEncryptedBundle: string;
  newBundleSalt: string;
  newBundleNonce: string;
}
