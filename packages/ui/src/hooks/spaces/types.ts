import type { PublicSpace, PublicSpaceChannel, PublicSpaceMessage } from '@adieuu/shared';

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

  setActiveSpace: (slug: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  sendMessage: (content: string) => Promise<PublicSpaceMessage | null>;
  loadOlderMessages: () => Promise<void>;
  refresh: () => Promise<void>;
}
