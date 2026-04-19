/**
 * User model
 * Represents a user account in the system
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

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
