/**
 * Conversation messaging: send, paginate, delete.
 *
 * @module services/conversation/messaging
 */

import { ObjectId } from 'mongodb';
import {
  computeHasNewerPagesFromLastMessageId,
  messagePageBoundsFromNewestFirst,
  type MessagePaginationDirection,
  type SubscriptionTierId,
} from '@adieuu/shared';
import { hasPaidAccess } from '../billing/resolve-access';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getBlockRepository } from '../../repositories/block.repository';
import { getReactionRepository } from '../../repositories/reaction.repository';
import { getE2EMediaRepository } from '../../repositories/e2e-media.repository';
import { createNotification } from '../notification.service';
import { checkAndAward } from '../achievement.service';
import { toPublicConversation, type ConversationDocument } from '../../models/conversation';
import {
  toPublicMessage,
  type MessageDocument,
  type CreateMessageInput,
  type SerializedWrappedKey,
} from '../../models/message';
import type { CryptoProfile } from '../../models/identity';
import { deleteE2EMedia } from '../e2e-upload.service';
import { verifyMessageSignatureV2 } from '../../utils/crypto';
import elog from '../../utils/adieuuLogger';
import type { MessagePagePayload, MessageResult } from './types';
import { publishConversationEvent, publishToParticipants } from './redis-events';

/** Free tier message history depth: only the most recent 14 days are visible. */
const FREE_TIER_HISTORY_DAYS = 14;

function minCreatedAtForRequester(
  conversation: ConversationDocument,
  requester: ObjectId
): Date | undefined {
  const m = conversation.participantJoinedAtByIdentityId;
  if (!m) return undefined;
  const v = m[requester.toHexString()];
  if (v == null) return undefined;
  return v instanceof Date ? v : new Date(String(v));
}

interface BillingContext {
  subscriptions: readonly SubscriptionTierId[];
  entitlements?: readonly string[];
  isLifetime?: boolean;
}

function effectiveMinDate(
  minJoin: Date | undefined,
  billing?: BillingContext,
): Date | undefined {
  if (billing && hasPaidAccess(billing)) return minJoin;

  const freeFloor = new Date(Date.now() - FREE_TIER_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  if (!minJoin) return freeFloor;
  return freeFloor > minJoin ? freeFloor : minJoin;
}

export async function sendMessage(
  conversationId: string | ObjectId,
  senderIdentityId: string | ObjectId,
  input: Omit<CreateMessageInput, 'conversationId' | 'fromIdentityId'> & {
    mentionedIdentityIds?: string[];
  }
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const senderObjId =
    senderIdentityId instanceof ObjectId
      ? senderIdentityId
      : new ObjectId(senderIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(senderObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  // Block enforcement: reject outright for DMs, filter delivery for groups
  const blockRepo = getBlockRepository();
  let blockedPairSet: Set<string> | undefined;

  if (conversation.type === 'dm') {
    const otherParticipant = conversation.participants.find((p) => !p.equals(senderObjId));
    if (otherParticipant) {
      const blocked = await blockRepo.isBlockedByEither(senderObjId, otherParticipant);
      if (blocked) {
        return { success: false, error: 'Cannot message this identity', errorCode: 'BLOCKED' };
      }
    }
  } else if (conversation.type === 'group') {
    const relatedIds = await blockRepo.getBlockRelatedIdentityIds(senderObjId);
    if (relatedIds.length > 0) {
      blockedPairSet = new Set(relatedIds.map((id) => id.toHexString()));
    }
  }

  // Deduplicate by clientMessageId
  const existing = await messageRepo.findByClientMessageId(convObjId, input.clientMessageId);
  if (existing) {
    return {
      success: true,
      message: toPublicMessage(existing, senderObjId),
    };
  }

  // Verify the sender's context-bound (v2) message signature. This rejects
  // payloads whose signature does not cover this conversation, sender, and
  // clientMessageId, so stored messages cannot later be replayed by a
  // compromised server into a different context without detection.
  const senderIdentity = await getIdentityRepository().findByIdentityId(senderObjId);
  if (!senderIdentity?.signingPublicKey) {
    return {
      success: false,
      error: 'Sender has no registered signing key.',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
  const signatureValid = verifyMessageSignatureV2(
    senderIdentity.signingPublicKey,
    {
      conversationId: convObjId.toHexString(),
      fromIdentityId: senderObjId.toHexString(),
      clientMessageId: input.clientMessageId,
    },
    input.ciphertext,
    input.nonce,
    input.wrappedKeys,
    input.signature
  );
  if (!signatureValid) {
    elog.warn('Rejected message with invalid signature', {
      conversationId: convObjId.toHexString(),
      senderIdentityId: senderObjId.toHexString(),
    });
    return {
      success: false,
      error: 'Message signature verification failed.',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  if (input.e2eMediaIds?.length) {
    const e2eRepo = getE2EMediaRepository();
    const mediaRecords = await e2eRepo.findManyByE2EMediaIds(input.e2eMediaIds);

    if (mediaRecords.length !== input.e2eMediaIds.length) {
      return { success: false, error: 'One or more E2E media references not found', errorCode: 'INVALID_MEDIA' as const };
    }

    for (const media of mediaRecords) {
      if (!media.identityId.equals(senderObjId)) {
        return { success: false, error: 'E2E media does not belong to sender', errorCode: 'INVALID_MEDIA' as const };
      }
      if (media.status === 'pending') {
        return { success: false, error: 'E2E media upload has not been completed', errorCode: 'INVALID_MEDIA' as const };
      }
      // Allow messages while moderation is still pending (gated + pending/error) or after pass (available).
      // Block only when moderation has definitively rejected the scan copy.
      if (media.moderationStatus === 'rejected') {
        return { success: false, error: 'E2E media has not cleared moderation', errorCode: 'INVALID_MEDIA' as const };
      }
    }
  }

  const { replyToMessageId: replyFromInput, mentionedIdentityIds: rawMentionIds, ...messageFields } = input;

  const participantHexSet = new Set(conversation.participants.map((p) => p.toHexString()));
  const validMentionIds = rawMentionIds?.filter((id) => participantHexSet.has(id));

  let resolvedReplyId: ObjectId | undefined;
  let replyTargetAuthorId: ObjectId | undefined;
  if (replyFromInput) {
    const replyOid =
      replyFromInput instanceof ObjectId
        ? replyFromInput
        : new ObjectId(String(replyFromInput));
    const parent = await messageRepo.findByIdInConversation(convObjId, replyOid);
    if (!parent) {
      return {
        success: false,
        error: 'Reply target not found in this conversation',
        errorCode: 'INVALID_REPLY_TARGET',
      };
    }
    replyTargetAuthorId = parent.fromIdentityId;
    resolvedReplyId = replyOid;
  }

  const message = await messageRepo.createMessage({
    ...messageFields,
    ...(resolvedReplyId ? { replyToMessageId: resolvedReplyId } : {}),
    conversationId: convObjId,
    fromIdentityId: senderObjId,
  });

  await getIdentityRepository().incrementMessagesSentCount(senderObjId);

  if (input.e2eMediaIds?.length && message.expiresAt) {
    const e2eRepo = getE2EMediaRepository();
    await e2eRepo.setExpiresAt(input.e2eMediaIds, message.expiresAt);
  }

  // Update conversation lastMessage metadata
  await conversationRepo.updateLastMessage(convObjId, message._id, message.createdAt);
  await conversationRepo.incrementMessageCount(convObjId);

  const publicMessage = toPublicMessage(message, senderObjId);

  // In groups, exclude participants involved in a block relationship with the sender
  const deliveryRecipients = blockedPairSet
    ? conversation.participants.filter(
        (p) => !p.equals(senderObjId) && !blockedPairSet!.has(p.toHexString())
      )
    : conversation.participants.filter((p) => !p.equals(senderObjId));

  // Publish to eligible participants (per-member fan-out)
  const messageEvent = {
    type: 'conversation_message',
    data: {
      conversationId: convObjId.toHexString(),
      messageId: message._id.toHexString(),
      fromIdentityId: senderObjId.toHexString(),
      createdAt: message.createdAt.toISOString(),
      ...(resolvedReplyId && replyTargetAuthorId
        ? {
            replyToMessageId: resolvedReplyId.toHexString(),
            replyToMessageAuthorId: replyTargetAuthorId.toHexString(),
          }
        : {}),
      ...(message.expiresAt ? { expiresAt: message.expiresAt.toISOString() } : {}),
      ...(validMentionIds?.length ? { mentionedIdentityIds: validMentionIds } : {}),
    },
  };
  await Promise.all(
    deliveryRecipients.map((id) => publishConversationEvent(id.toHexString(), messageEvent))
  );

  // Create persistent notifications for eligible participants
  for (const participantId of deliveryRecipients) {
    if (replyTargetAuthorId && participantId.equals(replyTargetAuthorId)) {
      await createNotification(participantId, 'conversation_message_reply', {
        conversationId: convObjId.toHexString(),
        messageId: message._id.toHexString(),
        fromIdentityId: senderObjId.toHexString(),
        replyToMessageId: resolvedReplyId!.toHexString(),
      });
    } else {
      await createNotification(participantId, 'conversation_message', {
        conversationId: convObjId.toHexString(),
        messageId: message._id.toHexString(),
        fromIdentityId: senderObjId.toHexString(),
      });
    }
  }

  checkAndAward(senderObjId, 'message_sent').catch(() => {});

  const usesFs = input.wrappedKeys.some((k) => k.preKeyType !== 'static');
  const usesTtl = !!input.expiresAt;

  if (usesFs) checkAndAward(senderObjId, 'fs_message_sent').catch(() => {});
  if (usesTtl) checkAndAward(senderObjId, 'ttl_message_sent').catch(() => {});
  if (usesFs && usesTtl) checkAndAward(senderObjId, 'fs_ttl_message_sent').catch(() => {});

  return { success: true, message: publicMessage };
}

/**
 * Edit an existing user message (E2E re-encrypt). Sender-only; enforces same rules as
 * send for block membership; caps revision history.
 */
export async function editMessage(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  senderIdentityId: string | ObjectId,
  input: {
    ciphertext: string;
    nonce: string;
    wrappedKeys: SerializedWrappedKey[];
    signature: string;
    cryptoProfile: CryptoProfile;
    clientEditId: string;
    e2eMediaIds?: string[];
  }
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId = messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
  const senderObjId =
    senderIdentityId instanceof ObjectId
      ? senderIdentityId
      : new ObjectId(senderIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(senderObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const blockRepo = getBlockRepository();
  let blockedPairSet: Set<string> | undefined;

  if (conversation.type === 'dm') {
    const otherParticipant = conversation.participants.find((p) => !p.equals(senderObjId));
    if (otherParticipant) {
      const blocked = await blockRepo.isBlockedByEither(senderObjId, otherParticipant);
      if (blocked) {
        return { success: false, error: 'Cannot message this identity', errorCode: 'BLOCKED' };
      }
    }
  } else if (conversation.type === 'group') {
    const relatedIds = await blockRepo.getBlockRelatedIdentityIds(senderObjId);
    if (relatedIds.length > 0) {
      blockedPairSet = new Set(relatedIds.map((id) => id.toHexString()));
    }
  }

  const { ciphertext, nonce, wrappedKeys, signature, cryptoProfile, clientEditId, e2eMediaIds } = input;

  if (e2eMediaIds?.length) {
    const e2eRepo = getE2EMediaRepository();
    const mediaRecords = await e2eRepo.findManyByE2EMediaIds(e2eMediaIds);

    if (mediaRecords.length !== e2eMediaIds.length) {
      return { success: false, error: 'One or more E2E media references not found', errorCode: 'INVALID_MEDIA' as const };
    }

    for (const media of mediaRecords) {
      if (!media.identityId.equals(senderObjId)) {
        return { success: false, error: 'E2E media does not belong to sender', errorCode: 'INVALID_MEDIA' as const };
      }
      if (media.status === 'pending') {
        return { success: false, error: 'E2E media upload has not been completed', errorCode: 'INVALID_MEDIA' as const };
      }
      if (media.moderationStatus === 'rejected') {
        return { success: false, error: 'E2E media has not cleared moderation', errorCode: 'INVALID_MEDIA' as const };
      }
    }
  }

  // Verify the context-bound (v2) signature over the replacement ciphertext.
  // Edits sign with the original message's clientMessageId (stable across
  // revisions), so the message doc is loaded first to resolve it.
  const existingMessage = await messageRepo.findByIdInConversation(convObjId, msgObjId);
  if (!existingMessage) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  const editorIdentity = await getIdentityRepository().findByIdentityId(senderObjId);
  if (!editorIdentity?.signingPublicKey) {
    return {
      success: false,
      error: 'Sender has no registered signing key.',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
  const editSignatureValid = verifyMessageSignatureV2(
    editorIdentity.signingPublicKey,
    {
      conversationId: convObjId.toHexString(),
      fromIdentityId: senderObjId.toHexString(),
      clientMessageId: existingMessage.clientMessageId,
    },
    ciphertext,
    nonce,
    wrappedKeys,
    signature
  );
  if (!editSignatureValid) {
    elog.warn('Rejected message edit with invalid signature', {
      conversationId: convObjId.toHexString(),
      messageId: msgObjId.toHexString(),
      senderIdentityId: senderObjId.toHexString(),
    });
    return {
      success: false,
      error: 'Message signature verification failed.',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  const result = await messageRepo.applyMessageEdit(
    convObjId,
    msgObjId,
    senderObjId,
    clientEditId,
    { ciphertext, nonce, wrappedKeys, signature, cryptoProfile, ...(e2eMediaIds ? { e2eMediaIds } : {}) }
  );

  if (result.idempotentReplay && result.doc) {
    return { success: true, message: toPublicMessage(result.doc, senderObjId) };
  }

  if (result.errorCode === 'MAX_EDITS_REACHED') {
    return {
      success: false,
      error: 'Maximum edits for this message reached.',
      errorCode: 'MAX_EDITS_REACHED',
    };
  }
  if (result.errorCode === 'NOT_SENDER') {
    return { success: false, error: 'Only the sender can edit this message', errorCode: 'NOT_SENDER' };
  }
  if (result.errorCode === 'TOMBSTONE') {
    return { success: false, error: 'This message is no longer available', errorCode: 'TOMBSTONE' };
  }
  if (result.errorCode === 'SYSTEM_MESSAGE') {
    return { success: false, error: 'System messages cannot be edited', errorCode: 'SYSTEM_MESSAGE' };
  }
  if (result.errorCode === 'NOT_FOUND' || !result.doc) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const message = result.doc;

  if (e2eMediaIds?.length && message.expiresAt) {
    const e2eRepo = getE2EMediaRepository();
    await e2eRepo.setExpiresAt(e2eMediaIds, message.expiresAt);
  }

  // Fan-out: same as send — exclude ineligible in groups
  const deliveryRecipients = blockedPairSet
    ? conversation.participants.filter(
        (p) => !p.equals(senderObjId) && !blockedPairSet!.has(p.toHexString())
      )
    : conversation.participants.filter((p) => !p.equals(senderObjId));

  const revisionCount = message.encryptedRevisionHistory?.length ?? 0;
  const messageEvent = {
    type: 'conversation_message_edited' as const,
    data: {
      conversationId: convObjId.toHexString(),
      messageId: msgObjId.toHexString(),
      fromIdentityId: senderObjId.toHexString(),
      lastEditedAt: message.lastEditedAt?.toISOString() ?? new Date().toISOString(),
      revisionCount,
      ...(message.expiresAt ? { expiresAt: message.expiresAt.toISOString() } : {}),
    },
  };
  await Promise.all(
    deliveryRecipients.map((id) => publishConversationEvent(id.toHexString(), messageEvent))
  );

  // Achievements: optional — small edit count, skip or add later

  return { success: true, message: toPublicMessage(message, senderObjId) };
}

/**
 * Load a single message by id; optionally include full E2E revision history.
 */
export async function getMessage(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  options?: { includeRevisionHistory?: boolean },
  billing?: BillingContext,
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId = messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }
  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const message = await messageRepo.findByIdInConversation(convObjId, msgObjId);
  if (!message) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }
  const minDate = effectiveMinDate(
    minCreatedAtForRequester(conversation, requesterObjId),
    billing,
  );
  if (minDate && message.createdAt.getTime() < minDate.getTime()) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  return {
    success: true,
    message: toPublicMessage(message, requesterObjId, {
      includeRevisionHistory: options?.includeRevisionHistory,
    }),
  };
}

async function buildMessagePagePayload(
  conversation: ConversationDocument,
  convObjId: ObjectId,
  requesterObjId: ObjectId,
  messageRepo: ReturnType<typeof getMessageRepository>,
  docs: MessageDocument[],
  nextOlderCursor: string | null,
  minCreatedAtForRequester?: Date,
): Promise<MessagePagePayload> {
  // Flag messages carrying reactions so the client reserves reaction-bar space
  // before the (separately batch-fetched) reactions load. Count-only distinct
  // query; the deleted branch of toPublicMessage drops the flag on tombstones.
  const withReactions = await getReactionRepository().messageIdsWithReactions(
    convObjId,
    docs.map((m) => m._id),
  );
  const publicMessages = docs.map((m) =>
    toPublicMessage(m, requesterObjId, {
      hasReactions: withReactions.has(m._id.toHexString()),
    }),
  );
  const bounds = messagePageBoundsFromNewestFirst(publicMessages);
  let hasNewerPages = false;
  if (bounds.pageNewestId) {
    const derived = computeHasNewerPagesFromLastMessageId(
      bounds.pageNewestId,
      conversation.lastMessageId?.toHexString(),
    );
    if (derived === null) {
      hasNewerPages = await messageRepo.hasMessageNewerThan(
        convObjId,
        new ObjectId(bounds.pageNewestId),
        minCreatedAtForRequester,
      );
    } else {
      hasNewerPages = derived;
    }
  }
  return {
    messages: publicMessages,
    cursor: nextOlderCursor,
    pageOldestId: bounds.pageOldestId,
    pageNewestId: bounds.pageNewestId,
    hasNewerPages,
  };
}
export async function getMessages(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  limit = 50,
  cursor?: string,
  direction?: MessagePaginationDirection,
  billing?: BillingContext,
): Promise<MessagePagePayload | MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const hasCursor = !!cursor?.trim();
  const hasDirection = direction != null;
  if (hasCursor !== hasDirection) {
    return {
      success: false,
      error: hasCursor
        ? 'direction is required when cursor is set (older or newer).'
        : 'cursor is required when direction is set.',
      errorCode: 'INVALID_MESSAGE_QUERY',
    };
  }

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const minJoin = effectiveMinDate(
    minCreatedAtForRequester(conversation, requesterObjId),
    billing,
  );

  if (hasCursor && direction === 'newer') {
    const anchorObjId = new ObjectId(cursor!);
    // Next page toward the present: the *oldest* N messages with _id > anchor (ascending),
    // not the globally newest N (descending would jump to the live tail).
    const ascChunk = await messageRepo.findAfter(convObjId, anchorObjId, limit + 1, minJoin);
    const hasMoreInDirection = ascChunk.length > limit;
    const pageAsc = hasMoreInDirection ? ascChunk.slice(0, limit) : ascChunk;
    if (pageAsc.length === 0) {
      return {
        messages: [],
        cursor: null,
        pageOldestId: null,
        pageNewestId: null,
        hasNewerPages: false,
      };
    }
    const newestFirst = [...pageAsc].reverse();
    const tail = newestFirst[newestFirst.length - 1]!;
    const hasMoreOlder = await messageRepo.hasMessageOlderThan(convObjId, tail._id, minJoin);
    return buildMessagePagePayload(
      conversation,
      convObjId,
      requesterObjId,
      messageRepo,
      newestFirst,
      hasMoreOlder ? tail._id.toHexString() : null,
      minJoin,
    );
  }

  if (hasCursor && direction === 'older') {
    const anchorObjId = new ObjectId(cursor!);
    const messages = await messageRepo.findByConversation(
      convObjId,
      limit + 1,
      anchorObjId,
      'asc',
      minJoin
    );
    const hasMoreOlder = messages.length > limit;
    const result = hasMoreOlder ? messages.slice(0, limit) : messages;
    if (result.length === 0) {
      return {
        messages: [],
        cursor: null,
        pageOldestId: null,
        pageNewestId: null,
        hasNewerPages: false,
      };
    }
    const tail = result[result.length - 1]!;
    return buildMessagePagePayload(
      conversation,
      convObjId,
      requesterObjId,
      messageRepo,
      result,
      hasMoreOlder ? tail._id.toHexString() : null,
      minJoin,
    );
  }

  const messages = await messageRepo.findByConversation(
    convObjId,
    limit + 1,
    undefined,
    undefined,
    minJoin
  );
  const hasMoreOlder = messages.length > limit;
  const result = hasMoreOlder ? messages.slice(0, limit) : messages;
  if (result.length === 0) {
    return {
      messages: [],
      cursor: null,
      pageOldestId: null,
      pageNewestId: null,
      hasNewerPages: false,
    };
  }
  const tail = result[result.length - 1]!;
  return buildMessagePagePayload(
    conversation,
    convObjId,
    requesterObjId,
    messageRepo,
    result,
    hasMoreOlder ? tail._id.toHexString() : null,
    minJoin,
  );
}

/**
 * Load a window around a message: up to `afterLimit` newer and `beforeLimit` older than `centerMessageId`,
 * including the center message, sorted newest-first (same shape as {@link getMessages}).
 */
export async function getMessagesAround(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  centerMessageId: string,
  beforeLimit = 15,
  afterLimit = 15,
  billing?: BillingContext,
): Promise<MessagePagePayload | MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const bl = Math.max(1, Math.min(beforeLimit, 100));
  const al = Math.max(1, Math.min(afterLimit, 100));

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const minJoin = effectiveMinDate(
    minCreatedAtForRequester(conversation, requesterObjId),
    billing,
  );

  const centerObjId = new ObjectId(centerMessageId);
  const centerDoc = await messageRepo.findByIdInConversation(convObjId, centerObjId);
  if (!centerDoc) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  if (minJoin && centerDoc.createdAt.getTime() < minJoin.getTime()) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const newerDocs = await messageRepo.findAfter(convObjId, centerObjId, al, minJoin);
  const olderDocs = await messageRepo.findBefore(convObjId, centerObjId, bl, minJoin);

  const combined: MessageDocument[] = [centerDoc, ...newerDocs, ...olderDocs];
  combined.sort((a, b) => {
    const ax = a._id.toHexString();
    const bx = b._id.toHexString();
    if (ax === bx) return 0;
    return ax < bx ? 1 : -1;
  });

  const tail = combined[combined.length - 1]!;
  const hasMoreOlder = await messageRepo.hasMessageOlderThan(convObjId, tail._id, minJoin);
  return buildMessagePagePayload(
    conversation,
    convObjId,
    requesterObjId,
    messageRepo,
    combined,
    hasMoreOlder ? tail._id.toHexString() : null,
    minJoin,
  );
}

/**
 * Delete a message for the requesting identity only.
 * The message remains visible to other participants.
 */
export async function deleteMessageForSelf(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId =
    messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const message = await messageRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  await messageRepo.markDeletedForIdentity(msgObjId, requesterObjId);

  return { success: true, message: toPublicMessage(message, requesterObjId) };
}

/**
 * Delete a message for all participants (sender only).
 * Replaces content with a tombstone and notifies all members.
 */
export async function deleteMessageForEveryone(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId =
    messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const message = await messageRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  if (!message.fromIdentityId.equals(requesterObjId)) {
    return { success: false, error: 'Only the sender can delete for everyone', errorCode: 'NOT_SENDER' };
  }

  await messageRepo.markDeletedForEveryone(msgObjId);

  await conversationRepo.pullPinnedMessage(convObjId, msgObjId);

  const convAfterPin = await conversationRepo.findById(convObjId);
  if (convAfterPin) {
    const publicConv = toPublicConversation(convAfterPin);
    await publishToParticipants(conversation.participants, requesterObjId, {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'pins_updated',
        identityId: requesterObjId.toHexString(),
        pinnedMessageIds: publicConv.pinnedMessageIds ?? [],
      },
    });
  }

  const reactionRepo = getReactionRepository();
  await reactionRepo.deleteByMessage(msgObjId);

  if (message.e2eMediaIds?.length) {
    for (const e2eMediaId of message.e2eMediaIds) {
      await deleteE2EMedia(e2eMediaId).catch((err) => {
        elog.error('Failed to delete E2E media during message deletion', { e2eMediaId, err });
      });
    }
  }

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_message_deleted',
    data: {
      conversationId: convObjId.toHexString(),
      messageId: msgObjId.toHexString(),
      deletedBy: requesterObjId.toHexString(),
      forEveryone: true,
    },
  });

  checkAndAward(requesterObjId, 'message_deleted_for_all').catch(() => {});

  return { success: true };
}
