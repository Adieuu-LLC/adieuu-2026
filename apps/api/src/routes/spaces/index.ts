/**
 * Space routes module.
 *
 * Endpoints for Space creation/discovery, membership, roles, invites, channels,
 * and non-E2EE channel messaging. All endpoints require an authenticated
 * identity session (enforced in the controllers).
 *
 * Route ordering: literal paths (`/spaces/discover`, `/spaces/creation-enabled`,
 * `/spaces/invites`, `/spaces/slug/...`) are registered before the parameterised
 * `/spaces/:id` routes so the `:id` pattern does not swallow them.
 *
 * @module routes/spaces
 */

import { Router } from '../../router';
import { spaceRespond } from './space-route-result';
import * as spaceController from './controller';
import * as messageController from './message-controller';
import * as voiceController from './voice-controller';

const router = new Router();

// ---------------------------------------------------------------------------
// Literal collection routes (must precede parameterised /spaces/:id)
// ---------------------------------------------------------------------------

router.get('/spaces/discover', async (ctx) => {
  return spaceRespond(ctx, await spaceController.discoverSpacesCtrl(ctx));
});

router.get('/spaces/creation-enabled', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceCreationEnabledCtrl(ctx));
});

router.get('/spaces/invites', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listInvitesCtrl(ctx));
});

router.post('/spaces/invites/:inviteId/accept', async (ctx) => {
  const { requireCaptchaForFreeTier } = await import('../../middleware/captcha');
  const captchaError = await requireCaptchaForFreeTier(ctx);
  if (captchaError) return captchaError;
  return spaceRespond(ctx, await spaceController.acceptInviteCtrl(ctx));
});

router.post('/spaces/invites/:inviteId/decline', async (ctx) => {
  return spaceRespond(ctx, await spaceController.declineInviteCtrl(ctx));
});

router.get('/spaces/slug/:slug/available', async (ctx) => {
  return spaceRespond(ctx, await spaceController.checkSlugAvailabilityCtrl(ctx));
});

router.get('/spaces/slug/:slug', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceBySlugCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Space preferences (must precede parameterised /spaces/:id)
// ---------------------------------------------------------------------------

router.get('/spaces/preferences', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listSpacePreferencesCtrl(ctx));
});

router.patch('/spaces/preferences/:spaceId', async (ctx) => {
  return spaceRespond(ctx, await spaceController.patchSpacePreferencesCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Space lifecycle
// ---------------------------------------------------------------------------

router.post('/spaces', async (ctx) => {
  return spaceRespond(ctx, await spaceController.createSpaceCtrl(ctx));
});

router.get('/spaces', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listMySpacesCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Single Space routes (parameterised :id — after literal paths)
// ---------------------------------------------------------------------------

router.get('/spaces/:id', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getSpaceCtrl(ctx));
});

router.patch('/spaces/:id', async (ctx) => {
  return spaceRespond(ctx, await spaceController.updateSpaceCtrl(ctx));
});

router.delete('/spaces/:id', async (ctx) => {
  return spaceRespond(ctx, await spaceController.deleteSpaceCtrl(ctx));
});

router.get('/spaces/:id/me', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getMyPermissionsCtrl(ctx));
});

router.get('/spaces/:id/manage/overview', async (ctx) => {
  return spaceRespond(ctx, await spaceController.getManageOverviewCtrl(ctx));
});

router.post('/spaces/:id/join', async (ctx) => {
  const { requireCaptchaForFreeTier } = await import('../../middleware/captcha');
  const captchaError = await requireCaptchaForFreeTier(ctx);
  if (captchaError) return captchaError;
  return spaceRespond(ctx, await spaceController.joinSpaceCtrl(ctx));
});

router.post('/spaces/:id/leave', async (ctx) => {
  return spaceRespond(ctx, await spaceController.leaveSpaceCtrl(ctx));
});

router.get('/spaces/:id/members', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listMembersCtrl(ctx));
});

router.delete('/spaces/:id/members/:identityId', async (ctx) => {
  return spaceRespond(ctx, await spaceController.removeMemberCtrl(ctx));
});

router.post('/spaces/:id/members/:identityId/ban', async (ctx) => {
  return spaceRespond(ctx, await spaceController.banMemberCtrl(ctx));
});

router.patch('/spaces/:id/members/:identityId/profile', async (ctx) => {
  return spaceRespond(ctx, await spaceController.updateMemberProfileCtrl(ctx));
});

router.get('/spaces/:id/roles', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listRolesCtrl(ctx));
});

router.post('/spaces/:id/roles', async (ctx) => {
  return spaceRespond(ctx, await spaceController.createRoleCtrl(ctx));
});

router.patch('/spaces/:id/roles/:roleId', async (ctx) => {
  return spaceRespond(ctx, await spaceController.updateRoleCtrl(ctx));
});

router.delete('/spaces/:id/roles/:roleId', async (ctx) => {
  return spaceRespond(ctx, await spaceController.deleteRoleCtrl(ctx));
});

router.get('/spaces/:id/roles/:roleId/members', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listRoleMembersCtrl(ctx));
});

router.put('/spaces/:id/members/:identityId/roles', async (ctx) => {
  return spaceRespond(ctx, await spaceController.setMemberRolesCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Channels & messages
// ---------------------------------------------------------------------------

router.get('/spaces/:id/channels', async (ctx) => {
  return spaceRespond(ctx, await messageController.listChannelsCtrl(ctx));
});

router.post('/spaces/:id/channels', async (ctx) => {
  return spaceRespond(ctx, await messageController.createChannelCtrl(ctx));
});

router.patch('/spaces/:id/channels/:channelId', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateChannelCtrl(ctx));
});

router.get('/spaces/:id/categories', async (ctx) => {
  return spaceRespond(ctx, await messageController.listCategoriesCtrl(ctx));
});

router.post('/spaces/:id/categories', async (ctx) => {
  return spaceRespond(ctx, await messageController.createCategoryCtrl(ctx));
});

router.patch('/spaces/:id/categories/:categoryId', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateCategoryCtrl(ctx));
});

router.delete('/spaces/:id/categories/:categoryId', async (ctx) => {
  return spaceRespond(ctx, await messageController.deleteCategoryCtrl(ctx));
});

router.put('/spaces/:id/channel-layout', async (ctx) => {
  return spaceRespond(ctx, await messageController.updateChannelLayoutCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Voice channels
// ---------------------------------------------------------------------------

router.get('/spaces/:id/voice', async (ctx) => {
  return spaceRespond(ctx, await voiceController.listVoicePresenceCtrl(ctx));
});

router.get('/spaces/:id/channels/:channelId/voice', async (ctx) => {
  return spaceRespond(ctx, await voiceController.getVoiceSessionCtrl(ctx));
});

router.post('/spaces/:id/channels/:channelId/voice/join', async (ctx) => {
  return spaceRespond(ctx, await voiceController.joinVoiceChannelCtrl(ctx));
});

router.post('/spaces/:id/channels/:channelId/voice/leave', async (ctx) => {
  return spaceRespond(ctx, await voiceController.leaveVoiceChannelCtrl(ctx));
});

router.patch('/spaces/:id/channels/:channelId/voice/media', async (ctx) => {
  return spaceRespond(ctx, await voiceController.updateVoiceMediaCtrl(ctx));
});

router.get('/spaces/:id/channels/:channelId/messages', async (ctx) => {
  return spaceRespond(ctx, await messageController.getMessagesCtrl(ctx));
});

router.post('/spaces/:id/channels/:channelId/messages', async (ctx) => {
  return spaceRespond(ctx, await messageController.sendMessageCtrl(ctx));
});

router.get('/spaces/:id/channels/:channelId/messages/around/:msgId', async (ctx) => {
  return spaceRespond(ctx, await messageController.messagesAroundCtrl(ctx));
});

router.get('/spaces/:id/channels/:channelId/messages/:msgId', async (ctx) => {
  return spaceRespond(ctx, await messageController.getMessageCtrl(ctx));
});

router.patch('/spaces/:id/channels/:channelId/messages/:msgId', async (ctx) => {
  return spaceRespond(ctx, await messageController.editMessageCtrl(ctx));
});

router.delete('/spaces/:id/channels/:channelId/messages/:msgId', async (ctx) => {
  return spaceRespond(ctx, await messageController.deleteMessageCtrl(ctx));
});

router.delete('/spaces/:id/channels/:channelId/messages/:msgId/mod', async (ctx) => {
  return spaceRespond(ctx, await messageController.modDeleteMessageCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

router.post('/spaces/:id/channels/:channelId/messages/:msgId/reactions', async (ctx) => {
  return spaceRespond(ctx, await messageController.addReactionCtrl(ctx));
});

router.delete(
  '/spaces/:id/channels/:channelId/messages/:msgId/reactions/:reactionId',
  async (ctx) => {
    return spaceRespond(ctx, await messageController.removeReactionCtrl(ctx));
  },
);

router.get('/spaces/:id/channels/:channelId/messages/:msgId/reactions', async (ctx) => {
  return spaceRespond(ctx, await messageController.getReactionsCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

router.post('/spaces/:id/channels/:channelId/pins', async (ctx) => {
  return spaceRespond(ctx, await messageController.pinMessageCtrl(ctx));
});

router.delete('/spaces/:id/channels/:channelId/pins/:msgId', async (ctx) => {
  return spaceRespond(ctx, await messageController.unpinMessageCtrl(ctx));
});

router.get('/spaces/:id/channels/:channelId/pinned-messages', async (ctx) => {
  return spaceRespond(ctx, await messageController.getPinnedMessagesCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Space-scoped invites
// ---------------------------------------------------------------------------

router.post('/spaces/:id/invites', async (ctx) => {
  return spaceRespond(ctx, await spaceController.createInviteCtrl(ctx));
});

router.get('/spaces/:id/pending-invites', async (ctx) => {
  return spaceRespond(ctx, await spaceController.listPendingInvitesCtrl(ctx));
});

router.delete('/spaces/:id/invites/:inviteId', async (ctx) => {
  return spaceRespond(ctx, await spaceController.revokeInviteCtrl(ctx));
});

export const spaceRoutes = router;
