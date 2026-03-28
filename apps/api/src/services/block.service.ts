/**
 * @fileoverview Block Service
 *
 * Provides identity blocking functionality with privacy protections.
 * Blocking prevents friend requests and removes existing friendships.
 *
 * PRIVACY NOTES:
 * - Blocks are invisible to the blocked party
 * - Timing side-channels are mitigated via artificial delays
 * - All responses are designed to not leak block status to blocked party
 *
 * @module services/block
 */

import { ObjectId } from 'mongodb';
import { getBlockRepository } from '../repositories/block.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import type { PublicBlock } from '../models/block';
import { toPublicBlock } from '../models/block';
import { toPublicIdentity, type PublicIdentity } from '../models/identity';
import { cleanupFriendData } from './friend.service';
import elog from '../utils/adieuuLogger';
import { constantTimeCompare } from '../utils/crypto';

/**
 * Minimum operation time in ms to prevent timing attacks
 * All block operations take at least this long
 */
const MIN_OPERATION_TIME_MS = 50;

/**
 * Result of a block operation
 */
export interface BlockResult {
  success: boolean;
  error?: string;
  errorCode?: 'CANNOT_BLOCK_SELF' | 'ALREADY_BLOCKED' | 'NOT_FOUND' | 'IDENTITY_NOT_FOUND';
}

/**
 * Result of an unblock operation
 */
export interface UnblockResult {
  success: boolean;
  error?: string;
  errorCode?: 'BLOCK_NOT_FOUND';
}

/**
 * Block check result (only visible to blocker)
 */
export interface BlockCheckResult {
  blocked: boolean;
  blockedAt?: string;
}

/**
 * Blocked identity with denormalized info
 */
export interface BlockedIdentityInfo {
  identity: PublicIdentity;
  blockedAt: string;
}

/**
 * Ensures an async operation takes at least minMs milliseconds
 * Prevents timing side-channels by normalizing response times
 */
async function withMinimumTime<T>(
  operation: () => Promise<T>,
  minMs: number = MIN_OPERATION_TIME_MS
): Promise<T> {
  const startTime = performance.now();
  const result = await operation();
  const elapsed = performance.now() - startTime;

  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }

  return result;
}

/**
 * Block an identity
 *
 * @param blockerIdentityId - The identity initiating the block
 * @param blockedIdentityId - The identity to block
 */
export async function blockIdentity(
  blockerIdentityId: string | ObjectId,
  blockedIdentityId: string | ObjectId
): Promise<BlockResult> {
  return withMinimumTime(async () => {
    const blockRepo = getBlockRepository();
    const identityRepo = getIdentityRepository();

    const blockerObjId = blockerIdentityId instanceof ObjectId
      ? blockerIdentityId
      : new ObjectId(blockerIdentityId);
    const blockedObjId = blockedIdentityId instanceof ObjectId
      ? blockedIdentityId
      : new ObjectId(blockedIdentityId);

    // Use constant-time comparison for self-block check
    const blockerHex = blockerObjId.toHexString();
    const blockedHex = blockedObjId.toHexString();
    if (constantTimeCompare(blockerHex, blockedHex)) {
      return {
        success: false,
        error: 'Cannot block yourself',
        errorCode: 'CANNOT_BLOCK_SELF',
      };
    }

    // Verify blocked identity exists
    const blockedIdentity = await identityRepo.findByIdentityId(blockedObjId);
    if (!blockedIdentity) {
      return {
        success: false,
        error: 'Identity not found',
        errorCode: 'IDENTITY_NOT_FOUND',
      };
    }

    // Check if already blocked
    const existingBlock = await blockRepo.findBlock(blockerObjId, blockedObjId);
    if (existingBlock) {
      return {
        success: false,
        error: 'Identity already blocked',
        errorCode: 'ALREADY_BLOCKED',
      };
    }

    // Create the block
    await blockRepo.create({
      blockerIdentityId: blockerObjId,
      blockedIdentityId: blockedObjId,
    });

    // Remove any existing friendship and pending friend requests
    await cleanupFriendData(blockerObjId, blockedObjId);

    elog.info('Identity blocked', {
      blockerIdentityId: blockerHex,
    });

    return { success: true };
  });
}

/**
 * Unblock an identity
 *
 * @param blockerIdentityId - The identity that created the block
 * @param blockedIdentityId - The identity to unblock
 */
export async function unblockIdentity(
  blockerIdentityId: string | ObjectId,
  blockedIdentityId: string | ObjectId
): Promise<UnblockResult> {
  return withMinimumTime(async () => {
    const blockRepo = getBlockRepository();

    const blockerObjId = blockerIdentityId instanceof ObjectId
      ? blockerIdentityId
      : new ObjectId(blockerIdentityId);
    const blockedObjId = blockedIdentityId instanceof ObjectId
      ? blockedIdentityId
      : new ObjectId(blockedIdentityId);

    const removed = await blockRepo.remove(blockerObjId, blockedObjId);

    if (!removed) {
      return {
        success: false,
        error: 'Block not found',
        errorCode: 'BLOCK_NOT_FOUND',
      };
    }

    elog.info('Identity unblocked', {
      blockerIdentityId: blockerObjId.toHexString(),
    });

    return { success: true };
  });
}

/**
 * Check if an identity is blocked by the caller
 * Only the blocker can check their own blocks
 *
 * @param blockerIdentityId - The identity making the check
 * @param identityToCheck - The identity to check
 */
export async function checkIfBlocked(
  blockerIdentityId: string | ObjectId,
  identityToCheck: string | ObjectId
): Promise<BlockCheckResult> {
  const blockRepo = getBlockRepository();

  const blockerObjId = blockerIdentityId instanceof ObjectId
    ? blockerIdentityId
    : new ObjectId(blockerIdentityId);
  const checkObjId = identityToCheck instanceof ObjectId
    ? identityToCheck
    : new ObjectId(identityToCheck);

  const block = await blockRepo.findBlock(blockerObjId, checkObjId);

  if (block) {
    return {
      blocked: true,
      blockedAt: block.createdAt.toISOString(),
    };
  }

  return { blocked: false };
}

/**
 * Get list of blocked identities with their profile info
 *
 * @param identityId - The identity whose block list to retrieve
 * @param limit - Maximum number of results
 * @param cursor - Pagination cursor (last block _id)
 */
export async function getBlockedIdentities(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ blocks: BlockedIdentityInfo[]; cursor: string | null }> {
  const blockRepo = getBlockRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const blocks = await blockRepo.getBlockedByIdentity(identityObjId, limit + 1, cursorObjId);

  // Check if there are more results
  const hasMore = blocks.length > limit;
  const resultBlocks = hasMore ? blocks.slice(0, limit) : blocks;

  // Fetch identity info for each blocked identity
  const blockedIdentityInfos: BlockedIdentityInfo[] = [];

  for (const block of resultBlocks) {
    const identity = await identityRepo.findByIdentityId(block.blockedIdentityId);
    if (identity) {
      blockedIdentityInfos.push({
        identity: toPublicIdentity(identity),
        blockedAt: block.createdAt.toISOString(),
      });
    }
  }

  const nextCursor = hasMore && resultBlocks.length > 0
    ? resultBlocks[resultBlocks.length - 1]!._id.toHexString()
    : null;

  return {
    blocks: blockedIdentityInfos,
    cursor: nextCursor,
  };
}

/**
 * Get all blocked identity IDs for filtering (e.g., search results)
 * Returns raw ObjectIds for efficiency
 */
export async function getBlockedIdentityIds(
  identityId: string | ObjectId
): Promise<ObjectId[]> {
  const blockRepo = getBlockRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  return await blockRepo.getBlockedIdentityIds(identityObjId);
}

/**
 * Check if either identity has blocked the other
 * Used internally for friend request validation
 */
export async function isBlockedByEither(
  identityA: string | ObjectId,
  identityB: string | ObjectId
): Promise<boolean> {
  const blockRepo = getBlockRepository();

  const identityAObjId = identityA instanceof ObjectId
    ? identityA
    : new ObjectId(identityA);
  const identityBObjId = identityB instanceof ObjectId
    ? identityB
    : new ObjectId(identityB);

  return await blockRepo.isBlockedByEither(identityAObjId, identityBObjId);
}
