/**
 * Conversation routes module.
 *
 * Provides endpoints for DM and group conversations, messaging,
 * group management, and group invites.
 * All endpoints require an authenticated identity session.
 *
 * @module routes/conversations
 */

import { Router } from '../../router';
import { conversationRespond } from './conversation-route-result';
import * as conversationController from './controller';
import * as messagesController from './messages.controller';
import * as reactionsController from './reactions.controller';

const router = new Router();

// ---------------------------------------------------------------------------
// Conversation routes
// ---------------------------------------------------------------------------

router.post('/conversations', async (ctx) => {
  return conversationRespond(ctx, await conversationController.createConversationCtrl(ctx));
});

router.get('/conversations', async (ctx) => {
  return conversationRespond(ctx, await conversationController.listConversationsCtrl(ctx));
});

router.get('/conversations/stats', async (ctx) => {
  return conversationRespond(ctx, await conversationController.getConversationStatsCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Conversation preferences routes
// Registered before /conversations/:id to prevent the parameterised route
// from swallowing literal "/conversations/preferences" requests.
// ---------------------------------------------------------------------------

router.get('/conversations/preferences', async (ctx) => {
  return conversationRespond(
    ctx,
    await conversationController.listConversationPreferencesCtrl(ctx),
  );
});

router.patch('/conversations/preferences/:id', async (ctx) => {
  return conversationRespond(
    ctx,
    await conversationController.patchConversationPreferencesCtrl(ctx),
  );
});

// ---------------------------------------------------------------------------
// Group invite routes
// Registered before /conversations/:id to prevent the parameterised route
// from swallowing literal "/conversations/invites" requests.
// ---------------------------------------------------------------------------

router.get('/conversations/invites', async (ctx) => {
  return conversationRespond(ctx, await conversationController.listPendingGroupInvitesCtrl(ctx));
});

router.get('/conversations/invites/:id/preview', async (ctx) => {
  return conversationRespond(ctx, await conversationController.getGroupInvitePreviewCtrl(ctx));
});

router.post('/conversations/invites/:id/accept', async (ctx) => {
  return conversationRespond(ctx, await conversationController.acceptGroupInviteCtrl(ctx));
});

router.post('/conversations/invites/:id/decline', async (ctx) => {
  return conversationRespond(ctx, await conversationController.declineGroupInviteCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Single conversation routes (parameterised :id — must come after literal paths)
// ---------------------------------------------------------------------------

router.get('/conversations/:id', async (ctx) => {
  return conversationRespond(ctx, await conversationController.getConversationCtrl(ctx));
});

router.patch('/conversations/:id', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchConversationNameCtrl(ctx));
});

router.patch('/conversations/:id/member-settings', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchMemberSettingsCtrl(ctx));
});

router.patch('/conversations/:id/gifs', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchGifsDisabledCtrl(ctx));
});

router.patch('/conversations/:id/gif-content-filter', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchGifContentFilterCtrl(ctx));
});

router.patch('/conversations/:id/custom-emojis', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchCustomEmojisDisabledCtrl(ctx));
});

router.patch('/conversations/:id/message-search-cache', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchMessageSearchCacheCtrl(ctx));
});

router.patch('/conversations/:id/allow-skip-moderation', async (ctx) => {
  return conversationRespond(ctx, await conversationController.patchAllowSkipModerationCtrl(ctx));
});

router.post('/conversations/:id/pins', async (ctx) => {
  return conversationRespond(ctx, await conversationController.pinMessageCtrl(ctx));
});

router.delete('/conversations/:id/pins/:messageId', async (ctx) => {
  return conversationRespond(ctx, await conversationController.unpinMessageCtrl(ctx));
});

router.get('/conversations/:id/pinned-messages', async (ctx) => {
  return conversationRespond(ctx, await messagesController.listPinnedMessagesCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Message routes
// ---------------------------------------------------------------------------

router.post('/conversations/:id/messages', async (ctx) => {
  return conversationRespond(ctx, await messagesController.sendMessageCtrl(ctx));
});

router.get('/conversations/:id/messages', async (ctx) => {
  return conversationRespond(ctx, await messagesController.listMessagesCtrl(ctx));
});

router.get('/conversations/:id/messages/around/:messageId', async (ctx) => {
  return conversationRespond(ctx, await messagesController.messagesAroundCtrl(ctx));
});

router.get('/conversations/:id/messages/:messageId', async (ctx) => {
  return conversationRespond(ctx, await messagesController.getOneMessageCtrl(ctx));
});

router.patch('/conversations/:id/messages/:messageId', async (ctx) => {
  return conversationRespond(ctx, await messagesController.editMessageCtrl(ctx));
});

router.delete('/conversations/:id/messages/:messageId', async (ctx) => {
  return conversationRespond(ctx, await messagesController.deleteMessageForSelfCtrl(ctx));
});

router.delete('/conversations/:id/messages/:messageId/everyone', async (ctx) => {
  return conversationRespond(ctx, await messagesController.deleteMessageForEveryoneCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Group management routes
// ---------------------------------------------------------------------------

router.post('/conversations/:id/members', async (ctx) => {
  return conversationRespond(ctx, await conversationController.addGroupMemberCtrl(ctx));
});

router.delete('/conversations/:id/members/:identityId', async (ctx) => {
  return conversationRespond(ctx, await conversationController.removeGroupMemberCtrl(ctx));
});

router.get('/conversations/:id/former-members', async (ctx) => {
  return conversationRespond(ctx, await conversationController.getFormerMembersCtrl(ctx));
});

router.get('/conversations/:id/pending-invites', async (ctx) => {
  return conversationRespond(
    ctx,
    await conversationController.listConversationPendingInvitesCtrl(ctx),
  );
});

router.delete('/conversations/:id/invites/:inviteId', async (ctx) => {
  return conversationRespond(ctx, await conversationController.revokeGroupInviteCtrl(ctx));
});

router.post('/conversations/:id/leave', async (ctx) => {
  return conversationRespond(ctx, await conversationController.leaveConversationCtrl(ctx));
});

router.post('/conversations/:id/admins', async (ctx) => {
  return conversationRespond(ctx, await conversationController.promoteToAdminCtrl(ctx));
});

router.delete('/conversations/:id', async (ctx) => {
  return conversationRespond(ctx, await conversationController.terminateConversationCtrl(ctx));
});

// ---------------------------------------------------------------------------
// Reaction routes
// ---------------------------------------------------------------------------

router.post('/conversations/:id/messages/:messageId/reactions', async (ctx) => {
  return conversationRespond(ctx, await reactionsController.addReactionCtrl(ctx));
});

router.delete('/conversations/:id/reactions/:reactionId', async (ctx) => {
  return conversationRespond(ctx, await reactionsController.removeReactionCtrl(ctx));
});

router.get('/conversations/:id/reactions', async (ctx) => {
  return conversationRespond(ctx, await reactionsController.batchReactionsCtrl(ctx));
});

export const conversationRoutes = router;
