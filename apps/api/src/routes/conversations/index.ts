/**
 * Conversation routes module.
 *
 * Provides endpoints for DM and group conversations, messaging,
 * group management, and group invites.
 * All endpoints require an authenticated identity session.
 *
 * @module routes/conversations
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import {
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
} from '../../services/identity.service';
import {
  createConversation,
  getConversation,
  listConversations,
  sendMessage,
  getMessages,
  addGroupMember,
  removeGroupMember,
  leaveConversation,
  updateGroupName,
  acceptGroupInvite,
  declineGroupInvite,
  listGroupInvites,
} from '../../services/conversation.service';
import { z } from '@adieuu/shared/schemas';
import { isValidObjectId } from '../../utils';
import type { PublicMessage } from '../../models/message';

const router = new Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireIdentity(request: Request) {
  const sessionId = getIdentitySessionIdFromRequest(request);
  if (!sessionId) return null;
  return await getIdentityFromSession(sessionId);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateConversationSchema = z.object({
  type: z.enum(['dm', 'group']),
  participants: z.array(z.string().length(24)).min(1).max(24),
  encryptedName: z.string().max(500).optional(),
  nameNonce: z.string().max(100).optional(),
});

const SendMessageSchema = z.object({
  ciphertext: z.string().min(1).max(1_000_000),
  nonce: z.string().min(1).max(100),
  wrappedKeys: z.array(z.object({
    identityId: z.string().length(24),
    ephemeralPublicKey: z.string().min(1).max(200),
    kemCiphertext: z.string().min(1).max(3000),
    wrappedSessionKey: z.string().min(1).max(500),
    wrappingNonce: z.string().min(1).max(100),
    preKeyType: z.enum(['static', 'spk', 'otpk']),
    signedPreKeyId: z.string().uuid().optional(),
    oneTimePreKeyId: z.string().uuid().optional(),
    spkKemCiphertext: z.string().max(3000).optional(),
    otpkKemCiphertext: z.string().max(3000).optional(),
  })).min(1).max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientMessageId: z.string().uuid(),
  expiresInSeconds: z.number().int().min(30).max(604800).optional(),
});

const AddMemberSchema = z.object({
  identityId: z.string().length(24),
});

const UpdateNameSchema = z.object({
  encryptedName: z.string().min(1).max(500),
  nameNonce: z.string().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Conversation routes
// ---------------------------------------------------------------------------

/**
 * POST /conversations - Create a DM or group conversation
 */
router.post('/conversations', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const parseResult = CreateConversationSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const { type, participants, encryptedName, nameNonce } = parseResult.data;

  for (const id of participants) {
    const sanitized = sanitizeString(id, 'general');
    if (!sanitized.value || !isValidObjectId(sanitized.value)) {
      return errors.badRequest('Invalid participant ID.');
    }
  }

  const result = await createConversation(
    identity._id,
    type,
    participants,
    encryptedName,
    nameNonce
  );

  if (!result.success) {
    switch (result.errorCode) {
      case 'NOT_FRIENDS':
        return errors.badRequest(result.error ?? 'Not friends.');
      case 'BLOCKED':
        return errors.badRequest(result.error ?? 'Cannot message this identity.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound(result.error ?? 'Identity not found.');
      case 'TOO_MANY_PARTICIPANTS':
        return errors.badRequest(result.error ?? 'Too many participants.');
      case 'CANNOT_MESSAGE_SELF':
        return errors.badRequest(result.error ?? 'Cannot message yourself.');
      case 'INVALID_TYPE':
        return errors.badRequest(result.error ?? 'Invalid conversation type.');
      default:
        return errors.badRequest(result.error ?? 'Failed to create conversation.');
    }
  }

  return success(result.conversation, 'Conversation created.');
});

/**
 * GET /conversations - List conversations for authenticated identity
 */
router.get('/conversations', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitized = sanitizeString(cursor, 'general');
    if (sanitized.value && isValidObjectId(sanitized.value)) {
      validCursor = sanitized.value;
    }
  }

  const result = await listConversations(identity._id, limit, validCursor);

  return success({
    conversations: result.conversations,
    cursor: result.cursor,
  });
});

/**
 * GET /conversations/:id - Get a single conversation
 */
router.get('/conversations/:id', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const result = await getConversation(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to get conversation.');
  }

  return success(result.conversation);
});

/**
 * PATCH /conversations/:id - Update group name (creator only)
 */
router.patch('/conversations/:id', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = UpdateNameSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const result = await updateGroupName(
    sanitized.value,
    identity._id,
    parseResult.data.encryptedName,
    parseResult.data.nameNonce
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_CREATOR') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to update group name.');
  }

  return success(result.conversation, 'Group name updated.');
});

// ---------------------------------------------------------------------------
// Message routes
// ---------------------------------------------------------------------------

/**
 * POST /conversations/:id/messages - Send an encrypted message
 */
router.post('/conversations/:id/messages', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = SendMessageSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const { expiresInSeconds, ...messageInput } = parseResult.data;

  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : undefined;

  const result = await sendMessage(sanitized.value, identity._id, {
    ...messageInput,
    expiresAt,
  });

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to send message.');
  }

  return success(result.message, 'Message sent.');
});

/**
 * GET /conversations/:id/messages - Get messages (paginated)
 */
router.get('/conversations/:id/messages', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getMessages(sanitized.value, identity._id, limit, validCursor);

  if ('errorCode' in result) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to get messages.');
  }

  const { messages, cursor: nextCursor } = result as { messages: PublicMessage[]; cursor: string | null };

  return success({
    messages,
    cursor: nextCursor,
  });
});

// ---------------------------------------------------------------------------
// Group management routes
// ---------------------------------------------------------------------------

/**
 * POST /conversations/:id/members - Add a member to a group (creator only)
 */
router.post('/conversations/:id/members', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = AddMemberSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const memberSanitized = sanitizeString(parseResult.data.identityId, 'general');
  if (!memberSanitized.value || !isValidObjectId(memberSanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await addGroupMember(sanitized.value, identity._id, memberSanitized.value);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CONVERSATION_NOT_FOUND':
        return errors.notFound('Group conversation not found.');
      case 'NOT_CREATOR':
        return ctx.errors.unauthorized();
      case 'NOT_FRIENDS':
        return errors.badRequest('You can only add friends.');
      case 'BLOCKED':
        return errors.badRequest('Cannot add this identity.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound('Identity not found.');
      case 'ALREADY_MEMBER':
        return errors.badRequest('Already a member.');
      case 'TOO_MANY_PARTICIPANTS':
        return errors.badRequest(result.error ?? 'Group is full.');
      case 'INVITE_EXISTS':
        return errors.badRequest('Invite already pending.');
      default:
        return errors.badRequest(result.error ?? 'Failed to add member.');
    }
  }

  if ('invite' in result && result.invite) {
    return success(result.invite, 'Group invite sent.');
  }

  return success(
    'conversation' in result ? result.conversation : undefined,
    'Member added.'
  );
});

/**
 * DELETE /conversations/:id/members/:identityId - Remove a member (creator only)
 */
router.delete('/conversations/:id/members/:identityId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, identityId } = ctx.params;

  const sanitizedConv = sanitizeString(id ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedMember = sanitizeString(identityId ?? '', 'general');
  if (!sanitizedMember.value || !isValidObjectId(sanitizedMember.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await removeGroupMember(sanitizedConv.value, identity._id, sanitizedMember.value);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Group conversation not found.');
    if (result.errorCode === 'NOT_CREATOR') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_PARTICIPANT') return errors.notFound('Not a member.');
    return errors.badRequest(result.error ?? 'Failed to remove member.');
  }

  return success(result.conversation, 'Member removed.');
});

/**
 * DELETE /conversations/:id/leave - Leave a group conversation
 */
router.delete('/conversations/:id/leave', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const result = await leaveConversation(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Group conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return errors.badRequest('Not a participant.');
    return errors.badRequest(result.error ?? 'Failed to leave conversation.');
  }

  return success(undefined, 'Left conversation.');
});

// ---------------------------------------------------------------------------
// Group invite routes
// ---------------------------------------------------------------------------

/**
 * GET /conversations/invites - List pending group invites
 */
router.get('/conversations/invites', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitized = sanitizeString(cursor, 'general');
    if (sanitized.value && isValidObjectId(sanitized.value)) {
      validCursor = sanitized.value;
    }
  }

  const result = await listGroupInvites(identity._id, limit, validCursor);

  return success({
    invites: result.invites,
    cursor: result.cursor,
  });
});

/**
 * POST /conversations/invites/:id/accept - Accept a group invite
 */
router.post('/conversations/invites/:id/accept', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid invite ID.');
  }

  const result = await acceptGroupInvite(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') return errors.notFound('Invite not found.');
    if (result.errorCode === 'NOT_AUTHORIZED') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to accept invite.');
  }

  return success(result.invite, 'Invite accepted.');
});

/**
 * POST /conversations/invites/:id/decline - Decline a group invite
 */
router.post('/conversations/invites/:id/decline', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid invite ID.');
  }

  const result = await declineGroupInvite(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') return errors.notFound('Invite not found.');
    if (result.errorCode === 'NOT_AUTHORIZED') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to decline invite.');
  }

  return success(result.invite, 'Invite declined.');
});

export const conversationRoutes = router;
