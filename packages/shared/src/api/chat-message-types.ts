/**
 * WebSocket chat message payload types for Adieuu.
 *
 * Discriminated event contracts delivered over the chat WebSocket.
 * The runtime client lives in `chat-client.ts`.
 */

import type {
  PublicSpace,
  PublicSpaceInvite,
  PublicSpaceMember,
  PublicSpaceMessage,
  PublicSpaceReaction,
} from './spaces-types';

export type ChatMessageType =
  | 'ping'
  | 'pong'
  | 'presence'
  | 'ack'
  | 'error'
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'friend_removed'
  | 'conversation_created'
  | 'conversation_updated'
  | 'conversation_message'
  | 'conversation_message_edited'
  | 'group_invite_received'
  | 'group_invite_accepted'
  | 'group_invite_revoked'
  | 'conversation_message_deleted'
  | 'group_terminated'
  | 'reaction_added'
  | 'reaction_removed'
  | 'notification_created'
  | 'identity_profile_updated'
  | 'call_initiated'
  | 'call_participant_joined'
  | 'call_participant_left'
  | 'call_ended'
  | 'call_media_state_changed'
  | 'space_created'
  | 'space_updated'
  | 'space_deleted'
  | 'space_message'
  | 'space_member_joined'
  | 'space_member_left'
  | 'space_invite_received'
  | 'space_invite_accepted'
  | 'space_invite_revoked'
  | 'space_message_edited'
  | 'space_message_deleted'
  | 'space_reaction_added'
  | 'space_reaction_removed'
  | 'space_pins_updated';

export interface ChatMessageBase {
  type: ChatMessageType;
  id?: string;
}

export interface ChatPingMessage extends ChatMessageBase {
  type: 'ping';
}

export interface ChatPongMessage extends ChatMessageBase {
  type: 'pong';
}

export interface ChatErrorMessage extends ChatMessageBase {
  type: 'error';
  code: string;
  message: string;
}

export interface ChatAckMessage extends ChatMessageBase {
  type: 'ack';
  id: string;
}

export interface ChatFriendRequestReceivedMessage extends ChatMessageBase {
  type: 'friend_request_received';
  data: {
    requestId: string;
    fromIdentity: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
    };
  };
}

export interface ChatFriendRequestAcceptedMessage extends ChatMessageBase {
  type: 'friend_request_accepted';
  data: {
    requestId: string;
    byIdentity: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
    };
  };
}

export interface ChatFriendRemovedMessage extends ChatMessageBase {
  type: 'friend_removed';
  data: {
    identityId: string;
  };
}

export interface ChatConversationCreatedMessage extends ChatMessageBase {
  type: 'conversation_created';
  data: {
    conversation: {
      id: string;
      type: 'dm' | 'group';
      participants: string[];
      createdBy: string;
      admins: string[];
      encryptedName?: string;
      nameNonce?: string;
      createdAt: string;
      updatedAt: string;
    };
  };
}

export interface ChatConversationUpdatedMessage extends ChatMessageBase {
  type: 'conversation_updated';
  data: {
    conversationId: string;
    action:
      | 'member_added'
      | 'member_removed'
      | 'member_left'
      | 'removed'
      | 'renamed'
      | 'admin_promoted'
      | 'gifs_disabled_updated'
      | 'gif_content_filter_updated'
      | 'custom_emojis_disabled_updated'
      | 'message_search_cache_policy_updated'
      | 'allow_skip_moderation_updated'
      | 'pending_invites_changed'
      | 'pins_updated'
      | 'call_settings_updated';
    identityId?: string;
    gifsDisabled?: boolean;
    gifContentFilter?: string;
    customEmojisDisabled?: boolean;
    disallowPersistentMessageSearchCache?: boolean;
    allowSkipModeration?: boolean;
    pinnedMessageIds?: string[];
    /** Present for action renamed — drives notification copy (group vs DM). */
    conversationType?: 'dm' | 'group';
    audioCallsDisabled?: boolean;
    videoCallsDisabled?: boolean;
    screenshareDisabled?: boolean;
  };
}

export interface ChatGroupTerminatedMessage extends ChatMessageBase {
  type: 'group_terminated';
  data: {
    conversationId: string;
    terminatedBy: {
      id: string;
      username?: string;
      displayName?: string;
    };
    encryptedName?: string;
    nameNonce?: string;
  };
}

export interface ChatConversationMessageMessage extends ChatMessageBase {
  type: 'conversation_message';
  data: {
    conversationId: string;
    messageId: string;
    fromIdentityId: string;
    createdAt: string;
    /** Present when the new message is a reply; identifies the original message */
    replyToMessageId?: string;
    /** Author of the message being replied to (for reply-specific client UX) */
    replyToMessageAuthorId?: string;
    /** ISO-8601 expiry timestamp when the message is a disappearing/TTL message. */
    expiresAt?: string;
    /** Identity IDs of participants @mentioned in this message (for mention-specific notification sounds). */
    mentionedIdentityIds?: string[];
    /** When `system`, the message is informational (call/member events) and should not notify or increment unread. */
    messageType?: 'user' | 'system';
  };
}

export interface ChatConversationMessageEditedMessage extends ChatMessageBase {
  type: 'conversation_message_edited';
  data: {
    conversationId: string;
    messageId: string;
    fromIdentityId: string;
    lastEditedAt: string;
    revisionCount: number;
    expiresAt?: string;
  };
}

export interface ChatGroupInviteReceivedMessage extends ChatMessageBase {
  type: 'group_invite_received';
  data: {
    invite: {
      id: string;
      conversationId: string;
      invitedIdentityId: string;
      invitedByIdentityId: string;
      status: string;
      groupName?: string;
      hasGroupName?: boolean;
      memberCount: number;
      createdAt: string;
    };
  };
}

export interface ChatGroupInviteAcceptedMessage extends ChatMessageBase {
  type: 'group_invite_accepted';
  data: {
    conversationId: string;
    identityId: string;
    username?: string;
    displayName?: string;
  };
}

export interface ChatGroupInviteRevokedMessage extends ChatMessageBase {
  type: 'group_invite_revoked';
  data: {
    inviteId: string;
    conversationId: string;
  };
}

export interface ChatConversationMessageDeletedMessage extends ChatMessageBase {
  type: 'conversation_message_deleted';
  data: {
    conversationId: string;
    messageId: string;
    deletedBy: string;
    forEveryone: boolean;
  };
}

export interface ChatReactionAddedMessage extends ChatMessageBase {
  type: 'reaction_added';
  data: {
    reaction: {
      id: string;
      messageId: string;
      conversationId: string;
      fromIdentityId: string;
      ciphertext: string;
      nonce: string;
      wrappedKeys: {
        identityId: string;
        ephemeralPublicKey: string;
        kemCiphertext: string;
        wrappedSessionKey: string;
        wrappingNonce: string;
        preKeyType: 'static' | 'spk' | 'otpk';
        signedPreKeyId?: string;
        oneTimePreKeyId?: string;
        spkKemCiphertext?: string;
        otpkKemCiphertext?: string;
        routingTag?: string;
      }[];
      signature: string;
      cryptoProfile: 'default' | 'cnsa2';
      clientReactionId: string;
      createdAt: string;
    };
    /** Identity id of the message author (server-known; for author notifications). */
    messageAuthorId?: string;
  };
}

export interface ChatReactionRemovedMessage extends ChatMessageBase {
  type: 'reaction_removed';
  data: {
    reactionId: string;
    messageId: string;
    conversationId: string;
  };
}

export interface ChatNotificationCreatedMessage extends ChatMessageBase {
  type: 'notification_created';
  data: {
    notification: {
      id: string;
      type: string;
      data: Record<string, unknown>;
      read: boolean;
      createdAt: string;
    };
  };
}

export interface ChatIdentityProfileUpdatedMessage extends ChatMessageBase {
  type: 'identity_profile_updated';
  data: {
    identityId: string;
  };
}

export interface ChatCallMediaOptions {
  audio: boolean;
  video: boolean;
  screenshare: boolean;
}

export interface ChatCallInitiatedMessage extends ChatMessageBase {
  type: 'call_initiated';
  data: {
    call: {
      id: string;
      conversationId: string;
      initiatorIdentityId: string;
      status: string;
      allowedMedia: ChatCallMediaOptions;
      participants?: {
        identityId: string;
        joinedAt: string;
        leftAt?: string;
        mediaState: ChatCallMediaOptions;
      }[];
      roomName: string;
      createdAt: string;
    };
  };
}

export interface ChatCallParticipantJoinedMessage extends ChatMessageBase {
  type: 'call_participant_joined';
  data: {
    callId: string;
    identityId: string;
    mediaState: ChatCallMediaOptions;
  };
}

export interface ChatCallParticipantLeftMessage extends ChatMessageBase {
  type: 'call_participant_left';
  data: {
    callId: string;
    identityId: string;
  };
}

export interface ChatCallEndedMessage extends ChatMessageBase {
  type: 'call_ended';
  data: {
    callId: string;
    endedBy: string;
  };
}

export interface ChatCallMediaStateChangedMessage extends ChatMessageBase {
  type: 'call_media_state_changed';
  data: {
    callId: string;
    identityId: string;
    mediaState: ChatCallMediaOptions;
  };
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

/**
 * A Space the current identity now belongs to (e.g. after creating one or
 * accepting an invite). Delivered on the member's `identity:{id}` channel.
 */
export interface ChatSpaceCreatedMessage extends ChatMessageBase {
  type: 'space_created';
  data: { space: PublicSpace };
}

/** A Space's settings changed. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceUpdatedMessage extends ChatMessageBase {
  type: 'space_updated';
  data: { space: PublicSpace };
}

/** A Space was permanently deleted. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceDeletedMessage extends ChatMessageBase {
  type: 'space_deleted';
  data: { spaceId: string };
}

/**
 * A new (non-E2EE) channel message. Fanned out on the `space:{spaceId}`
 * channel to active members.
 */
export interface ChatSpaceMessageMessage extends ChatMessageBase {
  type: 'space_message';
  data: { message: PublicSpaceMessage };
}

/** A member joined a Space. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceMemberJoinedMessage extends ChatMessageBase {
  type: 'space_member_joined';
  data: { spaceId: string; member: PublicSpaceMember };
}

/** A member left or was removed. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceMemberLeftMessage extends ChatMessageBase {
  type: 'space_member_left';
  data: { spaceId: string; identityId: string };
}

/**
 * A pending Space invite addressed to the current identity. Delivered on the
 * invitee's `identity:{id}` channel.
 */
export interface ChatSpaceInviteReceivedMessage extends ChatMessageBase {
  type: 'space_invite_received';
  data: { invite: PublicSpaceInvite };
}

/** An invitee accepted an invite. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceInviteAcceptedMessage extends ChatMessageBase {
  type: 'space_invite_accepted';
  data: { spaceId: string; identityId: string };
}

/**
 * A pending invite was revoked. Delivered on the invitee's `identity:{id}`
 * channel so their inbox updates.
 */
export interface ChatSpaceInviteRevokedMessage extends ChatMessageBase {
  type: 'space_invite_revoked';
  data: { inviteId: string; spaceId: string };
}

/** A Space channel message was edited. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceMessageEditedMessage extends ChatMessageBase {
  type: 'space_message_edited';
  data: {
    channelId: string;
    messageId: string;
    fromIdentityId: string;
    content?: string;
    lastEditedAt?: string;
    revisionCount: number;
  };
}

/** A Space channel message was deleted. Fanned out on the `space:{spaceId}` channel. */
export interface ChatSpaceMessageDeletedMessage extends ChatMessageBase {
  type: 'space_message_deleted';
  data: {
    channelId: string;
    messageId: string;
    deletedBy: string;
  };
}

/** A reaction was added to a Space channel message. */
export interface ChatSpaceReactionAddedMessage extends ChatMessageBase {
  type: 'space_reaction_added';
  data: { reaction: PublicSpaceReaction };
}

/** A reaction was removed from a Space channel message. */
export interface ChatSpaceReactionRemovedMessage extends ChatMessageBase {
  type: 'space_reaction_removed';
  data: {
    reactionId: string;
    messageId: string;
    channelId: string;
  };
}

/** Pins in a Space channel were updated. */
export interface ChatSpacePinsUpdatedMessage extends ChatMessageBase {
  type: 'space_pins_updated';
  data: {
    channelId: string;
    messageId: string;
    action: 'pinned' | 'unpinned';
    pinnedBy?: string;
  };
}

export type ChatIncomingMessage =
  | ChatPongMessage
  | ChatErrorMessage
  | ChatAckMessage
  | ChatFriendRequestReceivedMessage
  | ChatFriendRequestAcceptedMessage
  | ChatFriendRemovedMessage
  | ChatConversationCreatedMessage
  | ChatConversationUpdatedMessage
  | ChatConversationMessageMessage
  | ChatConversationMessageEditedMessage
  | ChatGroupInviteReceivedMessage
  | ChatGroupInviteAcceptedMessage
  | ChatGroupInviteRevokedMessage
  | ChatConversationMessageDeletedMessage
  | ChatGroupTerminatedMessage
  | ChatReactionAddedMessage
  | ChatReactionRemovedMessage
  | ChatNotificationCreatedMessage
  | ChatIdentityProfileUpdatedMessage
  | ChatCallInitiatedMessage
  | ChatCallParticipantJoinedMessage
  | ChatCallParticipantLeftMessage
  | ChatCallEndedMessage
  | ChatCallMediaStateChangedMessage
  | ChatSpaceCreatedMessage
  | ChatSpaceUpdatedMessage
  | ChatSpaceDeletedMessage
  | ChatSpaceMessageMessage
  | ChatSpaceMemberJoinedMessage
  | ChatSpaceMemberLeftMessage
  | ChatSpaceInviteReceivedMessage
  | ChatSpaceInviteAcceptedMessage
  | ChatSpaceInviteRevokedMessage
  | ChatSpaceMessageEditedMessage
  | ChatSpaceMessageDeletedMessage
  | ChatSpaceReactionAddedMessage
  | ChatSpaceReactionRemovedMessage
  | ChatSpacePinsUpdatedMessage;

export type ChatOutgoingMessage =
  | ChatPingMessage;

