/**
 * Space model
 * Represents a Space (Discord-like server) with arbitrary membership.
 *
 * PRIVACY / E2EE NOTES:
 * - Membership, channels, and roles live in their own collections (not an
 *   embedded array) so a Space can scale to any number of members.
 * - Community Ciphers use a blind-relay verification challenge (`cipherCheck`).
 *   The server stores no Cipher entropy, keys, or cipherIds.
 * - `e2ee` encrypts messages and structural metadata; `encryptIdentity`
 *   additionally encrypts Space name/description for directory privacy;
 *   `cipherRequired` is a client-side join gate that may reuse the same
 *   challenge without encrypting.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CipherCheck, PublicSpace, SpaceVisibility } from '@adieuu/shared';
import { toPublicCipherCheck } from './cipher-check';

/**
 * Space document stored in MongoDB.
 */
export interface SpaceDocument extends BaseDocument {
  /** Unique URL slug; Space lives at `/s/<slug>`. */
  slug: string;

  /**
   * Display name. Empty string when `encryptIdentity` (ciphertext in
   * `encryptedName` / `nameNonce` / `cipherId`).
   */
  name: string;

  /** Optional description; omitted when `encryptIdentity`. */
  description?: string;

  /** Discoverability + join policy. */
  visibility: SpaceVisibility;

  /**
   * Blind-relay cipher verification challenge. Present when a Community Cipher
   * is associated (for join-gate verification and/or message E2EE). Opaque to
   * the server.
   */
  cipherCheck?: CipherCheck;

  /** When true, messages and structural metadata use ciphertext fields. */
  e2ee: boolean;

  /**
   * When true (requires `e2ee`), Space name/description are Cipher-encrypted
   * so directory browsers without the Cipher cannot read them.
   */
  encryptIdentity: boolean;

  /**
   * Client-side join gate (not enforced by the API). When true, clients should
   * require a matching Cipher before enabling Join.
   */
  cipherRequired: boolean;

  /** Cipher-encrypted Space name when `encryptIdentity`. */
  encryptedName?: string;
  nameNonce?: string;
  encryptedDescription?: string;
  descriptionNonce?: string;
  cipherId?: string;

  /** Identity that created the Space. */
  createdBy: ObjectId;

  /** Current owner identity (defaults to the creator). */
  ownerIdentityId: ObjectId;

  /** When true, free-tier identities may join/post (admin toggle; default false). */
  allowFreeMembers: boolean;

  /** Denormalised active member count for directory listings. */
  memberCount: number;
}

/**
 * Input for creating a Space. `_id` may be client-generated so the cipher
 * challenge can bind the final Space id atomically at create time.
 */
export interface CreateSpaceInput {
  _id?: ObjectId;
  slug: string;
  name: string;
  description?: string;
  visibility: SpaceVisibility;
  cipherCheck?: CipherCheck;
  e2ee: boolean;
  encryptIdentity: boolean;
  cipherRequired: boolean;
  encryptedName?: string;
  nameNonce?: string;
  encryptedDescription?: string;
  descriptionNonce?: string;
  cipherId?: string;
  createdBy: ObjectId;
  ownerIdentityId: ObjectId;
  allowFreeMembers: boolean;
  memberCount: number;
}

/**
 * Convert a SpaceDocument to its public representation (safe for clients).
 */
export function toPublicSpace(doc: SpaceDocument): PublicSpace {
  return {
    id: doc._id.toHexString(),
    slug: doc.slug,
    name: doc.name,
    ...(doc.description ? { description: doc.description } : {}),
    visibility: doc.visibility,
    ...(doc.cipherCheck ? { cipherCheck: toPublicCipherCheck(doc.cipherCheck) } : {}),
    e2ee: doc.e2ee ?? false,
    encryptIdentity: doc.encryptIdentity ?? false,
    cipherRequired: doc.cipherRequired ?? false,
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    ...(doc.encryptedDescription
      ? {
          encryptedDescription: doc.encryptedDescription,
          descriptionNonce: doc.descriptionNonce,
        }
      : {}),
    createdBy: doc.createdBy.toHexString(),
    ownerIdentityId: doc.ownerIdentityId.toHexString(),
    allowFreeMembers: doc.allowFreeMembers,
    memberCount: doc.memberCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
