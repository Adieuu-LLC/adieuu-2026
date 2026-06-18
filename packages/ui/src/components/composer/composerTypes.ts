import {
  CONV_MEDIA_BASE_MAX_BYTES,
  resolveScalableDmOrConvMaxUploadBytes,
  type SubscriptionTierId,
} from '@adieuu/shared';

export type ComposerSendOptions = {
  useForwardSecrecy?: boolean;
  replyToMessageId?: string;
  e2eMediaIds?: string[];
  expiresInSeconds?: number;
  mentionedIdentityIds?: string[];
};

export type ComposerSendFn = (
  plaintext: string,
  options?: ComposerSendOptions,
) => Promise<unknown>;

export interface ComposerReplyContext {
  messageId: string;
  authorName: string;
  snippet: string;
  onCancel: () => void;
  onClick?: () => void;
}

export interface MentionableUser {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

export interface MentionSource {
  users: MentionableUser[];
  resolveMentionDisplay: (id: string) => string;
  /** When true, @here and @everyone are offered in mention autocomplete. */
  isGroup?: boolean;
}

/** Sentinel IDs for group-wide mentions stored in encrypted MentionEntity payloads. */
export const MENTION_HERE_ID = '__HERE__';
export const MENTION_EVERYONE_ID = '__EVERYONE__';

export function isGroupMentionId(id: string): boolean {
  return id === MENTION_HERE_ID || id === MENTION_EVERYONE_ID;
}

export function groupMentionDisplayText(id: string): string | null {
  if (id === MENTION_HERE_ID) return 'here';
  if (id === MENTION_EVERYONE_ID) return 'everyone';
  return null;
}

export type AttachmentUploadStatus = 'pending' | 'encrypting' | 'uploading' | 'scanning' | 'done' | 'error';

export interface PendingAttachment {
  file: File;
  previewUrl: string;
  uploadStatus: AttachmentUploadStatus;
  uploadProgress: number;
  uploadError?: string;
}

export interface TrackedMention {
  identityId: string;
  offset: number;
  length: number;
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
/** Video types accepted for E2E conversation uploads (frame is scanned as JPEG). */
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

/** Returns true for known visual media types that get image/video treatment. */
export function isVisualMediaMimeType(mime: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime) ||
    (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mime);
}

/** All file types are accepted for conversation attachments. */
export function isAcceptedConversationMediaType(_mime: string): boolean {
  return true;
}


export const MAX_ATTACHMENTS = 10;

/**
 * Baseline conversation attachment size cap (Access / non-insider).
 * Prefer {@link resolveConversationComposerMediaMaxBytes} when session grants are known.
 */
export const MAX_ATTACHMENT_BYTES = CONV_MEDIA_BASE_MAX_BYTES;

export function resolveConversationComposerMediaMaxBytes(args: {
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
}): number {
  return resolveScalableDmOrConvMaxUploadBytes('conv_media', args.subscriptions, {
    entitlements: args.entitlements,
    isLifetime: args.isLifetime,
  });
}

export const PLACEHOLDER_VERB_KEYS = [
  'message',
  'hi',
] as const;

export const TTL_OPTIONS: { label: string; seconds: number }[] = [
  { label: '30s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1 hr', seconds: 3600 },
  { label: '1.5 hr', seconds: 5400 },
  { label: '3 hr', seconds: 10800 },
  { label: '6 hr', seconds: 21600 },
  { label: '12 hr', seconds: 43200 },
  { label: '18 hr', seconds: 64800 },
  { label: '24 hr', seconds: 86400 },
  { label: '36 hr', seconds: 129600 },
  { label: '48 hr', seconds: 172800 },
  { label: '1 week', seconds: 604800 },
  { label: '2 weeks', seconds: 1209600 },
];

export type ComposerControlId =
  | 'forwardSecrecy'
  | 'timedMessage'
  | 'upload'
  | 'gif'
  | 'emoji'
  | 'send';

export type ComposerControlSide = 'left' | 'right';

export type ComposerSendIconId =
  | 'paper-plane'
  | 'mailbox'
  | 'arrow-right'
  | 'message-arrow-up'
  | 'message-arrow-up-right';

export interface ComposerControlConfig {
  id: ComposerControlId;
  enabled: boolean;
  side: ComposerControlSide;
  order: number;
  sendIcon?: ComposerSendIconId;
  /** When true, the send control shows a "Send" label beside the icon. */
  sendShowText?: boolean;
}
