/**
 * Platform-level permission constants and role-to-permission mappings.
 *
 * Permissions follow a `verb-noun` pattern (e.g. `read-content-reports`).
 * Roles map to a fixed set of permissions; effective permissions for an identity
 * are the union of role-derived permissions and any direct attribute grants
 * stored on the identity document.
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
  VIEW_ADMIN_METRICS: 'view-admin-metrics',
  MANAGE_PLATFORM_SETTINGS: 'manage-platform-settings',
  MANAGE_ROLES: 'manage-roles',
  MANAGE_USERS: 'manage-users',
  MANAGE_IDENTITIES: 'manage-identities',
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

const PLATFORM_ROLE_SET = new Set<string>(Object.values(PLATFORM_ROLES));

export function isPlatformRole(value: string): value is PlatformRole {
  return PLATFORM_ROLE_SET.has(value);
}

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

const ADMIN_ONLY_PERMISSIONS: readonly PlatformPermission[] = [
  PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS,
  PLATFORM_PERMISSIONS.MANAGE_ESCALATED_TICKETS,
  PLATFORM_PERMISSIONS.VIEW_ADMIN_METRICS,
  PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS,
  PLATFORM_PERMISSIONS.MANAGE_ROLES,
  PLATFORM_PERMISSIONS.MANAGE_USERS,
  PLATFORM_PERMISSIONS.MANAGE_IDENTITIES,
];

const ADMIN_PERMISSIONS: readonly PlatformPermission[] = [
  ...MODERATOR_PERMISSIONS,
  ...ADMIN_ONLY_PERMISSIONS,
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

export function hasPlatformPermission(
  permissions: readonly PlatformPermission[],
  permission: PlatformPermission,
): boolean {
  return permissions.includes(permission);
}

export function normalizePlatformRoles(rawRoles: string[] | undefined): PlatformRole[] {
  if (!rawRoles?.length) return [];
  const roles: PlatformRole[] = [];
  for (const role of rawRoles) {
    if (isPlatformRole(role) && !roles.includes(role)) {
      roles.push(role);
    }
  }
  return roles;
}

export function derivePlatformRoleFlags(roles: readonly PlatformRole[]): {
  isPlatformAdmin: boolean;
  isPlatformModerator: boolean;
  isPlatformSupportAgent: boolean;
} {
  const isPlatformAdmin = roles.includes(PLATFORM_ROLES.ADMIN);
  const isPlatformModerator =
    isPlatformAdmin || roles.includes(PLATFORM_ROLES.MODERATOR);
  const isPlatformSupportAgent =
    isPlatformAdmin ||
    isPlatformModerator ||
    roles.includes(PLATFORM_ROLES.SUPPORT_AGENT);

  return { isPlatformAdmin, isPlatformModerator, isPlatformSupportAgent };
}
