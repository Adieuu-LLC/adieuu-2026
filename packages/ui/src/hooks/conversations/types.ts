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
      /** When true, do not merge the sent message into local message state (caller will refresh, e.g. jump to latest). */
      skipMessageStateUpdate?: boolean;
    }
  ) => Promise<PublicMessage | SendMessageErrorResult | null>;
  loadOlder: () => Promise<void>;
  loadNewer: () => Promise<void>;
  jumpToLatestMessages: (conversationId: string) => Promise<void>;
  fetchMessagesAround: (
    conversationId: string,
    centerMessageId: string,
    options?: { before?: number; after?: number }
  ) => Promise<boolean>;
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

  fetchRecipientKeys: (participantIds: string[], useForwardSecrecy?: boolean) => Promise<RecipientKeys[]>;

  getSessionKeysForMessages: (messageIds: string[]) => Promise<Record<string, string>>;

  refresh: () => Promise<void>;
}
