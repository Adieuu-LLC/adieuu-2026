/**
 * Pin / unpin messages within a conversation.
 *
 * DMs: either participant. Groups: admins only.
 *
 * @module services/conversation/pins
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { toPublicConversation } from '../../models/conversation';
import { toPublicMessage, type PublicMessage } from '../../models/message';
import type { ConversationResult } from './types';
import { publishToParticipants } from './redis-events';
import { canManageConversationPins } from './group-permissions';

/** Maximum pinned messages per conversation (abuse guard). */
export const MAX_PINNED_MESSAGES_PER_CONVERSATION = 50;

export const DEFAULT_PINNED_MESSAGES_PAGE_LIMIT = 15;
export const MAX_PINNED_MESSAGES_PAGE_LIMIT = 50;

export interface PinnedMessagesPageResult {
  success: boolean;
  messages?: PublicMessage[];
  /** Pass as `cursor` on the next request to load the following page. */
  nextCursor?: string | null;
  error?: string;
  errorCode?: 'CONVERSATION_NOT_FOUND' | 'NOT_PARTICIPANT';
}

/**
 * Paginate pinned message ids (conversation order: oldest pin first) and return ciphertext payloads.
 * Any participant may list pins (read path).
 */
export async function listPinnedMessagesPage(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  options?: { limit?: number; cursor?: string | null }
): Promise<PinnedMessagesPageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  let limit = options?.limit ?? DEFAULT_PINNED_MESSAGES_PAGE_LIMIT;
  if (limit < 1) limit = DEFAULT_PINNED_MESSAGES_PAGE_LIMIT;
  if (limit > MAX_PINNED_MESSAGES_PAGE_LIMIT) limit = MAX_PINNED_MESSAGES_PAGE_LIMIT;

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const pins = conversation.pinnedMessageIds ?? [];
  let startIdx = 0;
  const cursorHex = options?.cursor?.trim();
  if (cursorHex && ObjectId.isValid(cursorHex)) {
    const cursorId = new ObjectId(cursorHex);
    const idx = pins.findIndex((id) => id.equals(cursorId));
    startIdx = idx >= 0 ? idx + 1 : 0;
  }

  const slice = pins.slice(startIdx, startIdx + limit);
  if (slice.length === 0) {
    return { success: true, messages: [], nextCursor: null };
  }

  const docMap = await messageRepo.findByIdsInConversation(convObjId, slice);
  const publicMessages: PublicMessage[] = [];
  for (const pinId of slice) {
    const doc = docMap.get(pinId.toHexString());
    if (doc) {
      publicMessages.push(toPublicMessage(doc, requesterObjId));
    }
  }

  const lastPinInPage = slice[slice.length - 1]!;
  const hasMore = startIdx + limit < pins.length;
  const nextCursor = hasMore ? lastPinInPage.toHexString() : null;

  return { success: true, messages: publicMessages, nextCursor };
}

export async function pinMessage(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<ConversationResult> {
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

  if (!canManageConversationPins(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can manage pins', errorCode: 'NOT_ADMIN' };
  }

  const message = await messageRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  if (message.deletedForEveryone) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  const existing = conversation.pinnedMessageIds ?? [];
  const already = existing.some((id) => id.equals(msgObjId));
  if (!already && existing.length >= MAX_PINNED_MESSAGES_PER_CONVERSATION) {
    return {
      success: false,
      error: `You can pin at most ${MAX_PINNED_MESSAGES_PER_CONVERSATION} messages.`,
      errorCode: 'PIN_LIMIT',
    };
  }

  const updated = await conversationRepo.addPinnedMessage(convObjId, msgObjId);
  if (!updated) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const publicConv = toPublicConversation(updated);
  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'pins_updated',
      identityId: requesterObjId.toHexString(),
      pinnedMessageIds: publicConv.pinnedMessageIds ?? [],
    },
  });

  return { success: true, conversation: publicConv };
}

export async function unpinMessage(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

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

  if (!canManageConversationPins(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can manage pins', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.removePinnedMessage(convObjId, msgObjId);
  if (!updated) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const publicConv = toPublicConversation(updated);
  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'pins_updated',
      identityId: requesterObjId.toHexString(),
      pinnedMessageIds: publicConv.pinnedMessageIds ?? [],
    },
  });

  return { success: true, conversation: publicConv };
}
