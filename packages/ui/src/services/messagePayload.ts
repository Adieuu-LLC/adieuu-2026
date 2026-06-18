/**
 * Structured message payload format for E2E encrypted messages.
 *
 * The plaintext inside a message's ciphertext can be either:
 * 1. A plain string (legacy format, version 0)
 * 2. A JSON-serialised MessagePayload (version 1+)
 *
 * This module provides serialisation and deserialisation with backwards
 * compatibility: any plaintext that does not parse as a valid versioned
 * payload is treated as a legacy plain-text message.
 *
 * @module services/messagePayload
 */

import { createCustomEmojiColonTokenRegex, type CustomEmojiPayloadEntry } from '@adieuu/shared';

/**
 * Media attachment metadata embedded in the encrypted payload.
 * This data is invisible to the server — only participants who decrypt
 * the message can see attachment details.
 */
export interface MediaAttachment {
  /** E2E media record ID (matches the server-visible e2eMediaIds field) */
  e2eMediaId: string;
  /** Scan hash for client-side verification of moderation status */
  scanHash: string;
  /** MIME type of the original file */
  contentType: string;
  /** Original filename (optional, user may choose to omit) */
  fileName?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Original file size in bytes */
  sizeBytes?: number;
  /** Whether the uploader chose to preserve EXIF metadata */
  exifPreserved: boolean;
  /** Base64-encoded 256-bit symmetric key used to encrypt the E2E blob */
  encryptionKey: string;
  /** Base64-encoded nonce used with encryptionKey */
  encryptionNonce: string;
}

/**
 * An @mention entity embedded in the encrypted payload.
 * Maps a span of text to the identity that was mentioned.
 */
export interface MentionEntity {
  /** Identity ID of the mentioned user */
  id: string;
  /** Character offset in the `text` field where the mention display text starts */
  offset: number;
  /** Length of the mention display text in `text` */
  length: number;
}

/**
 * A #page-tag entity embedded in the encrypted payload.
 * Maps a span of text to a page in the app's navigation.
 */
export interface PageTagEntity {
  /** Page registry ID (e.g. "roadmap", "feedback") */
  id: string;
  /** Character offset in the `text` field where the page tag display text starts */
  offset: number;
  /** Length of the page tag display text in `text` */
  length: number;
}

/**
 * GIF or sticker attachment referenced by a Klipy CDN URL.
 * Embedded in the encrypted payload — the URL reference avoids
 * uploading to S3 while keeping the actual content invisible to the server.
 */
export interface GifAttachment {
  provider: 'klipy';
  type: 'gif' | 'sticker';
  /** Sanitised hd.webp URL for message display */
  url: string;
  /** Optional HD-tier JPG still — when present, clients may show it until hover/focus */
  posterUrl?: string;
  /** sm.webp for picker thumbnails / context */
  previewUrl: string;
  /** xs.webp for very small previews (e.g. composer strip) */
  tinyUrl: string;
  /** Base64 JPEG blur placeholder (immediate visual while loading) */
  blurPreview: string;
  width: number;
  height: number;
  /** The search term the sender used (fallback display when GIFs disabled) */
  searchTerm: string;
  /** Title provided by Klipy (preferred fallback when GIFs disabled) */
  title?: string;
  /** Klipy item identifier (for share trigger) */
  slug: string;
}

/**
 * Versioned message payload. Currently version 1.
 * Future versions can extend this interface while maintaining backwards
 * compatibility via the version discriminator.
 */
export interface MessagePayload {
  version: 1;
  /** Text content (may be empty when message is media-only) */
  text?: string;
  /** Media attachments (may be empty for text-only messages) */
  attachments?: MediaAttachment[];
  /** @mention entities referencing spans within `text` */
  mentions?: MentionEntity[];
  /** #page-tag entities referencing spans within `text` */
  pageTags?: PageTagEntity[];
  /** GIF / sticker attachments (URL references, not E2E blobs) */
  gifAttachments?: GifAttachment[];
  /**
   * Custom emoji lookup map keyed by shortcode. Populated by the sender so
   * recipients can render custom emojis without additional API calls.
   * Only present when the message text contains custom emoji shortcodes.
   */
  customEmojis?: Record<string, CustomEmojiPayloadEntry>;
  /**
   * Sending client's device id (E2E only). Lets recipients attribute messages to a
   * device for safety fingerprint verification UI.
   */
  senderDeviceId?: string;
}

/**
 * Result of parsing a decrypted plaintext.
 */
export interface ParsedMessagePayload {
  /** The text content of the message (empty string if none) */
  text: string;
  /** Media attachments (empty array if none) */
  attachments: MediaAttachment[];
  /** @mention entities (empty array if none) */
  mentions: MentionEntity[];
  /** #page-tag entities (empty array if none) */
  pageTags: PageTagEntity[];
  /** GIF/sticker attachments (empty array if none) */
  gifAttachments: GifAttachment[];
  /** Custom emoji map keyed by shortcode (empty object if none) */
  customEmojis: Record<string, CustomEmojiPayloadEntry>;
  /** Whether this was parsed from a structured payload (true) or legacy string (false) */
  isStructured: boolean;
  /** Present when the sender's client embedded their device id (v1+ JSON payloads). */
  senderDeviceId?: string;
}

/**
 * Serialise a message payload to a string for encryption.
 *
 * For pure text messages with no attachments, returns the raw text string
 * (legacy format) to save bytes and maintain interop with older clients.
 *
 * For messages with attachments, senderDeviceId, custom emoji maps, or other
 * structured fields, returns JSON.
 */
export function serializePayload(payload: MessagePayload): string {
  const hasCustomEmojis =
    !!payload.customEmojis && Object.keys(payload.customEmojis).length > 0;
  const needsJson =
    !!payload.senderDeviceId ||
    !!payload.attachments?.length ||
    !!payload.mentions?.length ||
    !!payload.pageTags?.length ||
    !!payload.gifAttachments?.length ||
    hasCustomEmojis;

  if (!needsJson) {
    return payload.text ?? '';
  }

  return JSON.stringify(payload);
}

/**
 * Snapshot of the sender's custom emoji list (e.g. from {@link useCustomEmojis}),
 * used to build the encrypted payload map for shortcodes in message text.
 */
export interface CustomEmojiComposerSnapshotEntry {
  id: string;
  shortcode: string;
  cdnUrl: string;
  name: string;
  animated: boolean;
}

/**
 * Build the `customEmojis` map for a message from converted text and the sender's emoji list.
 */
export function buildCustomEmojiPayloadMap(
  convertedText: string,
  list: readonly CustomEmojiComposerSnapshotEntry[] | undefined,
  disabled: boolean,
): Record<string, CustomEmojiPayloadEntry> | undefined {
  if (disabled || !list?.length) return undefined;
  let map: Record<string, CustomEmojiPayloadEntry> | undefined;
  const pattern = createCustomEmojiColonTokenRegex();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(convertedText)) !== null) {
    const sc = match[1]?.toLowerCase();
    if (!sc) continue;
    const ce = list.find((e) => e.shortcode === sc);
    if (ce) {
      if (!map) map = {};
      map[sc] = {
        id: ce.id,
        url: ce.cdnUrl,
        name: ce.name,
        animated: ce.animated,
      };
    }
  }
  return map;
}

function isComposerSnapshotEntry(x: unknown): x is CustomEmojiComposerSnapshotEntry {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.shortcode === 'string' &&
    typeof o.cdnUrl === 'string' &&
    typeof o.name === 'string' &&
    typeof o.animated === 'boolean'
  );
}

/**
 * Parse JSON persisted on a media outbox job (composer snapshot at enqueue time).
 */
export function parseCustomEmojiComposerSnapshot(
  json: string | undefined,
): CustomEmojiComposerSnapshotEntry[] | undefined {
  if (!json?.trim()) return undefined;
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return undefined;
    const out: CustomEmojiComposerSnapshotEntry[] = [];
    for (const item of raw) {
      if (isComposerSnapshotEntry(item)) out.push(item);
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

function isValidMention(m: unknown): m is MentionEntity {
  if (typeof m !== 'object' || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    (obj.id as string).length <= 64 &&
    typeof obj.offset === 'number' &&
    Number.isInteger(obj.offset) &&
    typeof obj.length === 'number' &&
    Number.isInteger(obj.length) &&
    obj.offset >= 0 &&
    obj.length > 0
  );
}

function isValidPageTag(p: unknown): p is PageTagEntity {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    /^[a-z0-9_-]+$/.test(obj.id as string) &&
    (obj.id as string).length <= 64 &&
    typeof obj.offset === 'number' &&
    Number.isInteger(obj.offset) &&
    typeof obj.length === 'number' &&
    Number.isInteger(obj.length) &&
    obj.offset >= 0 &&
    obj.length > 0
  );
}

/**
 * Reject entries whose spans overlap or extend beyond text length.
 * Returns a new array containing only valid, non-overlapping entries
 * (first entry wins when spans collide).
 */
function filterOverlappingSpans<T extends { offset: number; length: number }>(
  entries: T[],
  textLength: number,
): T[] {
  const sorted = [...entries].sort((a, b) => a.offset - b.offset);
  const result: T[] = [];
  let lastEnd = 0;
  for (const entry of sorted) {
    if (entry.offset + entry.length > textLength) continue;
    if (entry.offset < lastEnd) continue;
    result.push(entry);
    lastEnd = entry.offset + entry.length;
  }
  return result;
}

function isValidAttachment(a: unknown): a is MediaAttachment {
  if (typeof a !== 'object' || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    typeof obj.e2eMediaId === 'string' &&
    typeof obj.contentType === 'string' &&
    typeof obj.encryptionKey === 'string' &&
    typeof obj.encryptionNonce === 'string' &&
    typeof obj.exifPreserved === 'boolean'
  );
}

export function isValidGifAttachment(a: unknown): a is GifAttachment {
  if (typeof a !== 'object' || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    obj.provider === 'klipy' &&
    (obj.type === 'gif' || obj.type === 'sticker') &&
    typeof obj.url === 'string' &&
    (obj.posterUrl === undefined || typeof obj.posterUrl === 'string') &&
    typeof obj.previewUrl === 'string' &&
    typeof obj.tinyUrl === 'string' &&
    typeof obj.blurPreview === 'string' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number' &&
    typeof obj.searchTerm === 'string' &&
    typeof obj.slug === 'string'
  );
}

/**
 * Parse a decrypted plaintext into a structured payload.
 *
 * Handles both legacy plain-text strings and versioned JSON payloads.
 * A string is treated as legacy if it does not parse as a valid
 * MessagePayload with a recognised version field.
 */
function isValidCustomEmojiEntry(e: unknown): e is CustomEmojiPayloadEntry {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.animated === 'boolean'
  );
}

function parseCustomEmojisMap(
  raw: unknown,
): Record<string, CustomEmojiPayloadEntry> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, CustomEmojiPayloadEntry> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidCustomEmojiEntry(val)) {
      result[key] = val;
    }
  }
  return result;
}

export function parsePayload(plaintext: string): ParsedMessagePayload {
  const empty: ParsedMessagePayload = {
    text: plaintext,
    attachments: [],
    mentions: [],
    pageTags: [],
    gifAttachments: [],
    customEmojis: {},
    isStructured: false,
  };

  if (!plaintext.startsWith('{')) {
    return empty;
  }

  try {
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;

    if (typeof parsed.version !== 'number' || parsed.version < 1) {
      return empty;
    }

    const payload = parsed as unknown as MessagePayload;
    const text = typeof payload.text === 'string' ? payload.text : '';
    const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const validAttachments = rawAttachments.filter(isValidAttachment);
    const rawMentions = Array.isArray(payload.mentions) ? payload.mentions : [];
    const validMentions = filterOverlappingSpans(rawMentions.filter(isValidMention), text.length);
    const rawPageTags = Array.isArray(payload.pageTags) ? payload.pageTags : [];
    const validPageTags = filterOverlappingSpans(rawPageTags.filter(isValidPageTag), text.length);
    const rawGifs = Array.isArray(payload.gifAttachments) ? payload.gifAttachments : [];
    const validGifs = rawGifs.filter(isValidGifAttachment);
    const customEmojis = parseCustomEmojisMap(payload.customEmojis);

    const senderDeviceId =
      typeof payload.senderDeviceId === 'string' && payload.senderDeviceId.length > 0
        ? payload.senderDeviceId
        : undefined;

    return {
      text,
      attachments: validAttachments,
      mentions: validMentions,
      pageTags: validPageTags,
      gifAttachments: validGifs,
      customEmojis,
      isStructured: true,
      ...(senderDeviceId ? { senderDeviceId } : {}),
    };
  } catch {
    return empty;
  }
}

/**
 * Create a text-only payload (convenience helper).
 */
export function textPayload(text: string): MessagePayload {
  return { version: 1, text };
}

/**
 * Create a payload with text and media attachments.
 */
export function mediaPayload(
  text: string | undefined,
  attachments: MediaAttachment[]
): MessagePayload {
  return { version: 1, text, attachments };
}

/**
 * Create a payload with text and a GIF/sticker attachment.
 */
export function gifPayload(
  text: string | undefined,
  gif: GifAttachment
): MessagePayload {
  return { version: 1, text, gifAttachments: [gif] };
}
