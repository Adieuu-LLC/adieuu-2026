/**
 * Conversation route controllers (preferences, invites, CRUD, group, pins).
 *
 * @module routes/conversations/controller
 */

import type { RouteContext } from '../../router/types';
import type { ConversationRouteResult } from './conversation-route-result';
import {
  createConversation,
  getConversation,
  listConversations,
  acceptGroupInvite,
  declineGroupInvite,
  listGroupInvites,
  getGroupInvitePreview,
  promoteToAdmin,
  terminateGroup,
  getFormerMembers,
  updateMemberSettings,
  updateGifsDisabled,
  updateGifContentFilter,
  updateCustomEmojisDisabled,
  updateDisallowPersistentMessageSearchCache,
  updateAllowSkipModeration,
  listPendingInvitesForConversation,
  revokeGroupInvite,
  pinMessage,
  unpinMessage,
  addGroupMember,
  removeGroupMember,
  leaveConversation,
  updateGroupName,
} from '../../services/conversation.service';
import { getConversationPreferencesRepository } from '../../repositories/conversation-preferences.repository';
import { toPublicConversationPreferences } from '../../models/conversation-preferences';
import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import {
  CreateConversationSchema,
  UpdatePreferencesSchema,
  UpdateNameSchema,
  UpdateMemberSettingsSchema,
  UpdateGifsDisabledSchema,
  UpdateGifContentFilterSchema,
  UpdateCustomEmojisDisabledSchema,
  UpdateMessageSearchCacheSchema,
  UpdateAllowSkipModerationSchema,
  PinMessageBodySchema,
  AddMemberSchema,
  PromoteAdminSchema,
  LeaveSchema,
} from './conversation-schemas';
import {
  sanitizeObjectId24,
  parseOptionalObjectIdCursor,
  clampListLimit,
  sanitizeParticipantIds,
} from './conversation-inputs';

export async function createConversationCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const parseResult = CreateConversationSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const { type, participants, encryptedName, nameNonce, forceNew } = parseResult.data;

  if (type === 'group') {
    const { subscriptions, entitlements, isLifetime } = ctx.identitySession;
    const hasPaidTier =
      isLifetime ||
      subscriptions.some((t) => t === 'access' || t === 'insider') ||
      entitlements.includes('gifted');
    if (!hasPaidTier) {
      return { kind: 'forbidden', message: 'Upgrade to a paid plan to create group conversations.' };
    }
  }

  const parts = sanitizeParticipantIds(participants);
  if (!parts.ok) return { kind: 'bad_request', message: 'Invalid participant ID.' };

  const result = await createConversation(
    identity._id,
    type,
    parts.ids,
    encryptedName,
    nameNonce,
    forceNew,
  );

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FRIENDS':
        return { kind: 'bad_request', message: result.error ?? 'Not friends.' };
      case 'BLOCKED':
        return { kind: 'bad_request', message: result.error ?? 'Cannot message this identity.' };
      case 'IDENTITY_NOT_FOUND':
        return { kind: 'not_found', message: result.error ?? 'Identity not found.' };
      case 'TOO_MANY_PARTICIPANTS':
        return { kind: 'bad_request', message: result.error ?? 'Too many participants.' };
      case 'CANNOT_MESSAGE_SELF':
        return { kind: 'bad_request', message: result.error ?? 'Cannot message yourself.' };
      case 'INVALID_TYPE':
        return { kind: 'bad_request', message: result.error ?? 'Invalid conversation type.' };
      default:
        return { kind: 'bad_request', message: result.error ?? 'Failed to create conversation.' };
    }
  }

  return { kind: 'ok', data: result.conversation, message: 'Conversation created.' };
}

export async function listConversationsCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<{ conversations: unknown[]; cursor: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const limit = clampListLimit(ctx.query.get('limit'));
  const validCursor = parseOptionalObjectIdCursor(ctx.query.get('cursor'));

  const result = await listConversations(identity._id, limit, validCursor);

  return {
    kind: 'ok',
    data: {
      conversations: result.conversations,
      cursor: result.cursor,
    },
  };
}

export async function listConversationPreferencesCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const repo = getConversationPreferencesRepository();
  const docs = await repo.findForIdentity(identity._id);

  return { kind: 'ok', data: docs.map(toPublicConversationPreferences) };
}

export async function patchConversationPreferencesCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdatePreferencesSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const patch = parseResult.data;
  if (
    patch.archived === undefined &&
    patch.keepArchived === undefined &&
    patch.favorited === undefined &&
    patch.encryptedReadState === undefined
  ) {
    return {
      kind: 'bad_request',
      message: 'At least one preference field is required.',
    };
  }

  const repo = getConversationPreferencesRepository();
  const doc = await repo.upsert(identity._id, new ObjectId(conv.id), patch);

  return {
    kind: 'ok',
    data: toPublicConversationPreferences(doc),
    message: 'Preferences updated.',
  };
}

export async function listPendingGroupInvitesCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<{ invites: unknown[]; cursor: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const limit = clampListLimit(ctx.query.get('limit'));
  const validCursor = parseOptionalObjectIdCursor(ctx.query.get('cursor'));

  const result = await listGroupInvites(identity._id, limit, validCursor);

  return {
    kind: 'ok',
    data: {
      invites: result.invites,
      cursor: result.cursor,
    },
  };
}

export async function getGroupInvitePreviewCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const inv = sanitizeObjectId24(ctx.params.id);
  if (!inv.ok) return { kind: 'bad_request', message: 'Invalid invite ID.' };

  const result = await getGroupInvitePreview(inv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Invite not found.' };
    }
    if (result.errorCode === 'NOT_AUTHORIZED') return { kind: 'unauthorized' };
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to get invite preview.' };
  }

  return { kind: 'ok', data: result.preview };
}

export async function acceptGroupInviteCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const inv = sanitizeObjectId24(ctx.params.id);
  if (!inv.ok) return { kind: 'bad_request', message: 'Invalid invite ID.' };

  const result = await acceptGroupInvite(inv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Invite not found.' };
    }
    if (result.errorCode === 'NOT_AUTHORIZED') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to accept invite.' };
  }

  return { kind: 'ok', data: result.invite, message: 'Invite accepted.' };
}

export async function declineGroupInviteCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const inv = sanitizeObjectId24(ctx.params.id);
  if (!inv.ok) return { kind: 'bad_request', message: 'Invalid invite ID.' };

  const result = await declineGroupInvite(inv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Invite not found.' };
    }
    if (result.errorCode === 'NOT_AUTHORIZED') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to decline invite.' };
  }

  return { kind: 'ok', data: result.invite, message: 'Invite declined.' };
}

export async function getConversationCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const result = await getConversation(conv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to get conversation.' };
  }

  const messageRepo = getMessageRepository();
  const conversationRepo = getConversationRepository();

  const conversation = result.conversation!;
  let { messageCount } = conversation;
  if (messageCount == null) {
    messageCount = await messageRepo.countByConversation(new ObjectId(conv.id));
    conversationRepo.setMessageCount(new ObjectId(conv.id), messageCount).catch(() => {});
  }

  return { kind: 'ok', data: { ...conversation, messageCount } };
}

export async function patchConversationNameCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateNameSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateGroupName(
    conv.id,
    identity._id,
    parseResult.data.encryptedName,
    parseResult.data.nameNonce,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_ADMIN' || result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update conversation name.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Conversation updated.' };
}

export async function patchMemberSettingsCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateMemberSettingsSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateMemberSettings(
    conv.id,
    identity._id,
    parseResult.data.encryptedMemberSettings,
    parseResult.data.memberSettingsNonce,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update member settings.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Member settings updated.' };
}

export async function patchGifsDisabledCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateGifsDisabledSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateGifsDisabled(conv.id, identity._id, parseResult.data.gifsDisabled);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update GIF settings.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'GIF settings updated.' };
}

export async function patchGifContentFilterCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateGifContentFilterSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateGifContentFilter(
    conv.id,
    identity._id,
    parseResult.data.gifContentFilter,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update content filter.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Content filter updated.' };
}

export async function patchCustomEmojisDisabledCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateCustomEmojisDisabledSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateCustomEmojisDisabled(
    conv.id,
    identity._id,
    parseResult.data.customEmojisDisabled,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return {
      kind: 'bad_request',
      message: result.error ?? 'Failed to update custom emoji settings.',
    };
  }

  return { kind: 'ok', data: result.conversation, message: 'Custom emoji settings updated.' };
}

export async function patchMessageSearchCacheCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateMessageSearchCacheSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateDisallowPersistentMessageSearchCache(
    conv.id,
    identity._id,
    parseResult.data.disallowPersistentMessageSearchCache,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update message search policy.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Message search policy updated.' };
}

export async function patchAllowSkipModerationCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = UpdateAllowSkipModerationSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const result = await updateAllowSkipModeration(
    conv.id,
    identity._id,
    parseResult.data.allowSkipModeration,
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to update moderation settings.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Moderation settings updated.' };
}

export async function pinMessageCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = PinMessageBodySchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const msg = sanitizeObjectId24(parseResult.data.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const result = await pinMessage(conv.id, msg.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to pin message.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Message pinned.' };
}

export async function unpinMessageCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const result = await unpinMessage(conv.id, msg.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT' || result.errorCode === 'NOT_ADMIN') {
      return { kind: 'unauthorized' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to unpin message.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Pin removed.' };
}

export async function addGroupMemberCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = AddMemberSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const member = sanitizeObjectId24(parseResult.data.identityId);
  if (!member.ok) return { kind: 'bad_request', message: 'Invalid identity ID.' };

  const result = await addGroupMember(conv.id, identity._id, member.id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CONVERSATION_NOT_FOUND':
        return { kind: 'not_found', message: 'Group conversation not found.' };
      case 'NOT_CREATOR':
        return { kind: 'unauthorized' };
      case 'NOT_FRIENDS':
        return { kind: 'bad_request', message: 'You can only add friends.' };
      case 'BLOCKED':
        return { kind: 'bad_request', message: 'Cannot add this identity.' };
      case 'IDENTITY_NOT_FOUND':
        return { kind: 'not_found', message: 'Identity not found.' };
      case 'ALREADY_MEMBER':
        return { kind: 'bad_request', message: 'Already a member.' };
      case 'TOO_MANY_PARTICIPANTS':
        return { kind: 'bad_request', message: result.error ?? 'Group is full.' };
      case 'INVITE_EXISTS':
        return { kind: 'bad_request', message: 'Invite already pending.' };
      default:
        return { kind: 'bad_request', message: result.error ?? 'Failed to add member.' };
    }
  }

  if ('invite' in result && result.invite) {
    return { kind: 'ok', data: result.invite, message: 'Group invite sent.' };
  }

  return {
    kind: 'ok',
    data: 'conversation' in result ? result.conversation : undefined,
    message: 'Member added.',
  };
}

export async function removeGroupMemberCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const member = sanitizeObjectId24(ctx.params.identityId);
  if (!member.ok) return { kind: 'bad_request', message: 'Invalid identity ID.' };

  const result = await removeGroupMember(conv.id, identity._id, member.id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Group conversation not found.' };
    }
    if (result.errorCode === 'NOT_CREATOR') return { kind: 'unauthorized' };
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'not_found', message: 'Not a member.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to remove member.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Member removed.' };
}

export async function getFormerMembersCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const result = await getFormerMembers(conv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_AUTHORIZED') return { kind: 'unauthorized' };
    if (result.errorCode === 'NOT_GROUP') {
      return { kind: 'bad_request', message: 'Not a group conversation.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to get former members.' };
  }

  return { kind: 'ok', data: result.formerMembers };
}

export async function listConversationPendingInvitesCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<{ invites: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const result = await listPendingInvitesForConversation(conv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to list pending invites.' };
  }

  return { kind: 'ok', data: { invites: result.invites ?? [] } };
}

export async function revokeGroupInviteCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const inv = sanitizeObjectId24(ctx.params.inviteId);
  if (!inv.ok) return { kind: 'bad_request', message: 'Invalid invite ID.' };

  const result = await revokeGroupInvite(conv.id, inv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_ADMIN') return { kind: 'unauthorized' };
    if (result.errorCode === 'INVITE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Invite not found.' };
    }
    if (result.errorCode === 'INVITE_NOT_PENDING') {
      return { kind: 'bad_request', message: 'Invite is not pending.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to revoke invite.' };
  }

  return { kind: 'ok', data: result.invite, message: 'Invite revoked.' };
}

export async function leaveConversationCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = LeaveSchema.safeParse(ctx.body);
  let options = parseResult.success ? parseResult.data : undefined;

  if (options?.transferAdminTo) {
    const tid = sanitizeObjectId24(options.transferAdminTo);
    if (!tid.ok) return { kind: 'bad_request', message: 'Invalid identity ID.' };
    options = { ...options, transferAdminTo: tid.id };
  }

  const result = await leaveConversation(conv.id, identity._id, options ?? undefined);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Group conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'bad_request', message: 'Not a participant.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to leave conversation.' };
  }

  return { kind: 'ok', data: undefined, message: 'Left conversation.' };
}

export async function promoteToAdminCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = PromoteAdminSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const member = sanitizeObjectId24(parseResult.data.identityId);
  if (!member.ok) return { kind: 'bad_request', message: 'Invalid identity ID.' };

  const result = await promoteToAdmin(conv.id, identity._id, member.id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Group conversation not found.' };
    }
    if (result.errorCode === 'NOT_ADMIN') return { kind: 'unauthorized' };
    if (result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'bad_request', message: 'Not a group member.' };
    }
    if (result.errorCode === 'ALREADY_ADMIN') {
      return { kind: 'bad_request', message: 'Already an admin.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to promote to admin.' };
  }

  return { kind: 'ok', data: result.conversation, message: 'Member promoted to admin.' };
}

export async function terminateConversationCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const result = await terminateGroup(conv.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_ADMIN' || result.errorCode === 'NOT_PARTICIPANT') {
      return { kind: 'unauthorized' };
    }
    if (result.errorCode === 'INVALID_TYPE') {
      return {
        kind: 'bad_request',
        message: result.error ?? 'Cannot delete this conversation.',
      };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to delete conversation.' };
  }

  return { kind: 'ok', data: undefined, message: 'Conversation deleted.' };
}

export async function getConversationStatsCtrl(
  ctx: RouteContext,
): Promise<
  ConversationRouteResult<{
    totalConversations: number;
    totalMessages: number;
    totalFriends?: number;
    totalAchievementsEarned?: number;
  }>
> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const identityObjId = ctx.identitySession.identity._id;

  const projection = await getIdentityRepository().findActivityStatsProjection(identityObjId);

  const totalMessages = projection?.messagesSentCount ?? 0;
  const totalConversations = projection?.conversationsJoinedCount ?? 0;
  const totalFriends = projection?.friendCount ?? 0;
  const totalAchievementsEarned = projection?.achievementsEarnedCount ?? 0;

  return {
    kind: 'ok',
    data: {
      totalConversations,
      totalMessages,
      totalFriends,
      totalAchievementsEarned,
    },
  };
}
