/**
 * Block model
 * Represents when one identity has blocked another
 *
 * PRIVACY NOTE: Blocks are one-directional and invisible to the blocked party.
 * When A blocks B:
 * - A will not see friend requests from B (auto-ignored silently)
 * - B cannot tell they are blocked
 * - A will not see B in search results
 * - Existing friendship is removed when block is created
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Block document stored in MongoDB
 */
export interface BlockDocument extends BaseDocument {
  /** Identity that initiated the block */
  blockerIdentityId: ObjectId;

  /** Identity that is blocked */
  blockedIdentityId: ObjectId;
}

/**
 * Block creation input (without system-generated fields)
 */
export interface CreateBlockInput {
  blockerIdentityId: ObjectId;
  blockedIdentityId: ObjectId;
}

/**
 * Public block representation (safe to send to client)
 * Only shown to the blocker, never to the blocked party
 */
export interface PublicBlock {
  /** The blocked identity's ID */
  blockedIdentityId: string;
  /** When the block was created */
  blockedAt: string;
}

/**
 * Convert a BlockDocument to PublicBlock (safe for client)
 * Only the blocker should see this information
 */
export function toPublicBlock(doc: BlockDocument): PublicBlock {
  return {
    blockedIdentityId: doc.blockedIdentityId.toHexString(),
    blockedAt: doc.createdAt.toISOString(),
  };
}
