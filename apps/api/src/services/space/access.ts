/**
 * Shared Space read-access resolution.
 *
 * Visibility rules for reading a Space's structure/content (members, roles,
 * channels, messages):
 * - `public`: readable by anyone (no membership required).
 * - `listed`: discoverable, but must join to read → `NOT_MEMBER`.
 * - `hidden`: never revealed to non-members → `SPACE_NOT_FOUND`.
 *
 * @module services/space/access
 */

import type { ObjectId } from 'mongodb';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import type { SpaceDocument } from '../../models/space';
import type { SpaceErrorCode } from './types';

export type SpaceReadAccess =
  | { ok: true }
  | { ok: false; errorCode: SpaceErrorCode; error: string };

/** Resolves whether `requesterId` may read a Space, applying visibility rules. */
export async function canReadSpace(
  space: SpaceDocument,
  requesterId: ObjectId,
): Promise<SpaceReadAccess> {
  if (space.visibility === 'public') return { ok: true };

  const member = await getSpaceMemberRepository().findMember(space._id, requesterId);
  if (member) return { ok: true };

  if (space.visibility === 'hidden') {
    // Never reveal a hidden Space to non-members.
    return { ok: false, errorCode: 'SPACE_NOT_FOUND', error: 'Space not found.' };
  }
  // `listed`: discoverable, but must join to read.
  return { ok: false, errorCode: 'NOT_MEMBER', error: 'Join this Space to view it.' };
}
