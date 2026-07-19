/**
 * Shared types and constants for Spaces (Discord-like servers).
 *
 * Spaces have their own membership/channel/role model (separate from
 * conversations) so they can scale to arbitrary member counts. E2EE uses
 * Community Ciphers via a blind-relay verification challenge: the server
 * never stores Cipher entropy, derived keys, or cipherIds — only a
 * `CipherCheck` challenge. Content encryption is signaled by `e2ee`
 * (messages + structural metadata); `encryptIdentity` additionally encrypts
 * Space name/description for directory privacy; `cipherRequired` is a
 * client-side join gate (may use the same challenge without encrypting).
 *
 * @module api/spaces-types
 */

/** Space visibility levels. */
export const SPACE_VISIBILITY_VALUES = ['public', 'listed', 'hidden'] as const;
export type SpaceVisibility = (typeof SPACE_VISIBILITY_VALUES)[number];

/** Channel kinds. Only text channels ship in the first pass. */
export const SPACE_CHANNEL_TYPES = ['text'] as const;
export type SpaceChannelType = (typeof SPACE_CHANNEL_TYPES)[number];

/** Membership states. */
export const SPACE_MEMBER_STATUSES = ['active', 'banned'] as const;
export type SpaceMemberStatus = (typeof SPACE_MEMBER_STATUSES)[number];

/** Invite lifecycle states (mirrors group invites). */
export const SPACE_INVITE_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type SpaceInviteStatus = (typeof SPACE_INVITE_STATUSES)[number];

/**
 * Role permission flags. Full RBAC/ABAC is a later pass; the first pass seeds
 * a default Admin role (all flags) and a default Member role (`read` + `post`).
 */
export const SPACE_PERMISSIONS = [
  'admin',
  'read',
  'post',
  'invite',
  'manageChannels',
  'manageRoles',
  'manageMembers',
] as const;
export type SpacePermission = (typeof SPACE_PERMISSIONS)[number];

// --- Shared field constraints (used by both client and server validation) ---

/** Slugs live at `/s/<slug>`: lowercase alphanumeric + internal hyphens. */
export const SPACE_SLUG_MIN_LENGTH = 3;
export const SPACE_SLUG_MAX_LENGTH = 32;
export const SPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Slugs that cannot be claimed by a Space. Prevents collisions with existing
 * or future top-level app routes and confusing/impersonating names. Shared so
 * the create flow can surface a "reserved" state client-side and the API can
 * reject reserved slugs from a single source of truth. Compared
 * case-insensitively against the already-lowercased slug.
 */
export const SPACE_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // App/route collisions
  's', 'space', 'spaces', 'api', 'app', 'www', 'admin', 'administrator',
  'settings', 'account', 'accounts', 'auth', 'login', 'logout', 'signup',
  'register', 'new', 'create', 'edit', 'delete', 'discover', 'explore',
  'directory', 'search', 'home', 'dashboard', 'help', 'support', 'about',
  'terms', 'privacy', 'legal', 'contact', 'billing', 'subscribe', 'upgrade',
  'pricing', 'invite', 'invites', 'join', 'me', 'you', 'user', 'users',
  'identity', 'identities', 'profile', 'profiles', 'notifications', 'messages',
  'conversations', 'friends', 'blocks', 'report', 'reports', 'moderation',
  'feedback', 'themes', 'emojis', 'uploads', 'media', 'cdn', 'assets',
  'static', 'public', 'private', 'null', 'undefined', 'true', 'false',
  // Brand / impersonation guards
  'adieuu', 'official', 'staff', 'system', 'root', 'mod', 'mods',
]);

/** Whether a slug is reserved and cannot be used for a Space (case-insensitive). */
export function isReservedSpaceSlug(slug: string): boolean {
  return SPACE_RESERVED_SLUGS.has(slug.toLowerCase());
}

export const SPACE_NAME_MIN_LENGTH = 1;
export const SPACE_NAME_MAX_LENGTH = 100;
export const SPACE_DESCRIPTION_MAX_LENGTH = 500;

export const SPACE_CHANNEL_NAME_MIN_LENGTH = 1;
export const SPACE_CHANNEL_NAME_MAX_LENGTH = 100;
/** The single text channel auto-created with every new Space. */
export const DEFAULT_SPACE_CHANNEL_NAME = 'general';
/** System role names seeded with every new Space (plaintext labels for client encrypt). */
export const DEFAULT_ADMIN_ROLE_NAME = 'Admin';
export const DEFAULT_MEMBER_ROLE_NAME = 'Member';

/** Max length for plaintext (non-E2EE) channel messages. */
export const SPACE_MESSAGE_MAX_LENGTH = 4000;

/** Max length for the base64-encoded ciphertext field in E2EE messages. */
export const SPACE_MESSAGE_CIPHERTEXT_MAX_LENGTH = 16384;

/**
 * Blind-relay cipher verification challenge stored on a Space (or channel).
 *
 * `knownValue` is a short random plaintext; `encryptedKnownValue` is that same
 * value encrypted client-side with the selected Cipher's per-Space key (derived
 * with the Space `_id` as salt). A joining client finds its matching Cipher by
 * decrypting `encryptedKnownValue` and comparing to `knownValue`. The server
 * performs no crypto and stores no keys or cipherIds.
 */
export interface CipherCheck {
  knownValue: string;
  encryptedKnownValue: string;
  nonce: string;
}

/**
 * Blind-relay encrypted string fields (name, description, etc.). Opaque to
 * the server; clients encrypt/decrypt with the Space Community Cipher.
 */
export interface EncryptedSpaceField {
  encryptedName: string;
  nameNonce: string;
  cipherId: string;
}

/** Encrypted description uses a distinct nonce field name for clarity. */
export interface EncryptedSpaceDescription {
  encryptedDescription: string;
  descriptionNonce: string;
  cipherId: string;
}

/** System role keys used when seeding encrypted role names at Space create. */
export const SPACE_SEED_ROLE_SYSTEMS = ['admin', 'member'] as const;
export type SpaceSeedRoleSystem = (typeof SPACE_SEED_ROLE_SYSTEMS)[number];

/** Client-encrypted seed payloads for default channel + system roles when e2ee. */
export interface CreateSpaceEncryptedSeed {
  channel: EncryptedSpaceField;
  roles: Array<EncryptedSpaceField & { system: SpaceSeedRoleSystem }>;
}

/** Public Space representation (safe to send to clients). */
export interface PublicSpace {
  id: string;
  slug: string;
  /** Plaintext display name; empty when `encryptIdentity` is true. */
  name: string;
  description?: string;
  visibility: SpaceVisibility;
  /**
   * Blind-relay challenge when a Community Cipher is associated (for join-gate
   * verification and/or message E2EE). Opaque to the server.
   */
  cipherCheck?: CipherCheck;
  /** When true, messages and structural metadata use ciphertext fields. */
  e2ee: boolean;
  /**
   * When true (requires `e2ee`), Space name/description are Cipher-encrypted
   * so directory browsers without the Cipher cannot read them.
   */
  encryptIdentity: boolean;
  /**
   * Client-side join gate: the join interstitial should require a matching
   * Cipher before enabling Join. Not enforced by the API.
   */
  cipherRequired: boolean;
  /** Present when `encryptIdentity` — Cipher-encrypted Space name. */
  encryptedName?: string;
  nameNonce?: string;
  /** Present when `encryptIdentity` and a description was set. */
  encryptedDescription?: string;
  descriptionNonce?: string;
  /** Cipher fingerprint for identity ciphertext fields. */
  cipherId?: string;
  createdBy: string;
  ownerIdentityId: string;
  /** When true, free-tier identities may join/post despite the default tier gate. */
  allowFreeMembers: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Public channel representation. */
export interface PublicSpaceChannel {
  id: string;
  spaceId: string;
  type: SpaceChannelType;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  position: number;
  /** Present when the Space (or channel) uses Cipher-encrypted names. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** Present only when the channel has per-channel E2EE (schema only in the first pass). */
  cipherCheck?: CipherCheck;
  createdAt: string;
  updatedAt: string;
}

/** Public role representation. */
export interface PublicSpaceRole {
  id: string;
  spaceId: string;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  permissions: SpacePermission[];
  /** Present when the Space uses Cipher-encrypted role names. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** The role auto-assigned to new members. */
  isDefaultMember: boolean;
  /** System roles (Admin/Member) cannot be deleted. */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Public membership representation. */
export interface PublicSpaceMember {
  id: string;
  spaceId: string;
  identityId: string;
  roleIds: string[];
  status: SpaceMemberStatus;
  joinedAt: string;
}

/** Public invite representation (mirrors group invites). */
export interface PublicSpaceInvite {
  id: string;
  spaceId: string;
  invitedIdentityId: string;
  invitedByIdentityId: string;
  status: SpaceInviteStatus;
  /** Snapshot for the invite UI. */
  spaceName?: string;
  spaceSlug?: string;
  memberCount: number;
  createdAt: string;
}

/** Revision history entry — stores whichever body mode the message used. */
export interface SpaceMessageRevision {
  replacedAt: string;
  content?: string;
  ciphertext?: string;
  nonce?: string;
  cipherId?: string;
}

/** Public channel message representation. */
export interface PublicSpaceMessage {
  id: string;
  spaceId: string;
  channelId: string;
  fromIdentityId: string;
  /** Plaintext content when the channel/space is non-E2EE. */
  content?: string;
  /** Base64-encoded ciphertext for E2EE messages (blind relay). */
  ciphertext?: string;
  /** Base64-encoded nonce for E2EE messages. */
  nonce?: string;
  /** Public cipher fingerprint for E2EE messages. */
  cipherId?: string;
  clientMessageId: string;
  deleted: boolean;
  revisionCount: number;
  lastEditedAt?: string;
  revisionHistory?: SpaceMessageRevision[];
  replyToMessageId?: string;
  replyToMessageAuthorId?: string;
  mentionedIdentityIds?: string[];
  expiresAt?: string;
  createdAt: string;
  /**
   * True when the message has at least one reaction. Lets the client reserve
   * space for the reaction bar before the (separately fetched) reactions load,
   * avoiding layout shift. Best-effort: computed at list time, so it may lag a
   * very recent add/remove — the client still reconciles once reactions arrive.
   */
  hasReactions?: boolean;
}

/** Public space message reaction representation. */
export interface PublicSpaceReaction {
  id: string;
  spaceId: string;
  channelId: string;
  messageId: string;
  identityId: string;
  emoji: string;
  createdAt: string;
}

// --- Request params ---

export interface CreateSpaceParams {
  /**
   * Optional client-generated ObjectId (24 hex chars) so the cipher challenge
   * can be computed against the final `_id` before the atomic create call.
   */
  id?: string;
  /**
   * Custom URL slug for public/listed Spaces. Omitted for `hidden` Spaces —
   * the server stores the Space ObjectId hex as the slug (routing key).
   */
  slug?: string;
  /**
   * Plaintext display name. Required unless `encryptIdentity` (then omitted;
   * send `encryptedName` / `nameNonce` / `cipherId` instead).
   */
  name?: string;
  description?: string;
  visibility: SpaceVisibility;
  allowFreeMembers?: boolean;
  /**
   * Blind-relay challenge when associating a Community Cipher (E2EE and/or
   * cipher-required join). Never for `public`.
   */
  cipherCheck?: CipherCheck;
  /** Content + structural metadata encryption; requires `cipherCheck`. Default false. */
  e2ee?: boolean;
  /**
   * Encrypt Space name/description for directory privacy. Requires `e2ee`.
   * Default false.
   */
  encryptIdentity?: boolean;
  /** Client join gate; requires `cipherCheck`. Default false. */
  cipherRequired?: boolean;
  /** Required when `e2ee` — encrypted default channel + system role names. */
  encryptedSeed?: CreateSpaceEncryptedSeed;
  /** Required when `encryptIdentity`. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** Optional when `encryptIdentity` and a description was provided. */
  encryptedDescription?: string;
  descriptionNonce?: string;
}

export interface UpdateSpaceParams {
  name?: string;
  description?: string;
  visibility?: SpaceVisibility;
  allowFreeMembers?: boolean;
  /** Client join gate; may be toggled after create. */
  cipherRequired?: boolean;
}

/** Common fields for both plaintext and encrypted message sends. */
interface SendSpaceMessageCommon {
  clientMessageId: string;
  replyToMessageId?: string;
  mentionedIdentityIds?: string[];
  expiresInSeconds?: number;
}

/** Plaintext send (non-E2EE channels). */
export interface SendSpaceMessagePlaintext extends SendSpaceMessageCommon {
  content: string;
  ciphertext?: undefined;
  nonce?: undefined;
  cipherId?: undefined;
}

/** Encrypted send (E2EE channels via Community Cipher). */
export interface SendSpaceMessageEncrypted extends SendSpaceMessageCommon {
  content?: undefined;
  ciphertext: string;
  nonce: string;
  cipherId: string;
}

export type SendSpaceMessageParams = SendSpaceMessagePlaintext | SendSpaceMessageEncrypted;

export type EditSpaceMessageParams =
  | { content: string; ciphertext?: undefined; nonce?: undefined; cipherId?: undefined }
  | { content?: undefined; ciphertext: string; nonce: string; cipherId: string };

export interface AddSpaceReactionParams {
  emoji: string;
}

export interface PinSpaceMessageParams {
  messageId: string;
}
