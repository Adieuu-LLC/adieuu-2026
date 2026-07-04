/**
 * Conversation message and pinned-message-list controllers.
 *
 * @module routes/conversations/messages.controller
 */

import type { RouteContext } from '../../router/types';
import type { ConversationRouteResult } from './conversation-route-result';
import {
  sendMessage,
  editMessage,
  getMessage,
  getMessages,
  getMessagesAround,
  deleteMessageForSelf,
  deleteMessageForEveryone,
  listPinnedMessagesPage,
} from '../../services/conversation.service';
import { ObjectId } from 'mongodb';
import type { PublicMessage } from '../../models/message';
import {
  SendMessageSchema,
  EditMessageSchema,
} from './conversation-schemas';
import {
  sanitizeObjectId24,
  parseOptionalObjectIdCursor,
  clampListLimit,
  parsePinnedListCursor,
  sanitizeSendMessageBody,
  sanitizeEditMessageBody,
} from './conversation-inputs';

export async function listPinnedMessagesCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<{ messages: PublicMessage[]; nextCursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const limitParam = ctx.query.get('limit');
  const cursorParsed = parsePinnedListCursor(ctx.query.get('cursor'));
  if (!cursorParsed.ok) return { kind: 'bad_request', message: cursorParsed.message };

  let limit: number | undefined;
  if (limitParam) {
    const n = parseInt(limitParam, 10);
    if (!Number.isNaN(n)) limit = n;
  }

  const result = await listPinnedMessagesPage(conv.id, identity._id, {
    limit,
    cursor: cursorParsed.cursor,
  });

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to load pinned messages.' };
  }

  return {
    kind: 'ok',
    data: {
      messages: result.messages ?? [],
      nextCursor: result.nextCursor ?? null,
    },
  };
}

export async function sendMessageCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const parseResult = SendMessageSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const sanitizedBody = sanitizeSendMessageBody(parseResult.data);
  if (!sanitizedBody.ok) return { kind: 'bad_request', message: 'Invalid message payload.' };

  const { expiresInSeconds, replyToMessageId, mentionedIdentityIds, ...messageInput } =
    sanitizedBody.data;

  const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : undefined;

  const result = await sendMessage(conv.id, identity._id, {
    ...messageInput,
    ...(replyToMessageId ? { replyToMessageId: new ObjectId(replyToMessageId) } : {}),
    expiresAt,
    mentionedIdentityIds,
  });

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'BLOCKED') {
      return { kind: 'forbidden', message: 'Cannot message this identity.' };
    }
    if (result.errorCode === 'INVALID_REPLY_TARGET') {
      return {
        kind: 'bad_request',
        message:
          result.error ?? 'The message you are replying to was not found in this conversation.',
      };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to send message.' };
  }

  return { kind: 'ok', data: result.message, message: 'Message sent.' };
}

export async function listMessagesCtrl(
  ctx: RouteContext,
): Promise<
  ConversationRouteResult<{
    messages: PublicMessage[];
    cursor: string | null;
    pageOldestId: string | null;
    pageNewestId: string | null;
    hasNewerPages: boolean;
  }>
> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };

  const limit = clampListLimit(ctx.query.get('limit'));
  const cursorParam = ctx.query.get('cursor');
  const directionParam = ctx.query.get('direction');

  const validCursor = parseOptionalObjectIdCursor(cursorParam);
  const validDirection =
    directionParam === 'older' || directionParam === 'newer' ? directionParam : undefined;

  const result = await getMessages(conv.id, identity._id, limit, validCursor, validDirection, ctx.identitySession);

  if ('errorCode' in result) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'INVALID_MESSAGE_QUERY') {
      return { kind: 'bad_request', message: result.error ?? 'Invalid message query.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to get messages.' };
  }

  const {
    messages,
    cursor: nextOlderCursor,
    pageOldestId,
    pageNewestId,
    hasNewerPages,
  } = result as {
    messages: PublicMessage[];
    cursor: string | null;
    pageOldestId: string | null;
    pageNewestId: string | null;
    hasNewerPages: boolean;
  };

  return {
    kind: 'ok',
    data: {
      messages,
      cursor: nextOlderCursor,
      pageOldestId,
      pageNewestId,
      hasNewerPages,
    },
  };
}

export async function messagesAroundCtrl(
  ctx: RouteContext,
): Promise<
  ConversationRouteResult<{
    messages: PublicMessage[];
    cursor: string | null;
    pageOldestId: string | null;
    pageNewestId: string | null;
    hasNewerPages: boolean;
  }>
> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const beforeParam = ctx.query.get('before');
  const afterParam = ctx.query.get('after');
  let before = beforeParam ? parseInt(beforeParam, 10) : 15;
  let after = afterParam ? parseInt(afterParam, 10) : 15;
  if (Number.isNaN(before) || before < 1) before = 15;
  if (Number.isNaN(after) || after < 1) after = 15;
  if (before > 100) before = 100;
  if (after > 100) after = 100;

  const result = await getMessagesAround(conv.id, identity._id, msg.id, before, after, ctx.identitySession);

  if (!('messages' in result)) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to get messages.' };
  }

  const {
    messages,
    cursor: nextOlderCursor,
    pageOldestId,
    pageNewestId,
    hasNewerPages,
  } = result;

  return {
    kind: 'ok',
    data: {
      messages,
      cursor: nextOlderCursor,
      pageOldestId,
      pageNewestId,
      hasNewerPages,
    },
  };
}

export async function getOneMessageCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const includeRev = ctx.query.get('include') === 'revisionHistory';

  const result = await getMessage(conv.id, msg.id, identity._id, {
    includeRevisionHistory: includeRev,
  }, ctx.identitySession);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to load message.' };
  }

  return { kind: 'ok', data: result.message, message: 'Message loaded.' };
}

export async function editMessageCtrl(ctx: RouteContext): Promise<ConversationRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const parseResult = EditMessageSchema.safeParse(ctx.body);
  if (!parseResult.success) return { kind: 'validation_failed' };

  const sanitizedBody = sanitizeEditMessageBody(parseResult.data);
  if (!sanitizedBody.ok) return { kind: 'bad_request', message: 'Invalid message payload.' };

  const result = await editMessage(conv.id, msg.id, identity._id, sanitizedBody.data);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'BLOCKED') {
      return { kind: 'forbidden', message: 'Cannot message this identity.' };
    }
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    if (result.errorCode === 'MAX_EDITS_REACHED') {
      return {
        kind: 'named_error',
        code: 'MAX_EDITS_REACHED',
        message: "You can't edit this message anymore.",
        status: 400,
      };
    }
    if (result.errorCode === 'NOT_SENDER') return { kind: 'unauthorized' };
    if (result.errorCode === 'TOMBSTONE') {
      return { kind: 'bad_request', message: 'This message is no longer available.' };
    }
    if (result.errorCode === 'SYSTEM_MESSAGE') {
      return { kind: 'bad_request', message: 'This message cannot be edited.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to edit message.' };
  }

  return { kind: 'ok', data: result.message, message: 'Message updated.' };
}

export async function deleteMessageForSelfCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const result = await deleteMessageForSelf(conv.id, msg.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    return { kind: 'bad_request', message: result.error ?? 'Failed to delete message.' };
  }

  return { kind: 'ok', data: undefined, message: 'Message deleted for you.' };
}

export async function deleteMessageForEveryoneCtrl(
  ctx: RouteContext,
): Promise<ConversationRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const conv = sanitizeObjectId24(ctx.params.id);
  if (!conv.ok) return { kind: 'bad_request', message: 'Invalid conversation ID.' };
  const msg = sanitizeObjectId24(ctx.params.messageId);
  if (!msg.ok) return { kind: 'bad_request', message: 'Invalid message ID.' };

  const result = await deleteMessageForEveryone(conv.id, msg.id, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') {
      return { kind: 'not_found', message: 'Conversation not found.' };
    }
    if (result.errorCode === 'NOT_PARTICIPANT') return { kind: 'unauthorized' };
    if (result.errorCode === 'MESSAGE_NOT_FOUND') {
      return { kind: 'not_found', message: 'Message not found.' };
    }
    if (result.errorCode === 'NOT_SENDER') return { kind: 'unauthorized' };
    return { kind: 'bad_request', message: result.error ?? 'Failed to delete message.' };
  }

  return { kind: 'ok', data: undefined, message: 'Message deleted for everyone.' };
}
