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

export const DEFAULT_PINNED_MESSAGES_PAGE_LIMIT = 10;
/** Upper bound for a single list request (client typically uses {@link DEFAULT_PINNED_MESSAGES_PAGE_LIMIT}). */
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
 * List pinned messages: loads all pin ids for the conversation, sorts by message
 * `createdAt` descending (newest first), then paginates that list. Cursor is the last message
 * id in the current page. Any participant may list pins (read path).
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
  if (pins.length === 0) {
    return { success: true, messages: [], nextCursor: null };
  }

  const docMap = await messageRepo.findByIdsInConversation(convObjId, pins);
  const allPublic: PublicMessage[] = [];
  for (const pinId of pins) {
    const doc = docMap.get(pinId.toHexString());
    if (doc) {
      allPublic.push(toPublicMessage(doc, requesterObjId));
    }
  }

  /** Newest messages first (pin list UX). Stable tie-break by id. */
  allPublic.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });

  let startIdx = 0;
  const cursorHex = options?.cursor?.trim();
  if (cursorHex && ObjectId.isValid(cursorHex)) {
    const idx = allPublic.findIndex((m) => m.id === cursorHex);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }

  const page = allPublic.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < allPublic.length;
  const lastInPage = page[page.length - 1];
  const nextCursor = hasMore && lastInPage ? lastInPage.id : null;

  return { success: true, messages: page, nextCursor };
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
