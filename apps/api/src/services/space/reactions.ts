/**
 * Space message reactions service.
 *
 * @module services/space/reactions
 */

import { ObjectId } from 'mongodb';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getSpaceReactionRepository } from '../../repositories/space-reaction.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceReaction } from '../../models/space-reaction';
import { resolveMemberPermissions } from './permissions';
import { publishSpaceEvent } from './redis-events';
import type { SpaceReactionResult, SpaceReactionsListResult } from './types';

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
  if (!trimmed || trimmed.length > 32) {
    return { success: false, error: 'Invalid emoji.', errorCode: 'INVALID_CONTENT' };
  }

  const perms = await resolveMemberPermissions(spaceId, callerId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const message = await getSpaceMessageRepository().findByIdInChannel(channelId, messageId);
  if (!message || message.deleted) {
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
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_reaction_added',
    data: { reaction: publicReaction },
  });

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

  const reactionRepo = getSpaceReactionRepository();
  const reaction = await reactionRepo.findById(reactionId);
  if (!reaction) {
    return { success: false, error: 'Reaction not found.', errorCode: 'REACTION_NOT_FOUND' };
  }
  if (!reaction.identityId.equals(callerId)) {
    return { success: false, error: 'You can only remove your own reactions.', errorCode: 'FORBIDDEN' };
  }

  await reactionRepo.deleteById(reactionId);

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_reaction_removed',
    data: {
      reactionId: reactionId.toHexString(),
      messageId: messageId.toHexString(),
      channelId: channelId.toHexString(),
    },
  });

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

  const reactions = await getSpaceReactionRepository().findByMessage(messageId);
  return { success: true, reactions: reactions.map(toPublicSpaceReaction) };
}
