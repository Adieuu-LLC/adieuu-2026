/**
 * Space model
 * Represents a Space (Discord-like server) with arbitrary membership.
 *
 * PRIVACY / E2EE NOTES:
 * - Membership, channels, and roles live in their own collections (not an
 *   embedded array) so a Space can scale to any number of members.
 * - E2EE Spaces use Community Ciphers via a blind-relay verification challenge
 *   (`cipherCheck`). The server stores no Cipher entropy, keys, or cipherIds —
 *   the presence of `cipherCheck` is the only server-side signal of encryption.
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

  /** Display name (plaintext; Spaces are not name-encrypted like group DMs). */
  name: string;

  /** Optional description shown in the directory and header. */
  description?: string;

  /** Discoverability + join policy. */
  visibility: SpaceVisibility;

  /**
   * Blind-relay cipher verification challenge. Present only for Space-wide
   * E2EE Spaces. Opaque to the server.
   */
  cipherCheck?: CipherCheck;

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
    createdBy: doc.createdBy.toHexString(),
    ownerIdentityId: doc.ownerIdentityId.toHexString(),
    allowFreeMembers: doc.allowFreeMembers,
    memberCount: doc.memberCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
