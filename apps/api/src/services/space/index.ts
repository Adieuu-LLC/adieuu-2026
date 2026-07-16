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
  addSpaceMembership,
  resolveEffectiveTier,
} from './members';
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
  sendSpaceMessage,
  getSpaceMessages,
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
