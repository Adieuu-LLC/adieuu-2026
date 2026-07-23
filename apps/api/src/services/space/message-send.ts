/**
 * Space channel message send/edit (plaintext + E2EE + attachments).
 *
 * @module services/space/message-send
 */

import { ObjectId } from 'mongodb';
import { SPACE_MESSAGE_MAX_LENGTH, SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getE2EMediaRepository } from '../../repositories/e2e-media.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceMessage } from '../../models/space-message';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { requireChannelView, resolveChannelAudience } from './channel-access';
import { publishSpaceEvent } from './redis-events';
import { createNotification } from '../notification.service';
import {
  validateSpaceCleartextAttachments,
  validateSpaceE2EAttachments,
} from './message-attachments';
import type { SpaceMessageResult } from './types';

const MAX_EDIT_REVISIONS = 3;

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

/**
 * Send a message to a channel. Requires membership + `sendMessages`.
 * Encrypted channels require ciphertext/nonce/cipherId; plaintext channels
 * require content. Idempotent on `clientMessageId`.
 */
export async function sendSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  senderIdentityIdRaw: string | ObjectId,
  params: {
    content?: string;
    ciphertext?: string;
    nonce?: string;
    cipherId?: string;
    attachmentMediaIds?: string[];
    e2eMediaIds?: string[];
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
  if (!memberHasPermission(perms, 'sendMessages')) {
    return { success: false, error: 'You do not have permission to post here.', errorCode: 'FORBIDDEN' };
  }

  const channel = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  const view = await requireChannelView(spaceId, channel, senderId);
  if (!view.ok) return { success: false, error: view.error, errorCode: view.errorCode };

  // Content encryption is signaled by `e2ee` (or a per-channel cipherCheck).
  // A Space-level cipherCheck alone may be gate-only and still accepts plaintext.
  const isEncrypted = !!(space.e2ee || channel.cipherCheck);
  const hasAnyCipherField = !!(params.ciphertext || params.nonce || params.cipherId);
  const hasCipherFields = !!(params.ciphertext && params.nonce && params.cipherId);
  const clearAttachmentIds = params.attachmentMediaIds ?? [];
  const e2eAttachmentIds = params.e2eMediaIds ?? [];

  if (hasAnyCipherField && !hasCipherFields) {
    return { success: false, error: 'Cipher fields must include ciphertext, nonce, and cipherId.', errorCode: 'INVALID_CONTENT' };
  }
  if (isEncrypted && !hasCipherFields) {
    return { success: false, error: 'Encrypted channels require ciphertext, nonce, and cipherId.', errorCode: 'INVALID_CONTENT' };
  }
  if (!isEncrypted && hasCipherFields) {
    return { success: false, error: 'Cipher fields are not accepted on plaintext channels.', errorCode: 'INVALID_CONTENT' };
  }
  if (isEncrypted && clearAttachmentIds.length > 0) {
    return {
      success: false,
      error: 'Cleartext attachments are not accepted on encrypted channels.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (!isEncrypted && e2eAttachmentIds.length > 0) {
    return {
      success: false,
      error: 'E2E media ids are not accepted on plaintext channels.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const hasAttachments = clearAttachmentIds.length > 0 || e2eAttachmentIds.length > 0;
  if (hasAttachments && !memberHasPermission(perms, 'attachFiles')) {
    return {
      success: false,
      error: 'You do not have permission to attach files here.',
      errorCode: 'FORBIDDEN',
    };
  }

  let bodyFields: {
    content?: string;
    ciphertext?: string;
    nonce?: string;
    cipherId?: string;
    attachmentMediaIds?: string[];
    attachments?: import('../../models/space-message').SpaceMessageAttachmentDoc[];
    e2eMediaIds?: string[];
  };
  if (isEncrypted) {
    if (params.ciphertext!.length > SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH) {
      return { success: false, error: 'Ciphertext too long.', errorCode: 'INVALID_CONTENT' };
    }
    bodyFields = { ciphertext: params.ciphertext, nonce: params.nonce, cipherId: params.cipherId };
    if (e2eAttachmentIds.length > 0) {
      const e2eResult = await validateSpaceE2EAttachments(senderId, e2eAttachmentIds);
      if (!e2eResult.success) return e2eResult;
      bodyFields.e2eMediaIds = e2eResult.e2eMediaIds;
    }
  } else {
    const content = params.content?.trim() ?? '';
    if (content.length > SPACE_MESSAGE_MAX_LENGTH) {
      return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
    }
    if (!content && clearAttachmentIds.length === 0) {
      return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
    }
    bodyFields = content ? { content } : { content: '' };
    if (clearAttachmentIds.length > 0) {
      const clearResult = await validateSpaceCleartextAttachments(
        spaceId,
        senderId,
        clearAttachmentIds,
      );
      if (!clearResult.success) return clearResult;
      bodyFields.attachmentMediaIds = clearResult.attachmentMediaIds;
      bodyFields.attachments = clearResult.attachments;
    }
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

  // Mentions and reply notifications may only target active Space members —
  // otherwise arbitrary identities can be notification-spammed from any Space.
  let notifiableIdentityHexes: Set<string> | null = null;
  {
    const candidates = [
      ...(mentionedObjIds ?? []),
      ...(replyToMessageAuthorId ? [replyToMessageAuthorId] : []),
    ];
    if (candidates.length > 0) {
      const activeMembers = await getSpaceMemberRepository().findActiveByIdentityIds(
        spaceId,
        candidates,
      );
      notifiableIdentityHexes = new Set(activeMembers.map((m) => m.identityId.toHexString()));
      if (mentionedObjIds?.length) {
        mentionedObjIds = mentionedObjIds.filter((id) =>
          notifiableIdentityHexes!.has(id.toHexString()),
        );
      }
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
      ...bodyFields,
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

  if (bodyFields.e2eMediaIds?.length && message.expiresAt) {
    await getE2EMediaRepository().setExpiresAt(bodyFields.e2eMediaIds, message.expiresAt);
  }

  const publicMessage = toPublicSpaceMessage(message);
  if (replyToMessageAuthorId) {
    publicMessage.replyToMessageAuthorId = replyToMessageAuthorId.toHexString();
  }
  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_message',
      data: { message: publicMessage },
    },
    { audienceIdentityIds },
  );

  const senderHex = senderId.toHexString();
  const notifBase = {
    spaceId: spaceId.toHexString(),
    channelId: channelId.toHexString(),
    messageId: publicMessage.id,
    fromIdentityId: senderHex,
  };

  if (
    replyToMessageAuthorId &&
    !replyToMessageAuthorId.equals(senderId) &&
    notifiableIdentityHexes?.has(replyToMessageAuthorId.toHexString())
  ) {
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
 * Edit a message (author only, max revisions). Supports both plaintext and
 * cipher fields depending on the channel's encryption state.
 */
export async function editSpaceMessage(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  messageIdRaw: string | ObjectId,
  callerIdRaw: string | ObjectId,
  body: {
    content?: string;
    ciphertext?: string;
    nonce?: string;
    cipherId?: string;
    attachmentMediaIds?: string[];
    e2eMediaIds?: string[];
  },
): Promise<SpaceMessageResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const messageId = parseObjId(messageIdRaw);
  const callerId = parseObjId(callerIdRaw);
  if (!spaceId || !channelId || !messageId || !callerId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const hasAnyCipherField = !!(body.ciphertext || body.nonce || body.cipherId);
  const hasCipherFields = !!(body.ciphertext && body.nonce && body.cipherId);
  const clearAttachmentIds = body.attachmentMediaIds;
  const e2eAttachmentIds = body.e2eMediaIds;

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
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

  const isEncrypted = !!(space.e2ee || channel.cipherCheck);
  if (hasAnyCipherField && !hasCipherFields) {
    return { success: false, error: 'Cipher fields must include ciphertext, nonce, and cipherId.', errorCode: 'INVALID_CONTENT' };
  }
  if (isEncrypted && !hasCipherFields) {
    return { success: false, error: 'Encrypted channels require ciphertext, nonce, and cipherId.', errorCode: 'INVALID_CONTENT' };
  }
  if (!isEncrypted && hasCipherFields) {
    return { success: false, error: 'Cipher fields are not accepted on plaintext channels.', errorCode: 'INVALID_CONTENT' };
  }
  if (isEncrypted && (clearAttachmentIds?.length ?? 0) > 0) {
    return {
      success: false,
      error: 'Cleartext attachments are not accepted on encrypted channels.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (!isEncrypted && (e2eAttachmentIds?.length ?? 0) > 0) {
    return {
      success: false,
      error: 'E2E media ids are not accepted on plaintext channels.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const hasAttachments =
    (clearAttachmentIds?.length ?? 0) > 0 || (e2eAttachmentIds?.length ?? 0) > 0;
  if (hasAttachments && !memberHasPermission(perms, 'attachFiles')) {
    return {
      success: false,
      error: 'You do not have permission to attach files here.',
      errorCode: 'FORBIDDEN',
    };
  }

  let editBody: import('../../repositories/space-message.repository').EditMessageBody;
  if (isEncrypted) {
    if (body.ciphertext!.length > SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH) {
      return { success: false, error: 'Ciphertext too long.', errorCode: 'INVALID_CONTENT' };
    }
    editBody = { ciphertext: body.ciphertext!, nonce: body.nonce!, cipherId: body.cipherId! };
    if (e2eAttachmentIds !== undefined) {
      const e2eResult = await validateSpaceE2EAttachments(callerId, e2eAttachmentIds);
      if (!e2eResult.success) return e2eResult;
      editBody.e2eMediaIds = e2eResult.e2eMediaIds;
    }
  } else {
    const trimmed = body.content?.trim() ?? '';
    if (trimmed.length > SPACE_MESSAGE_MAX_LENGTH) {
      return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
    }
    if (!trimmed && !(clearAttachmentIds?.length)) {
      return { success: false, error: 'Invalid message content.', errorCode: 'INVALID_CONTENT' };
    }
    editBody = { content: trimmed };
    if (clearAttachmentIds !== undefined) {
      const clearResult = await validateSpaceCleartextAttachments(
        spaceId,
        callerId,
        clearAttachmentIds,
      );
      if (!clearResult.success) return clearResult;
      editBody.attachmentMediaIds = clearResult.attachmentMediaIds;
      editBody.attachments = clearResult.attachments;
    }
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

  const editResult = await messageRepo.editMessage(messageId, editBody);
  if (!editResult) {
    return { success: false, error: 'Failed to edit message.', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  if (editResult.conflict) {
    if (editResult.current?.deleted) {
      return { success: false, error: 'This message has been deleted.', errorCode: 'MESSAGE_DELETED' };
    }
    return { success: false, error: 'Edit conflict; please retry.', errorCode: 'EDIT_CONFLICT' };
  }

  if (editBody.e2eMediaIds?.length && editResult.message.expiresAt) {
    await getE2EMediaRepository().setExpiresAt(editBody.e2eMediaIds, editResult.message.expiresAt);
  }

  const publicMessage = toPublicSpaceMessage(editResult.message);
  const audienceIdentityIds = await resolveChannelAudience(spaceId, channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_message_edited',
      data: {
        channelId: channelId.toHexString(),
        messageId: messageId.toHexString(),
        fromIdentityId: callerId.toHexString(),
        ...(publicMessage.content !== undefined ? { content: publicMessage.content } : {}),
        ...(publicMessage.ciphertext ? { ciphertext: publicMessage.ciphertext, nonce: publicMessage.nonce, cipherId: publicMessage.cipherId } : {}),
        ...(publicMessage.attachmentMediaIds?.length
          ? { attachmentMediaIds: publicMessage.attachmentMediaIds, attachments: publicMessage.attachments }
          : {}),
        ...(publicMessage.e2eMediaIds?.length ? { e2eMediaIds: publicMessage.e2eMediaIds } : {}),
        lastEditedAt: publicMessage.lastEditedAt,
        revisionCount: publicMessage.revisionCount,
      },
    },
    { audienceIdentityIds },
  );

  return { success: true, message: publicMessage };
}

/**
 * Delete own message (soft-delete).
 */
