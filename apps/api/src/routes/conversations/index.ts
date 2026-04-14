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
  getMessagesAround,
  deleteMessageForSelf,
  deleteMessageForEveryone,
  addGroupMember,
  removeGroupMember,
  leaveConversation,
  updateGroupName,
  acceptGroupInvite,
  declineGroupInvite,
  listGroupInvites,
  getGroupInvitePreview,
  promoteToAdmin,
  terminateGroup,
  getFormerMembers,
  updateMemberSettings,
  updateGifsDisabled,
  listPendingInvitesForConversation,
  revokeGroupInvite,
  pinMessage,
  unpinMessage,
  listPinnedMessagesPage,
} from '../../services/conversation.service';
import { getConversationPreferencesRepository } from '../../repositories/conversation-preferences.repository';
import { toPublicConversationPreferences } from '../../models/conversation-preferences';
import { ObjectId } from 'mongodb';
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
  /** When true (DM only), create a new thread even if one already exists with this peer. */
  forceNew: z.boolean().optional(),
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
    routingTag: z.string().max(100).optional(),
  })).min(1).max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientMessageId: z.string().uuid(),
  e2eMediaIds: z.array(z.string().min(1).max(100)).max(10).optional(),
  expiresInSeconds: z.number().int().min(30).max(1209600).optional(),
  replyToMessageId: z.string().length(24).optional(),
  mentionedIdentityIds: z.array(z.string().length(24)).max(200).optional(),
});

const AddMemberSchema = z.object({
  identityId: z.string().length(24),
});

const PromoteAdminSchema = z.object({
  identityId: z.string().length(24),
});

const LeaveSchema = z.object({
  transferAdminTo: z.string().length(24).optional(),
  transferStrategy: z.enum(['oldest', 'most_active']).optional(),
}).optional();

const UpdateNameSchema = z.object({
  encryptedName: z.string().min(1).max(500),
  nameNonce: z.string().min(1).max(100),
});

const UpdateMemberSettingsSchema = z.object({
  encryptedMemberSettings: z.string().min(1).max(10_000),
  memberSettingsNonce: z.string().min(1).max(100),
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

  const { type, participants, encryptedName, nameNonce, forceNew } = parseResult.data;

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
    nameNonce,
    forceNew
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

// ---------------------------------------------------------------------------
// Conversation preferences routes
// Registered before /conversations/:id to prevent the parameterised route
// from swallowing literal "/conversations/preferences" requests.
// ---------------------------------------------------------------------------

const UpdatePreferencesSchema = z.object({
  archived: z.boolean().optional(),
  keepArchived: z.boolean().optional(),
  favorited: z.boolean().optional(),
});

/**
 * GET /conversations/preferences - List all conversation preferences for the authenticated identity
 */
router.get('/conversations/preferences', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const repo = getConversationPreferencesRepository();
  const docs = await repo.findForIdentity(identity._id);

  return success(docs.map(toPublicConversationPreferences));
});

/**
 * PATCH /conversations/:id/preferences - Upsert conversation preferences
 */
router.patch('/conversations/preferences/:id', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = UpdatePreferencesSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const patch = parseResult.data;
  if (
    patch.archived === undefined &&
    patch.keepArchived === undefined &&
    patch.favorited === undefined
  ) {
    return errors.badRequest('At least one preference field is required.');
  }

  const repo = getConversationPreferencesRepository();
  const doc = await repo.upsert(
    identity._id,
    new ObjectId(sanitized.value),
    patch,
  );

  return success(toPublicConversationPreferences(doc), 'Preferences updated.');
});

// ---------------------------------------------------------------------------
// Group invite routes
// Registered before /conversations/:id to prevent the parameterised route
// from swallowing literal "/conversations/invites" requests.
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
 * GET /conversations/invites/:id/preview - Preview group details for a pending invite
 */
router.get('/conversations/invites/:id/preview', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid invite ID.');
  }

  const result = await getGroupInvitePreview(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'INVITE_NOT_FOUND') return errors.notFound('Invite not found.');
    if (result.errorCode === 'NOT_AUTHORIZED') return ctx.errors.unauthorized();
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    return errors.badRequest(result.error ?? 'Failed to get invite preview.');
  }

  return success(result.preview);
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

// ---------------------------------------------------------------------------
// Single conversation routes (parameterised :id — must come after literal paths)
// ---------------------------------------------------------------------------

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
 * PATCH /conversations/:id - Update encrypted conversation topic or name
 * (group: admins; DM: any participant)
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
    if (result.errorCode === 'NOT_ADMIN' || result.errorCode === 'NOT_PARTICIPANT')
      return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to update conversation name.');
  }

  return success(result.conversation, 'Conversation updated.');
});

/**
 * PATCH /conversations/:id/member-settings - Update member nicknames/colours
 * DMs: any participant. Groups: admin only.
 */
router.patch('/conversations/:id/member-settings', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = UpdateMemberSettingsSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const result = await updateMemberSettings(
    sanitized.value,
    identity._id,
    parseResult.data.encryptedMemberSettings,
    parseResult.data.memberSettingsNonce
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to update member settings.');
  }

  return success(result.conversation, 'Member settings updated.');
});

// ---------------------------------------------------------------------------
// GIF settings
// ---------------------------------------------------------------------------

const UpdateGifsDisabledSchema = z.object({
  gifsDisabled: z.boolean(),
});

/**
 * PATCH /conversations/:id/gifs - Toggle GIFs for a conversation
 * Groups: admin only. DMs: either participant.
 */
router.patch('/conversations/:id/gifs', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = UpdateGifsDisabledSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const result = await updateGifsDisabled(
    sanitized.value,
    identity._id,
    parseResult.data.gifsDisabled
  );

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to update GIF settings.');
  }

  return success(result.conversation, 'GIF settings updated.');
});

const PinMessageBodySchema = z.object({
  messageId: z.string().length(24),
});

/**
 * POST /conversations/:id/pins — Pin a message (DM: either participant; group: admin).
 */
router.post('/conversations/:id/pins', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = PinMessageBodySchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const result = await pinMessage(sanitized.value, parseResult.data.messageId, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    if (result.errorCode === 'MESSAGE_NOT_FOUND') return errors.notFound('Message not found.');
    return errors.badRequest(result.error ?? 'Failed to pin message.');
  }

  return success(result.conversation, 'Message pinned.');
});

/**
 * DELETE /conversations/:id/pins/:messageId — Remove a pin.
 */
router.delete('/conversations/:id/pins/:messageId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, messageId } = ctx.params;
  const sanitizedConv = sanitizeString(id ?? '', 'general');
  const sanitizedMsg = sanitizeString(messageId ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }
  if (!sanitizedMsg.value || !isValidObjectId(sanitizedMsg.value)) {
    return errors.badRequest('Invalid message ID.');
  }

  const result = await unpinMessage(sanitizedConv.value, sanitizedMsg.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to unpin message.');
  }

  return success(result.conversation, 'Pin removed.');
});

/**
 * GET /conversations/:id/pinned-messages — Paginated ciphertext for pinned messages (any participant).
 */
router.get('/conversations/:id/pinned-messages', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const limitParam = ctx.query.get('limit');
  const cursorParam = ctx.query.get('cursor');
  let limit: number | undefined;
  if (limitParam) {
    const n = parseInt(limitParam, 10);
    if (!Number.isNaN(n)) limit = n;
  }
  const cursor = cursorParam?.trim() || undefined;

  const result = await listPinnedMessagesPage(sanitized.value, identity._id, { limit, cursor });

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to load pinned messages.');
  }

  return success({
    messages: result.messages ?? [],
    nextCursor: result.nextCursor ?? null,
  });
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

  const { expiresInSeconds, replyToMessageId, mentionedIdentityIds, ...messageInput } = parseResult.data;

  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : undefined;

  const result = await sendMessage(sanitized.value, identity._id, {
    ...messageInput,
    ...(replyToMessageId ? { replyToMessageId: new ObjectId(replyToMessageId) } : {}),
    expiresAt,
    mentionedIdentityIds,
  });

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'BLOCKED') return errors.forbidden('Cannot message this identity.');
    if (result.errorCode === 'INVALID_REPLY_TARGET') {
      return errors.badRequest(result.error ?? 'The message you are replying to was not found in this conversation.');
    }
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
  const cursorParam = ctx.query.get('cursor');
  const directionParam = ctx.query.get('direction');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursorParam) {
    const sanitizedCursor = sanitizeString(cursorParam, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const validDirection =
    directionParam === 'older' || directionParam === 'newer' ? directionParam : undefined;

  const result = await getMessages(sanitized.value, identity._id, limit, validCursor, validDirection);

  if ('errorCode' in result) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'INVALID_MESSAGE_QUERY') {
      return errors.badRequest(result.error ?? 'Invalid message query.');
    }
    return errors.badRequest(result.error ?? 'Failed to get messages.');
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

  return success({
    messages,
    cursor: nextOlderCursor,
    pageOldestId,
    pageNewestId,
    hasNewerPages,
  });
});

/**
 * GET /conversations/:id/messages/around/:messageId — window around a message (reply jump / deep link).
 */
router.get('/conversations/:id/messages/around/:messageId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, messageId } = ctx.params;
  const sanitizedConv = sanitizeString(id ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }
  const sanitizedMsg = sanitizeString(messageId ?? '', 'general');
  if (!sanitizedMsg.value || !isValidObjectId(sanitizedMsg.value)) {
    return errors.badRequest('Invalid message ID.');
  }

  const beforeParam = ctx.query.get('before');
  const afterParam = ctx.query.get('after');
  let before = beforeParam ? parseInt(beforeParam, 10) : 15;
  let after = afterParam ? parseInt(afterParam, 10) : 15;
  if (Number.isNaN(before) || before < 1) before = 15;
  if (Number.isNaN(after) || after < 1) after = 15;
  if (before > 100) before = 100;
  if (after > 100) after = 100;

  const result = await getMessagesAround(
    sanitizedConv.value,
    identity._id,
    sanitizedMsg.value,
    before,
    after,
  );

  if (!('messages' in result)) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'MESSAGE_NOT_FOUND') return errors.notFound('Message not found.');
    return errors.badRequest(result.error ?? 'Failed to get messages.');
  }

  const {
    messages,
    cursor: nextOlderCursor,
    pageOldestId,
    pageNewestId,
    hasNewerPages,
  } = result;

  return success({
    messages,
    cursor: nextOlderCursor,
    pageOldestId,
    pageNewestId,
    hasNewerPages,
  });
});

/**
 * DELETE /conversations/:id/messages/:messageId - Delete a message for self
 */
router.delete('/conversations/:id/messages/:messageId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, messageId } = ctx.params;

  const sanitizedConv = sanitizeString(id ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedMsg = sanitizeString(messageId ?? '', 'general');
  if (!sanitizedMsg.value || !isValidObjectId(sanitizedMsg.value)) {
    return errors.badRequest('Invalid message ID.');
  }

  const result = await deleteMessageForSelf(sanitizedConv.value, sanitizedMsg.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'MESSAGE_NOT_FOUND') return errors.notFound('Message not found.');
    return errors.badRequest(result.error ?? 'Failed to delete message.');
  }

  return success(undefined, 'Message deleted for you.');
});

/**
 * DELETE /conversations/:id/messages/:messageId/everyone - Delete a message for everyone (sender only)
 */
router.delete('/conversations/:id/messages/:messageId/everyone', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, messageId } = ctx.params;

  const sanitizedConv = sanitizeString(id ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedMsg = sanitizeString(messageId ?? '', 'general');
  if (!sanitizedMsg.value || !isValidObjectId(sanitizedMsg.value)) {
    return errors.badRequest('Invalid message ID.');
  }

  const result = await deleteMessageForEveryone(sanitizedConv.value, sanitizedMsg.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    if (result.errorCode === 'MESSAGE_NOT_FOUND') return errors.notFound('Message not found.');
    if (result.errorCode === 'NOT_SENDER') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to delete message.');
  }

  return success(undefined, 'Message deleted for everyone.');
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
 * GET /conversations/:id/former-members - List former members who left (admin only)
 */
router.get('/conversations/:id/former-members', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const result = await getFormerMembers(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_AUTHORIZED') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_GROUP') return errors.badRequest('Not a group conversation.');
    return errors.badRequest(result.error ?? 'Failed to get former members.');
  }

  return success(result.formerMembers);
});

/**
 * GET /conversations/:id/pending-invites - Pending group invites for this conversation
 */
router.get('/conversations/:id/pending-invites', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const result = await listPendingInvitesForConversation(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return ctx.errors.unauthorized();
    return errors.badRequest(result.error ?? 'Failed to list pending invites.');
  }

  return success({ invites: result.invites ?? [] });
});

/**
 * DELETE /conversations/:id/invites/:inviteId - Revoke a pending group invite (admin only)
 */
router.delete('/conversations/:id/invites/:inviteId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, inviteId } = ctx.params;
  const sanitizedConv = sanitizeString(id ?? '', 'general');
  const sanitizedInvite = sanitizeString(inviteId ?? '', 'general');
  if (!sanitizedConv.value || !isValidObjectId(sanitizedConv.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }
  if (!sanitizedInvite.value || !isValidObjectId(sanitizedInvite.value)) {
    return errors.badRequest('Invalid invite ID.');
  }

  const result = await revokeGroupInvite(sanitizedConv.value, sanitizedInvite.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    if (result.errorCode === 'INVITE_NOT_FOUND') return errors.notFound('Invite not found.');
    if (result.errorCode === 'INVITE_NOT_PENDING') return errors.badRequest('Invite is not pending.');
    return errors.badRequest(result.error ?? 'Failed to revoke invite.');
  }

  return success(result.invite, 'Invite revoked.');
});

/**
 * POST /conversations/:id/leave - Leave a group conversation
 */
router.post('/conversations/:id/leave', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = LeaveSchema.safeParse(ctx.body);
  const options = parseResult.success ? parseResult.data : undefined;

  const result = await leaveConversation(sanitized.value, identity._id, options ?? undefined);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Group conversation not found.');
    if (result.errorCode === 'NOT_PARTICIPANT') return errors.badRequest('Not a participant.');
    return errors.badRequest(result.error ?? 'Failed to leave conversation.');
  }

  return success(undefined, 'Left conversation.');
});

/**
 * POST /conversations/:id/admins - Promote a member to admin
 */
router.post('/conversations/:id/admins', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const parseResult = PromoteAdminSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const memberSanitized = sanitizeString(parseResult.data.identityId, 'general');
  if (!memberSanitized.value || !isValidObjectId(memberSanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await promoteToAdmin(sanitized.value, identity._id, memberSanitized.value);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Group conversation not found.');
    if (result.errorCode === 'NOT_ADMIN') return ctx.errors.unauthorized();
    if (result.errorCode === 'NOT_PARTICIPANT') return errors.badRequest('Not a group member.');
    if (result.errorCode === 'ALREADY_ADMIN') return errors.badRequest('Already an admin.');
    return errors.badRequest(result.error ?? 'Failed to promote to admin.');
  }

  return success(result.conversation, 'Member promoted to admin.');
});

/**
 * DELETE /conversations/:id - Terminate (delete) a group (admin) or topical DM (either participant)
 */
router.delete('/conversations/:id', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const result = await terminateGroup(sanitized.value, identity._id);

  if (!result.success) {
    if (result.errorCode === 'CONVERSATION_NOT_FOUND') return errors.notFound('Conversation not found.');
    if (result.errorCode === 'NOT_ADMIN' || result.errorCode === 'NOT_PARTICIPANT')
      return ctx.errors.unauthorized();
    if (result.errorCode === 'INVALID_TYPE') return errors.badRequest(result.error ?? 'Cannot delete this conversation.');
    return errors.badRequest(result.error ?? 'Failed to delete conversation.');
  }

  return success(undefined, 'Conversation deleted.');
});

// ---------------------------------------------------------------------------
// Reaction routes
// ---------------------------------------------------------------------------

import {
  addReaction,
  removeReaction,
  getReactionsForMessages,
} from '../../services/reaction.service';

const SendReactionSchema = z.object({
  ciphertext: z.string().min(1).max(50_000),
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
    routingTag: z.string().max(100).optional(),
  })).min(1).max(200),
  signature: z.string().min(1).max(500),
  cryptoProfile: z.enum(['default', 'cnsa2']),
  clientReactionId: z.string().uuid(),
});

/**
 * POST /conversations/:id/messages/:messageId/reactions - Add a reaction
 */
router.post('/conversations/:id/messages/:messageId/reactions', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, messageId } = ctx.params;

  const sanitizedConvId = sanitizeString(id ?? '', 'general');
  if (!sanitizedConvId.value || !isValidObjectId(sanitizedConvId.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedMsgId = sanitizeString(messageId ?? '', 'general');
  if (!sanitizedMsgId.value || !isValidObjectId(sanitizedMsgId.value)) {
    return errors.badRequest('Invalid message ID.');
  }

  const parseResult = SendReactionSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const result = await addReaction(
    identity._id.toHexString(),
    sanitizedConvId.value,
    sanitizedMsgId.value,
    parseResult.data
  );

  if (!result.success) {
    return errors.badRequest(result.error ?? 'Failed to add reaction.');
  }

  return success(result.reaction, 'Reaction added.');
});

/**
 * DELETE /conversations/:id/reactions/:reactionId - Remove a reaction
 */
router.delete('/conversations/:id/reactions/:reactionId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id, reactionId } = ctx.params;

  const sanitizedConvId = sanitizeString(id ?? '', 'general');
  if (!sanitizedConvId.value || !isValidObjectId(sanitizedConvId.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const sanitizedReactionId = sanitizeString(reactionId ?? '', 'general');
  if (!sanitizedReactionId.value || !isValidObjectId(sanitizedReactionId.value)) {
    return errors.badRequest('Invalid reaction ID.');
  }

  const result = await removeReaction(
    identity._id.toHexString(),
    sanitizedConvId.value,
    sanitizedReactionId.value
  );

  if (!result.success) {
    return errors.badRequest(result.error ?? 'Failed to remove reaction.');
  }

  return success(undefined, 'Reaction removed.');
});

/**
 * GET /conversations/:id/reactions - Batch-fetch reactions for messages
 */
router.get('/conversations/:id/reactions', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;

  const sanitizedConvId = sanitizeString(id ?? '', 'general');
  if (!sanitizedConvId.value || !isValidObjectId(sanitizedConvId.value)) {
    return errors.badRequest('Invalid conversation ID.');
  }

  const messageIdsParam = ctx.query.get('messageIds');
  if (!messageIdsParam) {
    return errors.badRequest('messageIds query parameter is required.');
  }

  const messageIds = messageIdsParam.split(',').filter(Boolean);
  if (messageIds.length === 0 || messageIds.length > 100) {
    return errors.badRequest('Provide between 1 and 100 message IDs.');
  }

  for (const msgId of messageIds) {
    if (!isValidObjectId(msgId)) {
      return errors.badRequest('Invalid message ID in list.');
    }
  }

  const result = await getReactionsForMessages(
    identity._id.toHexString(),
    sanitizedConvId.value,
    messageIds
  );

  if (!result.success) {
    return errors.badRequest(result.error ?? 'Failed to fetch reactions.');
  }

  return success({ reactions: result.reactions });
});

export const conversationRoutes = router;
