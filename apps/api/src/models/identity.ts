/**
 * Identity model
 * Represents a user identity in the system.
 *
 * SECURITY NOTE: Identities are intentionally unlinkable to Users.
 * The `ident` hash is derived from: SHA3-256(Argon2id(passphrase, salt=accountHash))
 * where accountHash is an HMAC of the account ID, never stored on the identity.
 * Without the passphrase, it is impossible to link an Identity to a User.
 */

import type { BaseDocument } from './base';
import type { PublicSignedPreKey } from './pre-key';
import type { SubscriptionOverride } from './user';

/**
 * Visibility level for profile fields.
 * - 'public':  visible to everyone
 * - 'friends': visible only to mutual friends
 * - 'private': visible only to the profile owner
 */
export type ProfileVisibility = 'public' | 'friends' | 'private';

/**
 * Per-field privacy settings for the identity profile.
 * When absent from storage, {@link DEFAULT_PRIVACY_SETTINGS} applies.
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

export const DEFAULT_PRIVACY_SETTINGS: ProfilePrivacySettings = {
  avatar: 'public',
  banner: 'public',
  bio: 'public',
  lastActiveAt: 'friends',
  profileColors: 'public',
  achievements: 'friends',
};

/** Prefix for deleted identity idents (followed by objectId) */
export const DELETED_IDENT_PREFIX = '_deleted_';

/**
 * Check if an ident value indicates a deleted identity.
 */
export function isDeletedIdent(ident: string): boolean {
  return ident.startsWith(DELETED_IDENT_PREFIX);
}

/**
 * Crypto profile type for E2E encryption.
 * - 'default': X25519 + Ed25519 (classical)
 * - 'cnsa2': ML-KEM-1024 + Ed25519 (post-quantum)
 */
export type CryptoProfile = 'default' | 'cnsa2';

/**
 * Registered device for an identity.
 * Each device has its own ECDH/KEM key pair for key exchange.
 */
export interface IdentityDevice {
  /** Unique device identifier (UUID) */
  deviceId: string;
  /** Human-readable device name */
  name: string;
  /** X25519 public key for ECDH (base64) */
  ecdhPublicKey: string;
  /** ML-KEM public key for post-quantum (base64, optional) */
  kemPublicKey?: string;
  /**
   * Ed25519 signature (base64) over static device keys under the identity signing key.
   * Used for device-trust fingerprints (v3).
   */
  staticKeyAttestation?: string;
  /** When this device was registered */
  registeredAt: Date;
  /** Last time this device was active */
  lastActiveAt: Date;
}

/**
 * Identity document stored in MongoDB
 */
export interface IdentityDocument extends BaseDocument {
  /**
   * Unique identifier hash for the identity.
   * Generated from: SHA3-256(Argon2id(passphrase, salt=accountHash))
   * Set to 'deleted' when identity is soft-deleted.
   */
  ident: string;

  /**
   * Hash algorithm version used to generate the ident.
   * Allows for algorithm migration when parameters change.
   */
  hashVersion: number;

  /** Username associated with the identity */
  username: string;

  /** Display name for the identity */
  displayName: string;

  /** Short bio/description (max 160 characters) */
  bio?: string;

  /** URL to avatar image */
  avatarUrl?: string;

  /** URL to banner image */
  bannerUrl?: string;

  /** Customisable profile accent colours (hex strings) */
  profileColors?: ProfileColors;

  /** Per-field privacy settings */
  privacySettings?: ProfilePrivacySettings;

  /** Last time this identity was active */
  lastActiveAt: Date;

  /** Preferred crypto profile for E2E encryption */
  preferredCryptoProfile?: CryptoProfile;

  /** Ed25519 signing public key (base64) */
  signingPublicKey?: string;

  /** Registered devices for E2E encryption */
  devices?: IdentityDevice[];

  /** When true, adding this identity to a group requires their explicit approval */
  requireGroupApproval?: boolean;

  /** Platform-level roles assigned directly on this identity */
  platformRoles?: string[];
  /** Platform-level permission attributes granted directly */
  platformAttributes?: string[];

  /** Platform moderation: suspended until this date (null/undefined = not suspended) */
  suspendedUntil?: Date | null;
  /** Platform moderation: permanently banned */
  isBanned?: boolean;
  /** Platform moderation: human-readable reason for the latest moderation action */
  moderationReason?: string;
  /** Platform moderation: report ID that triggered the latest enforcement action */
  moderationReportId?: string;

  /** Admin-granted subscription tier overrides, merged additively with account-level access. */
  subscriptionOverrides?: SubscriptionOverride[];
  /** Admin-granted entitlement overrides (lifetime), merged additively with account-level access. */
  entitlementOverrides?: string[];

  /**
   * Server-owned dashboard counters (never exposed on {@link PublicIdentity}).
   * Omitted on legacy rows → treat as 0 when reading for API responses.
   */
  messagesSentCount?: number;
  /** Monotonic threads this identity joined (not decremented on leave). */
  conversationsJoinedCount?: number;
  /** Exact mutual friend count for the identity’s outward edges. */
  friendCount?: number;
  /** One row per distinct earned achievement (`IDENTITY_ACHIEVEMENTS`). */
  achievementsEarnedCount?: number;
}

/**
 * Identity creation input (without system-generated fields)
 */
export interface CreateIdentityInput {
  ident: string;
  hashVersion: number;
  username: string;
  displayName: string;
  preferredCryptoProfile?: CryptoProfile;
  signingPublicKey?: string;
}

/**
 * Identity update input
 */
export interface UpdateIdentityInput {
  ident?: string;
  hashVersion?: number;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  profileColors?: ProfileColors;
  privacySettings?: ProfilePrivacySettings;
  lastActiveAt?: Date;
  preferredCryptoProfile?: CryptoProfile;
  signingPublicKey?: string;
  devices?: IdentityDevice[];
  requireGroupApproval?: boolean;
  platformRoles?: string[];
  platformAttributes?: string[];
  suspendedUntil?: Date | null;
  isBanned?: boolean;
  moderationReason?: string;
  moderationReportId?: string;
}

/**
 * Public identity representation (safe to send to client)
 * NOTE: Does NOT include `ident` hash - that should never be exposed
 */
export interface PublicIdentity {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  profileColors?: ProfileColors;
  privacySettings?: ProfilePrivacySettings;
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
 * Public device representation (safe to send to other users).
 * `name` is only populated when the viewer is the device owner; otherwise empty (privacy).
 */
export interface PublicDevice {
  deviceId: string;
  name: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
  /** Present when the device owner has uploaded a static-key attestation */
  staticKeyAttestation?: string;
  signedPreKey?: PublicSignedPreKey | null;
}

/**
 * Identity public keys for E2E encryption (sent to other users)
 */
export interface IdentityPublicKeys {
  identityId: string;
  signingPublicKey: string;
  preferredCryptoProfile: CryptoProfile;
  devices: PublicDevice[];
}

/**
 * Convert an IdentityDocument to PublicIdentity (safe for client)
 *
 * @param doc - The identity document from MongoDB
 */
export function toPublicIdentity(doc: IdentityDocument): PublicIdentity {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    displayName: doc.displayName,
    bio: doc.bio,
    avatarUrl: doc.avatarUrl,
    bannerUrl: doc.bannerUrl,
    profileColors: doc.profileColors,
    privacySettings: doc.privacySettings,
    lastActiveAt: doc.lastActiveAt.toISOString(),
    isDeleted: isDeletedIdent(doc.ident),
    preferredCryptoProfile: doc.preferredCryptoProfile,
    hasE2EKeys: !!doc.signingPublicKey,
    deviceCount: doc.devices?.length ?? 0,
    requireGroupApproval: doc.requireGroupApproval ?? false,
  };
}

/**
 * Check if an identity is deleted
 */
export function isIdentityDeleted(doc: IdentityDocument): boolean {
  return isDeletedIdent(doc.ident);
}

export interface ToIdentityPublicKeysOptions {
  /**
   * When false, device `name` is omitted from the payload (empty string).
   * Must be false for any viewer who is not the identity owner — device names are private.
   * @default true
   */
  includeDeviceNames?: boolean;
}

/**
 * Convert an IdentityDocument to IdentityPublicKeys for E2E encryption.
 * Returns null if the identity doesn't have E2E keys set up.
 */
export function toIdentityPublicKeys(
  doc: IdentityDocument,
  options?: ToIdentityPublicKeysOptions
): IdentityPublicKeys | null {
  if (!doc.signingPublicKey) {
    return null;
  }

  const includeDeviceNames = options?.includeDeviceNames !== false;

  return {
    identityId: doc._id.toHexString(),
    signingPublicKey: doc.signingPublicKey,
    preferredCryptoProfile: doc.preferredCryptoProfile ?? 'default',
    devices: (doc.devices ?? []).map((d) => ({
      deviceId: d.deviceId,
      name: includeDeviceNames ? d.name : '',
      ecdhPublicKey: d.ecdhPublicKey,
      kemPublicKey: d.kemPublicKey,
      staticKeyAttestation: d.staticKeyAttestation,
    })),
  };
}
