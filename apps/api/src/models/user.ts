/**
 * User model
 * Represents a user account in the system
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { SubscriptionTierId, AccountModerationCategory } from '@adieuu/shared';

/**
 * User document stored in MongoDB
 */
export interface UserDocument extends BaseDocument {
  // Contact methods (at least one required)
  email?: string;           // Normalized, lowercase
  emailVerified: boolean;
  phone?: string;           // E.164 format (+1234567890)
  phoneVerified: boolean;

  // Profile
  displayName?: string;

  // Security
  failedAttempts: number;
  lockedUntil?: Date;

  // Metadata
  lastLoginAt?: Date;

  // Identity-related fields
  /** Lifetime count of identities created by this user */
  identityCount: number;
  /** User's preferred lockout duration in milliseconds (default: 1 hour) */
  identityLockoutDuration: number;
  /** Timestamps of recent failed identity login attempts (capped at 6) */
  identityLoginAttempts: Date[];
  /** When the identity lockout expires */
  identityLockedUntil?: Date;

  /** Maximum identities this account may create (default: 2, adjustable per-account) */
  maxIdentities?: number;

  /**
   * Optional per-account cap on video duration (seconds), e.g. subscription tier.
   * Resolved against platform ceiling when minting the account→identity bridging token;
   * identity sessions store the effective value — identity routes do not read User.
   */
  maxVideoDurationSeconds?: number;

  /** IP-derived jurisdiction information, refreshed at login and periodically. */
  geo?: UserGeo;

  /** Account-level age verification state. */
  ageVerification?: UserAgeVerification;

  /** Export-control and VPN attestation compliance state. */
  compliance?: UserCompliance;

  /** Stripe customer ID (server-side only; never returned to the client). */
  stripeCustomerId?: string;

  /** Denormalised billing summary kept in sync by Stripe webhooks. */
  billing?: UserBilling;

  /** Admin-granted subscription tier overrides, merged additively with Stripe billing. */
  subscriptionOverrides?: SubscriptionOverride[];
  /** Admin-granted entitlement overrides (lifetime), merged additively with Stripe billing. */
  entitlementOverrides?: string[];
  /** Denormalised count of sponsorships received (for future directory display). */
  sponsorshipCount?: number;

  /** Account suspended until this date (null/undefined = not suspended). */
  suspendedUntil?: Date | null;
  /** Account permanently banned. */
  isBanned?: boolean;
  /** Human-readable reason for the latest account moderation action. */
  moderationReason?: string;
  /** Category preset for the latest account moderation action. */
  moderationCategory?: AccountModerationCategory;
  /** ISO country code that triggered an OFAC sanctions ban (for re-evaluation on login). */
  moderationCountryCode?: string;
  /** Admin identity ID that performed the latest moderation action. */
  moderatedBy?: string;
  /** When the moderation action was applied. */
  moderatedAt?: Date;
}

/**
 * Resolved jurisdiction from an IP geolocation lookup.
 * Raw IPs are never stored; only a keyed hash for staleness checks.
 */
export interface UserGeo {
  /** Canonical jurisdiction code, e.g. 'US-TN', 'IT', 'DE' */
  jurisdiction: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** ISO 3166-2 region/state code (US/CA states only) */
  regionCode?: string;
  /** SHA-256(ip + accountHashSecret) for staleness comparison */
  ipHash: string;
  /** When this lookup was last refreshed */
  checkedAt: Date;
  /** IPLocate privacy.is_anonymous at last check */
  isAnonymous?: boolean;
  /** IPLocate privacy.is_abuser at last check */
  isAbuser?: boolean;
}

export type AgeVerificationStatus = 'unverified' | 'pending' | 'verified' | 'failed' | 'expired';

export type AgeVerificationRequiredReason =
  | 'legislation'
  | 'abusive_ip'
  | 'utah_attestation'
  | 'admin';

/**
 * Account-level age verification state.
 * Tracks current status, provider references, and retry cooldown data.
 */
export interface UserAgeVerification {
  status: AgeVerificationStatus;
  providerId?: string;
  providerVerificationId?: string;
  verifiedAt?: Date;
  /** When the most recent verification failed (drives 30-day cooldown). */
  failedAt?: Date;
  /** The jurisdiction under which verification was performed. */
  lastJurisdiction?: string;
  /** True if the user voluntarily opted in (unresolved jurisdiction). */
  optedIn?: boolean;
  /** How many times the verification has expired (max 3 before 30-day cooldown). */
  expirationCount: number;
  /** When the most recent expiration occurred (drives 24h and 30-day cooldowns). */
  lastExpiredAt?: Date;
  /** When we last queried the provider for status (drives /me debounce). */
  lastStatusCheckAt?: Date;
  /** Why AV is required when not solely jurisdiction-driven. */
  requiredReason?: AgeVerificationRequiredReason;
  /** When a non-legislation AV requirement was imposed. */
  requiredReasonAt?: Date;
  /** ipHash that triggered a compliance-driven AV requirement. */
  requiredReasonIpHash?: string;
}

export type VpnAttestationStep = 'sanctioned_membership' | 'utah_residency';

export interface UserCompliance {
  vpnAttestationPending?: {
    ipHash: string;
    step: VpnAttestationStep;
    detectedAt: Date;
    vpnCountryCode?: string;
  };
  lastVpnAttestation?: {
    ipHash: string;
    completedAt: Date;
    sanctionedMembership: boolean;
    utahResidency?: boolean;
  };
  /** User self-attested Utah residency on a US VPN IP. */
  attestedUtahResidency?: boolean;
}

/**
 * An admin-granted subscription tier override that is merged additively
 * with Stripe-managed billing. Lives outside of `UserBilling` so that
 * Stripe sync never clobbers it.
 */
export interface SubscriptionOverride {
  tier: SubscriptionTierId;
  /** When the override expires. Omit for lifetime (no expiry). */
  expiresAt?: Date;
}

/**
 * Denormalised billing state kept in sync by Stripe webhooks.
 * Stripe remains the source of truth; this summary avoids synchronous
 * Stripe calls during login and JWT minting.
 */
export interface UserBilling {
  activeSubscriptions: SubscriptionTierId[];
  entitlements: string[];
  /** True when access was granted via a one-time lifetime purchase (no renewal). */
  isLifetime: boolean;
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  /** Precise cancellation timestamp from Stripe (`cancel_at`). */
  cancelAt?: Date;
  stripeSubscriptionId?: string;
  /** Stripe Payment Intent id for one-time purchases. */
  stripePaymentIntentId?: string;
  updatedAt: Date;
}

/** Default identity lockout duration: 1 hour in milliseconds */
export const DEFAULT_IDENTITY_LOCKOUT_DURATION = 60 * 60 * 1000;

/** Minimum identity lockout duration: 15 minutes */
export const MIN_IDENTITY_LOCKOUT_DURATION = 15 * 60 * 1000;

/** Valid identity lockout duration presets in milliseconds */
export const IDENTITY_LOCKOUT_PRESETS = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '3hours': 3 * 60 * 60 * 1000,
  '6hours': 6 * 60 * 60 * 1000,
  '12hours': 12 * 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
  '1week': 7 * 24 * 60 * 60 * 1000,
  'permanent': -1, // Special value indicating permanent lockout
} as const;

/**
 * User creation input (without system-generated fields)
 */
export interface CreateUserInput {
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  displayName?: string;
}

/**
 * User update input
 */
export interface UpdateUserInput {
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  displayName?: string;
  failedAttempts?: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date;
  identityCount?: number;
  identityLockoutDuration?: number;
  identityLoginAttempts?: Date[];
  identityLockedUntil?: Date | null;
}

/**
 * Avatar data for rendering deterministic avatars
 */
export interface AvatarInfo {
  /** Background color (hex) */
  backgroundColor: string;
  /** Skin tone color (hex) */
  skinColor: string;
  /** Hair color (hex) */
  hairColor: string;
  /** Hair style index (0-4) */
  hairStyle: number;
  /** Face shape index (0-3) */
  faceShape: number;
  /** Eye style index (0-3) */
  eyeStyle: number;
  /** Accessory index (0-3, 0 = none) */
  accessory: number;
  /** Facial hair index (0-4, 0 = none) */
  facialHair: number;
  /** Hash used to generate the avatar */
  hash: string;
}

/**
 * Public user representation (safe to send to client)
 */
export interface PublicUser {
  id: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
  /** Avatar data for rendering */
  avatar?: AvatarInfo;
}

/**
 * Convert a UserDocument to PublicUser (safe for client)
 *
 * @param doc - The user document from MongoDB
 * @param avatarData - Optional avatar data to include
 */
export function toPublicUser(doc: UserDocument, avatarData?: AvatarInfo): PublicUser {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    emailVerified: doc.emailVerified,
    phone: doc.phone,
    phoneVerified: doc.phoneVerified,
    displayName: doc.displayName,
    createdAt: doc.createdAt.toISOString(),
    lastLoginAt: doc.lastLoginAt?.toISOString(),
    avatar: avatarData,
  };
}
