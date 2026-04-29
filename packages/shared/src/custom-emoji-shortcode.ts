/**
 * Custom emoji shortcodes are stored lowercase. Allowed characters: letters,
 * digits, underscores, and hyphens (2–32 chars). Message text uses `:shortcode:` tokens.
 */

/** Validates the shortcode body (no colons). */
export const CUSTOM_EMOJI_SHORTCODE_BODY_RE = /^[a-z0-9_-]{2,32}$/;

/**
 * Finds `:shortcode:` tokens in plaintext. Instantiate per scan so `g`/`lastIndex`
 * does not leak between callers.
 */
export function createCustomEmojiColonTokenRegex(): RegExp {
  return /:([a-z0-9_-]{2,32}):/gi;
}
