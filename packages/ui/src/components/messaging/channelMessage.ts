/**
 * Normalized view-model for a message in any channel (Conversation or Space).
 *
 * Both {@link DisplayMessage} (conversations) and {@link PublicSpaceMessage}
 * (spaces) map into this shape via their respective adapter functions. All
 * shared rendering components ({@link ChannelMessageBubble},
 * {@link ChannelMessageList}, etc.) accept `ChannelMessage` rather than a
 * domain-specific type.
 */

import type {
  CustomEmojiPayloadEntry,
  MessageType,
  PublicSpaceMessage,
  SystemEvent,
} from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type {
  GifAttachment,
  MediaAttachment,
  MentionEntity,
  PageTagEntity,
} from '../../services/messagePayload';
import { parsePayload } from '../../services/messagePayload';

// ---------------------------------------------------------------------------
// ChannelMessage — shared view model
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  id: string;
  /**
   * Opaque channel identifier: `conversationId` for conversations,
   * `channelId` for space channels.
   */
  channelId: string;
  fromIdentityId: string;
  createdAt: string;

  /** Decrypted plaintext body (already parsed from payload). */
  body: string;

  // -- Parsed payload fields -------------------------------------------------

  attachments: MediaAttachment[];
  gifAttachments: GifAttachment[];
  mentions: MentionEntity[];
  pageTags: PageTagEntity[];
  customEmojis: Record<string, CustomEmojiPayloadEntry>;

  // -- Message metadata ------------------------------------------------------

  deleted: boolean;
  replyToMessageId?: string;
  revisionCount: number;
  lastEditedAt?: string;
  messageType?: MessageType;
  systemEvent?: SystemEvent;
  expiresAt?: string;
  moderationEnabled?: boolean;
  e2eMediaIds?: string[];
  /**
   * Server hint that the message has at least one reaction. Used to reserve
   * reaction-bar space before reactions load, preventing layout shift.
   */
  hasReactions?: boolean;

  /** Device id from the sender's E2E client (used for device trust UI). */
  senderDeviceId?: string;

  // -- E2EE trust metadata (conversation-specific, optional) -----------------

  signatureVerified?: boolean;
  forwardSecrecy?: boolean;
  fsDowngraded?: boolean;
  /** Decryption error message string; presence indicates an error. */
  decryptionError?: string;

  // -- Source reference (for adapters that need the original) -----------------

  /** Present when the source was a `DisplayMessage`. */
  _sourceConversation?: DisplayMessage;
  /** Present when the source was a `PublicSpaceMessage`. */
  _sourceSpace?: PublicSpaceMessage;
}

// ---------------------------------------------------------------------------
// Adapter: DisplayMessage → ChannelMessage
// ---------------------------------------------------------------------------

/**
 * Map a conversation {@link DisplayMessage} (with decrypted content) into the
 * shared {@link ChannelMessage} view model.
 */
export function displayMessageToChannel(msg: DisplayMessage): ChannelMessage {
  const parsed = parsePayload(msg.decryptedContent ?? '');

  return {
    id: msg.id,
    channelId: msg.conversationId,
    fromIdentityId: msg.fromIdentityId,
    createdAt: msg.createdAt,
    body: parsed.text,
    attachments: parsed.attachments,
    gifAttachments: parsed.gifAttachments,
    mentions: parsed.mentions,
    pageTags: parsed.pageTags,
    customEmojis: parsed.customEmojis,
    deleted: msg.deleted,
    replyToMessageId: msg.replyToMessageId,
    revisionCount: msg.revisionCount,
    lastEditedAt: msg.lastEditedAt,
    messageType: msg.messageType,
    systemEvent: msg.systemEvent,
    expiresAt: msg.expiresAt,
    moderationEnabled: msg.moderationEnabled,
    e2eMediaIds: msg.e2eMediaIds,
    hasReactions: msg.hasReactions,
    senderDeviceId: parsed.senderDeviceId,
    signatureVerified: msg.signatureVerified,
    forwardSecrecy: msg.forwardSecrecy,
    fsDowngraded: msg.fsDowngraded,
    decryptionError: msg.decryptionError,
    _sourceConversation: msg,
  };
}

// ---------------------------------------------------------------------------
// Adapter: PublicSpaceMessage → ChannelMessage
// ---------------------------------------------------------------------------

/**
 * Map a space {@link PublicSpaceMessage} into the shared {@link ChannelMessage}
 * view model.
 *
 * @param msg - Raw space message from the API / socket.
 * @param decryptedBody - The message body after any cipher decryption. For
 *   non-E2EE channels this is typically `msg.content` itself; for E2EE
 *   channels the caller decrypts first.
 */
export function spaceMessageToChannel(
  msg: PublicSpaceMessage,
  decryptedBody: string,
): ChannelMessage {
  const parsed = parsePayload(decryptedBody);

  return {
    id: msg.id,
    channelId: msg.channelId,
    fromIdentityId: msg.fromIdentityId,
    createdAt: msg.createdAt,
    body: parsed.text,
    attachments: parsed.attachments,
    gifAttachments: parsed.gifAttachments,
    mentions: parsed.mentions,
    pageTags: parsed.pageTags,
    customEmojis: parsed.customEmojis,
    senderDeviceId: parsed.senderDeviceId,
    deleted: msg.deleted ?? false,
    replyToMessageId: msg.replyToMessageId,
    revisionCount: msg.revisionCount ?? 0,
    lastEditedAt: msg.lastEditedAt,
    expiresAt: msg.expiresAt,
    hasReactions: msg.hasReactions,
    _sourceSpace: msg,
  };
}
