/**
 * Conversation preferences model
 * Per-identity preferences for individual conversations (archive, favorites).
 *
 * These are identity-scoped: each identity has their own archive/favorite
 * state for each conversation they participate in.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export interface ConversationPreferencesDocument extends BaseDocument {
  /** The identity these preferences belong to */
  identityId: ObjectId;

  /** The conversation these preferences apply to */
  conversationId: ObjectId;

  /** Whether the conversation is archived (hidden from default list) */
  archived: boolean;

  /**
   * When true, new messages do NOT un-archive the conversation.
   * Only respected for group conversations; DMs always un-archive on new message.
   */
  keepArchived: boolean;

  /** Whether the conversation is pinned as a favourite */
  favorited: boolean;

  /**
   * E2E-encrypted read state blob (base64). Contains the lastReadMessageId
   * encrypted with deriveReadStateKey(conversationId) so the server cannot
   * infer read timing from ObjectId timestamps.
   */
  encryptedReadState?: string;
}

export interface PublicConversationPreferences {
  id: string;
  conversationId: string;
  archived: boolean;
  keepArchived: boolean;
  favorited: boolean;
  encryptedReadState?: string;
}

export function toPublicConversationPreferences(
  doc: ConversationPreferencesDocument,
): PublicConversationPreferences {
  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId.toHexString(),
    archived: doc.archived,
    keepArchived: doc.keepArchived,
    favorited: doc.favorited,
    ...(doc.encryptedReadState ? { encryptedReadState: doc.encryptedReadState } : {}),
  };
}
