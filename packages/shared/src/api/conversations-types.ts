export type ConversationType = 'dm' | 'group';

export type PreKeyType = 'static' | 'spk' | 'otpk';

export type MessageCryptoProfile = 'default' | 'cnsa2';

export type MessageType = 'user' | 'system';

export interface SystemEvent {
  type: string;
  identityId: string;
  displayName?: string;
  username?: string;
  actorIdentityId?: string;
  actorDisplayName?: string;
  actorUsername?: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export interface SerializedWrappedKey {
  identityId: string;
  ephemeralPublicKey: string;
  kemCiphertext: string;
  wrappedSessionKey: string;
  wrappingNonce: string;
  preKeyType: PreKeyType;
  signedPreKeyId?: string;
  oneTimePreKeyId?: string;
  spkKemCiphertext?: string;
  otpkKemCiphertext?: string;
  /**
   * Key-fingerprint routing tag for O(1) wrapped key lookup on multi-device
   * identities. Truncated SHA-256 of the recipient device's public keys.
   * Absent on messages created before this field was introduced.
   */
  routingTag?: string;
}

export interface PublicMessage {
  id: string;
  conversationId: string;
  fromIdentityId: string;
  messageType?: MessageType;
  systemEvent?: SystemEvent;
  ciphertext?: string;
  nonce?: string;
  wrappedKeys?: SerializedWrappedKey[];
  signature?: string;
  cryptoProfile: MessageCryptoProfile;
  clientMessageId: string;
  expiresAt?: string;
  deleted: boolean;
  createdAt: string;
  /** When set, this message is a reply to another message in the same conversation */
  replyToMessageId?: string;
}

export interface PublicGroupInvite {
  id: string;
  conversationId: string;
  invitedIdentityId: string;
  invitedByIdentityId: string;
  status: string;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  createdAt: string;
}

export interface GroupInvitePreviewMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

export interface GroupInvitePreview {
  inviteId: string;
  conversationId: string;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  members: GroupInvitePreviewMember[];
  invitedMembers: GroupInvitePreviewMember[];
  invitedBy: GroupInvitePreviewMember;
  createdAt: string;
}

export interface FormerMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SendMessageParams {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientMessageId: string;
  expiresInSeconds?: number;
  replyToMessageId?: string;
  e2eMediaIds?: string[];
  /** Identity IDs of participants @mentioned in this message (unencrypted metadata for notification routing). */
  mentionedIdentityIds?: string[];
}

export interface ConversationPreferences {
  id: string;
  conversationId: string;
  archived: boolean;
  keepArchived: boolean;
  favorited: boolean;
}

export interface ConversationPreferencesPatch {
  archived?: boolean;
  keepArchived?: boolean;
  favorited?: boolean;
}

export interface PublicReaction {
  id: string;
  messageId: string;
  conversationId: string;
  fromIdentityId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientReactionId: string;
  createdAt: string;
}

export interface SendReactionParams {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: MessageCryptoProfile;
  clientReactionId: string;
}
