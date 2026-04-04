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
}

/**
 * Result of parsing a decrypted plaintext.
 */
export interface ParsedMessagePayload {
  /** The text content of the message (empty string if none) */
  text: string;
  /** Media attachments (empty array if none) */
  attachments: MediaAttachment[];
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
  if (!payload.attachments?.length) {
    return payload.text ?? '';
  }

  return JSON.stringify(payload);
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
    return { text: plaintext, attachments: [], isStructured: false };
  }

  try {
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;

    if (typeof parsed.version !== 'number' || parsed.version < 1) {
      return { text: plaintext, attachments: [], isStructured: false };
    }

    const payload = parsed as unknown as MessagePayload;
    return {
      text: payload.text ?? '',
      attachments: payload.attachments ?? [],
      isStructured: true,
    };
  } catch {
    return { text: plaintext, attachments: [], isStructured: false };
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
