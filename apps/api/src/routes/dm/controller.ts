/**
 * DM Controller Module
 *
 * Contains the business logic for DM conversation and message endpoints.
 * All messages are E2E encrypted - server only handles ciphertext.
 *
 * @module routes/dm/controller
 */

import { ObjectId } from 'mongodb';
import { success, errors } from '../../utils/response';
import { RouteContext } from '../../router';
import { getIdentityFromSession, getIdentitySessionIdFromRequest, publishNewMessage, publishMessageDeleted } from '../../services';
import { getDmConversationRepository } from '../../repositories/dm-conversation.repository';
import { getDmMessageRepository } from '../../repositories/dm-message.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import {
  isValidObjectId,
  sanitizeString,
  deriveConversationId,
  validateConversationId,
  deriveParticipantHash,
} from '../../utils';
import { toPublicDmConversation } from '../../models/dm-conversation';
import { toPublicDmMessage, type SerializedWrappedKey, type PublicDmMessage } from '../../models/dm-message';
import { z } from '@adieuu/shared/schemas';
import type { CryptoProfile } from '../../models/identity';

/**
 * Placeholder: Check if an identity can message another identity.
 *
 * TODO: Implement identity settings for "receive from anyone vs friends only"
 * For now, always returns true to allow all messaging.
 *
 * @param _fromIdentityId - Sender identity ID
 * @param _toIdentityId - Recipient identity ID
 * @returns true if messaging is allowed
 */
async function canMessageIdentity(
  _fromIdentityId: ObjectId,
  _toIdentityId: ObjectId
): Promise<boolean> {
  return true;
}

/**
 * Schema for wrapped key validation.
 */
const WrappedKeySchema = z.object({
  identityId: z.string().length(24),
  deviceId: z.string().optional(),
  ephemeralPublicKey: z.string().min(1),
  kemCiphertext: z.string().min(1),
  wrappedSessionKey: z.string().min(1),
  wrappingNonce: z.string().min(1),
});

/**
 * Schema for creating/getting a conversation.
 */
const GetOrCreateConversationSchema = z.object({
  toIdentityId: z.string().length(24),
});

/**
 * Schema for sending a message.
 */
const SendMessageSchema = z.object({
  conversationId: z.string().length(64),
  toIdentityId: z.string().length(24),
  encryptedSenderId: z.string().min(1).max(256),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  wrappedKeys: z.array(WrappedKeySchema).min(1),
  signature: z.string().min(1),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientMessageId: z.string().min(1).max(64),
  expiresInSeconds: z.number().int().positive().optional(),
  replyToId: z.string().length(24).optional(),
  threadRootId: z.string().length(24).optional(),
});

/**
 * POST /dm/conversations - Get or create a conversation
 *
 * Creates a conversation if it doesn't exist, or returns the existing one.
 * The conversation ID is derived from the two participant identity IDs.
 */
export async function getOrCreateConversationCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const parseResult = GetOrCreateConversationSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { toIdentityId } = parseResult.data;

  const sanitizedToId = sanitizeString(toIdentityId, 'general');
  if (!sanitizedToId.value || !isValidObjectId(sanitizedToId.value)) {
    return errors.badRequest('Invalid recipient identity ID.');
  }

  if (sanitizedToId.value === identity._id.toHexString()) {
    return errors.badRequest('Cannot create conversation with yourself.');
  }

  const toIdentityObjectId = new ObjectId(sanitizedToId.value);

  const identityRepo = getIdentityRepository();
  const recipientIdentity = await identityRepo.findById(toIdentityObjectId);
  if (!recipientIdentity) {
    return errors.notFound('Recipient identity not found.');
  }

  if (!recipientIdentity.signingPublicKey) {
    return errors.badRequest('Recipient has not set up E2E encryption.');
  }

  const canMessage = await canMessageIdentity(identity._id, toIdentityObjectId);
  if (!canMessage) {
    return errors.forbidden('You cannot message this identity.');
  }

  const conversationId = deriveConversationId(
    identity._id.toHexString(),
    sanitizedToId.value
  );

  const conversationRepo = getDmConversationRepository();

  const activeCryptoProfile: CryptoProfile =
    identity.preferredCryptoProfile ?? 'default';

  const participantHash = deriveParticipantHash(
    identity._id.toHexString(),
    conversationId
  );

  const conversation = await conversationRepo.getOrCreate({
    conversationId,
    activeCryptoProfile,
    initiatedByHash: participantHash,
  });

  return success(
    { conversation: toPublicDmConversation(conversation) },
    'Conversation ready.',
    200
  );
}

/**
 * POST /dm/messages - Send an encrypted message
 *
 * Stores an encrypted message. The server validates structure but
 * cannot read the content (E2E encrypted).
 */
export async function sendMessageCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (!identity.signingPublicKey) {
    return errors.badRequest('You must set up E2E encryption before sending messages.');
  }

  const parseResult = SendMessageSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const {
    conversationId,
    toIdentityId,
    encryptedSenderId,
    ciphertext,
    nonce,
    wrappedKeys,
    signature,
    cryptoProfile,
    clientMessageId,
    expiresInSeconds,
    replyToId,
    threadRootId,
  } = parseResult.data;

  const sanitizedToId = sanitizeString(toIdentityId, 'general');
  const sanitizedEncryptedSenderId = sanitizeString(encryptedSenderId, 'base64');

  if (!sanitizedToId.value || !isValidObjectId(sanitizedToId.value)) {
    return errors.badRequest('Invalid recipient identity ID.');
  }

  if (!sanitizedEncryptedSenderId.value) {
    return errors.badRequest('Invalid encrypted sender ID.');
  }

  const toIdentityObjectId = new ObjectId(sanitizedToId.value);

  if (!validateConversationId(conversationId, identity._id.toHexString(), sanitizedToId.value)) {
    return errors.badRequest('Invalid conversation ID for these participants.');
  }

  const identityRepo = getIdentityRepository();
  const recipientIdentity = await identityRepo.findById(toIdentityObjectId);
  if (!recipientIdentity) {
    return errors.notFound('Recipient identity not found.');
  }

  if (!recipientIdentity.signingPublicKey) {
    return errors.badRequest('Recipient has not set up E2E encryption.');
  }

  const canMessage = await canMessageIdentity(identity._id, toIdentityObjectId);
  if (!canMessage) {
    return errors.forbidden('You cannot message this identity.');
  }

  const messageRepo = getDmMessageRepository();

  const existingMessage = await messageRepo.findByClientMessageId(conversationId, clientMessageId);
  if (existingMessage) {
    return success(
      { message: toPublicDmMessage(existingMessage) },
      'Message already sent (deduplicated).',
      200
    );
  }

  const conversationRepo = getDmConversationRepository();
  let conversation = await conversationRepo.findByConversationId(conversationId);
  if (!conversation) {
    const senderParticipantHash = deriveParticipantHash(
      identity._id.toHexString(),
      conversationId
    );
    conversation = await conversationRepo.getOrCreate({
      conversationId,
      activeCryptoProfile: cryptoProfile,
      initiatedByHash: senderParticipantHash,
    });
  }

  let expiresAt: Date | undefined;
  if (expiresInSeconds) {
    expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  }

  const message = await messageRepo.createMessage({
    conversationId,
    toIdentityId: toIdentityObjectId,
    encryptedSenderId: sanitizedEncryptedSenderId.value,
    ciphertext,
    nonce,
    wrappedKeys: wrappedKeys as SerializedWrappedKey[],
    signature,
    cryptoProfile,
    clientMessageId,
    expiresAt,
    replyToId: replyToId ? new ObjectId(replyToId) : undefined,
    threadRootId: threadRootId ? new ObjectId(threadRootId) : undefined,
  });

  // Newly created messages are never tombstones
  const publicMessage = toPublicDmMessage(message) as PublicDmMessage;

  // Publish to Redis for real-time delivery via WebSocket
  // This is fire-and-forget - we don't wait for delivery confirmation
  // The message is already persisted, so offline users will get it on next fetch
  // Publishes to both sender and recipient so both conversation lists update
  publishNewMessage(
    identity._id.toHexString(),
    sanitizedToId.value,
    publicMessage
  ).catch((err) => {
    // Log but don't fail the request - message is already stored
    // eslint-disable-next-line no-console
    console.error('Failed to publish DM event:', err);
  });

  return success(
    { message: publicMessage },
    'Message sent.',
    201
  );
}

/**
 * GET /dm/conversations/:conversationId/messages - Get messages for a conversation
 *
 * Returns paginated encrypted messages for a conversation.
 */
export async function getMessagesCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { conversationId } = ctx.params;

  if (!conversationId || conversationId.length !== 64) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedConvId = sanitizeString(conversationId, 'general');
  if (!sanitizedConvId.value) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const limitParam = ctx.query.get('limit');
  const cursorParam = ctx.query.get('cursor');
  const directionParam = ctx.query.get('direction');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let cursor: ObjectId | undefined;
  if (cursorParam) {
    const sanitizedCursor = sanitizeString(cursorParam, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      cursor = new ObjectId(sanitizedCursor.value);
    }
  }

  const direction = directionParam === 'newer' ? 'newer' : 'older';

  const messageRepo = getDmMessageRepository();
  const result = await messageRepo.getMessagesByConversation(
    sanitizedConvId.value,
    identity._id,
    { limit, cursor, direction }
  );

  const publicMessages = result.messages.map((msg) =>
    toPublicDmMessage(msg, identity._id)
  );

  return success({
    messages: publicMessages,
    cursor: result.cursor,
    hasMore: result.hasMore,
  });
}

/**
 * GET /dm/conversations/:conversationId - Get a conversation
 *
 * Returns the conversation metadata.
 */
export async function getConversationCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { conversationId } = ctx.params;

  if (!conversationId || conversationId.length !== 64) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedConvId = sanitizeString(conversationId, 'general');
  if (!sanitizedConvId.value) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const conversationRepo = getDmConversationRepository();
  const conversation = await conversationRepo.findByConversationId(sanitizedConvId.value);

  if (!conversation) {
    return errors.notFound('Conversation not found.');
  }

  return success({
    conversation: toPublicDmConversation(conversation),
  });
}

/**
 * Conversation list item returned from the API.
 */
interface ConversationListItem {
  conversationId: string;
  activeCryptoProfile: CryptoProfile;
  readState: Array<{
    participantHash: string;
    encryptedLastReadId: string;
    updatedAt: string;
  }>;
  lastMessageAt: string | null;
  lastMessageId: string | null;
  lastMessageEncryptedSenderId: string | null;
  lastMessageClientMessageId: string | null;
}

/**
 * GET /dm/conversations - List all conversations for the current identity
 *
 * Returns conversations where the identity has received messages.
 * Includes conversation metadata, read state, and last message timestamp.
 */
export async function getConversationsCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const messageRepo = getDmMessageRepository();
  const conversationRepo = getDmConversationRepository();

  const conversationIds = await messageRepo.getConversationIdsForIdentity(identity._id);

  if (conversationIds.length === 0) {
    return success({ conversations: [] });
  }

  const latestMessages = await messageRepo.getLatestMessagePerConversation(
    conversationIds,
    identity._id
  );

  const conversations: ConversationListItem[] = [];

  for (const convId of conversationIds) {
    const conversationDoc = await conversationRepo.findByConversationId(convId);
    const latestMsg = latestMessages.get(convId);

    const readState = (conversationDoc?.readState ?? []).map((entry) => ({
      participantHash: entry.participantHash,
      encryptedLastReadId: entry.encryptedLastReadId,
      updatedAt: entry.updatedAt.toISOString(),
    }));

    conversations.push({
      conversationId: convId,
      activeCryptoProfile: conversationDoc?.activeCryptoProfile ?? 'default',
      readState,
      lastMessageAt: latestMsg ? latestMsg.createdAt.toISOString() : null,
      lastMessageId: latestMsg ? latestMsg._id.toHexString() : null,
      lastMessageEncryptedSenderId: latestMsg?.encryptedSenderId ?? null,
      lastMessageClientMessageId: latestMsg?.clientMessageId ?? null,
    });
  }

  conversations.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  return success({ conversations });
}

/**
 * Schema for updating read state.
 */
const UpdateReadStateSchema = z.object({
  encryptedLastReadId: z.string().min(1).max(256),
});

/**
 * PUT /dm/conversations/:conversationId/read-state - Update read state
 *
 * Updates the encrypted read position for the current identity in a conversation.
 * The server cannot decrypt this - it's opaque ciphertext.
 */
export async function updateReadStateCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { conversationId } = ctx.params;

  if (!conversationId || conversationId.length !== 64) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedConvId = sanitizeString(conversationId, 'general');
  if (!sanitizedConvId.value) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = UpdateReadStateSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { encryptedLastReadId } = parseResult.data;

  const sanitizedEncryptedId = sanitizeString(encryptedLastReadId, 'base64');
  if (!sanitizedEncryptedId.value) {
    return errors.badRequest('Invalid encrypted read state.');
  }

  const conversationRepo = getDmConversationRepository();

  const existingConversation = await conversationRepo.findByConversationId(sanitizedConvId.value);
  if (!existingConversation) {
    return errors.notFound('Conversation not found.');
  }

  const participantHash = deriveParticipantHash(
    identity._id.toHexString(),
    sanitizedConvId.value
  );

  const updated = await conversationRepo.updateReadState(
    sanitizedConvId.value,
    participantHash,
    sanitizedEncryptedId.value
  );

  if (!updated) {
    return errors.internal('Failed to update read state.');
  }

  return success({
    conversation: toPublicDmConversation(updated),
  });
}

/**
 * DELETE /dm/messages/:messageId - Delete a message for everyone
 *
 * Deletes a message for all participants. Only the sender can do this.
 * The sender is verified by checking the message signature against the
 * requester's signing key.
 *
 * Security: If the signature verifies, the requester is the sender
 * (only they had the private key to create the signature).
 */
export async function deleteMessageForEveryoneCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (!identity.signingPublicKey) {
    return errors.badRequest('You must set up E2E encryption.');
  }

  const { messageId } = ctx.params;

  if (!messageId || !isValidObjectId(messageId)) {
    return errors.badRequest('Invalid message ID.');
  }

  const messageRepo = getDmMessageRepository();
  const message = await messageRepo.findById(new ObjectId(messageId));

  if (!message) {
    return errors.notFound('Message not found.');
  }

  if (message.deletedForEveryone) {
    return success({ deleted: true }, 'Message already deleted.');
  }

  const { verifyDmMessageSignature } = await import('../../utils/crypto');

  const isValidSignature = verifyDmMessageSignature(
    identity.signingPublicKey,
    message.ciphertext,
    message.nonce,
    message.wrappedKeys,
    message.signature
  );

  if (!isValidSignature) {
    return errors.forbidden('You can only delete messages you sent.');
  }

  const deleted = await messageRepo.deleteForEveryone(
    new ObjectId(messageId),
    identity._id
  );

  if (!deleted) {
    return errors.internal('Failed to delete message.');
  }

  publishMessageDeleted(
    message.toIdentityId.toHexString(),
    messageId,
    message.conversationId,
    'deleted_for_everyone'
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to publish deletion event:', err);
  });

  return success({ deleted: true }, 'Message deleted for everyone.');
}

/**
 * POST /dm/messages/:messageId/delete-for-self - Delete a message for self
 *
 * Deletes a message for the current identity only. Other participants
 * can still see the message.
 */
export async function deleteMessageForSelfCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { messageId } = ctx.params;

  if (!messageId || !isValidObjectId(messageId)) {
    return errors.badRequest('Invalid message ID.');
  }

  const messageRepo = getDmMessageRepository();
  const message = await messageRepo.findById(new ObjectId(messageId));

  if (!message) {
    return errors.notFound('Message not found.');
  }

  const alreadyDeletedForSelf = message.deletedFor.some((id) => id.equals(identity._id));
  if (message.deletedForEveryone || alreadyDeletedForSelf) {
    return success({ deleted: true }, 'Message already deleted.');
  }

  const deleted = await messageRepo.deleteForSelf(
    new ObjectId(messageId),
    identity._id
  );

  if (!deleted) {
    return errors.internal('Failed to delete message.');
  }

  return success({ deleted: true }, 'Message deleted for you.');
}
