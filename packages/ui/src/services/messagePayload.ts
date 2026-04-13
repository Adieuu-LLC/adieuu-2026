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
  /** GIF / sticker attachments (URL references, not E2E blobs) */
  gifAttachments?: GifAttachment[];
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
  /** GIF/sticker attachments (empty array if none) */
  gifAttachments: GifAttachment[];
  /** Whether this was parsed from a structured payload (true) or legacy string (false) */
  isStructured: boolean;
}

/**
 * Serialise a message payload to a string for encryption.
 *
 * For pure text messages with no attachments, returns the raw text string
 * (legacy format) to save bytes and maintain interop with older clients.
 *
 * For messages with attachments (or explicitly structured payloads),
 * returns JSON.
 */
export function serializePayload(payload: MessagePayload): string {
  if (
    !payload.attachments?.length &&
    !payload.mentions?.length &&
    !payload.gifAttachments?.length
  ) {
    return payload.text ?? '';
  }

  return JSON.stringify(payload);
}

function isValidMention(m: unknown): m is MentionEntity {
  if (typeof m !== 'object' || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.offset === 'number' &&
    typeof obj.length === 'number' &&
    obj.offset >= 0 &&
    obj.length > 0
  );
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
export function parsePayload(plaintext: string): ParsedMessagePayload {
  if (!plaintext.startsWith('{')) {
    return { text: plaintext, attachments: [], mentions: [], gifAttachments: [], isStructured: false };
  }

  try {
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;

    if (typeof parsed.version !== 'number' || parsed.version < 1) {
      return { text: plaintext, attachments: [], mentions: [], gifAttachments: [], isStructured: false };
    }

    const payload = parsed as unknown as MessagePayload;
    const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const validAttachments = rawAttachments.filter(isValidAttachment);
    const rawMentions = Array.isArray(payload.mentions) ? payload.mentions : [];
    const validMentions = rawMentions.filter(isValidMention);
    const rawGifs = Array.isArray(payload.gifAttachments) ? payload.gifAttachments : [];
    const validGifs = rawGifs.filter(isValidGifAttachment);

    return {
      text: typeof payload.text === 'string' ? payload.text : '',
      attachments: validAttachments,
      mentions: validMentions,
      gifAttachments: validGifs,
      isStructured: true,
    };
  } catch {
    return { text: plaintext, attachments: [], mentions: [], gifAttachments: [], isStructured: false };
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
