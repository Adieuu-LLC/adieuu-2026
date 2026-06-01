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

/**
 * Derive a valid shortcode from a filename (e.g. "Party Parrot.gif" -> "party-parrot").
 * Returns an empty string when the filename cannot produce a valid shortcode (< 2 chars).
 */
export function filenameToShortcode(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const sanitised = base
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);
  return sanitised.length >= 2 ? sanitised : '';
}

/**
 * Derive a human-readable display name from a filename by stripping the extension.
 */
export function filenameToDisplayName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').slice(0, 64);
}
