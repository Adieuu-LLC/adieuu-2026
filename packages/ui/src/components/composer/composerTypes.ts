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
export const MAX_ATTACHMENT_BYTES = 1_337_000_000; // 1.337 GB

export const PLACEHOLDER_VERB_KEYS = [
  'message',
  'ping',
  'poke',
  'nudge',
  'sendLove',
  'whisper',
  'shout',
  'wave',
  'holla',
  'buzz',
  'serenade',
  'sing',
  'pigeon',
  'dropLine',
  'converse',
  'sonnet',
  'telepathy',
  'vibes',
  'beam',
  'raven',
  'smoke',
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
