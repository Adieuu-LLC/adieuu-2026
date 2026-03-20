/**
 * DM Routes Module
 *
 * Provides endpoints for direct message conversations and encrypted messages.
 * All messages are E2E encrypted - server handles ciphertext only.
 *
 * Privacy notes:
 * - Conversation IDs are blinded (derived from participant IDs)
 * - Sender identity is not stored on messages (revealed after decryption)
 * - Only toIdentityId is stored for delivery/query purposes
 *
 * @module routes/dm
 */

import { Router } from '../../router';
import {
  getOrCreateConversationCtrl,
  sendMessageCtrl,
  getMessagesCtrl,
  getConversationCtrl,
  getConversationsCtrl,
  updateReadStateCtrl,
  deleteMessageForEveryoneCtrl,
  deleteMessageForSelfCtrl,
} from './controller';
import {
  addReactionCtrl,
  removeReactionCtrl,
  getReactionsCtrl,
} from './reaction-controller';

const router = new Router();

/**
 * GET /dm/conversations - List all conversations
 *
 * Returns all conversations where the identity has received messages.
 * Includes conversation metadata, read state, and last message timestamp.
 *
 * @route GET /api/dm/conversations
 *
 * @returns 200 OK with conversations array
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/dm/conversations', async (ctx) => {
  return await getConversationsCtrl(ctx);
});

/**
 * POST /dm/conversations - Get or create a conversation
 *
 * Creates a conversation with another identity if it doesn't exist,
 * or returns the existing conversation. The conversation ID is
 * deterministically derived from both participant identity IDs.
 *
 * @route POST /api/dm/conversations
 *
 * @requestBody
 * - `toIdentityId` (string, required): The other participant's identity ID
 *
 * @returns 200 OK with conversation info
 * @returns 400 Bad Request if validation fails or cannot create with self
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if messaging not allowed (future: identity settings)
 * @returns 404 Not Found if recipient identity doesn't exist
 */
router.post('/dm/conversations', async (ctx) => {
  return await getOrCreateConversationCtrl(ctx);
});

/**
 * GET /dm/conversations/:conversationId - Get conversation metadata
 *
 * Returns the conversation metadata including crypto profile.
 *
 * @route GET /api/dm/conversations/:conversationId
 *
 * @param conversationId (string, required): The blinded conversation ID (64 hex chars)
 *
 * @returns 200 OK with conversation info
 * @returns 400 Bad Request if conversation ID invalid
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if conversation doesn't exist
 */
router.get('/dm/conversations/:conversationId', async (ctx) => {
  return await getConversationCtrl(ctx);
});

/**
 * PUT /dm/conversations/:conversationId/read-state - Update read state
 *
 * Updates the encrypted read position for the current identity.
 * The server stores opaque ciphertext and cannot determine the actual read position.
 *
 * @route PUT /api/dm/conversations/:conversationId/read-state
 *
 * @param conversationId (string, required): The blinded conversation ID (64 hex chars)
 *
 * @requestBody
 * - `encryptedLastReadId` (string, required): Encrypted message ID (base64)
 *
 * @returns 200 OK with updated conversation
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if conversation doesn't exist
 */
router.put('/dm/conversations/:conversationId/read-state', async (ctx) => {
  return await updateReadStateCtrl(ctx);
});

/**
 * POST /dm/messages - Send an encrypted message
 *
 * Sends an E2E encrypted message in a conversation. The server
 * validates structure but cannot read the content.
 *
 * Deduplication: If a message with the same clientMessageId already
 * exists in the conversation, returns the existing message (idempotent).
 *
 * @route POST /api/dm/messages
 *
 * @requestBody
 * - `conversationId` (string, required): Blinded conversation ID (64 hex chars)
 * - `toIdentityId` (string, required): Recipient identity ID
 * - `ciphertext` (string, required): Encrypted message content (base64)
 * - `nonce` (string, required): Encryption nonce (base64)
 * - `wrappedKeys` (array, required): Wrapped session keys for each device
 * - `signature` (string, required): Ed25519 signature (base64)
 * - `cryptoProfile` (string, required): 'default' or 'cnsa2'
 * - `clientMessageId` (string, required): Client-generated unique ID for deduplication
 * - `expiresInSeconds` (number, optional): TTL in seconds
 * - `replyToId` (string, optional): Message ID being replied to
 * - `threadRootId` (string, optional): Thread root message ID
 *
 * @returns 201 Created with message info
 * @returns 200 OK if deduplicated (message already exists)
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if messaging not allowed
 * @returns 404 Not Found if recipient identity doesn't exist
 */
router.post('/dm/messages', async (ctx) => {
  return await sendMessageCtrl(ctx);
});

/**
 * GET /dm/conversations/:conversationId/messages - Get messages
 *
 * Returns paginated encrypted messages for a conversation.
 * Messages deleted for everyone or for the requesting identity are
 * returned as tombstones (id + deleted flag only).
 *
 * @route GET /api/dm/conversations/:conversationId/messages
 *
 * @param conversationId (string, required): The blinded conversation ID
 *
 * @queryParam limit (number, optional): Max messages to return (default: 50, max: 100)
 * @queryParam cursor (string, optional): Pagination cursor (message ID)
 * @queryParam direction (string, optional): 'older' (default) or 'newer'
 *
 * @returns 200 OK with messages array, cursor, and hasMore flag
 * @returns 400 Bad Request if conversation ID invalid
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/dm/conversations/:conversationId/messages', async (ctx) => {
  return await getMessagesCtrl(ctx);
});

/**
 * DELETE /dm/messages/:messageId - Delete message for everyone
 *
 * Deletes a message for all participants. Only the sender can do this.
 * Sender is verified by checking the message signature against the
 * requester's signing key.
 *
 * @route DELETE /api/dm/messages/:messageId
 *
 * @param messageId (string, required): The message ID to delete
 *
 * @returns 200 OK with deleted: true
 * @returns 400 Bad Request if message ID invalid
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if requester is not the sender
 * @returns 404 Not Found if message doesn't exist
 */
router.delete('/dm/messages/:messageId', async (ctx) => {
  return await deleteMessageForEveryoneCtrl(ctx);
});

/**
 * POST /dm/messages/:messageId/delete-for-self - Delete message for self only
 *
 * Deletes a message for the current identity only. Other participants
 * can still see the message.
 *
 * @route POST /api/dm/messages/:messageId/delete-for-self
 *
 * @param messageId (string, required): The message ID to delete
 *
 * @returns 200 OK with deleted: true
 * @returns 400 Bad Request if message ID invalid
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if message doesn't exist
 */
router.post('/dm/messages/:messageId/delete-for-self', async (ctx) => {
  return await deleteMessageForSelfCtrl(ctx);
});

/**
 * POST /dm/messages/:messageId/reactions - Add an encrypted reaction
 *
 * Adds an E2E encrypted reaction to a message. The server validates
 * structure but cannot read the reaction content (emoji + reactor identity).
 *
 * @route POST /api/dm/messages/:messageId/reactions
 *
 * @param messageId (string, required): The message ID to react to
 *
 * @requestBody
 * - `conversationId` (string, required): Blinded conversation ID (64 hex chars)
 * - `toIdentityId` (string, required): Other participant's identity ID
 * - `ciphertext` (string, required): Encrypted reaction content (base64)
 * - `nonce` (string, required): Encryption nonce (base64)
 * - `wrappedKeys` (array, required): Wrapped session keys for each device
 * - `signature` (string, required): Ed25519 signature (base64)
 * - `cryptoProfile` (string, required): 'default' or 'cnsa2'
 * - `clientReactionId` (string, required): Client-generated unique ID for deduplication
 *
 * @returns 201 Created with reaction info
 * @returns 200 OK if deduplicated
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if message doesn't exist
 */
router.post('/dm/messages/:messageId/reactions', async (ctx) => {
  return await addReactionCtrl(ctx);
});

/**
 * DELETE /dm/reactions/:reactionId - Remove a reaction
 *
 * Removes a reaction. Only the reactor can do this, verified via
 * signature check against the requester's signing key.
 *
 * @route DELETE /api/dm/reactions/:reactionId
 *
 * @param reactionId (string, required): The reaction ID to remove
 *
 * @returns 200 OK with deleted: true
 * @returns 400 Bad Request if reaction ID invalid
 * @returns 401 Unauthorized if not authenticated
 * @returns 403 Forbidden if requester is not the reactor
 * @returns 404 Not Found if reaction doesn't exist
 */
router.delete('/dm/reactions/:reactionId', async (ctx) => {
  return await removeReactionCtrl(ctx);
});

/**
 * GET /dm/conversations/:conversationId/reactions - Get reactions for messages
 *
 * Returns encrypted reactions for the specified message IDs.
 *
 * @route GET /api/dm/conversations/:conversationId/reactions
 *
 * @param conversationId (string, required): The blinded conversation ID
 *
 * @queryParam messageIds (string[], required): Message IDs to get reactions for
 *
 * @returns 200 OK with reactions array
 * @returns 400 Bad Request if parameters invalid
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/dm/conversations/:conversationId/reactions', async (ctx) => {
  return await getReactionsCtrl(ctx);
});

export const dmRoutes = router;
