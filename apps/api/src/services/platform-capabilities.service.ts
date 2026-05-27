/**
 * Resolves effective platform capabilities for an identity from persisted
 * identity-document roles and direct attribute grants.
 *
 * Single entry-point: `getPlatformCapabilities(identityId)`.
 */

import type { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../repositories/identity.repository';
import {
  derivePlatformRoleFlags,
  normalizePlatformRoles,
  resolvePermissions,
  type PlatformPermission,
  type PlatformRole,
} from '../constants/platform-permissions';

export interface PlatformCapabilities {
  isPlatformAdmin: boolean;
  isPlatformModerator: boolean;
  isPlatformSupportAgent: boolean;
  roles: PlatformRole[];
  permissions: PlatformPermission[];
}

const EMPTY_CAPABILITIES: PlatformCapabilities = {
  isPlatformAdmin: false,
  isPlatformModerator: false,
  isPlatformSupportAgent: false,
  roles: [],
  permissions: [],
};

export async function getPlatformCapabilities(
  identityId: string | ObjectId,
): Promise<PlatformCapabilities> {
  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(identityId);

  if (!identity) {
    return EMPTY_CAPABILITIES;
  }

  const roles = normalizePlatformRoles(identity.platformRoles);
  const directAttributes = identity.platformAttributes ?? [];
  const permissions = resolvePermissions(roles, directAttributes);
  const flags = derivePlatformRoleFlags(roles);

  return {
    ...flags,
    roles,
    permissions,
  };
}
