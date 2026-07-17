import type { PublicIdentity, PublicSpace, PublicSpaceChannel, PublicSpaceMessage } from '@adieuu/shared';
import type { SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';

export interface SpaceChannelMessagesState {
  messages: PublicSpaceMessage[];
  /** Cursor for fetching older messages. */
  olderCursor: string | null;
  loading: boolean;
}

export interface SpacesContextValue {
  /** Spaces the current identity is a member of. */
  spaces: PublicSpace[];
  spacesLoading: boolean;

  /** Currently viewed Space (resolved from slug). */
  activeSpace: PublicSpace | null;
  activeSpaceLoading: boolean;
  activeSpaceError: 'not_found' | 'error' | null;

  /** Channels for the active Space (sorted by position). */
  channels: PublicSpaceChannel[];

  /** Currently viewed channel within the active Space. */
  activeChannelId: string | null;

  /**
   * Messages in the active channel. Index 0 = newest (same convention as
   * Conversations) — callers reverse for chronological display.
   */
  activeMessages: PublicSpaceMessage[];
  activeMessagesLoading: boolean;
  activeMessagesOlderCursor: string | null;

  sending: boolean;

  /** Resolved profiles for message authors, keyed by identity ID. */
  participantProfiles: Record<string, PublicIdentity>;

  /** Per-channel unread/mention state. */
  unreadByChannel: Record<string, SpaceChannelUnreadState>;

  /** Callbacks for forwarding socket events to feature hooks. */
  onSocketReactionAdded?: (reaction: {
    id: string;
    messageId: string;
    channelId: string;
    fromIdentityId: string;
    emoji: string;
    createdAt: string;
  }) => void;
  onSocketReactionRemoved?: (messageId: string, reactionId: string) => void;
  onSocketPinsUpdated?: (messageId: string, action: 'pinned' | 'unpinned') => void;

  setActiveSpace: (slug: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  sendMessage: (content: string, replyToMessageId?: string, mentionedIdentityIds?: string[], expiresInSeconds?: number) => Promise<PublicSpaceMessage | null>;
  loadOlderMessages: () => Promise<void>;
  refresh: () => Promise<void>;
  clearChannelUnread: (channelId: string) => void;
  registerSocketCallbacks: (callbacks: {
    onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
    onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
    onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
  }) => void;
}
