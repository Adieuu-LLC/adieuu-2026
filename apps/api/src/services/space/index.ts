/**
 * Space service layer.
 *
 * @module services/space
 */

export * from './types';
export {
  createSpace,
  getSpaceBySlug,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
} from './crud';
export {
  resolveMemberPermissions,
  memberHasPermission,
  type SpaceMemberPermissions,
} from './permissions';
export {
  joinSpace,
  leaveSpace,
  removeSpaceMember,
  listSpaceMembers,
  listSpaceRoles,
  resolveEffectiveTier,
} from './members';
