/**
 * Resolves effective platform capabilities for an identity by combining
 * list-based role membership (admin / moderator lists in platform_settings),
 * persisted identity-document roles, and direct attribute grants.
 *
 * Single entry-point: `getPlatformCapabilities(identityId)`.
 */

import type { ObjectId } from 'mongodb';
import { isPlatformAdmin, isPlatformModerator } from './platform-settings.service';
import { getIdentityRepository } from '../repositories/identity.repository';
import {
  PLATFORM_ROLES,
  resolvePermissions,
  type PlatformPermission,
  type PlatformRole,
} from '../constants/platform-permissions';

export interface PlatformCapabilities {
  isPlatformAdmin: boolean;
  isPlatformModerator: boolean;
  roles: PlatformRole[];
  permissions: PlatformPermission[];
}

export async function getPlatformCapabilities(
  identityId: string | ObjectId,
): Promise<PlatformCapabilities> {
  const [isAdmin, isModerator] = await Promise.all([
    isPlatformAdmin(identityId),
    isPlatformModerator(identityId),
  ]);

  const roles: PlatformRole[] = [];
  if (isAdmin) roles.push(PLATFORM_ROLES.ADMIN);
  if (isModerator) roles.push(PLATFORM_ROLES.MODERATOR);

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(identityId);

  if (identity?.platformRoles) {
    for (const r of identity.platformRoles) {
      if (!roles.includes(r as PlatformRole)) {
        roles.push(r as PlatformRole);
      }
    }
  }

  const directAttributes = identity?.platformAttributes ?? [];
  const permissions = resolvePermissions(roles, directAttributes);

  return {
    isPlatformAdmin: isAdmin,
    isPlatformModerator: isModerator || roles.includes(PLATFORM_ROLES.MODERATOR),
    roles,
    permissions,
  };
}
