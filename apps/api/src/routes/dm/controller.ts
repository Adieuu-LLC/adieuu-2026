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
import { getIdentityFromSession, getIdentitySessionIdFromRequest } from '../../services';
import { getDmConversationRepository } from '../../repositories/dm-conversation.repository';
import { getDmMessageRepository } from '../../repositories/dm-message.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import {
  isValidObjectId,
  sanitizeString,
  deriveConversationId,
  validateConversationId,
} from '../../utils';
import { toPublicDmConversation } from '../../models/dm-conversation';
import { toPublicDmMessage, type SerializedWrappedKey } from '../../models/dm-message';
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

  const conversation = await conversationRepo.getOrCreate({
    conversationId,
    activeCryptoProfile,
    initiatedBy: identity._id,
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
  if (!sanitizedToId.value || !isValidObjectId(sanitizedToId.value)) {
    return errors.badRequest('Invalid recipient identity ID.');
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
    conversation = await conversationRepo.getOrCreate({
      conversationId,
      activeCryptoProfile: cryptoProfile,
      initiatedBy: identity._id,
    });
  }

  let expiresAt: Date | undefined;
  if (expiresInSeconds) {
    expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  }

  const message = await messageRepo.createMessage({
    conversationId,
    toIdentityId: toIdentityObjectId,
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

  return success(
    { message: toPublicDmMessage(message) },
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
