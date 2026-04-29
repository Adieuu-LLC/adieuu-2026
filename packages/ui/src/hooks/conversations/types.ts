import type {
  PublicConversation,
  PublicMessage,
  PublicGroupInvite,
  GroupInvitePreview,
  PublicIdentity,
  FormerMember,
} from '@adieuu/shared';
import type { RecipientKeys, MemberSettingsMap } from '../../services/conversationCryptoService';

export interface DecryptedConversation extends PublicConversation {
  decryptedName?: string;
  decryptedMemberSettings?: MemberSettingsMap;
  unreadCount: number;
}

export interface DisplayMessage extends PublicMessage {
  decryptedContent?: string;
  signatureVerified?: boolean;
  decryptionError?: string;
  forwardSecrecy?: boolean;
}

/** One prior ciphertext version after E2E edit (decrypted in the client for history UI). */
export interface MessageEditHistoryEntry {
  replacedAt: string;
  plaintext?: string;
  decryptionError?: string;
}

export interface SendMessageErrorResult {
  errorCode: string;
}

export interface ConversationMessagesState {
  messages: DisplayMessage[];
  /** Next `cursor` with `direction=older` (from API `cursor`). */
  olderCursor: string | null;
  /**
   * Newest message id still in the buffer (`messages[0]`); must match after merge/trim so
   * `after` pagination is never stale when {@link trimMessagesBuffer} evicts toward the present.
   */
  newerPaginationAfterId: string | null;
  /** More messages exist toward the present than are currently in the buffer (or were evicted by trim). */
  hasNewerPages: boolean;
  loading: boolean;
  /**
   * The last paged request (older/initial) returned only non-visible messages; show a CTA
   * so the user can fetch the next page on demand (avoids auto chain-fetching unreadable history).
   */
  showManualLoadOlder: boolean;
  /** Same for paging toward the present (e.g. gap of undecryptable messages). */
  showManualLoadNewer: boolean;
}

export const EMPTY_MESSAGES: DisplayMessage[] = [];
export const EMPTY_MEMBER_SETTINGS: MemberSettingsMap = {};

export interface ConversationsContextValue {
  conversations: DecryptedConversation[];
  activeConversationId: string | null;
  activeMessages: DisplayMessage[];
  activeMessagesOlderCursor: string | null;
  activeMessagesHasNewerPages: boolean;
  invites: PublicGroupInvite[];
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;

  loading: boolean;
  messagesLoading: boolean;
  sending: boolean;

  setActiveConversation: (id: string | null) => void;
  setIsAtBottom: (value: boolean) => void;
  /** Merges `GET /conversations/:id` (e.g. `messageCount`) into local state. */
  fetchConversationById: (conversationId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => void;

  createDM: (
    participantId: string,
    options?: { forceNew?: boolean; topic?: string }
  ) => Promise<PublicConversation | null>;
  createGroup: (
    participantIds: string[],
    conversationTopicOrName?: string
  ) => Promise<PublicConversation | null>;

  sendTextMessage: (
    conversationId: string,
    plaintext: string,
    options?: {
      expiresInSeconds?: number;
      useForwardSecrecy?: boolean;
      replyToMessageId?: string;
      e2eMediaIds?: string[];
      mentionedIdentityIds?: string[];
      /** When true, do not merge the sent message into local message state (caller will refresh, e.g. jump to latest). */
      skipMessageStateUpdate?: boolean;
      /** When true, do not toggle global `sending` (e.g. background media outbox). */
      suppressGlobalSending?: boolean;
      /** Aborts in-flight send (e.g. media outbox cancel). */
      signal?: AbortSignal;
    }
  ) => Promise<PublicMessage | SendMessageErrorResult | null>;

  /** Replace text for an existing message (E2E); max 3 edits per message server-side. */
  editTextMessage: (
    conversationId: string,
    messageId: string,
    plaintext: string,
    options?: { useForwardSecrecy?: boolean; signal?: AbortSignal }
  ) => Promise<PublicMessage | SendMessageErrorResult | null>;

  /** Fetches and decrypts `encryptedRevisionHistory` for a message (read-only, no pre-key side effects). */
  loadMessageEditHistory: (conversationId: string, message: DisplayMessage) => Promise<MessageEditHistoryEntry[] | null>;

  /**
   * True when the given conversation's buffer is at the live tail (same heuristic as the composer adapter).
   */
  computeAtLiveTail: (conversationId: string) => boolean;
  loadOlder: () => Promise<void>;
  loadNewer: () => Promise<void>;
  activeShowManualLoadOlder: boolean;
  activeShowManualLoadNewer: boolean;
  jumpToLatestMessages: (conversationId: string) => Promise<void>;
  fetchMessagesAround: (
    conversationId: string,
    centerMessageId: string,
    options?: {
      before?: number;
      after?: number;
      /** Do not replace conversation buffer (e.g. gathering report evidence keys). */
      skipStateUpdate?: boolean;
      /** With skipStateUpdate: suppress failure toast (caller shows error). */
      silent?: boolean;
    }
  ) => Promise<DisplayMessage[] | null>;
  loadPinnedMessagesPage: (
    conversationId: string,
    cursor?: string | null
  ) => Promise<{ messages: DisplayMessage[]; nextCursor: string | null } | null>;
  replyParentHydrationMap: Record<string, DisplayMessage>;
  ensureReplyParentHydration: (conversationId: string, parentMessageId: string) => Promise<void>;
  deleteMessage: (
    conversationId: string,
    messageId: string,
    forEveryone: boolean
  ) => Promise<boolean>;

  addMember: (conversationId: string, identityId: string) => Promise<boolean>;
  removeMember: (conversationId: string, identityId: string) => Promise<boolean>;
  leaveGroup: (
    conversationId: string,
    options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
  ) => Promise<boolean>;
  renameGroup: (conversationId: string, newName: string) => Promise<boolean>;
  updateMemberSettings: (conversationId: string, settings: MemberSettingsMap) => Promise<boolean>;
  updateGifsDisabled: (conversationId: string, gifsDisabled: boolean) => Promise<boolean>;
  updateCustomEmojisDisabled: (
    conversationId: string,
    customEmojisDisabled: boolean
  ) => Promise<boolean>;
  updateMessageSearchCachePolicy: (
    conversationId: string,
    disallowPersistentMessageSearchCache: boolean
  ) => Promise<boolean>;
  pinMessage: (conversationId: string, messageId: string) => Promise<boolean>;
  unpinMessage: (conversationId: string, messageId: string) => Promise<boolean>;
  promoteToAdmin: (conversationId: string, identityId: string) => Promise<boolean>;
  terminateGroup: (conversationId: string) => Promise<boolean>;

  acceptInvite: (inviteId: string) => Promise<boolean>;
  declineInvite: (inviteId: string) => Promise<boolean>;
  getInvitePreview: (inviteId: string) => Promise<GroupInvitePreview | null>;

  getFormerMembers: (conversationId: string) => Promise<FormerMember[]>;

  pendingInvitesRefreshSignal: { conversationId: string; nonce: number } | null;
  listPendingGroupInvites: (conversationId: string) => Promise<PublicGroupInvite[]>;
  revokeGroupInvite: (conversationId: string, inviteId: string) => Promise<boolean>;
  prefetchParticipantProfiles: (identityIds: string[]) => Promise<Record<string, PublicIdentity>>;

  fetchRecipientKeys: (
    participantIds: string[],
    useForwardSecrecy?: boolean,
    signal?: AbortSignal
  ) => Promise<RecipientKeys[]>;

  getSessionKeysForMessages: (messageIds: string[]) => Promise<Record<string, string>>;

  refresh: () => Promise<void>;
}
