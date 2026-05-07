/**
 * Conversation model
 * Represents a DM (1-1) or group (up to 25 members) conversation.
 *
 * PRIVACY NOTES:
 * - Participants are stored in plaintext (needed for lookups/routing)
 * - Conversation topic or name (groups and optionally DMs) is encrypted with a conversation-derived key
 * - Message content is always E2E encrypted (see message model)
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type ConversationType = 'dm' | 'group';

/** Klipy content safety filter levels (ascending strictness). */
export type GifContentFilter = 'off' | 'low' | 'medium' | 'high';

export const GIF_CONTENT_FILTER_VALUES: readonly GifContentFilter[] = [
  'off',
  'low',
  'medium',
  'high',
] as const;

export const MAX_GROUP_PARTICIPANTS = 25;
export const MAX_GROUP_NAME_LENGTH = 100;

/** One shared join instant for all initial participants (conversation creation). */
export function newParticipantJoinMapForIds(
  participantIds: ObjectId[],
  at: Date = new Date()
): Record<string, Date> {
  return Object.fromEntries(participantIds.map((p) => [p.toHexString(), at]));
}

/**
 * Conversation document stored in MongoDB
 */
export interface ConversationDocument extends BaseDocument {
  /** Whether this is a 1-1 DM or a group conversation */
  type: ConversationType;

  /** Identity IDs of all participants (plaintext for lookup efficiency) */
  participants: ObjectId[];

  /** Identity that created the conversation */
  createdBy: ObjectId;

  /** Identities with admin privileges (groups only). Defaults to [createdBy]. */
  admins: ObjectId[];

  /**
   * Encrypted conversation topic or name (groups; optional for DMs with a named thread).
   * Encrypted with HKDF(conversationId, "adieuu-conv-name-v1").
   * DMs without a stored name derive display from the other participant's profile.
   */
  encryptedName?: string;

  /** Nonce used for conversation topic/name encryption */
  nameNonce?: string;

  /**
   * Encrypted per-member customisations (nicknames/colours).
   * Encrypted with HKDF(conversationId, "adieuu-conv-member-settings-v1").
   * Plaintext shape: Record<identityId, { nickname?: string; color?: string }>
   */
  encryptedMemberSettings?: string;

  /** Nonce used for member settings encryption */
  memberSettingsNonce?: string;

  /** Timestamp of the most recent message (for sorting the conversation list) */
  lastMessageAt?: Date;

  /** ID of the most recent message */
  lastMessageId?: ObjectId;

  /** Whether GIF/sticker content is disabled for this conversation (admin toggle) */
  gifsDisabled?: boolean;

  /** Klipy content safety filter level for GIF/sticker searches (admin toggle, default off). */
  gifContentFilter?: GifContentFilter;

  /** Whether custom emoji usage is disabled for this conversation (admin toggle) */
  customEmojisDisabled?: boolean;

  /**
   * When true, members must not retain a persistent local plaintext message search
   * cache; clients only use decrypted material during active search, then wipe.
   */
  disallowPersistentMessageSearchCache?: boolean;

  /** When true, participants may opt out of moderation scanning per-send. */
  allowSkipModeration?: boolean;

  /**
   * Message ids pinned for this conversation (order: oldest pin first).
   * Managed by group admins or, in DMs, by either participant.
   */
  pinnedMessageIds?: ObjectId[];

  /**
   * When each identity became a member (thread creation, direct add, or invite accept).
   * Used server-side to omit pre-join ciphertext from paginated message lists. Omitted on legacy
   * rows until backfilled; absence means no time-based filter.
   */
  participantJoinedAtByIdentityId?: Record<string, Date>;
}

/**
 * Input for creating a new conversation
 */
export interface CreateConversationInput {
  type: ConversationType;
  participants: ObjectId[];
  createdBy: ObjectId;
  admins?: ObjectId[];
  encryptedName?: string;
  nameNonce?: string;
  /** When present, sets per-member join times at creation. */
  participantJoinedAtByIdentityId?: Record<string, Date>;
}

/**
 * Public conversation representation (safe to send to client)
 */
export interface PublicConversation {
  id: string;
  type: ConversationType;
  participants: string[];
  createdBy: string;
  admins: string[];
  encryptedName?: string;
  nameNonce?: string;
  encryptedMemberSettings?: string;
  memberSettingsNonce?: string;
  lastMessageAt?: string;
  lastMessageId?: string;
  gifsDisabled?: boolean;
  gifContentFilter?: GifContentFilter;
  customEmojisDisabled?: boolean;
  disallowPersistentMessageSearchCache?: boolean;
  /** When true, participants may opt out of moderation scanning per-send. */
  allowSkipModeration?: boolean;
  pinnedMessageIds?: string[];
  /**
   * Total stored message documents (incl. system and tombstones). Set on single-get, not on list.
   */
  messageCount?: number;
  participantJoinedAtByIdentityId?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a ConversationDocument to PublicConversation (safe for client)
 */
export function toPublicConversation(doc: ConversationDocument): PublicConversation {
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    participants: doc.participants.map((p) => p.toHexString()),
    createdBy: doc.createdBy.toHexString(),
    admins: (doc.admins ?? []).map((a) => a.toHexString()),
    encryptedName: doc.encryptedName,
    nameNonce: doc.nameNonce,
    encryptedMemberSettings: doc.encryptedMemberSettings,
    memberSettingsNonce: doc.memberSettingsNonce,
    lastMessageAt: doc.lastMessageAt?.toISOString(),
    lastMessageId: doc.lastMessageId?.toHexString(),
    gifsDisabled: doc.gifsDisabled,
    ...(doc.gifContentFilter && doc.gifContentFilter !== 'off'
      ? { gifContentFilter: doc.gifContentFilter }
      : {}),
    ...(doc.customEmojisDisabled === true
      ? { customEmojisDisabled: true }
      : {}),
    ...(doc.disallowPersistentMessageSearchCache === true
      ? { disallowPersistentMessageSearchCache: true }
      : {}),
    ...(doc.allowSkipModeration === true
      ? { allowSkipModeration: true }
      : {}),
    ...(doc.pinnedMessageIds?.length
      ? {
          pinnedMessageIds: doc.pinnedMessageIds.map((id) => id.toHexString()),
        }
      : {}),
    ...(doc.participantJoinedAtByIdentityId &&
    Object.keys(doc.participantJoinedAtByIdentityId).length > 0
      ? {
          participantJoinedAtByIdentityId: Object.fromEntries(
            Object.entries(doc.participantJoinedAtByIdentityId).map(([id, at]) => [
              id,
              at instanceof Date ? at.toISOString() : new Date(String(at)).toISOString(),
            ])
          ),
        }
      : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
