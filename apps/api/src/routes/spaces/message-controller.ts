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
  createSpaceChannel,
  updateSpaceChannel,
  listSpaceChannelCategories,
  createSpaceChannelCategory,
  updateSpaceChannelCategory,
  deleteSpaceChannelCategory,
  updateSpaceChannelLayout,
} from '../../services/space.service';
import {
  CreateSpaceChannelSchema,
  UpdateSpaceChannelSchema,
  CreateSpaceChannelCategorySchema,
  UpdateSpaceChannelCategorySchema,
  UpdateSpaceChannelLayoutSchema,
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

export async function createChannelCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ channel: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = CreateSpaceChannelSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await createSpaceChannel(id.id, identity._id, parsed.data);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to create channel.');
  }
  return { kind: 'ok', data: { channel: result.channel }, message: 'Channel created.' };
}

export async function updateChannelCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ channel: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const channelId = sanitizeSpaceObjectId(ctx.params.channelId);
  if (!id.ok || !channelId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = UpdateSpaceChannelSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await updateSpaceChannel(id.id, channelId.id, identity._id, parsed.data);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update channel.');
  }
  return { kind: 'ok', data: { channel: result.channel }, message: 'Channel updated.' };
}

// ---------------------------------------------------------------------------
// Categories & layout
// ---------------------------------------------------------------------------

export async function listCategoriesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ categories: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceChannelCategories(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list categories.');
  }
  return { kind: 'ok', data: { categories: result.categories ?? [] } };
}

export async function createCategoryCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ category: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = CreateSpaceChannelCategorySchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await createSpaceChannelCategory(id.id, identity._id, parsed.data);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to create category.');
  }
  return { kind: 'ok', data: { category: result.category }, message: 'Category created.' };
}

export async function updateCategoryCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ category: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const categoryId = sanitizeSpaceObjectId(ctx.params.categoryId);
  if (!id.ok || !categoryId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = UpdateSpaceChannelCategorySchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await updateSpaceChannelCategory(
    id.id,
    categoryId.id,
    identity._id,
    parsed.data,
  );
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update category.');
  }
  return { kind: 'ok', data: { category: result.category }, message: 'Category updated.' };
}

export async function deleteCategoryCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ ok: true }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const categoryId = sanitizeSpaceObjectId(ctx.params.categoryId);
  if (!id.ok || !categoryId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await deleteSpaceChannelCategory(id.id, categoryId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to delete category.');
  }
  return { kind: 'ok', data: { ok: true }, message: 'Category deleted.' };
}

export async function updateChannelLayoutCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ categories: unknown[]; channels: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = UpdateSpaceChannelLayoutSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await updateSpaceChannelLayout(id.id, identity._id, parsed.data);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update channel layout.');
  }
  return {
    kind: 'ok',
    data: {
      categories: result.categories ?? [],
      channels: result.channels ?? [],
    },
    message: 'Channel layout updated.',
  };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getMessagesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null; hasNewerPages: boolean }>> {
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
  return {
    kind: 'ok',
    data: {
      messages: result.messages ?? [],
      cursor: result.cursor ?? null,
      hasNewerPages: result.hasNewerPages ?? false,
    },
  };
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

  const clientMessageId = sanitizeClientMessageId(parsed.data.clientMessageId);
  if (!clientMessageId.ok) return { kind: 'validation_failed' };

  const hasCipher = !!(parsed.data.ciphertext && parsed.data.nonce && parsed.data.cipherId);

  let bodyFields: { content?: string; ciphertext?: string; nonce?: string; cipherId?: string };
  if (hasCipher) {
    bodyFields = { ciphertext: parsed.data.ciphertext, nonce: parsed.data.nonce, cipherId: parsed.data.cipherId };
  } else {
    const content = sanitizeSpaceMessageContent(parsed.data.content);
    if (!content.ok) return { kind: 'validation_failed' };
    bodyFields = { content: content.content };
  }

  const result = await sendSpaceMessage(id.id, channelId.id, identity._id, {
    ...bodyFields,
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

  const hasCipher = !!(parsed.data.ciphertext && parsed.data.nonce && parsed.data.cipherId);

  let bodyFields: { content?: string; ciphertext?: string; nonce?: string; cipherId?: string };
  if (hasCipher) {
    bodyFields = { ciphertext: parsed.data.ciphertext, nonce: parsed.data.nonce, cipherId: parsed.data.cipherId };
  } else {
    const content = sanitizeSpaceMessageContent(parsed.data.content);
    if (!content.ok) return { kind: 'validation_failed' };
    bodyFields = { content: content.content };
  }

  const result = await editSpaceMessage(
    id.id, channelId.id, messageId.id, identity._id, bodyFields,
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
): Promise<SpaceRouteResult<{ messages: unknown[]; cursor: string | null; hasNewerPages: boolean }>> {
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
  return {
    kind: 'ok',
    data: {
      messages: result.messages ?? [],
      cursor: result.cursor ?? null,
      hasNewerPages: result.hasNewerPages ?? false,
    },
  };
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
  const rawCursor = ctx.query.get('cursor');
  const cursor = rawCursor && /^\d{1,15}_[0-9a-f]{24}$/.test(rawCursor) ? rawCursor : undefined;

  const result = await getSpacePinnedMessages(id.id, channelId.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list pinned messages.');
  }
  return { kind: 'ok', data: { messages: result.messages ?? [], cursor: result.cursor ?? null } };
}
