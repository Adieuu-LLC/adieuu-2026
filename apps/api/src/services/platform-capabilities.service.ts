/**
 * Resolves effective platform capabilities for a user by combining
 * list-based role membership (admin / moderator lists in platform_settings),
 * persisted user-document roles, and direct attribute grants.
 *
 * Single entry-point: `getPlatformCapabilities(userId)`.
 */

import type { ObjectId } from 'mongodb';
import { isPlatformAdmin, isPlatformModerator } from './platform-settings.service';
import { getUserRepository } from '../repositories/user.repository';
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
  userId: string | ObjectId,
): Promise<PlatformCapabilities> {
  const [isAdmin, isModerator] = await Promise.all([
    isPlatformAdmin(userId),
    isPlatformModerator(userId),
  ]);

  const roles: PlatformRole[] = [];
  if (isAdmin) roles.push(PLATFORM_ROLES.ADMIN);
  if (isModerator) roles.push(PLATFORM_ROLES.MODERATOR);

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);

  if (user?.platformRoles) {
    for (const r of user.platformRoles) {
      if (!roles.includes(r as PlatformRole)) {
        roles.push(r as PlatformRole);
      }
    }
  }

  const directAttributes = user?.platformAttributes ?? [];
  const permissions = resolvePermissions(roles, directAttributes);

  return {
    isPlatformAdmin: isAdmin,
    isPlatformModerator: isModerator || roles.includes(PLATFORM_ROLES.MODERATOR),
    roles,
    permissions,
  };
}
