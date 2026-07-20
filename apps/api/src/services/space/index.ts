/**
 * Space service layer.
 *
 * @module services/space
 */

export * from './types';
export {
  createSpace,
  getSpaceBySlug,
  getSpaceById,
  updateSpace,
  getSpaceViewerPermissions,
  getSpaceManageOverview,
  deleteSpace,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
} from './crud';
export {
  resolveMemberPermissions,
  memberHasPermission,
  memberCanAccessManageUi,
  type SpaceMemberPermissions,
} from './permissions';
export {
  joinSpace,
  leaveSpace,
  removeSpaceMember,
  listSpaceMembers,
  listSpaceRoles,
  addSpaceMembership,
  resolveEffectiveTier,
} from './members';
export {
  createSpaceRole,
  updateSpaceRole,
  deleteSpaceRole,
  setMemberRoles,
  listRoleMembers,
  type SpaceRoleResult,
  type CreateSpaceRoleParams,
  type UpdateSpaceRoleParams,
} from './roles';
export {
  createSpaceInvite,
  acceptSpaceInvite,
  declineSpaceInvite,
  revokeSpaceInvite,
  listSpaceInvitesForIdentity,
  listPendingInvitesForSpace,
} from './invites';
export { canReadSpace, type SpaceReadAccess } from './access';
export {
  listSpaceChannels,
  createSpaceChannel,
  updateSpaceChannel,
  resolveChannelCipherCheck,
  type CreateSpaceChannelParams,
  type UpdateSpaceChannelParams,
} from './channel-crud';
export {
  sendSpaceMessage,
  getSpaceMessages,
  getSpaceMessage,
  editSpaceMessage,
  deleteSpaceMessage,
  modDeleteSpaceMessage,
  getSpaceMessagesAround,
} from './channels';
export {
  addSpaceReaction,
  removeSpaceReaction,
  getSpaceReactions,
} from './reactions';
export {
  pinSpaceMessage,
  unpinSpaceMessage,
  getSpacePinnedMessages,
} from './pins';
