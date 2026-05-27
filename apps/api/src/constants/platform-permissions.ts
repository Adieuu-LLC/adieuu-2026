/**
 * Platform-level permission constants and role-to-permission mappings.
 *
 * Permissions follow a `verb-noun` pattern (e.g. `read-content-reports`).
 * Roles map to a fixed set of permissions; effective permissions for a user
 * are the union of role-derived permissions and any direct attribute grants
 * stored on the UserDocument.
 */

export const PLATFORM_PERMISSIONS = {
  READ_CONTENT_REPORTS: 'read-content-reports',
  UPDATE_CONTENT_REPORTS: 'update-content-reports',
  READ_ABUSE_REPORTS: 'read-abuse-reports',
  UPDATE_ABUSE_REPORTS: 'update-abuse-reports',
  MANAGE_ESCALATED_REPORTS: 'manage-escalated-reports',
  READ_SUPPORT_TICKETS: 'read-support-tickets',
  UPDATE_SUPPORT_TICKETS: 'update-support-tickets',
  MANAGE_ESCALATED_TICKETS: 'manage-escalated-tickets',
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export const PLATFORM_ROLES = {
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  SUPPORT_AGENT: 'support_agent',
} as const;

export type PlatformRole =
  (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

const SUPPORT_AGENT_PERMISSIONS: readonly PlatformPermission[] = [
  PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
  PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
];

const MODERATOR_PERMISSIONS: readonly PlatformPermission[] = [
  PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS,
  PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS,
  PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS,
  PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS,
  ...SUPPORT_AGENT_PERMISSIONS,
];

const ADMIN_PERMISSIONS: readonly PlatformPermission[] = [
  ...MODERATOR_PERMISSIONS,
  PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS,
  PLATFORM_PERMISSIONS.MANAGE_ESCALATED_TICKETS,
];

const ROLE_PERMISSION_MAP: Record<PlatformRole, readonly PlatformPermission[]> = {
  [PLATFORM_ROLES.MODERATOR]: MODERATOR_PERMISSIONS,
  [PLATFORM_ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [PLATFORM_ROLES.SUPPORT_AGENT]: SUPPORT_AGENT_PERMISSIONS,
};

/**
 * Returns the deduplicated set of permissions granted by one or more roles,
 * optionally unioned with directly-attached attribute strings.
 */
export function resolvePermissions(
  roles: PlatformRole[],
  directAttributes: string[] = [],
): PlatformPermission[] {
  const set = new Set<PlatformPermission>();

  for (const role of roles) {
    const perms = ROLE_PERMISSION_MAP[role];
    if (perms) {
      for (const p of perms) set.add(p);
    }
  }

  const allPerms = new Set<string>(Object.values(PLATFORM_PERMISSIONS));
  for (const attr of directAttributes) {
    if (allPerms.has(attr)) {
      set.add(attr as PlatformPermission);
    }
  }

  return [...set];
}
