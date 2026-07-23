/**
 * Space role permission catalog, toggle defs, and legacy normalization.
 *
 * Permissions are stored as flat boolean flags on each role. UI rows with a
 * 3-way toggle (No / Yes / Manage) map to a base + manage pair. Effective
 * permissions for a member are the additive union across all roles they hold.
 *
 * @module api/space-permissions
 */

/** All Space permission flags (boolean, additive). */
export const SPACE_PERMISSIONS = [
  // general
  'viewChannels',
  'manageChannels',
  'manageRoles',
  'viewAuditLog',
  'manageWebhooks',
  'manageEncryption',
  'manageMetadata',
  'deleteSpace',
  // members
  'createInvite',
  'manageInvites',
  'changeNickname',
  'manageNicknames',
  'kickMembers',
  'banMembers',
  'manageMemberRoles',
  'manageApplications',
  // text
  'sendMessages',
  'manageMessages',
  'embedLinks',
  'attachFiles',
  'addReactions',
  'useCustomEmoji',
  'useGifsStickers',
  'mentionHere',
  'mentionRoles',
  'pinMessages',
  'bypassSlowmode',
  // voice
  'connect',
  'speak',
  'video',
  'stream',
  'muteMembers',
] as const;

export type SpacePermission = (typeof SPACE_PERMISSIONS)[number];

export const SPACE_PERMISSION_SET: ReadonlySet<string> = new Set(SPACE_PERMISSIONS);

/** Categories shown in the Roles Manage Permissions tab. */
export const SPACE_PERMISSION_CATEGORIES = [
  'general',
  'members',
  'text',
  'voice',
  'events',
] as const;
export type SpacePermissionCategory = (typeof SPACE_PERMISSION_CATEGORIES)[number];

/**
 * Toggle shape for a permission row in the UI.
 * - yesNo: No / Yes
 * - noManage: No / Manage
 * - yesNoManage: No / Yes / Manage (base + manage flags)
 */
export type SpacePermissionToggleKind = 'yesNo' | 'noManage' | 'yesNoManage';

/** Effective value of a permission row for a given set of flags. */
export type SpacePermissionToggleValue = 'no' | 'yes' | 'manage';

export interface SpacePermissionDef {
  /** Stable id for i18n keys (`spaces.permissions.<id>.title`). */
  id: string;
  category: SpacePermissionCategory;
  toggle: SpacePermissionToggleKind;
  /** Primary flag (Yes or Manage for noManage rows). */
  permission: SpacePermission;
  /** Manage flag for yesNoManage rows. */
  managePermission?: SpacePermission;
}

/**
 * UI catalog. Events remain an empty shell for a later category.
 * Every stored flag appears exactly once (as `permission` or `managePermission`).
 */
export const SPACE_PERMISSION_DEFS: readonly SpacePermissionDef[] = [
  // general
  { id: 'viewChannels', category: 'general', toggle: 'yesNo', permission: 'viewChannels' },
  { id: 'manageChannels', category: 'general', toggle: 'noManage', permission: 'manageChannels' },
  { id: 'manageRoles', category: 'general', toggle: 'noManage', permission: 'manageRoles' },
  { id: 'viewAuditLog', category: 'general', toggle: 'yesNo', permission: 'viewAuditLog' },
  { id: 'manageWebhooks', category: 'general', toggle: 'noManage', permission: 'manageWebhooks' },
  { id: 'manageEncryption', category: 'general', toggle: 'noManage', permission: 'manageEncryption' },
  { id: 'manageMetadata', category: 'general', toggle: 'noManage', permission: 'manageMetadata' },
  { id: 'deleteSpace', category: 'general', toggle: 'noManage', permission: 'deleteSpace' },
  // members
  {
    id: 'createInvite',
    category: 'members',
    toggle: 'yesNoManage',
    permission: 'createInvite',
    managePermission: 'manageInvites',
  },
  {
    id: 'changeNickname',
    category: 'members',
    toggle: 'yesNoManage',
    permission: 'changeNickname',
    managePermission: 'manageNicknames',
  },
  { id: 'kickMembers', category: 'members', toggle: 'yesNo', permission: 'kickMembers' },
  { id: 'banMembers', category: 'members', toggle: 'yesNo', permission: 'banMembers' },
  {
    id: 'manageMemberRoles',
    category: 'members',
    toggle: 'yesNo',
    permission: 'manageMemberRoles',
  },
  {
    id: 'manageApplications',
    category: 'members',
    toggle: 'yesNo',
    permission: 'manageApplications',
  },
  // text
  {
    id: 'sendMessages',
    category: 'text',
    toggle: 'yesNoManage',
    permission: 'sendMessages',
    managePermission: 'manageMessages',
  },
  { id: 'embedLinks', category: 'text', toggle: 'yesNo', permission: 'embedLinks' },
  { id: 'attachFiles', category: 'text', toggle: 'yesNo', permission: 'attachFiles' },
  { id: 'addReactions', category: 'text', toggle: 'yesNo', permission: 'addReactions' },
  { id: 'useCustomEmoji', category: 'text', toggle: 'yesNo', permission: 'useCustomEmoji' },
  { id: 'useGifsStickers', category: 'text', toggle: 'yesNo', permission: 'useGifsStickers' },
  { id: 'mentionHere', category: 'text', toggle: 'yesNo', permission: 'mentionHere' },
  { id: 'mentionRoles', category: 'text', toggle: 'yesNo', permission: 'mentionRoles' },
  { id: 'pinMessages', category: 'text', toggle: 'yesNo', permission: 'pinMessages' },
  { id: 'bypassSlowmode', category: 'text', toggle: 'yesNo', permission: 'bypassSlowmode' },
  // voice
  { id: 'connect', category: 'voice', toggle: 'yesNo', permission: 'connect' },
  { id: 'speak', category: 'voice', toggle: 'yesNo', permission: 'speak' },
  { id: 'video', category: 'voice', toggle: 'yesNo', permission: 'video' },
  { id: 'stream', category: 'voice', toggle: 'yesNo', permission: 'stream' },
  { id: 'muteMembers', category: 'voice', toggle: 'yesNo', permission: 'muteMembers' },
] as const;

/** Permissions that open the Space Manage shell. */
export const SPACE_MANAGE_UI_PERMISSIONS: readonly SpacePermission[] = [
  'manageMetadata',
  'manageRoles',
  'manageEncryption',
  'manageWebhooks',
] as const;

/** Default Member role permissions. */
export const DEFAULT_MEMBER_PERMISSIONS: readonly SpacePermission[] = [
  'viewChannels',
  'sendMessages',
  'embedLinks',
  'attachFiles',
  'addReactions',
  'useCustomEmoji',
  'useGifsStickers',
  'changeNickname',
  'createInvite',
  'connect',
  'speak',
  'video',
  'stream',
] as const;

/** Admin role gets every permission (no god-flag). */
export const DEFAULT_ADMIN_PERMISSIONS: readonly SpacePermission[] = [...SPACE_PERMISSIONS];

/** Default role colors (hex). */
export const DEFAULT_ADMIN_ROLE_COLOR = '#e74c3c';
export const DEFAULT_MEMBER_ROLE_COLOR = '#99aab5';
export const DEFAULT_CUSTOM_ROLE_COLOR = '#5865f2';

/** Legacy permission strings still present on older role documents. */
const LEGACY_PERMISSION_MAP: Record<string, readonly SpacePermission[]> = {
  admin: SPACE_PERMISSIONS,
  read: ['viewChannels'],
  post: ['sendMessages'],
  invite: ['createInvite'],
  manageMembers: ['kickMembers'],
  manageRoles: ['manageRoles'],
};

/**
 * Normalize a raw permissions array (possibly legacy) into the current catalog.
 * Unknown strings are dropped. Order follows SPACE_PERMISSIONS.
 */
export function normalizeSpacePermissions(
  raw: readonly string[] | null | undefined,
): SpacePermission[] {
  const out = new Set<SpacePermission>();
  for (const p of raw ?? []) {
    if (SPACE_PERMISSION_SET.has(p)) {
      out.add(p as SpacePermission);
      continue;
    }
    const mapped = LEGACY_PERMISSION_MAP[p];
    if (mapped) {
      for (const m of mapped) out.add(m);
    }
  }
  return SPACE_PERMISSIONS.filter((p) => out.has(p));
}

/** Whether a permission list includes a specific flag (after normalize). */
export function spacePermissionListHas(
  permissions: readonly string[] | null | undefined,
  permission: SpacePermission,
): boolean {
  return normalizeSpacePermissions(permissions).includes(permission);
}

/** Whether the viewer can open the Space Manage shell. */
export function canAccessSpaceManageUi(
  permissions: readonly string[] | null | undefined,
): boolean {
  const normalized = normalizeSpacePermissions(permissions);
  return SPACE_MANAGE_UI_PERMISSIONS.some((p) => normalized.includes(p));
}

/** Read the effective toggle value for a permission def from a flag set. */
export function getSpacePermissionToggleValue(
  def: SpacePermissionDef,
  permissions: ReadonlySet<string> | readonly string[],
): SpacePermissionToggleValue {
  const set: ReadonlySet<string> =
    permissions instanceof Set
      ? permissions
      : new Set(normalizeSpacePermissions(permissions as readonly string[]));
  if (def.toggle === 'yesNoManage') {
    if (def.managePermission && set.has(def.managePermission)) return 'manage';
    if (set.has(def.permission)) return 'yes';
    return 'no';
  }
  if (def.toggle === 'noManage') {
    return set.has(def.permission) ? 'manage' : 'no';
  }
  return set.has(def.permission) ? 'yes' : 'no';
}

/**
 * Apply a toggle value to a permission set for one def.
 * Returns a new sorted permission array.
 */
export function applySpacePermissionToggle(
  current: readonly string[] | null | undefined,
  def: SpacePermissionDef,
  value: SpacePermissionToggleValue,
): SpacePermission[] {
  const set = new Set(normalizeSpacePermissions(current));
  const clear = () => {
    set.delete(def.permission);
    if (def.managePermission) set.delete(def.managePermission);
  };

  if (def.toggle === 'yesNoManage') {
    clear();
    if (value === 'yes') {
      set.add(def.permission);
    } else if (value === 'manage') {
      set.add(def.permission);
      if (def.managePermission) set.add(def.managePermission);
    }
  } else if (def.toggle === 'noManage') {
    if (value === 'manage' || value === 'yes') {
      set.add(def.permission);
    } else {
      set.delete(def.permission);
    }
  } else {
    if (value === 'yes' || value === 'manage') {
      set.add(def.permission);
    } else {
      set.delete(def.permission);
    }
  }

  return SPACE_PERMISSIONS.filter((p) => set.has(p));
}

/** Segment options for a given toggle kind. */
export function spacePermissionToggleOptions(
  kind: SpacePermissionToggleKind,
): SpacePermissionToggleValue[] {
  if (kind === 'yesNoManage') return ['no', 'yes', 'manage'];
  if (kind === 'noManage') return ['no', 'manage'];
  return ['no', 'yes'];
}

/** Whether `granted` is a subset of `holder` (escalation check). */
export function spacePermissionsSubsetOf(
  granted: readonly string[] | null | undefined,
  holder: readonly string[] | null | undefined,
): boolean {
  const holderSet = new Set(normalizeSpacePermissions(holder));
  return normalizeSpacePermissions(granted).every((p) => holderSet.has(p));
}

/**
 * Whether the actor may newly grant a specific Space role to a member.
 *
 * - System Admin: only system Admins may assign it.
 * - `manageRoles`: any other role.
 * - `manageMemberRoles` only: role permissions must be ⊆ actor's.
 */
export function canGrantSpaceMemberRole(params: {
  role: { systemKey?: string | null; permissions: readonly string[] };
  actorPermissions: readonly string[];
  actorIsAdmin: boolean;
  actorCanManageRoles: boolean;
}): boolean {
  const { role, actorPermissions, actorIsAdmin, actorCanManageRoles } = params;
  if (role.systemKey === 'admin') return actorIsAdmin;
  if (actorCanManageRoles) return true;
  return spacePermissionsSubsetOf(role.permissions, actorPermissions);
}
