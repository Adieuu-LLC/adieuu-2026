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
}

/**
 * Convert a UserDocument to PublicUser (safe for client)
 */
export function toPublicUser(doc: UserDocument): PublicUser {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    emailVerified: doc.emailVerified,
    phone: doc.phone,
    phoneVerified: doc.phoneVerified,
    displayName: doc.displayName,
    createdAt: doc.createdAt.toISOString(),
    lastLoginAt: doc.lastLoginAt?.toISOString(),
  };
}
