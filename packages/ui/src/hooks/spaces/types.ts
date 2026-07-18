import type { PublicIdentity, PublicSpace, PublicSpaceChannel, PublicSpaceMessage } from '@adieuu/shared';
import type { SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';

export interface SpaceChannelMessagesState {
  messages: PublicSpaceMessage[];
  /** Cursor for fetching older messages. */
  olderCursor: string | null;
  /**
   * More messages exist toward the present than are currently in the buffer
   * (either never loaded, or evicted by trimming while scrolled up). Drives the
   * bottom sentinel / newer-page loading. The newer-page anchor is the buffer
   * head (`messages[0]`).
   */
  hasNewerPages?: boolean;
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
  /** Whether more messages exist toward the present than are in the buffer. */
  activeMessagesHasNewerPages: boolean;

  sending: boolean;

  /** Resolved profiles for message authors, keyed by identity ID. */
  participantProfiles: Record<string, PublicIdentity>;

  /** Per-channel unread/mention state. */
  unreadByChannel: Record<string, SpaceChannelUnreadState>;

  /** Aggregate unread count per Space (keyed by spaceId). */
  unreadBySpace: Record<string, number>;

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

  /** Resolve author profiles for the given identity IDs (fire-and-forget). */
  resolveProfiles: (ids: string[]) => void;

  setActiveSpace: (slug: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  sendMessage: (content: string, replyToMessageId?: string, mentionedIdentityIds?: string[], expiresInSeconds?: number) => Promise<PublicSpaceMessage | null>;
  loadOlderMessages: () => Promise<void>;
  /**
   * Load the next page of messages toward the present (used after trimming the
   * buffer while scrolled up). No-op unless `activeMessagesHasNewerPages`.
   */
  loadNewerMessages: () => Promise<void>;
  /**
   * Discard the loaded window for a channel and re-fetch the latest page, so
   * "jump to latest" lands on the channel's live tip even when the user is deep
   * in history or the buffer was trimmed/detached (`hasNewerPages`).
   */
  jumpToLatestMessages: (channelId: string) => Promise<void>;
  /**
   * Fetch a window of messages centered on `messageId` (reply/pin jump to a
   * target outside the loaded buffer) and merge it into the active channel
   * store. Resolves with the fetched messages, or null on failure.
   */
  fetchMessagesAround: (
    messageId: string,
    options?: { before?: number; after?: number },
  ) => Promise<PublicSpaceMessage[] | null>;
  /**
   * Trim the active channel's message buffer to a bounded size. Pass whether the
   * viewport is at the live tail: at bottom retains the newest window (and
   * advances the older cursor); while scrolled up retains the oldest window and
   * flags `hasNewerPages` so the evicted newest messages can be reloaded.
   */
  trimActiveChannelBuffer: (atBottom: boolean) => void;
  refresh: () => Promise<void>;
  clearChannelUnread: (channelId: string) => void;
  registerSocketCallbacks: (callbacks: {
    onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
    onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
    onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
  }) => void;
}
