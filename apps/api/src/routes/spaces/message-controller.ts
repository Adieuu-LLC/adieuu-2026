/**
 * Space message route controllers.
 *
 * Handles channel message CRUD, reactions, and pins. Split from `controller.ts`
 * to keep files under 700 lines.
 *
 * @module routes/spaces/message-controller
 */

import type { RouteContext } from '../../router/types';
import type { SpaceRouteResult } from './space-route-result';
import { mapSpaceError } from './space-route-result';
import {
  getSpaceMessage,
  getSpaceMessages,
  sendSpaceMessage,
  editSpaceMessage,
  deleteSpaceMessage,
  modDeleteSpaceMessage,
  getSpaceMessagesAround,
  addSpaceReaction,
  removeSpaceReaction,
  getSpaceReactions,
  pinSpaceMessage,
  unpinSpaceMessage,
  getSpacePinnedMessages,
  listSpaceChannels,
} from '../../services/space.service';
import {
  SendSpaceMessageSchema,
  EditSpaceMessageSchema,
  AddSpaceReactionSchema,
  PinSpaceMessageSchema,
} from '@adieuu/shared/schemas';
import {
  sanitizeSpaceObjectId,
  sanitizeSpaceMessageContent,
  sanitizeClientMessageId,
  parseSpaceListCursor,
  clampSpaceListLimit,
} from './space-inputs';

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export async function listChannelsCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ channels: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceChannels(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list channels.');
  }
  return { kind: 'ok', data: { channels: result.channels ?? [] } };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getMessagesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const directionParam = ctx.query.get('direction');
  const direction =
    directionParam === 'asc' || directionParam === 'desc' ? directionParam : undefined;

  const result = await getSpaceMessages(id.id, channelId.id, identity._id, limit, cursor, direction);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list messages.');
  }
  return { kind: 'ok', data: { messages: result.messages ?? [], cursor: result.cursor ?? null } };
}

export async function getMessageCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await getSpaceMessage(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Message not found.');
  }
  return { kind: 'ok', data: result.message };
}

export async function sendMessageCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = SendSpaceMessageSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const content = sanitizeSpaceMessageContent(parsed.data.content);
  if (!content.ok) return { kind: 'validation_failed' };
  const clientMessageId = sanitizeClientMessageId(parsed.data.clientMessageId);
  if (!clientMessageId.ok) return { kind: 'validation_failed' };

  const result = await sendSpaceMessage(id.id, channelId.id, identity._id, {
    content: content.content,
    clientMessageId: clientMessageId.clientMessageId,
    ...(parsed.data.replyToMessageId ? { replyToMessageId: parsed.data.replyToMessageId } : {}),
    ...(parsed.data.mentionedIdentityIds?.length
      ? { mentionedIdentityIds: parsed.data.mentionedIdentityIds }
      : {}),
    ...(parsed.data.expiresInSeconds != null ? { expiresInSeconds: parsed.data.expiresInSeconds } : {}),
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to send message.');
  }
  return { kind: 'ok', data: result.message };
}

// ---------------------------------------------------------------------------
// Message interactions (edit, delete)
// ---------------------------------------------------------------------------

export async function editMessageCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const parsed = EditSpaceMessageSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const content = sanitizeSpaceMessageContent(parsed.data.content);
  if (!content.ok) return { kind: 'validation_failed' };

  const result = await editSpaceMessage(
    id.id, channelId.id, messageId.id, identity._id, content.content,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to edit message.');
  }
  return { kind: 'ok', data: result.message, message: 'Message updated.' };
}

export async function deleteMessageCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await deleteSpaceMessage(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to delete message.');
  }
  return { kind: 'ok', data: undefined, message: 'Message deleted.' };
}

export async function modDeleteMessageCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await modDeleteSpaceMessage(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to delete message.');
  }
  return { kind: 'ok', data: undefined, message: 'Message deleted by moderator.' };
}

export async function messagesAroundCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const targetMsgId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !targetMsgId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const beforeParam = ctx.query.get('before');
  const afterParam = ctx.query.get('after');
  let before = beforeParam ? parseInt(beforeParam, 10) : 15;
  let after = afterParam ? parseInt(afterParam, 10) : 15;
  if (Number.isNaN(before) || before < 1) before = 15;
  if (Number.isNaN(after) || after < 1) after = 15;
  if (before > 100) before = 100;
  if (after > 100) after = 100;

  const result = await getSpaceMessagesAround(
    id.id, channelId.id, identity._id, targetMsgId.id, before, after,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to get messages.');
  }
  return { kind: 'ok', data: { messages: result.messages ?? [], cursor: result.cursor ?? null } };
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export async function addReactionCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const parsed = AddSpaceReactionSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await addSpaceReaction(
    id.id, channelId.id, messageId.id, identity._id, parsed.data.emoji,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to add reaction.');
  }
  return { kind: 'ok', data: result.reaction, message: 'Reaction added.' };
}

export async function removeReactionCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  const reactionId = sanitizeSpaceObjectId(ctx.params.reactionId);
  if (!id.ok || !channelId.ok || !messageId.ok || !reactionId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await removeSpaceReaction(
    id.id, channelId.id, messageId.id, reactionId.id, identity._id,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to remove reaction.');
  }
  return { kind: 'ok', data: undefined, message: 'Reaction removed.' };
}

export async function getReactionsCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ reactions: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await getSpaceReactions(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to fetch reactions.');
  }
  return { kind: 'ok', data: { reactions: result.reactions ?? [] } };
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

export async function pinMessageCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = PinSpaceMessageSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const messageId = sanitizeSpaceObjectId(parsed.data.messageId);
  if (!messageId.ok) return { kind: 'bad_request', message: 'Invalid message id.' };

  const result = await pinSpaceMessage(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to pin message.');
  }
  return { kind: 'ok', data: undefined, message: 'Message pinned.' };
}

export async function unpinMessageCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  const messageId = sanitizeSpaceObjectId(ctx.params.msgId);
  if (!id.ok || !channelId.ok || !messageId.ok) {
    return { kind: 'bad_request', message: 'Invalid id.' };
  }

  const result = await unpinSpaceMessage(id.id, channelId.id, messageId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to unpin message.');
  }
  return { kind: 'ok', data: undefined, message: 'Message unpinned.' };
}

export async function getPinnedMessagesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await getSpacePinnedMessages(id.id, channelId.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list pinned messages.');
  }
  return { kind: 'ok', data: { messages: result.messages ?? [], cursor: result.cursor ?? null } };
}
