/**
 * Shared guards for admin moderation actions.
 *
 * @module routes/admin/moderation-guards
 */

import {
  PLATFORM_ROLES,
  isPlatformRole,
} from '../../constants/platform-permissions';

export function isSelfIdentityTarget(
  adminIdentityId: string,
  targetIdentityId: string,
): boolean {
  return adminIdentityId.toLowerCase() === targetIdentityId.toLowerCase();
}

export function identityHasPlatformAdminRole(identity: {
  platformRoles?: string[];
}): boolean {
  return (identity.platformRoles ?? []).some(
    (role) => isPlatformRole(role) && role === PLATFORM_ROLES.ADMIN,
  );
}
