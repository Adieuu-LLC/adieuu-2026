/**
 * Last Admin protection for Space membership / role changes.
 *
 * A Space must retain at least one holder of the system Admin role. Later
 * policy/voting can replace this hard block; for now demotion, leave, and kick
 * of the sole Admin are rejected with `LAST_ADMIN`.
 *
 * @module services/space/last-admin
 */

import type { ObjectId } from 'mongodb';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import type { SpaceErrorCode } from './types';

export type LastAdminBlock = {
  success: false;
  error: string;
  errorCode: Extract<SpaceErrorCode, 'LAST_ADMIN'>;
};

const LAST_ADMIN_BLOCK: LastAdminBlock = {
  success: false,
  error: 'Cannot remove the last Admin.',
  errorCode: 'LAST_ADMIN',
};

/**
 * Returns a `LAST_ADMIN` failure when `identityId` holds the system Admin role
 * and is the only active holder. Returns `null` when the action is allowed
 * (no Admin role, identity is not an Admin, or other Admins remain).
 */
export async function assertNotLastAdmin(
  spaceId: ObjectId,
  identityId: ObjectId,
): Promise<LastAdminBlock | null> {
  const adminRole = await getSpaceRoleRepository().findBySystemKey(spaceId, 'admin');
  if (!adminRole) return null;

  const memberRepo = getSpaceMemberRepository();
  const member = await memberRepo.findMember(spaceId, identityId);
  if (!member || member.status !== 'active') return null;

  const holdsAdmin = member.roleIds.some((id) => id.equals(adminRole._id));
  if (!holdsAdmin) return null;

  const holders = await memberRepo.countWithRole(spaceId, adminRole._id);
  if (holders <= 1) return LAST_ADMIN_BLOCK;
  return null;
}
