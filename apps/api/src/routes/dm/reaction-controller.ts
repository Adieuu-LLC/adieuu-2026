/**
 * DM Reaction Controller Module
 *
 * Contains the business logic for DM reaction endpoints.
 * Reactions are E2E encrypted mini-messages -- the server only handles ciphertext.
 *
 * @module routes/dm/reaction-controller
 */

import { ObjectId } from 'mongodb';
import { success, errors } from '../../utils/response';
import { RouteContext } from '../../router';
import { getIdentityFromSession, getIdentitySessionIdFromRequest, publishReactionAdded, publishReactionRemoved } from '../../services';
import { getDmReactionRepository } from '../../repositories/dm-reaction.repository';
import { getDmMessageRepository } from '../../repositories/dm-message.repository';
import {
  isValidObjectId,
  sanitizeString,
  validateConversationId,
} from '../../utils';
import { toPublicDmReaction } from '../../models/dm-reaction';
import type { SerializedWrappedKey } from '../../models/dm-message';
import { z } from '@adieuu/shared/schemas';

/**
 * Schema for wrapped key validation (shared with message controller).
 */
const WrappedKeySchema = z.object({
  identityId: z.string().length(24),
  deviceId: z.string().min(1),
  ephemeralPublicKey: z.string().min(1),
  kemCiphertext: z.string().min(1),
  wrappedSessionKey: z.string().min(1),
  wrappingNonce: z.string().min(1),
  preKeyType: z.enum(['otpk', 'spk', 'static']),
  oneTimePreKeyId: z.string().uuid().optional(),
  signedPreKeyId: z.string().uuid().optional(),
  oneTimeKemCiphertext: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.preKeyType === 'otpk') {
    if (!value.oneTimePreKeyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oneTimePreKeyId'],
        message: 'oneTimePreKeyId is required when preKeyType is otpk',
      });
    }
    if (!value.signedPreKeyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signedPreKeyId'],
        message: 'signedPreKeyId is required when preKeyType is otpk',
      });
    }
    if (!value.oneTimeKemCiphertext) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oneTimeKemCiphertext'],
        message: 'oneTimeKemCiphertext is required when preKeyType is otpk',
      });
    }
  }
  if (value.preKeyType === 'spk' && !value.signedPreKeyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signedPreKeyId'],
      message: 'signedPreKeyId is required when preKeyType is spk',
    });
  }
});

/**
 * Schema for adding a reaction.
 */
const AddReactionSchema = z.object({
  conversationId: z.string().length(64),
  toIdentityId: z.string().length(24),
  ciphertext: z.string().min(1).max(4096),
  nonce: z.string().min(1),
  wrappedKeys: z.array(WrappedKeySchema).min(1),
  signature: z.string().min(1),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientReactionId: z.string().min(1).max(64),
});

/**
 * POST /dm/messages/:messageId/reactions - Add an encrypted reaction
 *
 * Stores an encrypted reaction to a message. The server validates structure
 * but cannot read the reaction content (E2E encrypted).
 */
export async function addReactionCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  if (!identity.signingPublicKey) {
    return errors.badRequest('You must set up E2E encryption before reacting.');
  }

  const { messageId } = ctx.params;

  if (!messageId || !isValidObjectId(messageId)) {
    return errors.badRequest('Invalid message ID.');
  }

  const parseResult = AddReactionSchema.safeParse(ctx.body);
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
    clientReactionId,
  } = parseResult.data;

  const sanitizedToId = sanitizeString(toIdentityId, 'general');
  if (!sanitizedToId.value || !isValidObjectId(sanitizedToId.value)) {
    return errors.badRequest('Invalid recipient identity ID.');
  }

  if (!validateConversationId(conversationId, identity._id.toHexString(), sanitizedToId.value)) {
    return errors.badRequest('Invalid conversation ID for these participants.');
  }

  const messageRepo = getDmMessageRepository();
  const message = await messageRepo.findById(new ObjectId(messageId));
  if (!message) {
    return errors.notFound('Message not found.');
  }

  if (message.conversationId !== conversationId) {
    return errors.badRequest('Message does not belong to this conversation.');
  }

  const reactionRepo = getDmReactionRepository();

  const existingReaction = await reactionRepo.findByClientReactionId(conversationId, clientReactionId);
  if (existingReaction) {
    return success(
      { reaction: toPublicDmReaction(existingReaction) },
      'Reaction already added (deduplicated).',
      200
    );
  }

  const MAX_REACTIONS_PER_IDENTITY = 10;
  const MAX_REACTIONS_PER_MESSAGE = 20;

  const identityReactionCount = await reactionRepo.countReactionsOnMessageByRecipient(
    new ObjectId(messageId),
    new ObjectId(sanitizedToId.value)
  );
  if (identityReactionCount >= MAX_REACTIONS_PER_IDENTITY) {
    return errors.badRequest('Maximum reactions per participant reached for this message.');
  }

  const totalReactionCount = await reactionRepo.countReactionsOnMessage(
    new ObjectId(messageId)
  );
  if (totalReactionCount >= MAX_REACTIONS_PER_MESSAGE) {
    return errors.badRequest('Maximum total reactions reached for this message.');
  }

  const reaction = await reactionRepo.createReaction({
    messageId: new ObjectId(messageId),
    conversationId,
    toIdentityId: new ObjectId(sanitizedToId.value),
    ciphertext,
    nonce,
    wrappedKeys: wrappedKeys as SerializedWrappedKey[],
    signature,
    cryptoProfile,
    clientReactionId,
  });

  const publicReaction = toPublicDmReaction(reaction);

  publishReactionAdded(sanitizedToId.value, publicReaction).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to publish reaction event:', err);
  });

  return success(
    { reaction: publicReaction },
    'Reaction added.',
    201
  );
}

/**
 * DELETE /dm/reactions/:reactionId - Remove a reaction
 *
 * Removes a reaction. The reactor is verified by checking the reaction
 * signature against the requester's signing key.
 */
export async function removeReactionCtrl(ctx: RouteContext): Promise<Response> {
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

  const { reactionId } = ctx.params;

  if (!reactionId || !isValidObjectId(reactionId)) {
    return errors.badRequest('Invalid reaction ID.');
  }

  const reactionRepo = getDmReactionRepository();
  const reaction = await reactionRepo.findById(new ObjectId(reactionId));

  if (!reaction) {
    return errors.notFound('Reaction not found.');
  }

  const { verifyDmMessageSignature } = await import('../../utils/crypto');

  const isValidSignature = verifyDmMessageSignature(
    identity.signingPublicKey,
    reaction.ciphertext,
    reaction.nonce,
    reaction.wrappedKeys,
    reaction.signature
  );

  if (!isValidSignature) {
    return errors.forbidden('You can only remove your own reactions.');
  }

  const deleted = await reactionRepo.deleteReaction(new ObjectId(reactionId));

  if (!deleted) {
    return errors.internal('Failed to remove reaction.');
  }

  publishReactionRemoved(
    reaction.toIdentityId.toHexString(),
    reactionId,
    reaction.messageId.toHexString(),
    reaction.conversationId
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to publish reaction removal event:', err);
  });

  return success({ deleted: true }, 'Reaction removed.');
}

/**
 * GET /dm/conversations/:conversationId/reactions - Get reactions for messages
 *
 * Returns encrypted reactions for the specified message IDs in a conversation.
 */
export async function getReactionsCtrl(ctx: RouteContext): Promise<Response> {
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

  const messageIdParams = ctx.query.getAll('messageIds');
  if (messageIdParams.length === 0) {
    return success({ reactions: [] });
  }

  const messageIds: ObjectId[] = [];
  for (const id of messageIdParams) {
    if (!isValidObjectId(id)) {
      return errors.badRequest(`Invalid message ID: ${id}`);
    }
    messageIds.push(new ObjectId(id));
  }

  const messageRepo = getDmMessageRepository();
  const firstMessageId = messageIds[0];
  if (!firstMessageId) {
    return success({ reactions: [] });
  }
  const sampleMessage = await messageRepo.findById(firstMessageId);
  if (!sampleMessage) {
    return success({ reactions: [] });
  }

  if (sampleMessage.conversationId !== sanitizedConvId.value) {
    return errors.forbidden('Access denied.');
  }

  const isRecipient = sampleMessage.toIdentityId.equals(identity._id);
  const isParticipant = isRecipient || validateConversationId(
    sanitizedConvId.value,
    identity._id.toHexString(),
    sampleMessage.toIdentityId.toHexString()
  );

  if (!isParticipant) {
    return errors.forbidden('Access denied.');
  }

  const reactionRepo = getDmReactionRepository();
  const reactions = await reactionRepo.getReactionsForMessages(
    sanitizedConvId.value,
    messageIds
  );

  const publicReactions = reactions.map(toPublicDmReaction);

  return success({ reactions: publicReactions });
}
