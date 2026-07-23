/**
 * Space routes module.
 *
 * Endpoints for Space creation/discovery, membership, roles, invites, channels,
 * and non-E2EE channel messaging. All endpoints require an authenticated
 * identity session (enforced in the controllers) and are rate limited per
 * identity via {@link withSpaceRateLimit}.
 *
 * Route ordering: literal paths (`/spaces/discover`, `/spaces/creation-enabled`,
 * `/spaces/invites`, `/spaces/slug/...`) are registered before the parameterised
 * `/spaces/:id` routes so the `:id` pattern does not swallow them.
 *
 * @module routes/spaces
 */

import { Router } from '../../router';
import { spaceRespond } from './space-route-result';
import { withSpaceRateLimit } from './rate-limit';
import * as spaceController from './controller';
import * as memberController from './member-controller';
import * as inviteController from './invite-controller';
import * as messageController from './message-controller';
import * as voiceController from './voice-controller';

const router = new Router();

// ---------------------------------------------------------------------------
// Literal collection routes (must precede parameterised /spaces/:id)
// ---------------------------------------------------------------------------

router.get('/spaces/discover', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.discoverSpacesCtrl(ctx));
}));

router.get('/spaces/creation-enabled', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceCreationEnabledCtrl(ctx));
}));

router.get('/spaces/invites', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await inviteController.listInvitesCtrl(ctx));
}));

router.post('/spaces/invites/:inviteId/accept', withSpaceRateLimit('spaces:join', async (ctx) => {
  const { requireCaptchaForFreeTier } = await import('../../middleware/captcha');
  const captchaError = await requireCaptchaForFreeTier(ctx);
  if (captchaError) return captchaError;
  return spaceRespond(ctx, await inviteController.acceptInviteCtrl(ctx));
}));

router.post('/spaces/invites/:inviteId/decline', withSpaceRateLimit('spaces:join', async (ctx) => {
  return spaceRespond(ctx, await inviteController.declineInviteCtrl(ctx));
}));

router.get('/spaces/slug/:slug/available', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.checkSlugAvailabilityCtrl(ctx));
}));

router.get('/spaces/slug/:slug', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceBySlugCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Space preferences (must precede parameterised /spaces/:id)
// ---------------------------------------------------------------------------

router.get('/spaces/preferences', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await inviteController.listSpacePreferencesCtrl(ctx));
}));

router.patch('/spaces/preferences/:spaceId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await inviteController.patchSpacePreferencesCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Space lifecycle
// ---------------------------------------------------------------------------

router.post('/spaces', withSpaceRateLimit('spaces:create', async (ctx) => {
  return spaceRespond(ctx, await spaceController.createSpaceCtrl(ctx));
}));

router.get('/spaces', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listMySpacesCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Single Space routes (parameterised :id — after literal paths)
// ---------------------------------------------------------------------------

router.get('/spaces/:id', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceCtrl(ctx));
}));

router.patch('/spaces/:id', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await spaceController.updateSpaceCtrl(ctx));
}));

router.delete('/spaces/:id', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await spaceController.deleteSpaceCtrl(ctx));
}));

router.get('/spaces/:id/me', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getMyPermissionsCtrl(ctx));
}));

router.get('/spaces/:id/manage/overview', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getManageOverviewCtrl(ctx));
}));

router.get('/spaces/:id/audit-log', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await inviteController.listAuditLogCtrl(ctx));
}));

router.post('/spaces/:id/join', withSpaceRateLimit('spaces:join', async (ctx) => {
  const { requireCaptchaForFreeTier } = await import('../../middleware/captcha');
  const captchaError = await requireCaptchaForFreeTier(ctx);
  if (captchaError) return captchaError;
  return spaceRespond(ctx, await memberController.joinSpaceCtrl(ctx));
}));

router.post('/spaces/:id/leave', withSpaceRateLimit('spaces:join', async (ctx) => {
  return spaceRespond(ctx, await memberController.leaveSpaceCtrl(ctx));
}));

router.get('/spaces/:id/members', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await memberController.listMembersCtrl(ctx));
}));

router.get('/spaces/:id/members/banned', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await memberController.listBannedMembersCtrl(ctx));
}));

router.delete('/spaces/:id/members/:identityId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.removeMemberCtrl(ctx));
}));

router.post('/spaces/:id/members/:identityId/ban', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.banMemberCtrl(ctx));
}));

router.delete('/spaces/:id/members/:identityId/ban', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.unbanMemberCtrl(ctx));
}));

router.patch('/spaces/:id/members/:identityId/profile', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.updateMemberProfileCtrl(ctx));
}));

router.get('/spaces/:id/roles', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await memberController.listRolesCtrl(ctx));
}));

router.post('/spaces/:id/roles', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.createRoleCtrl(ctx));
}));

router.patch('/spaces/:id/roles/:roleId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.updateRoleCtrl(ctx));
}));

router.delete('/spaces/:id/roles/:roleId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.deleteRoleCtrl(ctx));
}));

router.get('/spaces/:id/roles/:roleId/members', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await memberController.listRoleMembersCtrl(ctx));
}));

router.put('/spaces/:id/members/:identityId/roles', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await memberController.setMemberRolesCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Channels & messages
// ---------------------------------------------------------------------------

router.get('/spaces/:id/channels', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.listChannelsCtrl(ctx));
}));

router.post('/spaces/:id/channels', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.createChannelCtrl(ctx));
}));

router.patch('/spaces/:id/channels/:channelId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateChannelCtrl(ctx));
}));

router.get('/spaces/:id/categories', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.listCategoriesCtrl(ctx));
}));

router.post('/spaces/:id/categories', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.createCategoryCtrl(ctx));
}));

router.patch('/spaces/:id/categories/:categoryId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateCategoryCtrl(ctx));
}));

router.delete('/spaces/:id/categories/:categoryId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.deleteCategoryCtrl(ctx));
}));

router.put('/spaces/:id/channel-layout', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateChannelLayoutCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Voice channels
// ---------------------------------------------------------------------------

router.get('/spaces/:id/voice', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await voiceController.listVoicePresenceCtrl(ctx));
}));

router.get('/spaces/:id/channels/:channelId/voice', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await voiceController.getVoiceSessionCtrl(ctx));
}));

router.post('/spaces/:id/channels/:channelId/voice/join', withSpaceRateLimit('spaces:voice', async (ctx) => {
  return spaceRespond(ctx, await voiceController.joinVoiceChannelCtrl(ctx));
}));

router.post('/spaces/:id/channels/:channelId/voice/leave', withSpaceRateLimit('spaces:voice', async (ctx) => {
  return spaceRespond(ctx, await voiceController.leaveVoiceChannelCtrl(ctx));
}));

router.patch('/spaces/:id/channels/:channelId/voice/media', withSpaceRateLimit('spaces:voice', async (ctx) => {
  return spaceRespond(ctx, await voiceController.updateVoiceMediaCtrl(ctx));
}));

router.get('/spaces/:id/channels/:channelId/messages', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.getMessagesCtrl(ctx));
}));

router.post('/spaces/:id/channels/:channelId/messages', withSpaceRateLimit('spaces:message', async (ctx) => {
  return spaceRespond(ctx, await messageController.sendMessageCtrl(ctx));
}));

router.get('/spaces/:id/channels/:channelId/messages/around/:msgId', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.messagesAroundCtrl(ctx));
}));

router.get('/spaces/:id/channels/:channelId/messages/:msgId', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.getMessageCtrl(ctx));
}));

router.patch('/spaces/:id/channels/:channelId/messages/:msgId', withSpaceRateLimit('spaces:message', async (ctx) => {
  return spaceRespond(ctx, await messageController.editMessageCtrl(ctx));
}));

router.delete('/spaces/:id/channels/:channelId/messages/:msgId', withSpaceRateLimit('spaces:message', async (ctx) => {
  return spaceRespond(ctx, await messageController.deleteMessageCtrl(ctx));
}));

router.delete('/spaces/:id/channels/:channelId/messages/:msgId/mod', withSpaceRateLimit('spaces:message', async (ctx) => {
  return spaceRespond(ctx, await messageController.modDeleteMessageCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

router.post('/spaces/:id/channels/:channelId/messages/:msgId/reactions', withSpaceRateLimit('spaces:reaction', async (ctx) => {
  return spaceRespond(ctx, await messageController.addReactionCtrl(ctx));
}));

router.delete(
  '/spaces/:id/channels/:channelId/messages/:msgId/reactions/:reactionId',
  withSpaceRateLimit('spaces:reaction', async (ctx) => {
    return spaceRespond(ctx, await messageController.removeReactionCtrl(ctx));
  }),
);

router.get('/spaces/:id/channels/:channelId/messages/:msgId/reactions', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.getReactionsCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

router.post('/spaces/:id/channels/:channelId/pins', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.pinMessageCtrl(ctx));
}));

router.delete('/spaces/:id/channels/:channelId/pins/:msgId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await messageController.unpinMessageCtrl(ctx));
}));

router.get('/spaces/:id/channels/:channelId/pinned-messages', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await messageController.getPinnedMessagesCtrl(ctx));
}));

// ---------------------------------------------------------------------------
// Space-scoped invites
// ---------------------------------------------------------------------------

router.post('/spaces/:id/invites', withSpaceRateLimit('spaces:invite', async (ctx) => {
  return spaceRespond(ctx, await inviteController.createInviteCtrl(ctx));
}));

router.get('/spaces/:id/pending-invites', withSpaceRateLimit('spaces:read', async (ctx) => {
  return spaceRespond(ctx, await inviteController.listPendingInvitesCtrl(ctx));
}));

router.delete('/spaces/:id/invites/:inviteId', withSpaceRateLimit('spaces:write', async (ctx) => {
  return spaceRespond(ctx, await inviteController.revokeInviteCtrl(ctx));
}));

export const spaceRoutes = router;
