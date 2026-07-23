/**
 * Space message reactions service.
 *
 * @module services/space/reactions
 */

import { ObjectId } from 'mongodb';
import { isValidReactionEmoji } from '@adieuu/shared';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getSpaceReactionRepository } from '../../repositories/space-reaction.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceReaction } from '../../models/space-reaction';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { requireChannelView, resolveChannelAudience } from './channel-access';
import { publishSpaceEvent } from './redis-events';
import type { SpaceReactionResult, SpaceReactionsListResult } from './types';

function isCustomEmojiToken(emoji: string): boolean {
  return emoji.startsWith('custom:') || /^:[a-z0-9_-]{2,32}:$/i.test(emoji);
}

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export async function addSpaceReaction(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
  emoji: string,
): Promise<SpaceReactionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const trimmed = emoji?.trim() ?? '';
  if (!isValidReactionEmoji(trimmed)) {
    return { success: false, error: 'Invalid emoji.', errorCode: 'INVALID_CONTENT' };
  }

  const perms = await resolveMemberPermissions(spaceId, callerId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'addReactions')) {
    return { success: false, error: 'You do not have permission to add reactions.', errorCode: 'FORBIDDEN' };
  }
  if (isCustomEmojiToken(trimmed) && !memberHasPermission(perms, 'useCustomEmoji')) {
    return {
      success: false,
      error: 'You do not have permission to use custom emoji.',
      errorCode: 'FORBIDDEN',
    };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const message = await getSpaceMessageRepository().findByIdInChannel(channelId, messageId);
  if (!message || message.deleted) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (!message.spaceId.equals(spaceId)) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const reactionRepo = getSpaceReactionRepository();
  const existing = await reactionRepo.findExisting(messageId, callerId, trimmed);
  if (existing) {
    return { success: false, error: 'You already reacted with this emoji.', errorCode: 'REACTION_EXISTS' };
  }

  let reaction;
  try {
    reaction = await reactionRepo.createReaction({
      spaceId,
      channelId,
      messageId,
      identityId: callerId,
      emoji: trimmed,
    });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return { success: false, error: 'You already reacted with this emoji.', errorCode: 'REACTION_EXISTS' };
    }
    throw err;
  }

  const publicReaction = toPublicSpaceReaction(reaction);
  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_reaction_added',
      data: { reaction: publicReaction },
    },
    { audienceIdentityIds },
  );

  return { success: true, reaction: publicReaction };
}

export async function removeSpaceReaction(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  reactionIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpaceReactionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const reactionId = parseObjId(reactionIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !reactionId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const perms = await resolveMemberPermissions(spaceId, callerId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const reactionRepo = getSpaceReactionRepository();
  const reaction = await reactionRepo.findById(reactionId);
  if (!reaction) {
    return { success: false, error: 'Reaction not found.', errorCode: 'REACTION_NOT_FOUND' };
  }
  if (!reaction.spaceId.equals(spaceId) || !reaction.channelId.equals(channelId) || !reaction.messageId.equals(messageId)) {
    return { success: false, error: 'Reaction not found.', errorCode: 'REACTION_NOT_FOUND' };
  }
  if (!reaction.identityId.equals(callerId)) {
    return { success: false, error: 'You can only remove your own reactions.', errorCode: 'FORBIDDEN' };
  }

  await reactionRepo.deleteById(reactionId);

  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    reaction.spaceId.toHexString(),
    {
      type: 'space_reaction_removed',
      data: {
        reactionId: reactionId.toHexString(),
        messageId: reaction.messageId.toHexString(),
        channelId: reaction.channelId.toHexString(),
      },
    },
    { audienceIdentityIds },
  );

  return { success: true };
}

export async function getSpaceReactions(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpaceReactionsListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const perms = await resolveMemberPermissions(spaceId, callerId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const message = await getSpaceMessageRepository().findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const reactions = await getSpaceReactionRepository().findByMessage(messageId);
  return { success: true, reactions: reactions.map(toPublicSpaceReaction) };
}
