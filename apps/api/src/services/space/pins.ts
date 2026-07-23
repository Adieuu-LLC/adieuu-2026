/**
 * Space channel pins service.
 *
 * @module services/space/pins
 */

import { ObjectId } from 'mongodb';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getSpacePinRepository } from '../../repositories/space-pin.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceRepository } from '../../repositories/space.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceMessage } from '../../models/space-message';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { canReadSpace } from './access';
import { requireChannelView, resolveChannelAudience } from './channel-access';
import { publishSpaceEvent } from './redis-events';
import type { SpacePinResult, SpacePinnedMessagesResult } from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export async function pinSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpacePinResult> {
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
  if (!memberHasPermission(perms, 'pinMessages')) {
    return { success: false, error: 'Moderator permissions required.', errorCode: 'FORBIDDEN' };
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

  const pinRepo = getSpacePinRepository();
  const existing = await pinRepo.findPin(channelId, messageId);
  if (existing) {
    return { success: false, error: 'Message is already pinned.', errorCode: 'ALREADY_PINNED' };
  }

  try {
    await pinRepo.createPin({ channelId, messageId, pinnedBy: callerId });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return { success: false, error: 'Message is already pinned.', errorCode: 'ALREADY_PINNED' };
    }
    throw err;
  }

  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_pins_updated',
      data: {
        channelId: channelId.toHexString(),
        messageId: messageId.toHexString(),
        action: 'pinned',
        pinnedBy: callerId.toHexString(),
      },
    },
    { audienceIdentityIds },
  );

  return { success: true };
}

export async function unpinSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
): Promise<SpacePinResult> {
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
  if (!memberHasPermission(perms, 'pinMessages')) {
    return { success: false, error: 'Moderator permissions required.', errorCode: 'FORBIDDEN' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  const pinRepo = getSpacePinRepository();
  const removed = await pinRepo.removePin(channelId, messageId);
  if (!removed) {
    return { success: false, error: 'Pin not found.', errorCode: 'PIN_NOT_FOUND' };
  }

  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_pins_updated',
      data: {
        channelId: channelId.toHexString(),
        messageId: messageId.toHexString(),
        action: 'unpinned',
      },
    },
    { audienceIdentityIds },
  );

  return { success: true };
}

export async function getSpacePinnedMessages(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<SpacePinnedMessagesResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, callerId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, callerId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  let decodedCursor: { pinnedAt: Date; id: ObjectId } | undefined;
  if (cursor) {
    const sep = cursor.indexOf('_');
    if (sep > 0) {
      const ms = Number(cursor.slice(0, sep));
      const hex = cursor.slice(sep + 1);
      if (!Number.isNaN(ms) && isValidObjectId(hex)) {
        decodedCursor = { pinnedAt: new Date(ms), id: new ObjectId(hex) };
      }
    }
  }

  const pinRepo = getSpacePinRepository();
  const pins = await pinRepo.findByChannel(channelId, limit + 1, decodedCursor);

  const hasMore = pins.length > limit;
  const page = hasMore ? pins.slice(0, limit) : pins;

  const messageRepo = getSpaceMessageRepository();
  const messageIds = page.map((pin) => pin.messageId);
  const msgs = await messageRepo.findByIds(messageIds);
  const lookup = new Map(msgs.map((m) => [m._id.toHexString(), m]));
  const messages = page.map((pin) => {
    const msg = lookup.get(pin.messageId.toHexString());
    return msg ? toPublicSpaceMessage(msg) : null;
  });

  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const lastPin = page[page.length - 1]!;
    nextCursor = `${lastPin.pinnedAt.getTime()}_${lastPin._id.toHexString()}`;
  }

  return {
    success: true,
    messages,
    cursor: nextCursor,
  };
}
