/**
 * Space channel messaging — plaintext and E2EE (Cipher).
 *
 * - Send/list plaintext messages for non-encrypted channels.
 * - Send/list encrypted messages (ciphertext/nonce/cipherId) for E2EE channels.
 *   The server acts as a blind relay and never performs crypto.
 *
 * Channel list/create lives in `channel-crud.ts`. Message reads/writes enforce
 * the same per-channel role ACL via `requireChannelView`.
 *
 * Message content is sanitized at the controller layer (see
 * `routes/spaces/space-inputs.ts`); this service defensively re-validates the
 * length/non-empty invariants.
 *
 * @module services/space/channels
 */

import { ObjectId } from 'mongodb';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getSpaceReactionRepository } from '../../repositories/space-reaction.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceMessage } from '../../models/space-message';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { requireChannelView, resolveChannelAudience } from './channel-access';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import type {
  SpaceMessageResult,
  SpaceMessagesListResult,
} from './types';

export { sendSpaceMessage, editSpaceMessage } from './message-send';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export async function getSpaceMessages(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
  direction?: 'asc' | 'desc',
): Promise<SpaceMessagesListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !channelId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, requesterId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const messageRepo = getSpaceMessageRepository();
  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  // History pagination walks older-than-cursor by default. Default an unspecified
  // direction to 'asc' when a cursor is present so a client that forgets to send
  // it does not silently receive newer-than rows. With a cursor, `desc` requests
  // the next page toward the present (newer than the cursor).
  const effectiveDirection: 'asc' | 'desc' | undefined = cursorObjId && !direction ? 'asc' : direction;

  let page: Awaited<ReturnType<typeof messageRepo.findByChannel>>;
  let olderCursor: string | null;

  if (cursorObjId && effectiveDirection === 'desc') {
    // Newer page: messages after the cursor, oldest-first, so they splice
    // contiguously onto the client's buffer head. Reverse to newest-first to
    // match the response convention. A newer fetch never changes the older
    // cursor (the client keeps its own).
    const ascChunk = await messageRepo.findAfter(channelId, cursorObjId, limit + 1);
    const pageAsc = ascChunk.length > limit ? ascChunk.slice(0, limit) : ascChunk;
    page = [...pageAsc].reverse();
    olderCursor = null;
  } else {
    const messages = await messageRepo.findByChannel(channelId, limit + 1, cursorObjId, effectiveDirection);
    const hasMore = messages.length > limit;
    page = hasMore ? messages.slice(0, limit) : messages;
    olderCursor = hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null;
  }

  // Flag which messages carry reactions so the client can reserve bar space
  // before the (separately fetched) reactions load. One indexed distinct query
  // per page; skips tombstones since deleted messages never render reactions.
  const reactableIds = page.filter((m) => !m.deleted).map((m) => m._id);
  const withReactions = await getSpaceReactionRepository().messageIdsWithReactions(reactableIds);

  // Whether more messages exist toward the present than the page's newest row,
  // so the client can enable newer-page loading after trimming the buffer.
  const newestId = page.length > 0 ? page[0]!._id : undefined;
  const hasNewerPages = newestId ? await messageRepo.hasMessageNewerThan(channelId, newestId) : false;

  return {
    success: true,
    messages: page.map((m) =>
      toPublicSpaceMessage(m, { hasReactions: withReactions.has(m._id.toHexString()) }),
    ),
    cursor: olderCursor,
    hasNewerPages,
  };
}

/**
 * Fetch a single message by ID (includes revisionHistory when present).
 */
export async function getSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceMessageResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !channelId || !messageId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, requesterId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const message = await getSpaceMessageRepository().findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  return { success: true, message: toPublicSpaceMessage(message) };
}

export async function deleteSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpaceMessageResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const perms = await resolveMemberPermissions(spaceId, callerId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const messageRepo = getSpaceMessageRepository();
  const message = await messageRepo.findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (!message.fromIdentityId.equals(callerId)) {
    return { success: false, error: 'You can only delete your own messages.', errorCode: 'NOT_AUTHOR' };
  }

  await messageRepo.softDelete(messageId);

  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_message_deleted',
      data: {
        channelId: channelId.toHexString(),
        messageId: messageId.toHexString(),
        deletedBy: callerId.toHexString(),
      },
    },
    { audienceIdentityIds },
  );

  return { success: true };
}

/**
 * Moderator delete (soft-delete by anyone with `manageMessages`).
 */
export async function modDeleteSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpaceMessageResult> {
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
  if (!memberHasPermission(perms, 'manageMessages')) {
    return { success: false, error: 'Moderator permissions required.', errorCode: 'FORBIDDEN' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const messageRepo = getSpaceMessageRepository();
  const message = await messageRepo.findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  await messageRepo.softDelete(messageId);

  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_message_deleted',
      data: {
        channelId: channelId.toHexString(),
        messageId: messageId.toHexString(),
        deletedBy: callerId.toHexString(),
      },
    },
    { audienceIdentityIds },
  );

  return { success: true };
}

/**
 * Fetch messages around a target message (for deep links).
 */
export async function getSpaceMessagesAround(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  targetMessageIdRaw: string | ObjectId,
  before = 15,
  after = 15,
): Promise<SpaceMessagesListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  const targetId = parseObjId(targetMessageIdRaw);
  if (!spaceId || !channelId || !requesterId || !targetId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, requesterId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const messageRepo = getSpaceMessageRepository();
  const target = await messageRepo.findByIdInChannel(channelId, targetId);
  if (!target) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const messages = await messageRepo.findAround(channelId, targetId, before, after);

  const reactableIds = messages.filter((m) => !m.deleted).map((m) => m._id);
  const withReactions = await getSpaceReactionRepository().messageIdsWithReactions(reactableIds);

  // `findAround` returns the window ascending (oldest first), so the last row is
  // the newest. Report whether messages exist beyond it so the client can mark
  // the merged buffer as detached (enabling newer-page loading / jump-to-latest).
  const newestId = messages.length > 0 ? messages[messages.length - 1]!._id : undefined;
  const hasNewerPages = newestId ? await messageRepo.hasMessageNewerThan(channelId, newestId) : false;

  return {
    success: true,
    messages: messages.map((m) =>
      toPublicSpaceMessage(m, { hasReactions: withReactions.has(m._id.toHexString()) }),
    ),
    cursor: null,
    hasNewerPages,
  };
}
