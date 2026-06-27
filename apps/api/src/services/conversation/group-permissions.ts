/**
 * Group admin checks (legacy `createdBy` fallback when `admins` is empty).
 *
 * @module services/conversation/group-permissions
 */

import { ObjectId } from 'mongodb';
import type { ConversationDocument } from '../../models/conversation';

/**
 * Check whether an identity has admin privileges on a conversation.
 * Falls back to createdBy for legacy conversations without an admins array.
 */
export function isGroupAdmin(
  conversation: ConversationDocument,
  identityId: ObjectId
): boolean {
  if (conversation.admins?.length) {
    return conversation.admins.some((a) => a.equals(identityId));
  }
  return conversation.createdBy.equals(identityId);
}

/**
 * Whether this identity may add or remove pinned messages.
 * DMs: any participant. Groups: admins only (see {@link isGroupAdmin}).
 */
export function canManageConversationPins(
  conversation: ConversationDocument,
  identityId: ObjectId
): boolean {
  if (!conversation.participants.some((p) => p.equals(identityId))) {
    return false;
  }
  if (conversation.type === 'dm') {
    return true;
  }
  return isGroupAdmin(conversation, identityId);
}
