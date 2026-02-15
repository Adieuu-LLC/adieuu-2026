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
}

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
