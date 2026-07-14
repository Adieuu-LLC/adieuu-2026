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
import type {
  SpaceChannelsResult,
  SpaceMessageResult,
  SpaceMessagesListResult,
} from './types';

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
  params: { content: string; clientMessageId: string },
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

  // E2EE path is deferred: the client must encrypt via its Cipher and use the
  // (future) encrypted send path. Plaintext is only allowed when neither the
  // Space nor the channel carries a cipher challenge.
  if (space.cipherCheck || channel.cipherCheck) {
    return {
      success: false,
      error: 'This Space is encrypted; plaintext messaging is not available yet.',
      errorCode: 'ENCRYPTION_NOT_SUPPORTED',
    };
  }

  const messageRepo = getSpaceMessageRepository();

  // Idempotency: a retried send with the same clientMessageId returns the original.
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
    });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      const now = await messageRepo.findByClientMessageId(channelId, params.clientMessageId);
      if (now) return { success: true, message: toPublicSpaceMessage(now) };
    }
    throw err;
  }

  return { success: true, message: toPublicSpaceMessage(message) };
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
