/**
 * Identity model
 * Represents a user identity in the system
 *
 * SECURITY NOTE: Identities are intentionally unlinkable to Users.
 * The `ident` hash is derived from: passphrase + userId + userCreatedAt
 * Without the passphrase, it's impossible to link an Identity to a User.
 */

import type { BaseDocument } from './base';

/** Sentinel value for deleted identities */
export const DELETED_IDENT = 'deleted';

/**
 * Identity document stored in MongoDB
 */
export interface IdentityDocument extends BaseDocument {
  /**
   * Unique identifier hash for the identity.
   * Generated from: SHA3-256(Argon2id(passphrase, salt=userId+createdAt))
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

  /** Last time this identity was active */
  lastActiveAt: Date;
}

/**
 * Identity creation input (without system-generated fields)
 */
export interface CreateIdentityInput {
  ident: string;
  hashVersion: number;
  username: string;
  displayName: string;
}

/**
 * Identity update input
 */
export interface UpdateIdentityInput {
  ident?: string;
  hashVersion?: number;
  username?: string;
  displayName?: string;
  lastActiveAt?: Date;
}

/**
 * Public identity representation (safe to send to client)
 * NOTE: Does NOT include `ident` hash - that should never be exposed
 */
export interface PublicIdentity {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  lastActiveAt: string;
  /** Whether this identity has been deleted */
  isDeleted: boolean;
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
    createdAt: doc.createdAt.toISOString(),
    lastActiveAt: doc.lastActiveAt.toISOString(),
    isDeleted: doc.ident === DELETED_IDENT,
  };
}

/**
 * Check if an identity is deleted
 */
export function isIdentityDeleted(doc: IdentityDocument): boolean {
  return doc.ident === DELETED_IDENT;
}
