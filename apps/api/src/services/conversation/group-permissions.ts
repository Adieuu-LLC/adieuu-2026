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
