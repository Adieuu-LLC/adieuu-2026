/**
 * Space channels + non-E2EE (plaintext) messaging.
 *
 * First pass:
 * - List channels (visibility-gated read).
 * - Send/list plaintext messages for channels without a cipher challenge.
 * - Reject sends when the Space OR the channel carries a `cipherCheck`, since
 *   Cipher-encrypted messaging (client-side encrypt/decrypt via the blind relay)
 *   is deferred. The server never performs crypto.
 *
 * Reading follows Space visibility (`public` is open; `listed`/`hidden` require
 * membership). Posting always requires membership plus the `post` permission.
 *
 * Message content is sanitized at the controller layer (see
 * `routes/spaces/space-inputs.ts`); this service defensively re-validates the
 * length/non-empty invariants.
 *
 * @module services/space/channels
 */

import { ObjectId } from 'mongodb';
import { SPACE_MESSAGE_MAX_LENGTH } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceChannel } from '../../models/space-channel';
import { toPublicSpaceMessage } from '../../models/space-message';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import { createNotification } from '../notification.service';
import type {
  SpaceChannelsResult,
  SpaceMessageResult,
  SpaceMessagesListResult,
} from './types';

const MAX_EDIT_REVISIONS = 3;

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

/**
 * List a Space's channels (ordered by position). Visibility-gated read.
 */
export async function listSpaceChannels(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceChannelsResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const channels = await getSpaceChannelRepository().findBySpace(spaceId);
  return { success: true, channels: channels.map(toPublicSpaceChannel) };
}

/**
 * Send a plaintext message to a channel. Requires membership + `post`. Rejects
 * E2EE channels/Spaces (deferred). Idempotent on `clientMessageId`.
 */
export async function sendSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  senderIdentityIdRaw: string | ObjectId,
  params: {
    content: string;
    clientMessageId: string;
    replyToMessageId?: string;
    mentionedIdentityIds?: string[];
    expiresInSeconds?: number;
  },
): Promise<SpaceMessageResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const senderId = parseObjId(senderIdentityIdRaw);
  if (!spaceId || !channelId || !senderId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const content = params.content?.trim() ?? '';
  if (!content || content.length > SPACE_MESSAGE_MAX_LENGTH) {
    return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
  }
  if (!params.clientMessageId) {
    return { success: false, error: 'Missing client message id.', errorCode: 'INVALID_CONTENT' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, senderId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'post')) {
    return { success: false, error: 'You do not have permission to post here.', errorCode: 'FORBIDDEN' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  if (space.cipherCheck || channel.cipherCheck) {
    return {
      success: false,
      error: 'This Space is encrypted; plaintext messaging is not available yet.',
      errorCode: 'ENCRYPTION_NOT_SUPPORTED',
    };
  }

  let replyToMessageObjId: ObjectId | undefined;
  let replyToMessageAuthorId: ObjectId | undefined;
  if (params.replyToMessageId) {
    const replyId = parseObjId(params.replyToMessageId);
    if (!replyId) {
      return { success: false, error: 'Invalid reply target id.', errorCode: 'INVALID_ID' };
    }
    const messageRepo = getSpaceMessageRepository();
    const replyTarget = await messageRepo.findByIdInChannel(channelId, replyId);
    if (!replyTarget || replyTarget.deleted) {
      return {
        success: false,
        error: 'The message you are replying to was not found in this channel.',
        errorCode: 'INVALID_REPLY_TARGET',
      };
    }
    replyToMessageObjId = replyId;
    replyToMessageAuthorId = replyTarget.fromIdentityId;
  }

  let mentionedObjIds: ObjectId[] | undefined;
  if (params.mentionedIdentityIds?.length) {
    const seen = new Set<string>();
    mentionedObjIds = [];
    for (const id of params.mentionedIdentityIds) {
      const parsed = parseObjId(id);
      if (!parsed) {
        return { success: false, error: 'Invalid mention id.', errorCode: 'INVALID_ID' };
      }
      const hex = parsed.toHexString();
      if (seen.has(hex)) continue;
      seen.add(hex);
      mentionedObjIds.push(parsed);
    }
  }

  const expiresAt =
    params.expiresInSeconds != null && params.expiresInSeconds > 0
      ? new Date(Date.now() + params.expiresInSeconds * 1000)
      : undefined;

  const messageRepo = getSpaceMessageRepository();

  const existing = await messageRepo.findByClientMessageId(channelId, params.clientMessageId);
  if (existing) {
    return { success: true, message: toPublicSpaceMessage(existing) };
  }

  let message;
  try {
    message = await messageRepo.createMessage({
      spaceId,
      channelId,
      fromIdentityId: senderId,
      content,
      clientMessageId: params.clientMessageId,
      ...(replyToMessageObjId ? { replyToMessageId: replyToMessageObjId } : {}),
      ...(mentionedObjIds?.length ? { mentionedIdentityIds: mentionedObjIds } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      const now = await messageRepo.findByClientMessageId(channelId, params.clientMessageId);
      if (now) return { success: true, message: toPublicSpaceMessage(now) };
    }
    throw err;
  }

  const publicMessage = toPublicSpaceMessage(message);
  if (replyToMessageAuthorId) {
    publicMessage.replyToMessageAuthorId = replyToMessageAuthorId.toHexString();
  }
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_message',
    data: { message: publicMessage },
  });

  const senderHex = senderId.toHexString();
  const notifBase = {
    spaceId: spaceId.toHexString(),
    channelId: channelId.toHexString(),
    messageId: publicMessage.id,
    fromIdentityId: senderHex,
  };

  if (replyToMessageAuthorId && !replyToMessageAuthorId.equals(senderId)) {
    createNotification(replyToMessageAuthorId, 'space_message_reply', notifBase).catch(() => {});
  }

  if (mentionedObjIds?.length) {
    for (const mentionId of mentionedObjIds) {
      if (mentionId.equals(senderId)) continue;
      if (replyToMessageAuthorId && mentionId.equals(replyToMessageAuthorId)) continue;
      createNotification(mentionId, 'space_message_mention', notifBase).catch(() => {});
    }
  }

  return { success: true, message: publicMessage };
}

/**
 * List a channel's messages (newest first, cursor-paginated). Visibility-gated
 * read: `public` is open, `listed`/`hidden` require membership.
 */
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

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const messages = await getSpaceMessageRepository().findByChannel(
    channelId,
    limit + 1,
    cursorObjId,
    direction,
  );

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  return {
    success: true,
    messages: page.map(toPublicSpaceMessage),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
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

  const message = await getSpaceMessageRepository().findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  return { success: true, message: toPublicSpaceMessage(message) };
}

/**
 * Edit a message (author only, max revisions).
 */
export async function editSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
  content: string,
): Promise<SpaceMessageResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const trimmed = content?.trim() ?? '';
  if (!trimmed || trimmed.length > SPACE_MESSAGE_MAX_LENGTH) {
    return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const messageRepo = getSpaceMessageRepository();
  const message = await messageRepo.findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (message.deleted) {
    return { success: false, error: 'This message has been deleted.', errorCode: 'MESSAGE_DELETED' };
  }
  if (!message.fromIdentityId.equals(callerId)) {
    return { success: false, error: 'You can only edit your own messages.', errorCode: 'NOT_AUTHOR' };
  }
  if ((message.revisionCount ?? 0) >= MAX_EDIT_REVISIONS) {
    return { success: false, error: "You can't edit this message anymore.", errorCode: 'MAX_EDITS_REACHED' };
  }

  const editResult = await messageRepo.editMessage(messageId, trimmed);
  if (!editResult) {
    return { success: false, error: 'Failed to edit message.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (editResult.conflict) {
    if (editResult.current?.deleted) {
      return { success: false, error: 'This message has been deleted.', errorCode: 'MESSAGE_DELETED' };
    }
    return { success: false, error: 'Edit conflict; please retry.', errorCode: 'EDIT_CONFLICT' };
  }

  const publicMessage = toPublicSpaceMessage(editResult.message);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_message_edited',
    data: {
      channelId: channelId.toHexString(),
      messageId: messageId.toHexString(),
      fromIdentityId: callerId.toHexString(),
      content: publicMessage.content,
      lastEditedAt: publicMessage.lastEditedAt,
      revisionCount: publicMessage.revisionCount,
    },
  });

  return { success: true, message: publicMessage };
}

/**
 * Delete own message (soft-delete).
 */
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

  const messageRepo = getSpaceMessageRepository();
  const message = await messageRepo.findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (!message.fromIdentityId.equals(callerId)) {
    return { success: false, error: 'You can only delete your own messages.', errorCode: 'NOT_AUTHOR' };
  }

  await messageRepo.softDelete(messageId);

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_message_deleted',
    data: {
      channelId: channelId.toHexString(),
      messageId: messageId.toHexString(),
      deletedBy: callerId.toHexString(),
    },
  });

  return { success: true };
}

/**
 * Moderator delete (soft-delete by mod/admin/owner).
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
  if (!memberHasPermission(perms, 'manageMembers') && !perms.isAdmin) {
    return { success: false, error: 'Moderator permissions required.', errorCode: 'FORBIDDEN' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const messageRepo = getSpaceMessageRepository();
  const message = await messageRepo.findByIdInChannel(channelId, messageId);
  if (!message) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  await messageRepo.softDelete(messageId);

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_message_deleted',
    data: {
      channelId: channelId.toHexString(),
      messageId: messageId.toHexString(),
      deletedBy: callerId.toHexString(),
    },
  });

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

  const messageRepo = getSpaceMessageRepository();
  const target = await messageRepo.findByIdInChannel(channelId, targetId);
  if (!target) {
    return { success: false, error: 'Message not found.', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const messages = await messageRepo.findAround(channelId, targetId, before, after);

  return {
    success: true,
    messages: messages.map(toPublicSpaceMessage),
    cursor: null,
  };
}
